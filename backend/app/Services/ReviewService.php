<?php

namespace App\Services;

use App\Exceptions\ReviewExists;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

class ReviewService
{
    public function __construct(private LibraryMetadata $metadata) {}

    public function listing(int $movie, int $page, int $perPage): array
    {
        $rows = Review::query()->where('tmdb_id', $movie)->with('user:id,username,avatar_url')
            ->orderByDesc('created_at')->orderByDesc('id')->paginate($perPage, ['*'], 'page', $page);

        return ['entries' => $rows->getCollection(), 'meta' => ['page' => $rows->currentPage(), 'per_page' => $rows->perPage(),
            'total_pages' => (int) ceil($rows->total() / $rows->perPage()), 'total_results' => $rows->total()]];
    }

    public function own(User $user, int $movie): ?Review
    {
        return $user->reviews()->where('tmdb_id', $movie)->with('user:id,username,avatar_url')->first();
    }

    public function create(User $user, int $movie, array $values): Review
    {
        if ($user->reviews()->where('tmdb_id', $movie)->exists()) {
            throw new ReviewExists;
        }
        $this->metadata->confirm($movie);
        try {
            return DB::transaction(fn () => $user->reviews()->create(['tmdb_id' => $movie] + $values + ['contains_spoilers' => false])->load('user:id,username,avatar_url'), 3);
        } catch (UniqueConstraintViolationException) {
            throw new ReviewExists;
        }
    }

    public function update(User $user, int $movie, int $id, array $values): Review
    {
        return DB::transaction(function () use ($user, $movie, $id, $values): Review {
            $review = $user->reviews()->where('tmdb_id', $movie)->whereKey($id)->lockForUpdate()->firstOrFail();
            $review->fill($values)->save();

            return $review->load('user:id,username,avatar_url');
        }, 3);
    }

    public function delete(User $user, int $movie, int $id): void
    {
        DB::transaction(function () use ($user, $movie, $id): void {
            $user->reviews()->where('tmdb_id', $movie)->whereKey($id)->lockForUpdate()->firstOrFail()->delete();
        }, 3);
    }
}
