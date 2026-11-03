<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reviews\ReviewRequest;
use App\Http\Resources\ReviewResource;
use App\Services\ReviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class ReviewController extends Controller
{
    public function __construct(private ReviewService $reviews) {}

    public function index(ReviewRequest $request): AnonymousResourceCollection
    {
        $result = $this->reviews->listing((int) $request->validated('tmdb_id'), (int) $request->validated('page', 1), (int) $request->validated('per_page', 20));

        return ReviewResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }

    public function own(ReviewRequest $request): ReviewResource|JsonResponse
    {
        $review = $this->reviews->own($request->user(), (int) $request->validated('tmdb_id'));

        return $review ? new ReviewResource($review) : response()->json(['data' => null]);
    }

    public function store(ReviewRequest $request): JsonResponse
    {
        return (new ReviewResource($this->reviews->create($request->user(), (int) $request->validated('tmdb_id'), $request->safe()->only(['body', 'contains_spoilers']))))
            ->response()->setStatusCode(201);
    }

    public function update(ReviewRequest $request): ReviewResource
    {
        return new ReviewResource($this->reviews->update($request->user(), (int) $request->validated('tmdb_id'), (int) $request->validated('review_id'), $request->safe()->only(['body', 'contains_spoilers'])));
    }

    public function destroy(ReviewRequest $request): Response
    {
        $this->reviews->delete($request->user(), (int) $request->validated('tmdb_id'), (int) $request->validated('review_id'));

        return response()->noContent();
    }
}
