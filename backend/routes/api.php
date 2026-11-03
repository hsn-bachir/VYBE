<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CollectionController;
use App\Http\Controllers\Api\V1\EmailVerificationController;
use App\Http\Controllers\Api\V1\LibraryController;
use App\Http\Controllers\Api\V1\MovieController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\RatingController;
use App\Http\Controllers\Api\V1\ReviewController;
use App\Http\Middleware\EnsureVerifiedAccount;
use App\Http\Middleware\PreventAuthCaching;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

Route::prefix('v1/movies')->group(function (): void {
    Route::get('{tmdb_id}/ratings', [RatingController::class, 'statistics'])->middleware('throttle:community-read');
    Route::get('{tmdb_id}/reviews', [ReviewController::class, 'index'])->middleware('throttle:community-read', PreventAuthCaching::class);
    Route::get('popular', [MovieController::class, 'popular']);
    Route::get('search', [MovieController::class, 'search']);
    Route::get('{tmdb_id}', [MovieController::class, 'show']);
    Route::get('{tmdb_id}/experience', [MovieController::class, 'experience']);
});

Route::prefix('v1/movies')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
    ->middleware(['web', PreventAuthCaching::class, 'auth:sanctum', EnsureVerifiedAccount::class, 'throttle:library-write'])->group(function (): void {
        Route::post('{tmdb_id}/reviews', [ReviewController::class, 'store']);
        Route::patch('{tmdb_id}/reviews/{review_id}', [ReviewController::class, 'update']);
        Route::delete('{tmdb_id}/reviews/{review_id}', [ReviewController::class, 'destroy']);
    });

Route::prefix('v1/me')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
    ->middleware(['web', PreventAuthCaching::class, 'auth:sanctum', EnsureVerifiedAccount::class])->group(function (): void {
        foreach (['watchlist', 'watched'] as $library) {
            Route::get($library, [LibraryController::class, 'index'])->defaults('library', $library)->middleware('throttle:library-read');
            Route::post($library, [LibraryController::class, 'store'])->defaults('library', $library)->middleware('throttle:library-write');
            Route::delete($library.'/{tmdb_id}', [LibraryController::class, 'destroy'])->defaults('library', $library)->middleware('throttle:library-write');
        }
        Route::get('movies/{tmdb_id}/library-state', [LibraryController::class, 'state'])->middleware('throttle:library-read');
        Route::get('ratings/{tmdb_id}', [RatingController::class, 'show'])->middleware('throttle:library-read');
        Route::get('reviews/{tmdb_id}', [ReviewController::class, 'own'])->middleware('throttle:library-read');
        Route::get('profile', [ProfileController::class, 'show'])->middleware('throttle:library-read');
        Route::patch('profile', [ProfileController::class, 'update'])->middleware('throttle:library-write');
        Route::post('profile/avatar', [ProfileController::class, 'upload'])->middleware(['throttle:library-write', 'throttle:avatar-upload']);
        Route::delete('profile/avatar', [ProfileController::class, 'remove'])->middleware('throttle:library-write');
        Route::put('ratings/{tmdb_id}', [RatingController::class, 'put'])->middleware('throttle:library-write');
        Route::delete('ratings/{tmdb_id}', [RatingController::class, 'destroy'])->middleware('throttle:library-write');
        Route::get('collections', [CollectionController::class, 'index'])->middleware('throttle:library-read');
        Route::post('collections', [CollectionController::class, 'store'])->middleware('throttle:library-write');
        Route::get('collections/{id}', [CollectionController::class, 'show'])->middleware('throttle:library-read');
        Route::patch('collections/{id}', [CollectionController::class, 'update'])->middleware('throttle:library-write');
        Route::delete('collections/{id}', [CollectionController::class, 'destroy'])->middleware('throttle:library-write');
        Route::get('collections/{id}/movies', [CollectionController::class, 'movies'])->middleware('throttle:library-read');
        Route::post('collections/{id}/movies', [CollectionController::class, 'add'])->middleware('throttle:library-write');
        Route::delete('collections/{id}/movies/{tmdb_id}', [CollectionController::class, 'remove'])->middleware('throttle:library-write');
    });

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
