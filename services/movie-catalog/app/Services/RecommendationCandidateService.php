<?php

namespace App\Services;

use App\Exceptions\UpstreamUnavailable;
use App\Http\Resources\MovieSummaryResource;
use App\Models\Movie;
use Illuminate\Support\Facades\Cache;

class RecommendationCandidateService
{
    public function __construct(private MovieService $movies) {}

    public function get(array $request): array
    {
        if (isset($request['reference_ids'])) {
            return ['data' => $this->features($request['reference_ids']), 'meta' => ['partial' => false]];
        }
        $sources = $request['sources'] ?? [];
        $sources[] = ['kind' => 'quality', 'id' => 0];
        $pool = [];
        $evidence = [];
        $partial = false;
        $pages = 0;
        $start = microtime(true);
        $exhausted = [];
        $successful = false;
        // One initial page per source; refill fallback only if exclusions leave fewer than 100.
        foreach ([1, 2] as $page) {
            foreach ($sources as $source) {
                $signature = $source['kind'].':'.$source['id'];
                if (isset($exhausted[$signature])) {
                    continue;
                }
                if ($pages >= 8 || microtime(true) - $start >= 8) {
                    $partial = true;
                    break 2;
                }
                if ($page > 1 && ($source['kind'] !== 'quality' || count(array_diff(array_keys($pool), $request['exclude_ids'] ?? [])) >= 100)) {
                    continue;
                }
                $query = ['page' => $page];
                $key = match ($source['kind']) {
                    'genre' => 'with_genres', 'actor' => 'with_cast', 'writer', 'director' => 'with_crew', 'similar' => 'reference', default => null
                };
                if ($key) {
                    $query[$key] = $source['id'];
                }
                try {
                    $listing = $this->movies->recommendationListing($query);
                    $pages++;
                    $successful = true;
                    if ($listing['meta']['total_pages'] <= $page || ! $listing['movies']) {
                        $exhausted[$signature] = true;
                    }
                    foreach ($listing['movies'] as $movie) {
                        if (empty($movie['poster_path'])) {
                            continue;
                        }
                        $id = $movie['tmdb_id'];
                        $pool[$id] = $movie;
                        $evidence[$id][] = $source;
                    }
                } catch (UpstreamUnavailable) {
                    $partial = true;
                    break 2;
                }
            }
        }
        if (! $pool && ! $successful) {
            throw new UpstreamUnavailable;
        }
        $features = $this->features(array_slice(array_keys($pool), 0, 200));
        foreach ($features as &$feature) {
            $feature['sources'] = $evidence[$feature['movie']['tmdb_id']] ?? [];
        }

        return ['data' => $features, 'meta' => ['partial' => $partial]];
    }

    private function features(array $ids): array
    {
        $rows = Movie::whereIn('tmdb_id', $ids)->get(['tmdb_id', 'title', 'overview', 'poster_path', 'backdrop_path', 'release_date', 'tmdb_rating', 'tmdb_vote_count', 'genres'])->keyBy('tmdb_id');
        $result = [];
        $keys = [];
        foreach ($ids as $id) {
            foreach (['catalog:recommendation-genres:', 'catalog:recommendation-credits:', 'catalog:experience:v1:'] as $prefix) {
                $keys[] = $prefix.$id;
            }
        }
        $metadata = $keys ? Cache::many($keys) : [];
        foreach ($ids as $id) {
            if (! $movie = $rows->get($id)) {
                continue;
            }
            $summary = (new MovieSummaryResource($movie->toArray()))->resolve();
            $genres = $movie->genres ?: array_map(fn ($id) => ['id' => $id, 'name' => $this->genreName($id)], $metadata['catalog:recommendation-genres:'.$id] ?? []);
            $feature = ['movie' => $summary, 'genres' => $genres, 'sources' => []];
            $credits = $metadata['catalog:recommendation-credits:'.$id] ?? null;
            $experience = $metadata['catalog:experience:v1:'.$id]['data'] ?? [];
            foreach (['actors' => 'cast', 'directors' => 'directors', 'writers' => 'writers'] as $kind => $field) {
                $feature[$kind] = array_map(fn ($person) => ['id' => $person['tmdb_id'], 'name' => $person['name']], $credits[$kind] ?? $experience[$field] ?? []);
            }
            $result[] = $feature;
        }

        return $result;
    }

    private function genreName(int $id): string
    {
        return [28 => 'Action', 12 => 'Adventure', 16 => 'Animation', 35 => 'Comedy', 80 => 'Crime', 99 => 'Documentary', 18 => 'Drama', 10751 => 'Family', 14 => 'Fantasy', 36 => 'History', 27 => 'Horror', 10402 => 'Music', 9648 => 'Mystery', 10749 => 'Romance', 878 => 'Science Fiction', 10770 => 'TV Movie', 53 => 'Thriller', 10752 => 'War', 37 => 'Western'][$id] ?? 'Film';
    }
}
