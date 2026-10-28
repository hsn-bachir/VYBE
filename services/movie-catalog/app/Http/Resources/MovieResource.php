<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MovieResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'tmdb_id' => $this->tmdb_id,
            'title' => $this->title,
            'original_title' => $this->original_title,
            'overview' => $this->overview,
            'poster_path' => $this->poster_path,
            'backdrop_path' => $this->backdrop_path,
            'release_date' => $this->release_date?->format('Y-m-d'),
            'runtime' => $this->runtime,
            'original_language' => $this->original_language,
            'genres' => $this->genres ?? [],
            'tmdb_rating' => $this->tmdb_rating === null ? null : (float) $this->tmdb_rating,
            'tmdb_vote_count' => $this->tmdb_vote_count,
        ];
    }
}
