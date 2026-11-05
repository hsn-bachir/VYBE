<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ModerationReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'tmdb_id' => $this->tmdb_id,
            'author' => $this->user ? ['id' => $this->user->id, 'username' => $this->user->username] : null,
            'body' => $this->body, 'visibility' => $this->visibility,
            'author_contains_spoilers' => $this->contains_spoilers,
            'moderator_spoiler' => $this->moderator_spoiler,
            'contains_spoilers' => (bool) ($this->contains_spoilers || $this->moderator_spoiler),
            'created_at' => $this->created_at?->toISOString(), 'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
