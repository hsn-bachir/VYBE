<?php

namespace App\Services\Recommendations;

use App\Integrations\MovieCatalog\MovieCatalogClient;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class RecommendationService
{
    public function __construct(private PreferenceService $preferences, private RecommendationScorer $scorer, private MovieCatalogClient $catalog) {}

    public function feed(User $user): array
    {
        $start = microtime(true);
        $timings = ['candidates_ms' => 0.0, 'filter_ms' => 0.0, 'scoring_ms' => 0.0];
        $activity = $this->preferences->activity($user);
        $key = 'recommendations:v1:'.$user->id.':'.$activity['revision'];
        $ttl = config('recommendations.ttl_seconds');
        $profile = Cache::remember($key.':preferences', $ttl, function () use ($activity) {
            $features = $this->catalog->recommendationCandidates(['reference_ids' => array_keys($activity['signals'])]);

            return $this->preferences->calculate($activity, $features['data']);
        });
        $timings['preferences_ms'] = (microtime(true) - $start) * 1000;
        $cached = Cache::get($key.':ranked');
        $cacheHit = $cached !== null;
        if (! $cached) {
            $sources = [];
            // Rotate daily among meaningful references without introducing randomness.
            foreach (['loved', 'watchlist'] as $kind) {
                $ids = array_keys($profile[$kind]);
                if ($ids) {
                    $sources[] = ['kind' => 'similar', 'id' => $ids[(int) now('UTC')->format('z') % count($ids)]];
                }
            }
            foreach (['genres' => 'genre', 'actors' => 'actor', 'directors' => 'director', 'writers' => 'writer'] as $kind => $sourceKind) {
                foreach ($profile[$kind] as $id => $strength) {
                    if ($strength > 0) {
                        $sources[] = ['kind' => $sourceKind, 'id' => $id];
                        break;
                    }
                }
            }
            $stage = microtime(true);
            $candidates = $this->catalog->recommendationCandidates(['sources' => $sources, 'exclude_ids' => array_slice($activity['excluded'], 0, 500)]);
            $timings['candidates_ms'] = (microtime(true) - $stage) * 1000;
            $stage = microtime(true);
            $eligible = array_values(array_filter($candidates['data'], fn ($row) => ! in_array($row['movie']['tmdb_id'], $activity['excluded']) && ! empty($row['movie']['poster_path'])));
            $timings['filter_ms'] = (microtime(true) - $stage) * 1000;
            $stage = microtime(true);
            $cached = ['ranked' => $this->scorer->rank($eligible, $profile), 'partial' => $candidates['meta']['partial'], 'sources' => $sources];
            $timings['scoring_ms'] = (microtime(true) - $stage) * 1000;
            Cache::put($key.':ranked', $cached, $ttl);
        }
        // Always read authoritative membership again, including on a ranking cache hit.
        $stage = microtime(true);
        $excluded = array_fill_keys($this->preferences->activity($user)['excluded'], true);
        $ranked = array_values(array_filter($cached['ranked'], fn ($row) => ! isset($excluded[$row['movie']['tmdb_id']])));
        $timings['filter_ms'] += (microtime(true) - $stage) * 1000;
        $stage = microtime(true);
        $sections = [];
        $used = [];
        $add = function (string $id, string $title, ?string $explanation, array $rows, int $limit = 6) use (&$sections, &$used): void {
            if (! $rows) {
                return;
            }
            $fresh = array_values(array_filter($rows, fn ($row) => ! isset($used[$row['movie']['tmdb_id']])));
            if (count($fresh) >= min(3, count($rows))) {
                $rows = $fresh;
            }
            $movies = array_column(array_slice($rows, 0, $limit), 'movie');
            foreach ($movies as $movie) {
                $used[$movie['tmdb_id']] = true;
            }
            $sections[] = compact('id', 'title', 'explanation', 'movies');
        };
        $personalized = (bool) array_filter($ranked, fn ($row) => ($row['components']['G'] ?? 0) > 0 || ($row['components']['C'] ?? 0) > 0 || ($row['components']['P'] ?? 0) > 0);
        $add('top', $personalized ? 'Top Picks for You' : 'Worth discovering', $personalized ? 'Selected from your movie interests.' : 'Popular, well-rated films to start exploring. Rate and save films to shape your picks.', $ranked, 18);
        foreach ($cached['sources'] as $source) {
            $id = $source['id'];
            $kind = $source['kind'];
            if ($kind === 'similar') {
                $loved = isset($profile['loved'][$id]);
                $rows = array_values(array_filter($ranked, fn ($row) => in_array($source, $row['sources'])));
                $add($loved ? 'loved' : 'watchlist', $loved ? 'Because You Loved '.$profile['loved'][$id] : 'Inspired by Your Watchlist', $loved ? 'Similar to a film you strongly enjoyed.' : 'New stories related to films you saved for later.', $rows);
            } else {
                $field = ['genre' => 'genres', 'actor' => 'actors', 'writer' => 'writers', 'director' => 'directors'][$kind];
                $rows = array_values(array_filter($ranked, fn ($row) => in_array($id, array_column($row[$field], 'id'))));
                $name = $profile['names'][$field][$id];
                $title = match ($kind) {
                    'genre' => 'More '.$name.' for You', 'actor' => 'More Movies Featuring '.$name, 'writer' => 'Stories Written by '.$name, 'director' => 'More From '.$name
                };
                // One combined creator section; only actual cached roles support inclusion.
                if (in_array($kind, ['writer', 'director']) && in_array('creators', array_column($sections, 'id'))) {
                    continue;
                }
                $add(match ($kind) {
                    'writer', 'director' => 'creators', default => $kind
                }, $title, 'Connected to films you strongly enjoyed.', $rows);
            }
        }
        $timings['assembly_ms'] = (microtime(true) - $stage) * 1000;
        $timings['total_ms'] = (microtime(true) - $start) * 1000;
        Log::debug('Recommendation stages', ['cache_hit' => $cacheHit, 'timings' => $timings]);

        return ['data' => ['sections' => $sections], 'meta' => ['personalized' => $personalized, 'partial' => $cached['partial']]];
    }
}
