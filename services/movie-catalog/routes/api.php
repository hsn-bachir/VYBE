<?php

use App\Http\Controllers\Internal\V1\MovieController;
use App\Http\Controllers\Internal\V1\RecommendationCandidateController;
use Illuminate\Support\Facades\Route;

// `routes/api.php` receives Laravel's `/api` prefix automatically.
// All internal business endpoints MUST use the service-token middleware.
Route::middleware('catalog.internal')->prefix('internal/v1')->group(function (): void {
    Route::get('/health', fn () => response()->json([
        'status' => 'ok',
        'service' => 'movie-catalog',
    ]));

    Route::get('/movies/popular', [MovieController::class, 'popular']);
    Route::get('/movies/discover', [MovieController::class, 'discover']);
    Route::get('/movies/search', [MovieController::class, 'search']);
    Route::post('/movies/summaries', [MovieController::class, 'summaries']);
    Route::post('/movies/recommendation-candidates', RecommendationCandidateController::class);
    Route::get('/movies/{tmdb_id}', [MovieController::class, 'show']);
    Route::get('/movies/{tmdb_id}/experience', [MovieController::class, 'experience']);
});
