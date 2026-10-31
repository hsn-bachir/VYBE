<?php

namespace App\Integrations\MovieCatalog;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use InvalidArgumentException;

class MovieCatalogClient
{
    public function popular(int $page): array
    {
        return $this->listing('popular', ['page' => $page]);
    }

    public function search(string $query, int $page): array
    {
        return $this->listing('search', ['query' => $query, 'page' => $page]);
    }

    public function details(int $id): array
    {
        $body = $this->request((string) $id, [], true);
        if (! is_array($body['data'] ?? null) || ! is_bool($body['meta']['stale'] ?? null)) {
            throw new CatalogFailure;
        }
        $movie = $this->movie($body['data'], true);
        if ($movie['tmdb_id'] !== $id) {
            throw new CatalogFailure;
        }

        return ['data' => $movie, 'meta' => ['stale' => $body['meta']['stale']]];
    }

    /** @param list<int> $tmdbIds Up to 50 IDs before deduplication; empty pages need no HTTP. */
    public function summaries(array $tmdbIds): array
    {
        if (! array_is_list($tmdbIds) || count($tmdbIds) > 50) {
            throw new InvalidArgumentException('Expected a list of at most 50 TMDB IDs.');
        }
        foreach ($tmdbIds as $id) {
            if (! is_int($id) || $id < 1 || $id > 2147483647) {
                throw new InvalidArgumentException('TMDB IDs must be integers between 1 and 2147483647.');
            }
        }
        $ids = array_values(array_unique($tmdbIds));
        if ($ids === []) {
            return ['data' => [], 'meta' => ['requested_count' => 0, 'returned_count' => 0, 'missing_tmdb_ids' => []]];
        }

        $body = $this->request('summaries', ['tmdb_ids' => $ids], method: 'POST');
        $meta = $body['meta'] ?? null;
        if (! is_array($body['data'] ?? null) || ! array_is_list($body['data']) || ! is_array($meta)
            || ($meta['requested_count'] ?? null) !== count($ids)
            || ($meta['returned_count'] ?? null) !== count($body['data'])
            || ! is_array($meta['missing_tmdb_ids'] ?? null) || ! array_is_list($meta['missing_tmdb_ids'])
            || count($body['data']) + count($meta['missing_tmdb_ids']) !== count($ids)) {
            throw new CatalogFailure;
        }

        $requested = array_fill_keys($ids, true);
        $found = [];
        $missing = [];
        foreach ($body['data'] as $row) {
            if (! is_array($row)) {
                throw new CatalogFailure;
            }
            $movie = $this->movie($row);
            $id = $movie['tmdb_id'];
            if (! isset($requested[$id]) || isset($found[$id])) {
                throw new CatalogFailure;
            }
            $found[$id] = $movie;
        }
        foreach ($meta['missing_tmdb_ids'] as $id) {
            if (! is_int($id) || ! isset($requested[$id]) || isset($found[$id]) || isset($missing[$id])) {
                throw new CatalogFailure;
            }
            $missing[$id] = true;
        }

        // Restore caller order even if an upstream version returns the sets in a different order.
        $movies = [];
        $missingIds = [];
        foreach ($ids as $id) {
            if (isset($found[$id])) {
                $movies[] = $found[$id];
            } else {
                $missingIds[] = $id;
            }
        }

        return ['data' => $movies, 'meta' => [
            'requested_count' => count($ids), 'returned_count' => count($movies), 'missing_tmdb_ids' => $missingIds,
        ]];
    }

    private function listing(string $operation, array $params): array
    {
        $body = $this->request($operation, $params);
        $meta = $body['meta'] ?? null;
        if (! is_array($body['data'] ?? null) || ! array_is_list($body['data']) || ! is_array($meta)
            || ($meta['page'] ?? null) !== $params['page']
            || ! is_int($meta['total_pages'] ?? null) || $meta['total_pages'] < 0 || $meta['total_pages'] > 500
            || ! is_int($meta['total_results'] ?? null) || $meta['total_results'] < 0) {
            throw new CatalogFailure;
        }
        $movies = [];
        foreach ($body['data'] as $movie) {
            if (! is_array($movie)) {
                throw new CatalogFailure;
            }
            $movies[] = $this->movie($movie);
        }

        return ['data' => $movies, 'meta' => array_intersect_key($meta, array_flip(['page', 'total_pages', 'total_results']))];
    }

