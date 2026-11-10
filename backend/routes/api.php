<?php

use App\Http\Controllers\Api\V1\AdminUserController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CollectionController;
use App\Http\Controllers\Api\V1\EmailVerificationController;
use App\Http\Controllers\Api\V1\FirebaseLinkAuthorizationController;
use App\Http\Controllers\Api\V1\FirebasePasswordController;
use App\Http\Controllers\Api\V1\FirebaseRegistrationController;
use App\Http\Controllers\Api\V1\FirebaseSessionController;
use App\Http\Controllers\Api\V1\FirebaseSocialController;
use App\Http\Controllers\Api\V1\InvitationAcceptanceController;
use App\Http\Controllers\Api\V1\LibraryController;
use App\Http\Controllers\Api\V1\ModerationController;
use App\Http\Controllers\Api\V1\MovieController;
use App\Http\Controllers\Api\V1\PasswordResetController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\RatingController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ReviewController;
use App\Http\Middleware\EnsureAccountAccess;
use App\Http\Middleware\EnsureActiveAccount;
use App\Http\Middleware\EnsureLegacyAuthentication;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureVerifiedAccount;
use App\Http\Middleware\PreventAuthCaching;
use Illuminate\Http\Request;
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
    ->middleware(['web', PreventAuthCaching::class, 'auth:sanctum', EnsureAccountAccess::class, EnsureVerifiedAccount::class, 'throttle:library-write'])->group(function (): void {
        Route::post('{tmdb_id}/reviews', [ReviewController::class, 'store'])->middleware(EnsureActiveAccount::class);
        Route::patch('{tmdb_id}/reviews/{review_id}', [ReviewController::class, 'update'])->middleware(EnsureActiveAccount::class);
        Route::delete('{tmdb_id}/reviews/{review_id}', [ReviewController::class, 'destroy']);
        Route::post('{tmdb_id}/reviews/{review_id}/reports', [ReportController::class, 'store'])
            ->middleware([EnsureActiveAccount::class, 'throttle:review-report']);
    });

Route::prefix('v1/admin')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
    ->middleware(['web', PreventAuthCaching::class, 'auth:sanctum', EnsureAccountAccess::class,
        EnsureVerifiedAccount::class, EnsureRole::class.':moderator'])->group(function (): void {
            Route::get('overview', [ModerationController::class, 'overview'])->middleware('throttle:admin-read');
            Route::get('movie-summaries', [ModerationController::class, 'movieSummaries'])->middleware('throttle:admin-read');
            Route::get('reports', [ModerationController::class, 'reports'])->middleware('throttle:admin-read');
            Route::get('reports/{id}', [ModerationController::class, 'report'])->middleware('throttle:admin-read');
            Route::post('reports/{id}/resolve', [ModerationController::class, 'resolve'])->middleware('throttle:admin-write');
            Route::post('reports/{id}/dismiss', [ModerationController::class, 'dismiss'])->middleware('throttle:admin-write');
            Route::get('reviews', [ModerationController::class, 'reviews'])->middleware('throttle:admin-read');
            Route::get('reviews/{id}', [ModerationController::class, 'review'])->middleware('throttle:admin-read');
            Route::put('reviews/{id}/visibility', [ModerationController::class, 'visibility'])->middleware('throttle:admin-write');
            Route::put('reviews/{id}/spoiler', [ModerationController::class, 'spoiler'])->middleware('throttle:admin-write');
            Route::get('actions', [ModerationController::class, 'actions'])->middleware('throttle:admin-read');
        });

Route::prefix('v1/me')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
    ->middleware(['web', PreventAuthCaching::class, 'auth:sanctum', EnsureAccountAccess::class, EnsureVerifiedAccount::class])->group(function (): void {
        Route::get('access', fn (Request $request) => response()->json(['data' => [
            'role' => $request->user()->role, 'account_status' => $request->user()->account_status,
        ]]))->middleware('throttle:library-read');
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
        Route::put('ratings/{tmdb_id}', [RatingController::class, 'put'])->middleware(['throttle:library-write', EnsureActiveAccount::class]);
        Route::delete('ratings/{tmdb_id}', [RatingController::class, 'destroy'])->middleware(['throttle:library-write', EnsureActiveAccount::class]);
        Route::get('collections', [CollectionController::class, 'index'])->middleware('throttle:library-read');
        Route::post('collections', [CollectionController::class, 'store'])->middleware('throttle:library-write');
        Route::get('collections/{id}', [CollectionController::class, 'show'])->middleware('throttle:library-read');
        Route::patch('collections/{id}', [CollectionController::class, 'update'])->middleware('throttle:library-write');
        Route::delete('collections/{id}', [CollectionController::class, 'destroy'])->middleware('throttle:library-write');
        Route::get('collections/{id}/movies', [CollectionController::class, 'movies'])->middleware('throttle:library-read');
        Route::post('collections/{id}/movies', [CollectionController::class, 'add'])->middleware('throttle:library-write');
        Route::delete('collections/{id}/movies/{tmdb_id}', [CollectionController::class, 'remove'])->middleware('throttle:library-write');
    });

