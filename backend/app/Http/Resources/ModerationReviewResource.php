<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

class ModerationReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'tmdb_id' => $this->tmdb_id,
            'author' => $this->user ? ['id' => $this->user->id, 'username' => $this->user->username] : null,
            'body' => $this->when(! $request->boolean('compact'), $this->body),
            'body_preview' => Str::limit($this->body, 180), 'visibility' => $this->visibility,
            'pending_report_count' => $this->whenCounted('pending_reports'),
            'author_contains_spoilers' => $this->contains_spoilers,
            'moderator_spoiler' => $this->moderator_spoiler,
            'contains_spoilers' => (bool) ($this->contains_spoilers || $this->moderator_spoiler),
            'created_at' => $this->created_at?->toISOString(), 'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
