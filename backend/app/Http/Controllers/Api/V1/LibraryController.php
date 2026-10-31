<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Library\AddLibraryMovieRequest;
use App\Http\Requests\Library\ListLibraryRequest;
use App\Http\Requests\Movies\ShowMovieRequest;
use App\Http\Resources\LibraryEntryResource;
use App\Services\LibraryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class LibraryController extends Controller
{
    public function __construct(private LibraryService $library) {}

    public function index(ListLibraryRequest $request): AnonymousResourceCollection
    {
        $result = $this->library->listing($request->user(), $request->route('library'),
            (int) $request->validated('page', 1), (int) $request->validated('per_page', 20));

        return LibraryEntryResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }

    public function store(AddLibraryMovieRequest $request): JsonResponse
    {
        $entry = $this->library->add($request->user(), $request->route('library'), $request->validated('tmdb_id'));

        return (new LibraryEntryResource($entry))->response()->setStatusCode($entry->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(ShowMovieRequest $request): Response
    {
        $this->library->remove($request->user(), $request->route('library'), (int) $request->validated('tmdb_id'));

        return response()->noContent();
    }

    public function state(ShowMovieRequest $request): JsonResponse
    {
        return response()->json(['data' => $this->library->state($request->user(), (int) $request->validated('tmdb_id'))]);
    }
}
