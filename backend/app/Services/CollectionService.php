<?php

namespace App\Services;

use App\Integrations\MovieCatalog\CatalogFailure;
use App\Integrations\MovieCatalog\MovieCatalogClient;
use App\Models\Collection;
use App\Models\CollectionMovie;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CollectionService
{
    public function __construct(private LibraryMetadata $metadata, private MovieCatalogClient $catalog) {}

    public function owned(User $user, int $id): Collection
    {
        return $user->collections()->whereKey($id)->first() ?? abort(404, 'Not found.');
    }

    public function listing(User $user, int $page, int $perPage, ?int $movie, bool $includePreviews = true): array
    {
        $query = $user->collections()->withCount('movies');
        if ($includePreviews) {
            $query->with(['movies' => fn ($q) => $q->orderByDesc('created_at')->orderByDesc('id')->limit(3)]);
        }
        if ($movie !== null) {
            $query->withExists(['movies as contains_movie' => fn ($q) => $q->where('tmdb_id', $movie)]);
        }
        $rows = $query->orderByRaw("CASE WHEN system_key = 'favorites' THEN 0 ELSE 1 END")
            ->orderByDesc('created_at')->orderByDesc('id')->paginate($perPage, ['*'], 'page', $page);
        $ids = $includePreviews ? $rows->getCollection()->flatMap(fn (Collection $collection) => $collection->movies->pluck('tmdb_id'))
            ->unique()->values()->all() : [];
        $summaries = [];
        $unavailable = false;
        foreach (array_chunk($ids, 50) as $chunk) {
            try {
                foreach ($this->catalog->summaries($chunk)['data'] as $movieRow) {
                    $summaries[$movieRow['tmdb_id']] = $movieRow;
                }
            } catch (CatalogFailure) {
                $unavailable = true;
            }
        }
        foreach ($rows as $collection) {
            $collection->setAttribute('preview_movies', $includePreviews ? $collection->movies->map(fn ($entry) => [
                'tmdb_id' => $entry->tmdb_id,
                'title' => $summaries[$entry->tmdb_id]['title'] ?? null,
                'poster_path' => $summaries[$entry->tmdb_id]['poster_path'] ?? null,
            ])->all() : []);
            if ($includePreviews) {
                $collection->unsetRelation('movies');
            }
        }

        return ['entries' => $rows->getCollection(), 'meta' => ['page' => $page, 'per_page' => $perPage,
            'total_pages' => (int) ceil($rows->total() / $perPage), 'total_results' => $rows->total(),
            'preview_metadata_unavailable' => $unavailable]];
    }

    public function create(User $user, array $values): Collection
    {
        $this->guardReservedName($values);
        return DB::transaction(function () use ($user, $values): Collection {
            AccountAccess::lock($user);
            return $user->collections()->create($values)->loadCount('movies');
        }, 3);
    }

    public function update(User $user, int $id, array $values): Collection
    {
        $this->guardReservedName($values);
        return DB::transaction(function () use ($user, $id, $values) {
            AccountAccess::lock($user);
            $collection = $user->collections()->whereKey($id)->lockForUpdate()->first() ?? abort(404, 'Not found.');
            abort_if($collection->system_key !== null, 403, 'Built-in collections cannot be edited.');
            $collection->update($values);

            return $collection->loadCount('movies');
        });
    }

    public function delete(User $user, int $id): void
    {
        DB::transaction(function () use ($user, $id): void {
            AccountAccess::lock($user);
            $collection = $user->collections()->whereKey($id)->lockForUpdate()->first() ?? abort(404, 'Not found.');
            abort_if($collection->system_key !== null, 403, 'Built-in collections cannot be deleted.');
            $collection->delete();
        }, 3);
    }

    public function movies(User $user, int $id, int $page, int $perPage): array
    {
        $rows = $this->owned($user, $id)->movies()->orderByDesc('created_at')->orderByDesc('id')
            ->paginate($perPage, ['*'], 'page', $page);

        return $this->metadata->enrich($rows);
    }

    public function add(User $user, int $id, int $movie): CollectionMovie
    {
        $collection = $this->owned($user, $id);
        if ($entry = $collection->movies()->where('tmdb_id', $movie)->first()) {
            return $entry;
        }
        // Network I/O happens before locking; re-resolve ownership after it completes.
        $this->metadata->confirm($movie);

        return DB::transaction(function () use ($user, $id, $movie) {
            AccountAccess::lock($user);
            $collection = $user->collections()->whereKey($id)->lockForUpdate()->first() ?? abort(404, 'Not found.');

            // Parent lock serializes against deletion. Unique membership key remains the final authority.
            return $collection->movies()->firstOrCreate(['tmdb_id' => $movie]);
        }, 3);
    }

    public function remove(User $user, int $id, int $movie): void
    {
        DB::transaction(function () use ($user, $id, $movie) {
            AccountAccess::lock($user);
            $collection = $user->collections()->whereKey($id)->lockForUpdate()->first() ?? abort(404, 'Not found.');
            $collection->movies()->where('tmdb_id', $movie)->delete();
        }, 3);
    }

    private function guardReservedName(array $values): void
    {
        if (isset($values['name']) && mb_strtolower(trim($values['name'])) === 'favorites') {
            throw ValidationException::withMessages(['name' => ['Favorites is reserved for your built-in collection.']]);
        }
    }
}
