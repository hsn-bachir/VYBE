<?php

namespace App\Services;

use App\Models\Collection;
use App\Models\CollectionMovie;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CollectionService
{
    public function __construct(private LibraryMetadata $metadata) {}

    public function owned(User $user, int $id): Collection
    {
        return $user->collections()->whereKey($id)->first() ?? abort(404, 'Not found.');
    }

    public function listing(User $user, int $page, int $perPage, ?int $movie): array
    {
        $query = $user->collections()->withCount('movies');
        if ($movie !== null) {
            $query->withExists(['movies as contains_movie' => fn ($q) => $q->where('tmdb_id', $movie)]);
        }
        $rows = $query->orderByDesc('created_at')->orderByDesc('id')->paginate($perPage, ['*'], 'page', $page);

        return ['entries' => $rows->getCollection(), 'meta' => ['page' => $page, 'per_page' => $perPage,
            'total_pages' => (int) ceil($rows->total() / $perPage), 'total_results' => $rows->total()]];
    }

    public function create(User $user, array $values): Collection
    {
        return $user->collections()->create($values)->loadCount('movies');
    }

    public function update(User $user, int $id, array $values): Collection
    {
        return DB::transaction(function () use ($user, $id, $values) {
            $collection = $user->collections()->whereKey($id)->lockForUpdate()->first() ?? abort(404, 'Not found.');
            $collection->update($values);

            return $collection->loadCount('movies');
        });
    }

    public function delete(User $user, int $id): void
    {
        abort_unless($user->collections()->whereKey($id)->delete(), 404, 'Not found.');
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
            $collection = $user->collections()->whereKey($id)->lockForUpdate()->first() ?? abort(404, 'Not found.');

            // Parent lock serializes against deletion. Unique membership key remains the final authority.
            return $collection->movies()->firstOrCreate(['tmdb_id' => $movie]);
        }, 3);
    }

    public function remove(User $user, int $id, int $movie): void
    {
        DB::transaction(function () use ($user, $id, $movie) {
            $collection = $user->collections()->whereKey($id)->lockForUpdate()->first() ?? abort(404, 'Not found.');
            $collection->movies()->where('tmdb_id', $movie)->delete();
        }, 3);
    }
}
