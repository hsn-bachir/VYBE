<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\AddCollectionMovieRequest;
use App\Http\Requests\Collections\ListCollectionsRequest;
use App\Http\Requests\Collections\ShowCollectionRequest;
use App\Http\Requests\Collections\WriteCollectionRequest;
use App\Http\Resources\CollectionResource;
use App\Http\Resources\LibraryEntryResource;
use App\Services\CollectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class CollectionController extends Controller
{
    public function __construct(private CollectionService $collections) {}

    public function index(ListCollectionsRequest $request): AnonymousResourceCollection
    {
        $result = $this->collections->listing($request->user(), (int) $request->validated('page', 1),
            (int) $request->validated('per_page', 20), $request->has('contains_tmdb_id') ? (int) $request->validated('contains_tmdb_id') : null);

        return CollectionResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }

    public function store(WriteCollectionRequest $request): JsonResponse
    {
        return (new CollectionResource($this->collections->create($request->user(), $request->safe()->only(['name', 'description']))))
            ->response()->setStatusCode(201);
    }

    public function show(ShowCollectionRequest $request): CollectionResource
    {
        return new CollectionResource($this->collections->owned($request->user(), (int) $request->validated('id'))->loadCount('movies'));
    }

    public function update(WriteCollectionRequest $request): CollectionResource
    {
        return new CollectionResource($this->collections->update($request->user(), (int) $request->validated('id'), $request->safe()->only(['name', 'description'])));
    }

    public function destroy(ShowCollectionRequest $request): Response
    {
        $this->collections->delete($request->user(), (int) $request->validated('id'));

        return response()->noContent();
    }

    public function movies(ListCollectionsRequest $request): AnonymousResourceCollection
    {
        $result = $this->collections->movies($request->user(), (int) $request->validated('id'),
            (int) $request->validated('page', 1), (int) $request->validated('per_page', 20));

        return LibraryEntryResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }

    public function add(AddCollectionMovieRequest $request): JsonResponse
    {
        $entry = $this->collections->add($request->user(), (int) $request->validated('id'), $request->validated('tmdb_id'));

        return (new LibraryEntryResource($entry))->response()->setStatusCode($entry->wasRecentlyCreated ? 201 : 200);
    }

    public function remove(ShowCollectionRequest $request): Response
    {
        $this->collections->remove($request->user(), (int) $request->validated('id'), (int) $request->validated('tmdb_id'));

        return response()->noContent();
    }
}
