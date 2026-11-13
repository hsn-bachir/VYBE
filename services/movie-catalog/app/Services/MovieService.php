<?php

namespace App\Services;

use App\Exceptions\UpstreamUnavailable;
use App\Integrations\Tmdb\MovieNormalizer;
use App\Integrations\Tmdb\TmdbClient;
use App\Models\Movie;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class MovieService
{
    public function __construct(private TmdbClient $client, private MovieNormalizer $normalizer, private MovieExperienceService $experience) {}

    /** @param list<int> $ids Validated, bounded TMDB IDs. */
    public function summaries(array $ids): array
    {
        $ids = array_values(array_unique($ids));
        $stored = Movie::whereIn('tmdb_id', $ids)->get([
            'tmdb_id', 'title', 'poster_path', 'backdrop_path', 'overview', 'release_date', 'tmdb_rating', 'tmdb_vote_count',
        ])->keyBy('tmdb_id');
        $movies = [];
        $missing = [];
        foreach ($ids as $id) {
            if ($movie = $stored->get($id)) {
                // Model serialization preserves the summary resource's YYYY-MM-DD date contract.
                $movies[] = $movie->toArray();
            } else {
                $missing[] = $id;
            }
        }

        return ['movies' => $movies, 'meta' => [
            'requested_count' => count($ids), 'returned_count' => count($movies), 'missing_tmdb_ids' => $missing,
        ]];
    }

    public function ranking(int $page, ?string $query = null): array
    {
        $key = 'catalog:ranking:v1:'.hash('sha256', json_encode([$query === null ? 'popular' : 'search', $page, $query, 'en-US', false]));

        return $this->cachedListing($key, $page, fn () => $query === null ? $this->client->popular($page) : $this->client->search($query, $page));
    }

    public function discover(array $filters): array
    {
        if ($filters['category'] === 'trending') {
            return $this->trending($filters);
        }
        // An unfiltered popular browse shares the original provider snapshot.
        if ($filters === ['category' => 'popular', 'page' => $filters['page'], 'sort' => 'popularity.desc']) {
            return $this->ranking($filters['page']);
        }
        // Date-sensitive categories roll over at UTC midnight, even inside the TTL.
        $day = in_array($filters['category'], ['upcoming', 'now_playing'], true) ? now('UTC')->toDateString() : null;
        $key = 'catalog:discover:v1:'.hash('sha256', json_encode([$filters, $day, 'en-US', false]));

        return $this->cachedListing($key, $filters['page'], fn () => $this->client->discover($filters), $filters['category'] === 'upcoming');
    }

    private function trending(array $filters): array
    {
        $key = 'catalog:trending:pool:v1:'.now('UTC')->format('o-W');
        $pool = Cache::remember($key, config('catalog.ranking_ttl_seconds'), function () use ($key): array {
            $candidates = [];
            $seen = [];
            for ($page = 1; $page <= 3; $page++) {
                $listing = $this->cachedListing('catalog:trending:page:v1:'.$key.':'.$page, $page,
                    fn () => $this->client->discover(['category' => 'trending', 'page' => $page]), captureTrending: true);
                foreach ($listing['candidates'] as $candidate) {
                    $id = $candidate['movie']['tmdb_id'];
                    if (! isset($seen[$id])) {
                        $seen[$id] = true;
                        $candidates[] = $candidate;
                    }
                }
                if ($page >= $listing['meta']['total_pages'] || $listing['movies'] === []) {
                    break;
                }
            }

            return $candidates;
        });
        $matches = array_values(array_filter($pool, function (array $candidate) use ($filters): bool {
            $movie = $candidate['movie'];
            if (! empty($filters['genres'])) {
                $overlap = array_intersect($filters['genres'], $candidate['genres']);
                if ($filters['genre_match'] === 'all' ? count($overlap) !== count($filters['genres']) : $overlap === []) {
                    return false;
                }
            }
            $year = $movie['release_date'] ? (int) substr($movie['release_date'], 0, 4) : null;
            if ((isset($filters['year_from']) && ($year === null || $year < $filters['year_from']))
                || (isset($filters['year_to']) && ($year === null || $year > $filters['year_to']))) {
                return false;
            }

            return (! isset($filters['rating_min']) || ($movie['tmdb_rating'] !== null && $movie['tmdb_rating'] >= $filters['rating_min']))
                && (! isset($filters['original_language']) || $candidate['language'] === $filters['original_language']);
        }));
        $total = count($matches);

        return ['movies' => array_column(array_slice($matches, ($filters['page'] - 1) * 20, 20), 'movie'),
            'meta' => ['page' => $filters['page'], 'total_pages' => (int) ceil($total / 20), 'total_results' => $total]];
    }

    private function cachedListing(string $key, int $page, callable $fetch, bool $upcoming = false, bool $captureTrending = false): array
    {
        return Cache::remember($key, config('catalog.ranking_ttl_seconds'), function () use ($page, $fetch, $upcoming, $captureTrending): array {
            $data = $fetch();
            if (($data['page'] ?? null) !== $page || ! is_array($data['results'] ?? null) || ! array_is_list($data['results'])
                || ! is_int($data['total_pages'] ?? null) || $data['total_pages'] < 0
                || ! is_int($data['total_results'] ?? null) || $data['total_results'] < 0) {
                throw new UpstreamUnavailable;
            }
            $movies = [];
            $candidates = [];
            foreach ($data['results'] as $row) {
                if (! is_array($row)) {
                    throw new UpstreamUnavailable;
                }
                $movie = $this->normalizer->normalize($row);
                if ($upcoming && (empty($movie['poster_path']) || empty($movie['release_date']) || $movie['release_date'] <= now('UTC')->toDateString())) {
                    continue;
                }
                $movies[] = $movie;
                if ($captureTrending) {
                    $genres = $row['genre_ids'] ?? [];
                    $candidates[] = ['movie' => $movie,
                        'genres' => is_array($genres) && array_is_list($genres) ? array_values(array_filter($genres, fn ($id) => is_int($id) && $id > 0)) : [],
                        'language' => is_string($row['original_language'] ?? null) ? $row['original_language'] : null];
                }
            }
            // A multi-row upsert needs the same columns for every row. Group by the
            // fields actually supplied so an absent summary value cannot clear a
            // previously hydrated detail field. Keep provider order in $movies.
            $batches = [];
            foreach ($movies as $movie) {
                $values = array_filter($movie, fn ($value) => $value !== null);
                $columns = array_keys($values);
                sort($columns);
                $signature = implode('|', $columns);
                $batches[$signature]['columns'] = $columns;
                $batches[$signature]['rows'][$values['tmdb_id']] = $values;
            }
            DB::transaction(function () use ($batches): void {
                foreach ($batches as $batch) {
                    Movie::upsert(array_values($batch['rows']), ['tmdb_id'], array_diff($batch['columns'], ['tmdb_id']));
                }
            });

            return ['movies' => $movies, 'candidates' => $candidates, 'meta' => [
                'page' => $page, 'total_pages' => min(500, $data['total_pages']), 'total_results' => $data['total_results'],
            ]];
        });
    }

    public function details(int $id): array
    {
        $movie = Movie::where('tmdb_id', $id)->first();
        if ($this->fresh($movie)) {
            return [$movie, false];
        }
        $cooldown = 'catalog:detail:cooldown:'.$id;
        if (Cache::has($cooldown)) {
            return $this->fallback($movie);
        }
        // Nonblocking lock: concurrent readers can use stale data, but never start a stampede.
        $lock = Cache::lock('catalog:detail:lock:'.$id, 2 * config('catalog.request_timeout_seconds') + 10);
        if (! $lock->get()) {
            return $this->fallback($movie);
        }
        try {
            $movie = Movie::where('tmdb_id', $id)->first();
            if ($this->fresh($movie)) {
                return [$movie, false];
            }
            try {
                $raw = $this->client->details($id);
                $values = $this->normalizer->normalize($raw, true);
                if ($values['tmdb_id'] !== $id) {
                    throw new UpstreamUnavailable;
                }
            } catch (UpstreamUnavailable) {
                Cache::put($cooldown, true, config('catalog.refresh_cooldown_seconds'));

                return $this->fallback($movie);
            }
            $values['genres'] = json_encode($values['genres'], JSON_THROW_ON_ERROR);
            $values['metadata_fetched_at'] = now();
            Movie::upsert([$values], ['tmdb_id'], array_diff(array_keys($values), ['tmdb_id']));

            try {
                $this->experience->capture($raw, $id);
            } catch (UpstreamUnavailable) {
                // Optional appended content must never invalidate a valid base detail response.
            }

            return [Movie::where('tmdb_id', $id)->firstOrFail(), false];
        } finally {
            $lock->release();
        }
    }

    private function fresh(?Movie $movie): bool
    {
        return $movie?->metadata_fetched_at !== null
            && $movie->metadata_fetched_at->gt(now()->subSeconds(config('catalog.metadata_ttl_seconds')));
    }

    private function fallback(?Movie $movie): array
    {
        if ($movie?->metadata_fetched_at !== null) {
            return [$movie, true];
        }
        throw new UpstreamUnavailable;
    }
}
