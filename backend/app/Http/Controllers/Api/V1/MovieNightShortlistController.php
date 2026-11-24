<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\MovieNights\ListMovieNightInvitationsRequest;
use App\Http\Requests\MovieNights\NominateMovieNightMovieRequest;
use App\Http\Requests\MovieNights\RemoveMovieNightMovieRequest;
use App\Http\Resources\MovieNightMovieResource;
use App\Services\MovieNights\MovieNightShortlistService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class MovieNightShortlistController extends Controller
{
    public function __construct(private MovieNightShortlistService $shortlist) {}

    public function index(ListMovieNightInvitationsRequest $request): AnonymousResourceCollection
    {
        $result = $this->shortlist->listing($request->user(), (int) $request->validated('night'),
            (int) $request->validated('page', 1), (int) $request->validated('per_page', 20));

        return MovieNightMovieResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }

    public function store(NominateMovieNightMovieRequest $request): JsonResponse
    {
        return (new MovieNightMovieResource($this->shortlist->nominate($request->user(), (int) $request->validated('night'),
            (int) $request->validated('tmdb_id'))))->response()->setStatusCode(201);
    }

    public function destroy(RemoveMovieNightMovieRequest $request): Response
    {
        $this->shortlist->remove($request->user(), (int) $request->validated('night'), (int) $request->validated('movie'));

        return response()->noContent();
    }
}
