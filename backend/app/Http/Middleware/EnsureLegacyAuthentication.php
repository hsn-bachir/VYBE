<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureLegacyAuthentication
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('firebase_auth.mode') === 'firebase') {
            return response()->json(['message' => 'Not found.'], 404)
                ->header('Cache-Control', 'no-store, private');
        }

        return $next($request);
    }
}
