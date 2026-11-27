<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MovieNightVoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['movie_night_movie_id' => $this->movie_night_movie_id, 'updated_at' => $this->updated_at->toISOString()];
    }
}
