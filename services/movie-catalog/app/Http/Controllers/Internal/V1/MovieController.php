<?php

namespace App\Http\Controllers\Internal\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Movies\ListMoviesRequest;
use App\Http\Requests\Movies\SearchMoviesRequest;
use App\Http\Requests\Movies\ShowMovieRequest;
use App\Http\Resources\MovieResource;
use App\Http\Resources\MovieSummaryResource;
use App\Services\MovieService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MovieController extends Controller
{
    public function __construct(private MovieService $movies) {}

    public function popular(ListMoviesRequest $request): AnonymousResourceCollection
    {
        $result = $this->movies->ranking((int) $request->validated('page', 1));

        return MovieSummaryResource::collection($result['movies'])->additional(['meta' => $result['meta']]);
    }

    public function search(SearchMoviesRequest $request): AnonymousResourceCollection
    {
        $result = $this->movies->ranking((int) $request->validated('page', 1), $request->validated('query'));

        return MovieSummaryResource::collection($result['movies'])->additional(['meta' => $result['meta']]);
    }

    public function show(ShowMovieRequest $request): MovieResource
    {
        [$movie, $stale] = $this->movies->details((int) $request->validated('tmdb_id'));

        return (new MovieResource($movie))->additional(['meta' => ['stale' => $stale]]);
    }
}
