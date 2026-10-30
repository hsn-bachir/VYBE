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
    public function __construct(private TmdbClient $client, private MovieNormalizer $normalizer) {}

    public function ranking(int $page, ?string $query = null): array
    {
        $key = 'catalog:ranking:v1:'.hash('sha256', json_encode([$query === null ? 'popular' : 'search', $page, $query, 'en-US', false]));

        return Cache::remember($key, config('catalog.ranking_ttl_seconds'), function () use ($page, $query): array {
            $data = $query === null ? $this->client->popular($page) : $this->client->search($query, $page);
            if (($data['page'] ?? null) !== $page || ! is_array($data['results'] ?? null) || ! array_is_list($data['results'])
                || ! is_int($data['total_pages'] ?? null) || $data['total_pages'] < 0
                || ! is_int($data['total_results'] ?? null) || $data['total_results'] < 0) {
                throw new UpstreamUnavailable;
            }
            $movies = [];
            foreach ($data['results'] as $row) {
                if (! is_array($row)) {
                    throw new UpstreamUnavailable;
                }
                $movies[] = $this->normalizer->normalize($row);
            }
            DB::transaction(function () use ($movies): void {
                foreach ($movies as $movie) {
                    // Exclude absent/null summary fields from UPDATE; never touch detail freshness.
                    $values = array_filter($movie, fn ($value) => $value !== null);
                    Movie::upsert([$values], ['tmdb_id'], array_diff(array_keys($values), ['tmdb_id']));
                }
            });

            return ['movies' => $movies, 'meta' => [
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
                $values = $this->normalizer->normalize($this->client->details($id), true);
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
