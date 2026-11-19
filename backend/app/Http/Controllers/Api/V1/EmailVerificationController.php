<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AccountAccess;
use App\Services\FirebaseAuthentication;
use App\Services\FirebaseUserResolver;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\URL;
use Kreait\Firebase\Contract\Auth as FirebaseAuth;
use Throwable;

class EmailVerificationController extends Controller
{
    public function status(Request $request, FirebaseUserResolver $users)
    {
        if (config('firebase_auth.mode') === 'firebase') {
            try {
                $firebase = app(FirebaseAuthentication::class);
            } catch (Throwable $e) {
                Log::warning('Firebase SDK initialization failed.', ['stage' => 'verification_status', 'exception_class' => get_class($e)]);

                return response()->json(['message' => 'Verification status is temporarily unavailable.'], 503)
                    ->header('Cache-Control', 'no-store, private');
            }
            $identity = $firebase->lookup($request->user()->firebase_uid);
            $user = $users->resolve($identity);
            if ($user->password_session_version !== null) {
                $request->session()->put('password_session_version', $user->password_session_version);
            }

            return (new UserResource($user))->response()->setStatusCode(200);
        }

        return (new UserResource($request->user()))->response()->setStatusCode(200);
    }

    public function resend(Request $request)
    {
        if (config('firebase_auth.mode') === 'firebase') {
            try {
                $firebase = app(FirebaseAuthentication::class);
            } catch (Throwable $e) {
                Log::warning('Firebase SDK initialization failed.', ['stage' => 'verification_resend', 'exception_class' => get_class($e)]);

                return response()->json(['message' => 'Verification email is temporarily unavailable.'], 503)
                    ->header('Cache-Control', 'no-store, private');
            }
            $identity = $firebase->lookup($request->user()->firebase_uid);
            $user = app(FirebaseUserResolver::class)->resolve($identity);
            if ($user->password_session_version !== null) {
                $request->session()->put('password_session_version', $user->password_session_version);
            }
            if ($identity->emailVerified) {
                return response()->json(['message' => 'Email already verified.']);
            }
            try {
                app(FirebaseAuth::class)->sendEmailVerificationLink($identity->email, [
                    'url' => rtrim(config('app.frontend_url'), '/').'/verify-email/success',
                    'handleCodeInApp' => false,
                ]);
            } catch (Throwable $e) {
                Log::warning('Firebase verification email could not be sent.', ['exception_class' => get_class($e)]);

                return response()->json(['message' => 'Verification email is temporarily unavailable.'], 503)
                    ->header('Cache-Control', 'no-store, private');
            }

            return response()->json(['message' => 'Verification link sent.']);
        }

        if ($request->user()->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email already verified.']);
        }

        $request->user()->sendEmailVerificationNotification();

        return response()->json(['message' => 'Verification link sent.']);
    }

    public function verify(Request $request, string $id, string $hash)
    {
        $frontend = rtrim(config('app.frontend_url'), '/');
        if (config('firebase_auth.mode') === 'firebase') {
            return redirect($frontend.'/verify-email/error?reason=invalid');
        }
        if (! URL::hasValidSignature($request)) {
            $reason = (int) $request->query('expires') < now()->timestamp ? 'expired' : 'invalid';

            return redirect($frontend.'/verify-email/error?reason='.$reason);
        }

        $user = $request->user();
        if (! $user) {
            return redirect($frontend.'/login?verification=sign-in');
        }
        $user = User::query()->find($user->getKey());
        if (! $user || ! $user->canAccessAccount()) {
            return redirect($frontend.'/verify-email/error?reason=account');
        }
        if (! hash_equals((string) $user->getKey(), $id) || ! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return redirect($frontend.'/verify-email/error?reason=account');
        }

        $verified = DB::transaction(function () use ($user): bool {
            $current = AccountAccess::lock($user);

            return ! $current->hasVerifiedEmail() && $current->markEmailAsVerified();
        }, 3);
        if ($verified) {
            $user->refresh();
            event(new Verified($user));
        }

        return redirect($frontend.'/verify-email/success');
    }
}
