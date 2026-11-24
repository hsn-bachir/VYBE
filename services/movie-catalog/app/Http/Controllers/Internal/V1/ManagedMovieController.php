<?php

namespace App\Http\Controllers\Internal\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Movies\ManageMoviesRequest;
use App\Http\Requests\Movies\ShowMovieRequest;
use App\Http\Resources\ManagedMovieResource;
use App\Models\Movie;
use App\Services\MovieService;
use Illuminate\Http\JsonResponse;

class ManagedMovieController extends Controller
{
    public function index(ManageMoviesRequest $request): JsonResponse
    {
        $query = Movie::query();
        $search = trim($request->validated('q') ?? '');
        if ($search !== '') {
            if (ctype_digit($search)) {
                $query->where('tmdb_id', strlen($search) <= 10 && (float) $search <= 2147483647 ? (int) $search : 0);
            } else {
                // Literal substring matching, independent of database collation.
                $query->whereRaw("LOWER(title) LIKE ? ESCAPE '!'", ['%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($search)).'%']);
            }
        }
        $boundary = now()->subSeconds(config('catalog.metadata_ttl_seconds'));
        match ($request->validated('status', 'all')) {
            'fresh' => $query->where('metadata_fetched_at', '>', $boundary),
            'stale' => $query->where('metadata_fetched_at', '<=', $boundary),
            'not_hydrated' => $query->whereNull('metadata_fetched_at'),
            'unknown_genres' => $query->whereNull('genres'),
            'missing_poster' => $query->where(fn ($q) => $q->whereNull('poster_path')->orWhere('poster_path', '')),
            'missing_overview' => $query->where(fn ($q) => $q->whereNull('overview')->orWhereRaw("TRIM(overview) = ''")),
            default => null,
        };
        $page = $query->orderBy('tmdb_id')->paginate(20);

        return response()->json(['data' => ManagedMovieResource::collection($page->items())->resolve(), 'meta' => [
            'page' => $page->currentPage(), 'total_pages' => $page->lastPage(), 'total_results' => $page->total(),
        ]]);
    }

    public function show(ShowMovieRequest $request): ManagedMovieResource
    {
        return new ManagedMovieResource(Movie::where('tmdb_id', (int) $request->validated('tmdb_id'))->firstOrFail());
    }

    public function refresh(ShowMovieRequest $request, MovieService $movies): JsonResponse
    {
        [$movie] = $movies->details((int) $request->validated('tmdb_id'), force: true);

        return response()->json(['data' => (new ManagedMovieResource($movie))->resolve(), 'meta' => ['outcome' => 'refreshed']]);
    }
}
