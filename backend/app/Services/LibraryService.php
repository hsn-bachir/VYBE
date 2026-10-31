<?php

namespace App\Services;

use App\Integrations\MovieCatalog\CatalogFailure;
use App\Integrations\MovieCatalog\MovieCatalogClient;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Validation\ValidationException;

class LibraryService
{
    public function __construct(private MovieCatalogClient $catalog) {}

    private function entries(User $user, string $library): HasMany
    {
        return match ($library) {
            'watchlist' => $user->watchlistEntries(),
            'watched' => $user->watchedMovies(),
        };
    }

    public function listing(User $user, string $library, int $page, int $perPage): array
    {
        $rows = $this->entries($user, $library)->orderByDesc($library === 'watched' ? 'watched_at' : 'created_at')
            ->orderByDesc('id')->paginate($perPage, ['*'], 'page', $page);
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
            'page' => $page, 'per_page' => $perPage, 'total_pages' => (int) ceil($rows->total() / $perPage),
            'total_results' => $rows->total(), 'metadata_unavailable' => $unavailable,
        ]];
    }

    public function add(User $user, string $library, int $id): Model
    {
        // Preserve idempotency even during an outage. The unique key, not this optimization, prevents races.
        if ($entry = $this->entries($user, $library)->where('tmdb_id', $id)->first()) {
            return $entry;
        }
        $batch = $this->catalog->summaries([$id]);
        if ($batch['data'] === []) {
            throw ValidationException::withMessages(['tmdb_id' => ['This movie is not currently available in VYBE. Open its details and try again.']]);
        }

        // Eloquent createOrFirst handles a unique-key race without updating the existing timestamps.
        return $this->entries($user, $library)->firstOrCreate(['tmdb_id' => $id],
            $library === 'watched' ? ['watched_at' => now('UTC')] : []);
    }

    public function remove(User $user, string $library, int $id): void
    {
        $this->entries($user, $library)->where('tmdb_id', $id)->delete();
    }

    public function state(User $user, int $id): array
    {
        return ['tmdb_id' => $id, 'in_watchlist' => $user->watchlistEntries()->where('tmdb_id', $id)->exists(),
            'watched_at' => $user->watchedMovies()->where('tmdb_id', $id)->first()?->watched_at?->toISOString()];
    }
}
