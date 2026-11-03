<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MovieRatingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['tmdb_id' => $this->tmdb_id, 'rating' => $this->rating, 'updated_at' => $this->updated_at?->toISOString()];
    }
}
