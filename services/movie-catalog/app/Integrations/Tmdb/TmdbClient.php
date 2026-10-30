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

    public function details(int $id): array
    {
        return $this->get('movie/'.$id, [], true);
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
