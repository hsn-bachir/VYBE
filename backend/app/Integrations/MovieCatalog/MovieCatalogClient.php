<?php

namespace App\Integrations\MovieCatalog;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;

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
        $body = $this->get((string) $id, [], true);
        if (! is_array($body['data'] ?? null) || ! is_bool($body['meta']['stale'] ?? null)) {
            throw new CatalogFailure;
        }
        $movie = $this->movie($body['data'], true);
        if ($movie['tmdb_id'] !== $id) {
            throw new CatalogFailure;
        }

        return ['data' => $movie, 'meta' => ['stale' => $body['meta']['stale']]];
    }

    private function listing(string $operation, array $params): array
    {
        $body = $this->get($operation, $params);
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

    private function get(string $path, array $params, bool $detail = false): array
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
                ->get(rtrim($url, '/').'/api/internal/v1/movies/'.$path, $params);
        } catch (ConnectionException) {
            throw new CatalogFailure;
        }
        $body = $response->json();
        if ($detail && $response->status() === 404 && ($body['code'] ?? null) === 'MOVIE_NOT_FOUND') {
            throw new CatalogFailure(404);
        }
        if ($response->status() === 422 && is_array($body['errors'] ?? null)) {
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
