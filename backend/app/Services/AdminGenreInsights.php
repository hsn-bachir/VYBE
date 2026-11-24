<?php

namespace App\Services;

use App\Integrations\MovieCatalog\CatalogFailure;
use App\Integrations\MovieCatalog\MovieCatalogClient;
use App\Models\WatchedMovie;

class AdminGenreInsights
{
    private const COHORT_LIMIT = 50;

    public function __construct(private MovieCatalogClient $catalog) {}

    public function rankings(): array
    {
        // The unique user/movie key makes row count the number of members for each movie.
        $cohort = WatchedMovie::query()->toBase()->select('tmdb_id')
            ->selectRaw('COUNT(*) AS watched_entries, COUNT(*) OVER () AS total_movies, SUM(COUNT(*)) OVER () AS total_entries')
            ->groupBy('tmdb_id')->orderByDesc('watched_entries')->orderBy('tmdb_id')->limit(self::COHORT_LIMIT)->get();

        $coverage = [
            'cohort_limit' => self::COHORT_LIMIT,
            'total_watched_movies' => (int) ($cohort->first()->total_movies ?? 0),
            'total_watched_entries' => (int) ($cohort->first()->total_entries ?? 0),
            'cohort_movies' => $cohort->count(),
            'cohort_watched_entries' => (int) $cohort->sum('watched_entries'),
            'covered_movies' => 0,
            'covered_watched_entries' => 0,
            'metadata_unavailable' => false,
        ];

        try {
            $metadata = $this->catalog->genres($cohort->pluck('tmdb_id')->map(fn ($id) => (int) $id)->all());
        } catch (CatalogFailure) {
            $metadata = [];
            $coverage['metadata_unavailable'] = true;
        }

        $genres = [];
        foreach ($cohort as $movie) {
            $movieGenres = $metadata[$movie->tmdb_id] ?? null;
            if ($movieGenres === null) {
                continue;
            }
            $watchedEntries = (int) $movie->watched_entries;
            $coverage['covered_movies']++;
            $coverage['covered_watched_entries'] += $watchedEntries;

            foreach ($movieGenres as $id => $name) {
                $genres[$id] ??= ['genre_id' => $id, 'name' => $name, 'watched_entries' => 0];
                $genres[$id]['watched_entries'] += $watchedEntries;
                if (strcmp($name, $genres[$id]['name']) < 0) {
                    $genres[$id]['name'] = $name;
                }
            }
        }

        usort($genres, fn (array $left, array $right) => ($right['watched_entries'] <=> $left['watched_entries'])
            ?: ($left['genre_id'] <=> $right['genre_id']));

        return ['data' => array_slice($genres, 0, 10), 'meta' => $coverage];
    }
}
