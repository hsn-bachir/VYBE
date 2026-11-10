<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\FirebasePasswordResetRequest;
use App\Services\FirebaseIdentityMethods;
use App\Services\FirebasePasswordResetService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth as LaravelAuth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Kreait\Firebase\Contract\Auth as FirebaseAuth;
use Kreait\Firebase\Exception\Auth\EmailNotFound;
use Kreait\Firebase\Exception\Auth\UserNotFound;
use Throwable;

class FirebasePasswordController extends Controller
{
    public function forgot(Request $request)
    {
        abort_unless(config('firebase_auth.mode') === 'firebase', 404);
        $values = $request->validate(['email' => ['required', 'string', 'email', 'max:255']]);
        $email = Str::lower(trim($values['email']));
        try {
            $firebase = app(FirebaseAuth::class);
            $record = $firebase->getUserByEmail($email);
            if (! $record->disabled && app(FirebaseIdentityMethods::class)->hasPassword($record)) {
                $firebase->sendPasswordResetLink($email, [
                    'url' => rtrim(config('app.frontend_url'), '/').'/password/reset',
                    'handleCodeInApp' => false,
                ]);
            }
        } catch (EmailNotFound|UserNotFound) {
            // Keep the response identical for unknown addresses.
        } catch (Throwable $e) {
            Log::warning('Firebase password reset email unavailable.', ['exception_class' => get_class($e)]);

            return response()->json(['message' => 'Password reset is temporarily unavailable.'], 503)
                ->header('Cache-Control', 'no-store, private');
        }

        return response()->json(['message' => 'If an account exists, a reset email has been sent.'], 202)
            ->header('Cache-Control', 'no-store, private');
    }

    public function reset(FirebasePasswordResetRequest $request)
    {
        abort_unless(config('firebase_auth.mode') === 'firebase', 404);
        try {
            $reset = app(FirebasePasswordResetService::class);
        } catch (Throwable $e) {
            Log::warning('Firebase password reset initialization failed.', ['exception_class' => get_class($e)]);

            return response()->json(['message' => 'Password reset is temporarily unavailable.'], 503)
                ->header('Cache-Control', 'no-store, private');
        }
        $uid = $reset->reset($request->validated('oob_code'), $request->validated('password'));
        if ($request->user()?->firebase_uid === $uid) {
            LaravelAuth::guard('web')->logoutCurrentDevice();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }
}
