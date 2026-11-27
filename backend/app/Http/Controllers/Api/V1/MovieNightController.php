<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\MovieNights\FinalizeMovieNightRequest;
use App\Http\Requests\MovieNights\ListMovieNightsRequest;
use App\Http\Requests\MovieNights\ShowMovieNightRequest;
use App\Http\Requests\MovieNights\WriteMovieNightRequest;
use App\Http\Resources\MovieNightResource;
use App\Http\Resources\MovieNightSummaryResource;
use App\Services\MovieNights\MovieNightService;
use App\Services\MovieNights\MovieNightTransitions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MovieNightController extends Controller
{
    public function __construct(private MovieNightService $nights) {}

    public function index(ListMovieNightsRequest $request): AnonymousResourceCollection
    {
        $result = $this->nights->listing($request->user(), (int) $request->validated('page', 1),
            (int) $request->validated('per_page', 20), $request->validated('status'));

        return MovieNightSummaryResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }

    public function store(WriteMovieNightRequest $request): JsonResponse
    {
        return (new MovieNightResource($this->nights->create($request->user(), $this->fields($request))))
            ->response()->setStatusCode(201);
    }

    public function show(ShowMovieNightRequest $request): MovieNightResource
    {
        return new MovieNightResource($this->nights->visible($request->user(), (int) $request->validated('night')));
    }

    public function update(WriteMovieNightRequest $request): MovieNightResource
    {
        return new MovieNightResource($this->nights->update($request->user(), (int) $request->validated('night'), $this->fields($request)));
    }

    public function cancel(ShowMovieNightRequest $request): MovieNightResource
    {
        return new MovieNightResource($this->nights->cancel($request->user(), (int) $request->validated('night')));
    }

    public function finalize(FinalizeMovieNightRequest $request, MovieNightTransitions $transitions): MovieNightResource
    {
        $night = $transitions->finalize($request->user(), (int) $request->validated('night'),
            $request->has('tmdb_id') ? (int) $request->validated('tmdb_id') : null);

        return new MovieNightResource($night->load('host:id,username,avatar_url'));
    }

    private function fields(WriteMovieNightRequest $request): array
    {
        return $request->safe()->only(['title', 'starts_at', 'timezone', 'location', 'meeting_url']);
    }
}
