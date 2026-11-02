<?php

namespace App\Http\Resources;

use App\Models\CollectionMovie;
use App\Models\WatchedMovie;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LibraryEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $result = ['tmdb_id' => $this->tmdb_id, 'created_at' => $this->created_at?->toISOString()];
        if ($this->resource instanceof CollectionMovie) {
            $result['collection_id'] = $this->collection_id;
        }
        if ($this->resource instanceof WatchedMovie) {
            $result['watched_at'] = $this->watched_at->toISOString();
        }
        if (array_key_exists('metadata_status', $this->resource->getAttributes())) {
            $result['movie'] = $this->movie;
            $result['metadata_status'] = $this->metadata_status;
        }

        return $result;
    }
}