Route::prefix('v1/admin/users')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
    ->middleware(['web', PreventAuthCaching::class, 'auth:sanctum', EnsureAccountAccess::class,
        EnsureVerifiedAccount::class, EnsureRole::class.':admin'])->group(function (): void {
            Route::get('', [AdminUserController::class, 'index'])->middleware('throttle:admin-read');
            Route::post('', [AdminUserController::class, 'store'])->middleware('throttle:admin-write');
            Route::get('{id}', [AdminUserController::class, 'show'])->middleware('throttle:admin-read');
            Route::get('{id}/identity-methods', [AdminUserController::class, 'methods'])->middleware('throttle:admin-read');
            Route::post('{id}/invitation', [AdminUserController::class, 'resend'])->middleware(['throttle:admin-write', 'throttle:admin-invitation-target']);
            Route::patch('{id}', [AdminUserController::class, 'update'])->middleware('throttle:admin-write');
            Route::put('{id}/role', [AdminUserController::class, 'role'])->middleware('throttle:admin-write');
            Route::put('{id}/status', [AdminUserController::class, 'status'])->middleware('throttle:admin-write');
            Route::put('{id}/password', [AdminUserController::class, 'password'])->middleware(['throttle:admin-write', 'throttle:admin-password-change']);
            Route::post('{id}/password-reset', [AdminUserController::class, 'passwordReset'])->middleware(['throttle:admin-write', 'throttle:admin-password-reset']);
        });

// Auth is always session/CSRF protected, including requests without an Origin header.
// Avoid running the same cookie/session stack twice for first-party requests.
Route::prefix('v1/auth')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->middleware(['web', PreventAuthCaching::class])->group(function () {
    Route::post('register', [AuthController::class, 'register'])->middleware([EnsureLegacyAuthentication::class, 'throttle:register']);
    Route::post('invitations/accept', InvitationAcceptanceController::class)->middleware([EnsureLegacyAuthentication::class, 'throttle:invitation-accept']);
    Route::post('firebase/invitations/accept', [InvitationAcceptanceController::class, 'firebase'])->middleware('throttle:invitation-accept');
    Route::post('password/reset', PasswordResetController::class)->middleware([EnsureLegacyAuthentication::class, 'throttle:password-reset-complete']);
    Route::post('login', [AuthController::class, 'login'])->middleware([EnsureLegacyAuthentication::class, 'throttle:login']);
    Route::post('firebase/session', FirebaseSessionController::class)->middleware('throttle:firebase-session');
    Route::post('firebase/social/session', FirebaseSocialController::class)->middleware('throttle:firebase-session');
    Route::post('firebase/register', FirebaseRegistrationController::class)->middleware('throttle:register');
    Route::post('firebase/password/forgot', [FirebasePasswordController::class, 'forgot'])->middleware('throttle:firebase-password-forgot');
    Route::post('firebase/password/reset', [FirebasePasswordController::class, 'reset'])->middleware('throttle:firebase-password-reset');
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('firebase/link/authorize', FirebaseLinkAuthorizationController::class)
            ->middleware([EnsureAccountAccess::class, EnsureVerifiedAccount::class, 'throttle:firebase-session']);
        Route::get('me', [AuthController::class, 'me'])->middleware(EnsureAccountAccess::class);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('email/verification-status', [EmailVerificationController::class, 'status'])->middleware(EnsureAccountAccess::class);
        Route::post('email/verification-notification', [EmailVerificationController::class, 'resend'])->middleware([EnsureAccountAccess::class, 'throttle:verification']);
    });
});
