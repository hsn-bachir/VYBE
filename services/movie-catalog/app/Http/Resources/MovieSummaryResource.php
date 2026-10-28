<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MovieSummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'tmdb_id' => (int) $this->resource['tmdb_id'],
            'title' => $this->resource['title'],
            'poster_path' => $this->resource['poster_path'] ?? null,
            'backdrop_path' => $this->resource['backdrop_path'] ?? null,
            'overview' => $this->resource['overview'] ?? null,
            'release_date' => $this->resource['release_date'] ?? null,
            'tmdb_rating' => isset($this->resource['tmdb_rating']) ? (float) $this->resource['tmdb_rating'] : null,
            'tmdb_vote_count' => $this->resource['tmdb_vote_count'] ?? null,
        ];
    }
}
