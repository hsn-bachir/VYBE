<?php

namespace App\Services;

use App\Integrations\MovieCatalog\CatalogFailure;
use App\Integrations\MovieCatalog\MovieCatalogClient;
use App\Models\MovieRating;
use App\Models\WatchedMovie;

class AdminMovieInsights
{
    private const LIMIT = 10;

    private const PRIOR_RATINGS = 5;

    public function __construct(private MovieCatalogClient $catalog) {}

    public function rankings(): array
    {
        $watched = WatchedMovie::query()->toBase()
            ->select('tmdb_id')->selectRaw('COUNT(DISTINCT user_id) AS watched_users')
            ->groupBy('tmdb_id')->orderByDesc('watched_users')->orderBy('tmdb_id')
            ->limit(self::LIMIT)->get();

        // The window sums span all ratings before LIMIT. Sort by the weighted score
        // multiplied by the community rating count to avoid rounding the prior first.
        $rated = MovieRating::query()->toBase()
            ->select('tmdb_id')->selectRaw('COUNT(*) AS rating_count, AVG(rating * 1.000000000000) AS average_rating')
            ->selectRaw(
                '(SUM(rating) * SUM(COUNT(*)) OVER () + ? * SUM(SUM(rating)) OVER ()) * 1.000000000000 / (COUNT(*) + ?) AS ranking_score',
                [self::PRIOR_RATINGS, self::PRIOR_RATINGS],
            )
            ->groupBy('tmdb_id')->orderByDesc('ranking_score')->orderByDesc('rating_count')->orderBy('tmdb_id')
            ->limit(self::LIMIT)->get();

        $ids = $watched->pluck('tmdb_id')->concat($rated->pluck('tmdb_id'))
            ->map(fn ($id) => (int) $id)->unique()->values()->all();
        $movies = [];
        $metadataUnavailable = false;
        try {
            foreach ($this->catalog->summaries($ids)['data'] as $movie) {
                $movies[$movie['tmdb_id']] = [
                    'title' => $movie['title'], 'poster_path' => $movie['poster_path'], 'release_date' => $movie['release_date'],
                ];
            }
        } catch (CatalogFailure) {
            $metadataUnavailable = true;
        }

        return [
            'data' => [
                'most_watched' => $watched->map(fn ($row) => [
                    'tmdb_id' => (int) $row->tmdb_id,
                    'watched_users' => (int) $row->watched_users,
                    'movie' => $movies[$row->tmdb_id] ?? null,
                ]),
                'highest_rated' => $rated->map(fn ($row) => [
                    'tmdb_id' => (int) $row->tmdb_id,
                    'rating_count' => (int) $row->rating_count,
                    'average_rating' => round((float) $row->average_rating, 2),
                    'movie' => $movies[$row->tmdb_id] ?? null,
                ]),
            ],
            'meta' => ['metadata_unavailable' => $metadataUnavailable],
        ];
    }
}
