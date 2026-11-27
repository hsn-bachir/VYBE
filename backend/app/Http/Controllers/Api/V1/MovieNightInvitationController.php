<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\MovieNightRsvp;
use App\Http\Controllers\Controller;
use App\Http\Requests\MovieNights\CreateMovieNightInvitationRequest;
use App\Http\Requests\MovieNights\FindMovieNightInviteesRequest;
use App\Http\Requests\MovieNights\ListMovieNightInvitationsRequest;
use App\Http\Requests\MovieNights\RespondMovieNightRequest;
use App\Http\Resources\MovieNightInvitationResource;
use App\Http\Resources\MovieNightParticipantResource;
use App\Services\MovieNights\MovieNightInvitationService;
use App\Services\MovieNights\MovieNightTransitions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MovieNightInvitationController extends Controller
{
    public function __construct(private MovieNightInvitationService $invitations) {}

    public function eligible(FindMovieNightInviteesRequest $request): AnonymousResourceCollection
    {
        $result = $this->invitations->eligible($request->user(), (int) $request->validated('night'), $request->validated('query'),
            (int) $request->validated('page', 1), (int) $request->validated('per_page', 20));

        return MovieNightParticipantResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }

    public function store(CreateMovieNightInvitationRequest $request): JsonResponse
    {
        return (new MovieNightInvitationResource($this->invitations->create($request->user(), (int) $request->validated('night'),
            (int) $request->validated('invited_user_id'))))->response()->setStatusCode(201);
    }

    public function respond(RespondMovieNightRequest $request, MovieNightTransitions $transitions): MovieNightInvitationResource
    {
        return new MovieNightInvitationResource($transitions->respond($request->user(), (int) $request->validated('night'),
            MovieNightRsvp::from($request->validated('rsvp_status'))));
    }

    public function received(ListMovieNightInvitationsRequest $request): AnonymousResourceCollection
    {
        $result = $this->invitations->received($request->user(), (int) $request->validated('page', 1), (int) $request->validated('per_page', 20));

        return MovieNightInvitationResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }

    public function index(ListMovieNightInvitationsRequest $request): AnonymousResourceCollection
    {
        $result = $this->invitations->listing($request->user(), (int) $request->validated('night'),
            (int) $request->validated('page', 1), (int) $request->validated('per_page', 20));

        return MovieNightInvitationResource::collection($result['entries'])->additional(['meta' => $result['meta']]);
    }
}