    private function request(string $path, array $params, bool $detail = false, string $method = 'GET'): array
    {
        $url = config('movie_catalog.url');
        $token = config('movie_catalog.token');
        if (! is_string($url) || ! filter_var($url, FILTER_VALIDATE_URL)
            || ! in_array(parse_url($url, PHP_URL_SCHEME), ['http', 'https'], true)
            || ! is_string($token) || trim($token) === '') {
            throw new CatalogFailure;
        }
        try {
            $response = Http::acceptJson()->withHeaders(['X-VYBE-Service-Token' => $token])
                ->connectTimeout(config('movie_catalog.connect_timeout'))
                ->timeout(config('movie_catalog.timeout'))->withoutRedirecting()
                ->send($method, rtrim($url, '/').'/api/internal/v1/movies/'.$path, [
                    $method === 'POST' ? 'json' : 'query' => $params,
                ]);
        } catch (ConnectionException) {
            throw new CatalogFailure;
        }
        $body = $response->json();
        if ($detail && $response->status() === 404 && ($body['code'] ?? null) === 'MOVIE_NOT_FOUND') {
            throw new CatalogFailure(404);
        }
        if ($method === 'GET' && $response->status() === 422 && is_array($body['errors'] ?? null)) {
            $errors = [];
            foreach (['page', 'query', 'tmdb_id'] as $field) {
                if (array_key_exists($field, $body['errors'])) {
                    $errors[$field] = ['The '.$field.' field is invalid.'];
                }
            }
            if ($errors !== []) {
                throw new CatalogFailure(422, $errors);
            }
        }
        if ($response->status() !== 200 || ! is_array($body)) {
            throw new CatalogFailure;
        }

        return $body;
    }

    private function movie(array $movie, bool $detail = false): array
    {
        $rules = [
            'tmdb_id' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'title' => ['required', 'string', 'max:255'],
            'overview' => ['present', 'nullable', 'string'],
            'poster_path' => ['present', 'nullable', 'string', 'regex:~^/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$~D'],
            'backdrop_path' => ['present', 'nullable', 'string', 'regex:~^/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$~D'],
            'release_date' => ['present', 'nullable', 'date_format:Y-m-d'],
            'tmdb_rating' => ['present', 'nullable', 'numeric', 'between:0,10'],
            'tmdb_vote_count' => ['present', 'nullable', 'integer', 'min:0'],
        ];
        if ($detail) {
            $rules += [
                'original_title' => ['present', 'nullable', 'string'],
                'runtime' => ['present', 'nullable', 'integer', 'between:0,65535'],
                'original_language' => ['present', 'nullable', 'string', 'max:10'],
                'genres' => ['present', 'array'],
                'genres.*.id' => ['required', 'integer', 'min:1'],
                'genres.*.name' => ['required', 'string'],
            ];
        }
        if (Validator::make($movie, $rules)->fails() || ! is_int($movie['tmdb_id'] ?? null)
            || (isset($movie['tmdb_rating']) && ! is_int($movie['tmdb_rating']) && ! is_float($movie['tmdb_rating']))
            || (isset($movie['tmdb_vote_count']) && ! is_int($movie['tmdb_vote_count']))
            || ($detail && (isset($movie['runtime']) && ! is_int($movie['runtime']) || ! array_is_list($movie['genres'] ?? [])))) {
            throw new CatalogFailure;
        }
        $result = array_intersect_key($movie, array_filter($rules, fn ($key) => ! str_contains($key, '.'), ARRAY_FILTER_USE_KEY));
        if ($detail) {
            $result['genres'] = array_map(function (array $genre): array {
                if (! is_int($genre['id'])) {
                    throw new CatalogFailure;
                }

                return ['id' => $genre['id'], 'name' => $genre['name']];
            }, $movie['genres']);
        }

        return $result;
    }
}
