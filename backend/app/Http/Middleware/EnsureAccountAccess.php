<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401)->header('Cache-Control', 'no-store, private');
        }
        $current = User::query()->find($user->getKey());
        if (! $current) {
            return response()->json(['message' => 'Unauthenticated.'], 401)->header('Cache-Control', 'no-store, private');
        }
        if (config('firebase_auth.mode') === 'firebase' && ! $current->firebase_uid) {
            Auth::guard('web')->logoutCurrentDevice();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json(['message' => 'Unauthenticated.'], 401)->header('Cache-Control', 'no-store, private');
        }
        if (! $current->canAccessAccount()) {
            $code = $current->account_status === User::STATUS_BANNED ? 'ACCOUNT_BANNED' : 'ACCOUNT_DEACTIVATED';

            return response()->json(['message' => 'This account cannot access VYBE.', 'code' => $code], 403)
                ->header('Cache-Control', 'no-store, private');
        }
        if ($current->password_session_version !== null && (! $request->hasSession()
            || ! hash_equals($current->password_session_version, (string) $request->session()->get('password_session_version', '')))) {
            Auth::guard('web')->logoutCurrentDevice();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json(['message' => 'Unauthenticated.'], 401)->header('Cache-Control', 'no-store, private');
        }
        $request->setUserResolver(fn (?string $guard = null) => $current);

        return $next($request);
    }
}
