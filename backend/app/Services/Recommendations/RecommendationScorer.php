<?php

namespace App\Services\Recommendations;

class RecommendationScorer
{
    private function match(array $ids, array $preferences): ?float
    {
        if (! $ids || ! $preferences) {
            return null;
        }
        // Mean over known preferences only; unknown metadata is not a dislike.
        $values = array_values(array_intersect_key($preferences, array_fill_keys($ids, true)));

        return $values ? max(0, array_sum($values) / count($values)) : 0;
    }

    public function score(array $candidate, array $profile): array
    {
        $g = $this->match(array_column($candidate['genres'], 'id'), $profile['genres']);
        $contributors = [];
        foreach (['actors', 'writers', 'directors'] as $kind) {
            $value = $this->match(array_column($candidate[$kind], 'id'), $profile[$kind]);
            if ($value !== null) {
                $contributors[] = $value;
            }
        }
        $c = $contributors ? array_sum($contributors) / count($contributors) : null;
        $p = null;
        foreach ($candidate['sources'] as $source) {
            if ($source['kind'] === 'similar') {
                if (isset($profile['loved'][$source['id']])) {
                    $p = 1.0;
                } elseif (isset($profile['watchlist'][$source['id']])) {
                    $p = max($p ?? 0, .4);
                }
            }
        }
        if ($p === null && ($profile['loved'] || $profile['watchlist'])) {
            $p = 0.0;
        }
        $movie = $candidate['movie'];
        $votes = $movie['tmdb_vote_count'] ?? 0;
        // Bayesian shrinkage toward 6/10; bounded vote confidence substitutes for unstable raw popularity.
        $q = .8 * (($votes * ($movie['tmdb_rating'] ?? 6) + 300 * 6) / ($votes + 300) / 10)
            + .2 * min(1, log(1 + $votes) / log(10001));
        $sum = 0;
        $weight = 0;
        foreach ([[.4, $g], [.25, $c], [.2, $p], [.15, $q]] as [$w, $value]) {
            if ($value !== null) {
                $sum += $w * $value;
                $weight += $w;
            }
        }

        return ['score' => max(0, min(1, $sum / $weight)), 'components' => ['G' => $g, 'C' => $c, 'P' => $p, 'Q' => $q]];
    }

    public function rank(array $candidates, array $profile): array
    {
        foreach ($candidates as &$candidate) {
            $candidate += $this->score($candidate, $profile);
        }
        unset($candidate);
        usort($candidates, fn ($a, $b) => [$b['score'], $a['movie']['tmdb_id']] <=> [$a['score'], $b['movie']['tmdb_id']]);
        // Greedy rerank: each already selected occurrence costs .04 per dominant feature (cap .24).
        $ranked = [];
        $counts = [];
        while ($candidates) {
            $best = 0;
            $bestScore = -1;
            foreach ($candidates as $i => $candidate) {
                $keys = $this->diversityKeys($candidate);
                $penalty = min(.24, .04 * array_sum(array_map(fn ($key) => $counts[$key] ?? 0, $keys)));
                if ($bestScore < $candidate['score'] - $penalty) {
                    $best = $i;
                    $bestScore = $candidate['score'] - $penalty;
                }
            }
            $selected = $candidates[$best];
            foreach ($this->diversityKeys($selected) as $key) {
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }
            $ranked[] = $selected;
            array_splice($candidates, $best, 1);
        }

        return $ranked;
    }

    private function diversityKeys(array $candidate): array
    {
        $keys = [];
        foreach (['genres', 'actors', 'directors'] as $kind) {
            if (isset($candidate[$kind][0])) {
                $keys[] = $kind.':'.$candidate[$kind][0]['id'];
            }
        }

        return $keys;
    }
}
