<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\FirebaseSessionRequest;
use App\Http\Resources\UserResource;
use App\Services\FirebaseAuthentication;
use App\Services\FirebaseUserResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Throwable;

class FirebaseSessionController extends Controller
{
    public function __invoke(FirebaseSessionRequest $request, FirebaseUserResolver $users): JsonResponse
    {
        abort_unless(config('firebase_auth.mode') === 'firebase', 404);
        if (Auth::guard('web')->check()) {
            return response()->json(['message' => 'Sign out before signing in as another account.',
                'code' => 'SESSION_ALREADY_ACTIVE'], 409)->header('Cache-Control', 'no-store, private');
        }

        try {
            $firebase = app(FirebaseAuthentication::class);
        } catch (Throwable $e) {
            Log::warning('Firebase SDK initialization failed.', ['stage' => 'session', 'exception_class' => get_class($e)]);

            return response()->json(['message' => 'Firebase authentication is unavailable.'], 503)
                ->header('Cache-Control', 'no-store, private');
        }
        $identity = $firebase->verify($request->validated('id_token'));
        if (in_array($identity->signInProvider, ['google.com', 'github.com'], true)) {
            $user = $users->existingOrPending($identity);
            if (! $user) {
                return response()->json(['code' => 'USERNAME_REQUIRED'], 202)
                    ->header('Cache-Control', 'no-store, private');
            }
        } else {
            $user = $users->resolve($identity);
        }
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        if ($user->password_session_version !== null) {
            $request->session()->put('password_session_version', $user->password_session_version);
        }

        return (new UserResource($user))->response()->setStatusCode(200);
    }
}
