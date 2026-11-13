<?php

namespace Tests\Unit;

use App\Services\Recommendations\PreferenceService;
use App\Services\Recommendations\RecommendationScorer;
use PHPUnit\Framework\TestCase;

class RecommendationTest extends TestCase
{
    private function feature(int $id): array
    {
        return ['movie' => ['tmdb_id' => $id, 'title' => 'Fixture', 'tmdb_rating' => 8, 'tmdb_vote_count' => 400],
            'genres' => [['id' => 18, 'name' => 'Drama']], 'actors' => [['id' => 10, 'name' => 'Actor']],
            'writers' => [['id' => 11, 'name' => 'Writer']], 'directors' => [['id' => 12, 'name' => 'Director']], 'sources' => []];
    }

    public function test_sparse_negative_and_strong_evidence(): void
    {
        $service = new PreferenceService;
        $activity = ['signals' => [1 => 1, 2 => .75, 3 => -1, 4 => .2, 5 => .05, 6 => 0], 'watchlist' => [4]];
        $profile = $service->calculate($activity, array_map($this->feature(...), range(1, 6)));
        $this->assertEquals(.5, $profile['genres'][18]);
        $this->assertEquals(.375, $profile['actors'][10]);
        $this->assertCount(2, $profile['loved']);
        $this->assertArrayHasKey(4, $profile['watchlist']);
        $sparse = $service->calculate(['signals' => [1 => .2], 'watchlist' => [1]], [$this->feature(1)]);
        $this->assertEmpty($sparse['genres']);
        $this->assertEmpty($sparse['actors']);
        $negative = $service->calculate(['signals' => [1 => -1], 'watchlist' => []], [$this->feature(1)]);
        $this->assertEquals(-.5, $negative['genres'][18]);
    }

    public function test_weighted_bounded_scores_missing_metadata_and_deterministic_diversity(): void
    {
        $scorer = new RecommendationScorer;
        $profile = ['genres' => [18 => 1], 'actors' => [10 => 1], 'writers' => [11 => 1], 'directors' => [12 => 1], 'loved' => [1 => 'Fixture'], 'watchlist' => []];
        $candidate = $this->feature(2);
        $candidate['sources'] = [['kind' => 'similar', 'id' => 1]];
        $score = $scorer->score($candidate, $profile);
        $this->assertEqualsWithDelta(.85 + .15 * $score['components']['Q'], $score['score'], .00001);
        $this->assertLessThanOrEqual(1, $score['score']);
        $candidate['genres'] = $candidate['actors'] = $candidate['writers'] = $candidate['directors'] = [];
        $this->assertNull($scorer->score($candidate, $profile)['components']['G']);
        $candidates = array_map($this->feature(...), range(2, 20));
        $this->assertSame($scorer->rank($candidates, $profile), $scorer->rank($candidates, $profile));
        $this->assertCount(19, $scorer->rank($candidates, $profile));
    }

    public function test_negative_overlap_quality_confidence_and_diversity_change_ranking(): void
    {
        $scorer = new RecommendationScorer;
        $profile = ['genres' => [18 => 1, 27 => -1], 'actors' => [], 'writers' => [], 'directors' => [], 'loved' => [], 'watchlist' => []];
        $good = $this->feature(1);
        $mixed = $this->feature(2);
        $mixed['genres'][] = ['id' => 27, 'name' => 'Horror'];
        $this->assertGreaterThan($scorer->score($mixed, $profile)['score'], $scorer->score($good, $profile)['score']);
        $untrusted = $good;
        $untrusted['movie']['tmdb_rating'] = 10;
        $untrusted['movie']['tmdb_vote_count'] = 1;
        $this->assertGreaterThan($scorer->score($untrusted, $profile)['components']['Q'], $scorer->score($good, $profile)['components']['Q']);
        $alternative = $this->feature(4);
        $alternative['genres'] = [['id' => 35, 'name' => 'Comedy']];
        $alternative['actors'] = $alternative['directors'] = [];
        $profile['genres'][35] = .95;
        $ranked = $scorer->rank([$good, $this->feature(2), $this->feature(3), $alternative], $profile);
        $this->assertSame(1, $ranked[0]['movie']['tmdb_id']);
        $this->assertSame(4, $ranked[1]['movie']['tmdb_id']);
    }
}
