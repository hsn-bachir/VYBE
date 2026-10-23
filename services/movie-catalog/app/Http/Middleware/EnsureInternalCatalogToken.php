<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureInternalCatalogToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = config('catalog.internal_token');

        if (! is_string($expected) || $expected === '') {
            return response()->json([
                'message' => 'Service authentication is not configured.',
                'code' => 'SERVICE_MISCONFIGURED',
            ], 503);
        }

        $provided = $request->header('X-VYBE-Service-Token');

        if (! is_string($provided) || ! hash_equals($expected, $provided)) {
            return response()->json([
                'message' => 'Forbidden.',
                'code' => 'FORBIDDEN',
            ], 403);
        }

        return $next($request);
    }
}
