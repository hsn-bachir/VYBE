<?php

namespace App\Services;

use App\Integrations\MovieCatalog\CatalogFailure;
use App\Integrations\MovieCatalog\MovieCatalogClient;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;

/** Shared Catalog boundary for Core-owned movie references and library metadata. */
class LibraryMetadata
{
    public function __construct(private MovieCatalogClient $catalog) {}

    public function confirm(int $id): void
    {
        if ($this->catalog->summaries([$id])['data'] === []) {
            throw ValidationException::withMessages(['tmdb_id' => ['This movie is not currently available in VYBE. Open its details and try again.']]);
        }
    }

    public function enrich(LengthAwarePaginator $rows): array
    {
        $movies = [];
        $unavailable = false;
        if ($rows->isNotEmpty()) {
            try {
                $batch = $this->catalog->summaries($rows->getCollection()->pluck('tmdb_id')->all());
                $movies = array_column($batch['data'], null, 'tmdb_id');
            } catch (CatalogFailure) {
                $unavailable = true;
            }
        }
        foreach ($rows as $row) {
            $row->setAttribute('movie', $movies[$row->tmdb_id] ?? null);
            $row->setAttribute('metadata_status', $unavailable ? 'unavailable' : (isset($movies[$row->tmdb_id]) ? 'available' : 'missing'));
        }

        return ['entries' => $rows->getCollection(), 'meta' => [
            'page' => $rows->currentPage(), 'per_page' => $rows->perPage(),
            'total_pages' => (int) ceil($rows->total() / $rows->perPage()),
            'total_results' => $rows->total(), 'metadata_unavailable' => $unavailable,
        ]];
    }
}
