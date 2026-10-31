<?php

namespace App\Services;

use App\Exceptions\UpstreamUnavailable;
use App\Integrations\Tmdb\ExperienceNormalizer;
use App\Integrations\Tmdb\MovieNormalizer;
use App\Integrations\Tmdb\TmdbClient;
use App\Models\Movie;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class MovieExperienceService
{
    public function __construct(private TmdbClient $client, private ExperienceNormalizer $normalizer, private MovieNormalizer $movies) {}

    public function capture(array $raw, int $id): array
    {
        $data = $this->normalizer->normalize($raw, $id);
        DB::transaction(function () use ($data): void {
            foreach ($data['related'] as $movie) {
                $values = array_filter($movie, fn ($value) => $value !== null);
                Movie::upsert([$values], ['tmdb_id'], array_diff(array_keys($values), ['tmdb_id']));
            }
        });
        Cache::put('catalog:experience:v1:'.$id, ['data' => $data, 'fetched_at' => now()->timestamp], 2592000);

        return $data;
    }

    public function get(int $id): array
    {
        $cached = Cache::get('catalog:experience:v1:'.$id);
        if ($cached && $cached['fetched_at'] > now()->timestamp - config('catalog.metadata_ttl_seconds')) {
            return ['data' => $cached['data'], 'meta' => ['stale' => false]];
        }
        $cooldown = 'catalog:experience:cooldown:'.$id;
        $lock = Cache::lock('catalog:detail:lock:'.$id, 2 * config('catalog.request_timeout_seconds') + 10);
        if (Cache::has($cooldown) || ! $lock->get()) {
            return $this->fallback($cached);
        }
        try {
            $raw = $this->client->details($id);
            $values = $this->movies->normalize($raw, true);
            if ($values['tmdb_id'] !== $id) {
                throw new UpstreamUnavailable;
            }
            $data = $this->capture($raw, $id);
            $values['genres'] = json_encode($values['genres'], JSON_THROW_ON_ERROR);
            $values['metadata_fetched_at'] = now();
            Movie::upsert([$values], ['tmdb_id'], array_diff(array_keys($values), ['tmdb_id']));

            return ['data' => $data, 'meta' => ['stale' => false]];
        } catch (UpstreamUnavailable) {
            Cache::put($cooldown, true, config('catalog.refresh_cooldown_seconds'));

            return $this->fallback($cached);
        } finally {
            $lock->release();
        }
    }

    private function fallback(?array $cached): array
    {
        if ($cached) {
            return ['data' => $cached['data'], 'meta' => ['stale' => true]];
        }
        throw new UpstreamUnavailable;
    }
}
