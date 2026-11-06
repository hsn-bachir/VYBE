<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'tmdb_id' => $this->tmdb_id,
            'author' => ['id' => $this->user->id, 'username' => $this->user->username, 'avatar_url' => $this->user->avatar_url],
            'body' => $this->body, 'contains_spoilers' => (bool) ($this->contains_spoilers || $this->moderator_spoiler),
            'author_contains_spoilers' => $this->when($request->user()?->id === $this->user_id, $this->contains_spoilers),
            'moderator_spoiler' => $this->when($request->user()?->id === $this->user_id, $this->moderator_spoiler),
            'visibility' => $this->when($request->user()?->id === $this->user_id, $this->visibility),
            'created_at' => $this->created_at?->toISOString(), 'updated_at' => $this->updated_at?->toISOString()];
    }
}
