<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\MovieNights\CastMovieNightVoteRequest;
use App\Http\Requests\MovieNights\ShowMovieNightRequest;
use App\Http\Resources\MovieNightVoteResource;
use App\Services\MovieNights\MovieNightVotingService;
use Illuminate\Http\JsonResponse;

class MovieNightVotingController extends Controller
{
    public function __construct(private MovieNightVotingService $voting) {}

    public function store(CastMovieNightVoteRequest $request): JsonResponse
    {
        return (new MovieNightVoteResource($this->voting->cast($request->user(), (int) $request->validated('night'),
            (int) $request->validated('movie_night_movie_id'))))->response()->setStatusCode(200);
    }

    public function index(ShowMovieNightRequest $request): JsonResponse
    {
        return response()->json(['data' => $this->voting->totals($request->user(), (int) $request->validated('night'))]);
    }
}
