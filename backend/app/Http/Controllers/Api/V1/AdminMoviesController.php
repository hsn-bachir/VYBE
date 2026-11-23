<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ManageMoviesRequest;
use App\Integrations\MovieCatalog\MovieCatalogClient;
use App\Models\AdministrativeAction;
use Illuminate\Http\JsonResponse;
use Throwable;

class AdminMoviesController extends Controller
{
    public function index(ManageMoviesRequest $request, MovieCatalogClient $catalog): JsonResponse
    {
        return response()->json($catalog->managedMovies($request->safe()->only(['q', 'status', 'page'])));
    }

    public function show(ManageMoviesRequest $request, MovieCatalogClient $catalog): JsonResponse
    {
        return response()->json($catalog->managedMovies([], (int) $request->validated('tmdb_id')));
    }

    public function refresh(ManageMoviesRequest $request, MovieCatalogClient $catalog): JsonResponse
    {
        $id = (int) $request->validated('tmdb_id');
        // Persist intent before the remote write. A failed completion write leaves a
        // recoverable requested record instead of an unaudited Catalog mutation.
        $audit = AdministrativeAction::create([
            'actor_id' => $request->user()->id, 'action' => 'movie.refresh_requested',
            'target_type' => 'movie', 'target_id' => $id, 'created_at' => now(),
        ]);
        try {
            $result = $catalog->managedMovies([], $id, refresh: true);
        } catch (Throwable $error) {
            $audit->update(['action' => 'movie.refresh_failed']);
            throw $error;
        }
        $audit->update(['action' => 'movie.refreshed', 'details' => ['metadata_fetched_at' => $result['data']['metadata_fetched_at']]]);

        return response()->json($result);
    }
}
