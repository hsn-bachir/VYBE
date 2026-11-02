<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LibraryService
{
    public function __construct(private LibraryMetadata $metadata) {}

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

        return $this->metadata->enrich($rows);
    }

    public function add(User $user, string $library, int $id): Model
    {
        // Preserve idempotency even during an outage. The unique key, not this optimization, prevents races.
        if ($entry = $this->entries($user, $library)->where('tmdb_id', $id)->first()) {
            return $entry;
        }
        $this->metadata->confirm($id);

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
