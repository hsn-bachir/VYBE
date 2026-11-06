<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string $role): Response
    {
        $ability = match ($role) {
            User::ROLE_ADMIN => 'admin.read',
            User::ROLE_MODERATOR => 'moderation.read',
            default => null,
        };
        $user = $request->user();
        if (! $user || ! $ability || Gate::forUser($user)->denies($ability)
            || (! $request->isMethodSafe() && ! $user->canWriteCommunity())) {
            return response()->json(['message' => 'You do not have permission to access this resource.', 'code' => 'FORBIDDEN'], 403)
                ->header('Cache-Control', 'no-store, private');
        }

        return $next($request);
    }
}
