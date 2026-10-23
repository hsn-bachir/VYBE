<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\EmailVerificationController;
use App\Http\Middleware\PreventAuthCaching;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

// Auth is always session/CSRF protected, including requests without an Origin header.
// Avoid running the same cookie/session stack twice for first-party requests.
Route::prefix('v1/auth')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->middleware(['web', PreventAuthCaching::class])->group(function () {
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:register');
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('email/verification-status', [EmailVerificationController::class, 'status']);
        Route::post('email/verification-notification', [EmailVerificationController::class, 'resend'])->middleware('throttle:verification');
    });
});
