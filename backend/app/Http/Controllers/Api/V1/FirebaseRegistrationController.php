<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\FirebaseRegisterRequest;
use App\Http\Resources\UserResource;
use App\Services\FirebaseAuthentication;
use App\Services\FirebaseUserResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Throwable;

class FirebaseRegistrationController extends Controller
{
    public function __invoke(FirebaseRegisterRequest $request, FirebaseUserResolver $users): JsonResponse
    {
        abort_unless(config('firebase_auth.mode') === 'firebase', 404);
        if (Auth::guard('web')->check()) {
            return response()->json(['message' => 'Sign out before registering another account.',
                'code' => 'SESSION_ALREADY_ACTIVE'], 409)->header('Cache-Control', 'no-store, private');
        }

        try {
            $firebase = app(FirebaseAuthentication::class);
        } catch (Throwable $e) {
            Log::warning('Firebase SDK initialization failed.', ['stage' => 'registration', 'exception_class' => get_class($e)]);

            return response()->json(['message' => 'Firebase authentication is unavailable.'], 503)
                ->header('Cache-Control', 'no-store, private');
        }

        $identity = $firebase->verify($request->validated('id_token'));
        $user = $users->register($identity, $request->validated('username'));
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        if ($user->password_session_version !== null) {
            $request->session()->put('password_session_version', $user->password_session_version);
        }

        return (new UserResource($user))->response()->setStatusCode($user->wasRecentlyCreated ? 201 : 200);
    }
}
