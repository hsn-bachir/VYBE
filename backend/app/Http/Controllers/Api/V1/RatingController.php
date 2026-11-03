<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ratings\RatingRequest;
use App\Http\Resources\MovieRatingResource;
use App\Services\RatingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class RatingController extends Controller
{
    public function __construct(private RatingService $ratings) {}

    public function statistics(RatingRequest $request): JsonResponse
    {
        return response()->json(['data' => $this->ratings->statistics((int) $request->validated('tmdb_id'))])
            ->header('Cache-Control', 'no-store');
    }

    public function show(RatingRequest $request): MovieRatingResource|JsonResponse
    {
        $rating = $this->ratings->own($request->user(), (int) $request->validated('tmdb_id'));

        return $rating ? new MovieRatingResource($rating) : response()->json(['data' => null]);
    }

    public function put(RatingRequest $request): MovieRatingResource
    {
        return new MovieRatingResource($this->ratings->put($request->user(), (int) $request->validated('tmdb_id'), $request->validated('rating')));
    }

    public function destroy(RatingRequest $request): Response
    {
        $this->ratings->remove($request->user(), (int) $request->validated('tmdb_id'));

        return response()->noContent();
    }
}
