<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicCollectionMovieResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['tmdb_id' => (int) $this->tmdb_id, 'movie' => $this->movie, 'metadata_status' => $this->metadata_status];
    }
}
