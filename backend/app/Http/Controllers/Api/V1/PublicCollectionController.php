<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\PublicCollectionRequest;
use App\Http\Resources\PublicCollectionMovieResource;
use App\Http\Resources\PublicCollectionResource;
use App\Services\CollectionService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PublicCollectionController extends Controller
{
    public function __construct(private CollectionService $collections) {}

    public function index(PublicCollectionRequest $request): AnonymousResourceCollection
    {
        $result = $this->collections->publicListing((int) $request->validated('id'),
            (int) $request->validated('page', 1), (int) $request->validated('per_page', 20));

        return PublicCollectionResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }

    public function show(PublicCollectionRequest $request): PublicCollectionResource
    {
        return new PublicCollectionResource($this->collections->publicCollection((int) $request->validated('id')));
    }

    public function movies(PublicCollectionRequest $request): AnonymousResourceCollection
    {
        $result = $this->collections->publicMovies((int) $request->validated('id'),
            (int) $request->validated('page', 1), (int) $request->validated('per_page', 20));

        return PublicCollectionMovieResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }
}
