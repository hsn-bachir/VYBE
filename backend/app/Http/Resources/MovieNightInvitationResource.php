<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MovieNightInvitationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'participant' => new MovieNightParticipantResource($this->invitedUser),
            'rsvp_status' => $this->rsvp_status->value, 'responded_at' => $this->responded_at?->toISOString(),
            'movie_night' => new MovieNightSummaryResource($this->whenLoaded('movieNight'))];
    }
}
