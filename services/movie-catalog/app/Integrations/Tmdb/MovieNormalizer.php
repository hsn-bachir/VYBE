<?php

namespace App\Integrations\Tmdb;

use App\Exceptions\UpstreamUnavailable;
use DateTimeImmutable;

class MovieNormalizer
{
    public function normalize(array $data, bool $detail = false): array
    {
        if (! is_int($data['id'] ?? null) || $data['id'] < 1 || $data['id'] > 2147483647
            || ! is_string($data['title'] ?? null) || trim($data['title']) === '' || mb_strlen($data['title']) > 255) {
            throw new UpstreamUnavailable;
        }
        // A summary accidentally returned by the detail endpoint is not hydration.
        if ($detail && (! array_key_exists('runtime', $data) || ! is_array($data['genres'] ?? null) || ! array_is_list($data['genres']))) {
            throw new UpstreamUnavailable;
        }

        $result = ['tmdb_id' => $data['id'], 'title' => trim($data['title'])];
        foreach (['original_title' => 255, 'overview' => 16000, 'original_language' => 10] as $field => $length) {
            if ($detail || array_key_exists($field, $data)) {
                $result[$field] = is_string($data[$field] ?? null) ? mb_substr($data[$field], 0, $length) : null;
            }
        }
        foreach (['poster_path', 'backdrop_path'] as $field) {
            if ($detail || array_key_exists($field, $data)) {
                $value = $data[$field] ?? null;
                $result[$field] = is_string($value) && strlen($value) <= 255 && preg_match('~^/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$~D', $value) ? $value : null;
            }
        }
        if ($detail || array_key_exists('release_date', $data)) {
            $value = $data['release_date'] ?? null;
            $date = is_string($value) && preg_match('/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/D', $value) ? DateTimeImmutable::createFromFormat('!Y-m-d', $value) : false;
            $result['release_date'] = $date && $date->format('Y-m-d') === $value ? $value : null;
        }
        foreach (['vote_average' => ['tmdb_rating', 10], 'vote_count' => ['tmdb_vote_count', 4294967295]] as $source => [$target, $max]) {
            if ($detail || array_key_exists($source, $data)) {
                $value = $data[$source] ?? null;
                $valid = (is_int($value) || is_float($value)) && is_finite((float) $value) && $value >= 0 && $value <= $max;
                $result[$target] = $valid ? ($target === 'tmdb_rating' ? round($value, 2) : (int) $value) : null;
            }
        }
        if ($detail) {
            $runtime = $data['runtime'];
            $result['runtime'] = is_int($runtime) && $runtime >= 0 && $runtime <= 65535 ? $runtime : null;
            $result['genres'] = [];
            foreach ($data['genres'] as $genre) {
                if (! is_array($genre) || ! is_int($genre['id'] ?? null) || $genre['id'] < 1 || ! is_string($genre['name'] ?? null) || trim($genre['name']) === '') {
                    throw new UpstreamUnavailable;
                }
                $result['genres'][] = ['id' => $genre['id'], 'name' => mb_substr($genre['name'], 0, 255)];
            }
        }

        return $result;
    }
}
