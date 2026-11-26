<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicCollectionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => (int) $this->id, 'name' => $this->name, 'description' => $this->description,
            'movie_count' => (int) $this->movies_count,
            'creator' => new PublicProfileResource($this->user),
            'preview_movies' => $this->when(array_key_exists('preview_movies', $this->resource->getAttributes()), $this->preview_movies)];
    }
}
