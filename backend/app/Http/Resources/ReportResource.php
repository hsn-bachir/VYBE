<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $moderator = $request->is('api/v1/admin/*');
        $review = $moderator && $this->relationLoaded('review') ? $this->review : null;

        return [
            'id' => $this->id, 'target_type' => $this->target_type, 'target_id' => $this->target_id,
            'reason' => $this->reason, 'description' => $this->description, 'status' => $this->status,
            'created_at' => $this->created_at?->toISOString(), 'updated_at' => $this->updated_at?->toISOString(),
            'resolved_by' => $this->when($moderator, $this->resolved_by),
            'resolved_at' => $this->when($moderator, $this->resolved_at?->toISOString()),
            'resolution_note' => $this->when($moderator, $this->resolution_note),
            'resolution_action' => $this->when($moderator, $this->resolution_action),
            'reporter' => $this->when($moderator, fn () => $this->reporter
                ? ['id' => $this->reporter->id, 'username' => $this->reporter->username] : null),
            'target_available' => $this->when($moderator, $review !== null),
            'review' => $this->when($moderator && $review !== null, fn () => (new ModerationReviewResource($review))->toArray($request)),
        ];
    }
}
