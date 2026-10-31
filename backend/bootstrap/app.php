<?php

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
        $exceptions->shouldRenderJsonWhen(fn (Request $request, Throwable $e) => $request->is('api/v1/movies/*', 'api/v1/me/*') || $request->expectsJson());
        $exceptions->respond(function (Response $response, Throwable $e, Request $request) {
            if ($request->is('api/v1/me/*')) {
                $response->headers->set('Cache-Control', 'no-store, private');
            }

            return $response;
        });
    })->create();
