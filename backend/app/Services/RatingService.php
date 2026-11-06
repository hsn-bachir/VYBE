<?php

namespace App\Services;

use App\Models\MovieRating;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class RatingService
{
    public function __construct(private LibraryMetadata $metadata) {}

    public function own(User $user, int $id): ?MovieRating
    {
        return $user->movieRatings()->where('tmdb_id', $id)->first();
    }

    public function put(User $user, int $id, int $rating): MovieRating
    {
        if (! $this->own($user, $id)) {
            $this->metadata->confirm($id);
        }

        // No HTTP inside the transaction. Unique key + atomic upsert serialize competing writes.
        // The last database writer wins; created_at is preserved, updated_at may advance on repeats.
        return DB::transaction(function () use ($user, $id, $rating): MovieRating {
            AccountAccess::lock($user, true);
            MovieRating::query()->upsert([['user_id' => $user->getKey(), 'tmdb_id' => $id, 'rating' => $rating]],
                ['user_id', 'tmdb_id'], ['rating', 'updated_at']);

            return $user->movieRatings()->where('tmdb_id', $id)->firstOrFail();
        }, 3);
    }

    public function remove(User $user, int $id): void
    {
        DB::transaction(function () use ($user, $id): void {
            AccountAccess::lock($user, true);
            $user->movieRatings()->where('tmdb_id', $id)->delete();
        }, 3);
    }

    public function statistics(int $id): array
    {
        $buckets = array_fill(1, 5, 0);
        $groups = MovieRating::query()->where('tmdb_id', $id)->selectRaw('rating, COUNT(*) AS aggregate_count')->groupBy('rating')->get();
        foreach ($groups as $group) {
            $buckets[$group->rating] = (int) $group->aggregate_count;
        }
        $total = array_sum($buckets);
        $sum = 0;
        foreach ($buckets as $rating => $count) {
            $sum += $rating * $count;
        }

        return ['tmdb_id' => $id, 'average_rating' => $total ? round($sum / $total, 2, PHP_ROUND_HALF_UP) : null,
            'total_ratings' => $total, 'distribution' => (object) $buckets];
    }
}
