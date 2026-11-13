<?php

namespace App\Integrations\Tmdb;

use App\Exceptions\MovieNotFound;
use App\Exceptions\UpstreamUnavailable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;

class TmdbClient
{
    public function popular(int $page): array
    {
        return $this->get('movie/popular', ['page' => $page]);
    }

    public function search(string $query, int $page): array
    {
        return $this->get('search/movie', ['query' => $query, 'page' => $page, 'include_adult' => 'false']);
    }

    /** Provider filters are built only from the validated discovery contract. */
    public function discover(array $filters): array
    {
        if ($filters['category'] === 'trending') {
            return $this->get('trending/movie/week', ['page' => $filters['page']]);
        }
        $params = ['page' => $filters['page'], 'sort_by' => $filters['sort'], 'include_adult' => 'false', 'include_video' => 'false'];
        if (! empty($filters['genres'])) {
            $params['with_genres'] = implode($filters['genre_match'] === 'all' ? ',' : '|', $filters['genres']);
        }
        foreach (['rating_min' => 'vote_average.gte', 'runtime_min' => 'with_runtime.gte', 'runtime_max' => 'with_runtime.lte', 'original_language' => 'with_original_language'] as $field => $provider) {
            if (isset($filters[$field])) {
                $params[$provider] = $filters[$field];
            }
        }
        $from = isset($filters['year_from']) ? $filters['year_from'].'-01-01' : null;
        $to = isset($filters['year_to']) ? $filters['year_to'].'-12-31' : null;
        if ($filters['category'] === 'upcoming') {
            $from = max($from ?? '', now('UTC')->addDay()->toDateString());
        } elseif ($filters['category'] === 'now_playing') {
            $from = max($from ?? '', now('UTC')->subDays(42)->toDateString());
            $to = min($to ?? '9999-12-31', now('UTC')->toDateString());
        }
        if ($from !== null) {
            $params['primary_release_date.gte'] = $from;
        }
        if ($to !== null) {
            $params['primary_release_date.lte'] = $to;
        }
        if ($filters['category'] === 'top_rated' || $filters['sort'] === 'vote_average.desc') {
            $params['vote_count.gte'] = 300;
        }

        return $this->get('discover/movie', $params);
    }

    public function details(int $id): array
    {
        return $this->get('movie/'.$id, ['append_to_response' => 'videos,credits,recommendations'], true);
    }

    private function get(string $path, array $query, bool $detail = false): array
    {
        $token = config('catalog.tmdb_token');
        if (! is_string($token) || trim($token) === '' || Cache::has('catalog:tmdb:retry-after')) {
            throw new UpstreamUnavailable;
        }

        // At most two GET attempts. Never retain/log provider bodies or exceptions.
        for ($attempt = 0; $attempt < 2; $attempt++) {
            try {
                $response = Http::baseUrl('https://api.themoviedb.org/3')
                    ->acceptJson()->withToken($token)
                    ->connectTimeout(config('catalog.connect_timeout_seconds'))
                    ->timeout(config('catalog.request_timeout_seconds'))
                    ->withoutRedirecting()
                    ->get($path, $query + ['language' => 'en-US']);
            } catch (ConnectionException) {
                if ($attempt === 0) {
                    Sleep::usleep(200000);

                    continue;
                }
                throw new UpstreamUnavailable;
            }

            if ($response->status() === 404 && $detail) {
                throw new MovieNotFound;
            }
            if ($response->status() === 429) {
                // Defer rather than sleeping in a web worker or retrying before permission.
                $header = $response->header('Retry-After');
                $seconds = ctype_digit($header) ? (int) $header : max(0, (strtotime($header) ?: 0) - time());
                Cache::put('catalog:tmdb:retry-after', true, max(1, $seconds ?: 30));
                throw new UpstreamUnavailable;
            }
            if (in_array($response->status(), [500, 502, 503, 504], true)) {
                // Honor Retry-After on transient server responses as well.
                if ($response->header('Retry-After') !== '') {
                    $header = $response->header('Retry-After');
                    $seconds = ctype_digit($header) ? (int) $header : max(0, (strtotime($header) ?: 0) - time());
                    Cache::put('catalog:tmdb:retry-after', true, max(1, $seconds ?: 30));
                    throw new UpstreamUnavailable;
                }
                if ($attempt === 0) {
                    Sleep::usleep(200000);

                    continue;
                }
            }
            $data = $response->json();
            if (! $response->successful() || ! is_array($data) || array_is_list($data) || ($data['success'] ?? true) === false) {
                throw new UpstreamUnavailable;
            }

            return $data;
        }

        throw new UpstreamUnavailable;
    }
}
