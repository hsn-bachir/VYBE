<?php

use Illuminate\Support\Facades\Route;

// `routes/api.php` receives Laravel's `/api` prefix automatically.
// All internal business endpoints MUST use the service-token middleware.
Route::middleware('catalog.internal')->prefix('internal/v1')->group(function (): void {
    Route::get('/health', fn () => response()->json([
        'status' => 'ok',
        'service' => 'movie-catalog',
    ]));

    // Movie API endpoints are implemented in a later Milestone 1 feature PR:
    // GET /movies/popular, GET /movies/search, GET /movies/{tmdb_id}
});
