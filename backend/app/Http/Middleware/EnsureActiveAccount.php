<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->canWriteCommunity()) {
            return response()->json(['message' => 'This account cannot perform this action.', 'code' => 'ACCOUNT_RESTRICTED'], 403)
                ->header('Cache-Control', 'no-store, private');
        }

        return $next($request);
    }
}
