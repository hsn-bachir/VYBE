<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CollectionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'description' => $this->description,
            'system_key' => $this->system_key, 'preview_movies' => $this->preview_movies ?? [],
            'movie_count' => (int) $this->movies_count,
            'created_at' => $this->created_at?->toISOString(), 'updated_at' => $this->updated_at?->toISOString(),
            'contains_movie' => $this->when(array_key_exists('contains_movie', $this->resource->getAttributes()), fn () => (bool) $this->contains_movie)];
    }
}
