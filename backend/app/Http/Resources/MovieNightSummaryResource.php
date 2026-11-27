<?php

namespace App\Http\Resources;

use App\Enums\MovieNightRsvp;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MovieNightSummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $rsvp = $request->user()->id === $this->host_user_id ? MovieNightRsvp::Accepted->value
            : $this->invitations->firstWhere('invited_user_id', $request->user()->id)?->rsvp_status->value;
        // Explicit minimal invitation projection for pending/declined participants.
        $summary = ['id' => $this->id, 'title' => $this->title,
            'host' => ['id' => $this->host->id, 'username' => $this->host->username, 'avatar_url' => $this->host->avatar_url],
            'starts_at' => $this->starts_at->toISOString(), 'timezone' => $this->timezone,
            'status' => $this->status->value, 'my_rsvp' => $rsvp];

        if ($rsvp !== MovieNightRsvp::Accepted->value) {
            return $summary;
        }

        return $summary + ['finalized_tmdb_id' => $this->finalized_tmdb_id,
            'finalized_at' => $this->finalized_at?->toISOString(), 'cancelled_at' => $this->cancelled_at?->toISOString(),
            'voting_open' => $this->votingIsOpen(),
            'created_at' => $this->created_at->toISOString(), 'updated_at' => $this->updated_at->toISOString()];
    }
}
