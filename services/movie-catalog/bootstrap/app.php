<?php

use App\Exceptions\MovieNotFound;
use App\Exceptions\UpstreamUnavailable;
use App\Http\Middleware\EnsureInternalCatalogToken;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'catalog.internal' => EnsureInternalCatalogToken::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request, Throwable $e) => $request->is('api/*') || $request->expectsJson());
        $exceptions->dontReport([MovieNotFound::class, UpstreamUnavailable::class]);
        $exceptions->render(function (MovieNotFound $e) {
            return response()->json(['message' => 'Movie not found', 'code' => 'MOVIE_NOT_FOUND'], 404);
        });
        $exceptions->render(function (UpstreamUnavailable $e) {
            return response()->json(['message' => 'Movie service unavailable', 'code' => 'UPSTREAM_UNAVAILABLE'], 503);
        });
        $exceptions->render(function (Throwable $e, Request $request) {
            if ($request->is('api/*') && ! $e instanceof ValidationException
                && (! $e instanceof HttpExceptionInterface || $e->getStatusCode() >= 500)) {
                return response()->json(['message' => 'Internal server error', 'code' => 'INTERNAL_ERROR'], 500);
            }
        });
    })->create();
