<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['user' => new UserResource($this->resource), 'bio' => $this->bio,
            'member_since' => $this->created_at?->toISOString(),
            'statistics' => ['watched_count' => $this->watched_movies_count, 'watchlist_count' => $this->watchlist_entries_count, 'review_count' => $this->reviews_count]];
    }
}
