<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Movies\ListMoviesRequest;
use App\Http\Requests\Movies\SearchMoviesRequest;
use App\Http\Requests\Movies\ShowMovieRequest;
use App\Integrations\MovieCatalog\MovieCatalogClient;
use Illuminate\Http\JsonResponse;

class MovieController extends Controller
{
    public function __construct(private MovieCatalogClient $catalog) {}

    public function popular(ListMoviesRequest $request): JsonResponse
    {
        return response()->json($this->catalog->popular((int) $request->validated('page', 1)));
    }

    public function search(SearchMoviesRequest $request): JsonResponse
    {
        return response()->json($this->catalog->search($request->validated('query'), (int) $request->validated('page', 1)));
    }

    public function show(ShowMovieRequest $request): JsonResponse
    {
        return response()->json($this->catalog->details((int) $request->validated('tmdb_id')));
    }
}
