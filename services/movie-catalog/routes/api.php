<?php

use App\Http\Controllers\Internal\V1\MovieController;
use Illuminate\Support\Facades\Route;

// `routes/api.php` receives Laravel's `/api` prefix automatically.
// All internal business endpoints MUST use the service-token middleware.
Route::middleware('catalog.internal')->prefix('internal/v1')->group(function (): void {
    Route::get('/health', fn () => response()->json([
        'status' => 'ok',
        'service' => 'movie-catalog',
    ]));

    Route::get('/movies/popular', [MovieController::class, 'popular']);
    Route::get('/movies/search', [MovieController::class, 'search']);
    Route::post('/movies/summaries', [MovieController::class, 'summaries']);
    Route::get('/movies/{tmdb_id}', [MovieController::class, 'show']);
});
