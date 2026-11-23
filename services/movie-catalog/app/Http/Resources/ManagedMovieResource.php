<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

class ManagedMovieResource extends MovieResource
{
    public function toArray(Request $request): array
    {
        $data = parent::toArray($request);
        $data['genres'] = $this->genres;
        $data['metadata_fetched_at'] = $this->metadata_fetched_at?->toISOString();
        $data['metadata_status'] = $this->metadata_fetched_at === null ? 'not_hydrated'
            : ($this->metadata_fetched_at->gt(now()->subSeconds(config('catalog.metadata_ttl_seconds'))) ? 'fresh' : 'stale');

        return $data;
    }
}
