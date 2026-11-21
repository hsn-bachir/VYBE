<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\FirebaseSessionRequest;
use App\Services\FirebaseAuthentication;
use App\Services\FirebaseUserResolver;
use Illuminate\Support\Facades\Log;
use Throwable;

class FirebaseLinkAuthorizationController extends Controller
{
    public function __invoke(FirebaseSessionRequest $request, FirebaseUserResolver $users)
    {
        abort_unless(config('firebase_auth.mode') === 'firebase', 404);
        try {
            $firebase = app(FirebaseAuthentication::class);
        } catch (Throwable $e) {
            Log::warning('Firebase SDK initialization failed.', ['stage' => 'provider_link', 'exception_class' => get_class($e)]);

            return response()->json(['message' => 'Firebase authentication is unavailable.'], 503)
                ->header('Cache-Control', 'no-store, private');
        }
        $identity = $firebase->verify($request->validated('id_token'));
        if (! hash_equals((string) $request->user()->firebase_uid, $identity->uid)) {
            return response()->json(['message' => 'This Firebase identity does not match your VYBE account.',
                'code' => 'IDENTITY_MISMATCH'], 403)->header('Cache-Control', 'no-store, private');
        }
        $user = $users->existingOrPending($identity);
        if (! $user || $user->id !== $request->user()->id) {
            return response()->json(['message' => 'This Firebase identity does not match your VYBE account.',
                'code' => 'IDENTITY_MISMATCH'], 403)->header('Cache-Control', 'no-store, private');
        }
        if ($user->password_session_version !== null) {
            $request->session()->put('password_session_version', $user->password_session_version);
        }

        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }
}
