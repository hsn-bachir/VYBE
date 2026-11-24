<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MovieNightMovieResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'tmdb_id' => $this->tmdb_id,
            'nominated_by' => new MovieNightParticipantResource($this->nominatedBy),
            'created_at' => $this->created_at->toISOString(), 'movie' => $this->resource->getAttribute('movie')];
    }
}
