<?php

namespace App\Integrations\Tmdb;

use App\Exceptions\UpstreamUnavailable;

class ExperienceNormalizer
{
    public function __construct(private MovieNormalizer $movies) {}

    public function normalize(array $raw, int $id): array
    {
        foreach ([$raw['videos']['results'] ?? null, $raw['credits']['cast'] ?? null,
            $raw['credits']['crew'] ?? null, $raw['recommendations']['results'] ?? null] as $list) {
            if (! is_array($list) || ! array_is_list($list)) {
                throw new UpstreamUnavailable;
            }
        }
        $videos = [];
        foreach ($raw['videos']['results'] as $video) {
            if (! is_array($video) || ($video['site'] ?? null) !== 'YouTube'
                || ! in_array($video['type'] ?? null, ['Trailer', 'Teaser'], true)
                || ! is_string($video['key'] ?? null) || ! preg_match('/^[A-Za-z0-9_-]{11}$/D', $video['key'])
                || ! is_string($video['name'] ?? null) || trim($video['name']) === '') {
                continue;
            }
            $videos[] = ['name' => mb_substr($video['name'], 0, 255), 'site' => 'YouTube', 'key' => $video['key'],
                'type' => $video['type'], 'official' => ($video['official'] ?? false) === true];
        }
        // Stable sort preserves provider order within each preference group.
        usort($videos, fn ($a, $b) => [($a['type'] === 'Trailer' ? 0 : 1), ! $a['official']]
            <=> [($b['type'] === 'Trailer' ? 0 : 1), ! $b['official']]);
        $cast = [];
        $directors = [];
        foreach ($raw['credits']['cast'] as $person) {
            if (! $this->person($person) || isset($cast[$person['id']])) {
                continue;
            }
            $path = $person['profile_path'] ?? null;
            $cast[$person['id']] = ['tmdb_id' => $person['id'], 'name' => mb_substr($person['name'], 0, 255),
                'character' => is_string($person['character'] ?? null) ? mb_substr($person['character'], 0, 255) : null,
                'profile_path' => is_string($path) && strlen($path) <= 255 && preg_match('~^/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$~D', $path) ? $path : null];
            if (count($cast) === 12) {
                break;
            }
        }
        foreach ($raw['credits']['crew'] as $person) {
            if ($this->person($person) && ($person['job'] ?? null) === 'Director') {
                $directors[$person['id']] = ['tmdb_id' => $person['id'], 'name' => mb_substr($person['name'], 0, 255)];
                if (count($directors) === 4) {
                    break;
                }
            }
        }
        $related = [];
        foreach ($raw['recommendations']['results'] as $row) {
            if (! is_array($row) || ($row['id'] ?? null) === $id || ($row['adult'] ?? false) === true) {
                continue;
            }
            try {
                $movie = $this->movies->normalize($row);
                $movie = array_intersect_key($movie, array_flip(['tmdb_id', 'title', 'overview', 'poster_path', 'backdrop_path', 'release_date', 'tmdb_rating', 'tmdb_vote_count']))
                    + array_fill_keys(['overview', 'poster_path', 'backdrop_path', 'release_date', 'tmdb_rating', 'tmdb_vote_count'], null);
                $related[$movie['tmdb_id']] = $movie;
            } catch (UpstreamUnavailable) {
                continue;
            }
            if (count($related) === 6) {
                break;
            }
        }

        return ['tmdb_id' => $id, 'tagline' => is_string($raw['tagline'] ?? null) ? mb_substr($raw['tagline'], 0, 500) : null,
            'trailer' => $videos[0] ?? null, 'directors' => array_values($directors), 'cast' => array_values($cast), 'related' => array_values($related)];
    }

    private function person(mixed $person): bool
    {
        return is_array($person) && is_int($person['id'] ?? null) && $person['id'] > 0 && $person['id'] <= 2147483647
            && is_string($person['name'] ?? null) && trim($person['name']) !== '';
    }
}
