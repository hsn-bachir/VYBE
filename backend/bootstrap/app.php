<?php

use App\Exceptions\AvatarUnavailable;
use App\Integrations\MovieCatalog\CatalogFailure;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        // Private JSON APIs have no server-rendered login route.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/v1/me/*') ? null : '/login');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request, Throwable $e) => $request->is('api/v1/movies/*', 'api/v1/me/*', 'api/v1/admin/*', 'api/v1/auth/invitations/*', 'api/v1/auth/password/*') || $request->expectsJson());
        $exceptions->respond(function (Response $response, Throwable $e, Request $request) {
            if ($request->is('api/v1/auth/invitations/*', 'api/v1/auth/password/*')) {
                $response->headers->set('Cache-Control', 'no-store, private');
                if (in_array($response->getStatusCode(), [419, 429], true)) return response()->json([
                    'message' => $response->getStatusCode() === 419 ? 'CSRF token mismatch.' : 'Too many requests.',
                ], $response->getStatusCode(), $response->headers->all())->header('Cache-Control', 'no-store, private');
                if ($response->getStatusCode() >= 500) return response()->json([
                    'message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR',
                ], 500)->header('Cache-Control', 'no-store, private');
            }
            if ($request->is('api/v1/admin/*')) {
                $response->headers->set('Cache-Control', 'no-store, private');
                if ($response->getStatusCode() === 404) return response()->json(['message' => 'Not found.'], 404)->header('Cache-Control', 'no-store, private');
                if (in_array($response->getStatusCode(), [419, 429], true)) return response()->json([
                    'message' => $response->getStatusCode() === 419 ? 'CSRF token mismatch.' : 'Too many requests.',
                ], $response->getStatusCode(), $response->headers->all())->header('Cache-Control', 'no-store, private');
                if ($response->getStatusCode() >= 500 && ! $e instanceof CatalogFailure) return response()->json([
                    'message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR',
                ], 500)->header('Cache-Control', 'no-store, private');
            }
            if ($request->is('api/v1/me/profile', 'api/v1/me/profile/*')) {
                $response->headers->set('Cache-Control', 'no-store, private');
                if ($response->getStatusCode() === 404) {
                    return response()->json(['message' => 'Not found.'], 404)->header('Cache-Control', 'no-store, private');
                }
                if ($response->getStatusCode() === 413) {
                    return response()->json(['message' => 'The uploaded image is too large.'], 413)->header('Cache-Control', 'no-store, private');
                }
                if (in_array($response->getStatusCode(), [419, 429], true)) {
                    return response()->json(['message' => $response->getStatusCode() === 419 ? 'CSRF token mismatch.' : 'Too many requests.'], $response->getStatusCode(), $response->headers->all());
                }
                if ($response->getStatusCode() >= 500 && ! $e instanceof AvatarUnavailable) {
                    return response()->json(['message' => 'Unable to update your profile. Please try again.', 'code' => 'INTERNAL_ERROR'], 500)->header('Cache-Control', 'no-store, private');
                }
            }
            if ($request->is('api/v1/me/reviews/*', 'api/v1/movies/*/reviews', 'api/v1/movies/*/reviews/*')) {
                $response->headers->set('Cache-Control', 'no-store, private');
                if ($response->getStatusCode() === 404) {
                    return response()->json(['message' => 'Not found.'], 404)->header('Cache-Control', 'no-store, private');
                }
                if (in_array($response->getStatusCode(), [419, 429], true)) {
                    return response()->json(['message' => $response->getStatusCode() === 419 ? 'CSRF token mismatch.' : 'Too many requests.'],
                        $response->getStatusCode(), $response->headers->all());
                }
                if ($response->getStatusCode() >= 500 && ! $e instanceof CatalogFailure) {
                    return response()->json(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR'], 500)
                        ->header('Cache-Control', 'no-store, private');
                }
            }
            $ratingRoute = $request->is('api/v1/me/ratings/*', 'api/v1/movies/*/ratings');
            if ($ratingRoute) {
                $response->headers->set('Cache-Control', $request->is('api/v1/me/*') ? 'no-store, private' : 'no-store');
                if (in_array($response->getStatusCode(), [419, 429], true)) {
                    return response()->json(['message' => $response->getStatusCode() === 419 ? 'CSRF token mismatch.' : 'Too many requests.'],
                        $response->getStatusCode(), $response->headers->all());
                }
                if ($response->getStatusCode() >= 500 && ! $e instanceof CatalogFailure) {
                    return response()->json(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR'], 500)
                        ->header('Cache-Control', $request->is('api/v1/me/*') ? 'no-store, private' : 'no-store');
                }
            }
            if ($request->is('api/v1/me/*')) {
                $response->headers->set('Cache-Control', 'no-store, private');
            }
            if ($request->is('api/v1/me/collections', 'api/v1/me/collections/*') && $response->getStatusCode() === 404) {
                return response()->json(['message' => 'Not found.'], 404)->header('Cache-Control', 'no-store, private');
            }
            if ($request->is('api/v1/me/collections', 'api/v1/me/collections/*') && in_array($response->getStatusCode(), [419, 429], true)) {
                return response()->json(['message' => $response->getStatusCode() === 419 ? 'CSRF token mismatch.' : 'Too many requests.'],
                    $response->getStatusCode(), $response->headers->all())->header('Cache-Control', 'no-store, private');
            }
            if ($request->is('api/v1/me/collections', 'api/v1/me/collections/*') && $response->getStatusCode() >= 500
                && ! $e instanceof CatalogFailure) {
                return response()->json(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR'], 500)
                    ->header('Cache-Control', 'no-store, private');
            }

            return $response;
        });
    })->create();
