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
            'body' => $this->body, 'contains_spoilers' => $this->contains_spoilers,
            'created_at' => $this->created_at?->toISOString(), 'updated_at' => $this->updated_at?->toISOString()];
    }
}
