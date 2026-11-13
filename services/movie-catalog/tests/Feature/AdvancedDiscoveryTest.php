<?php

namespace Tests\Feature;

use App\Models\Movie;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;
use Tests\UsesPostgresSafeRefreshDatabase;

class AdvancedDiscoveryTest extends TestCase
{
    use UsesPostgresSafeRefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.internal_token' => 'test-internal', 'catalog.tmdb_token' => 'test-provider', 'catalog.ranking_ttl_seconds' => 60]);
        Http::preventStrayRequests();
        Sleep::fake();
        $this->withHeader('X-VYBE-Service-Token', 'test-internal');
        $this->travelTo(now('UTC')->setDate(2026, 11, 13)->startOfDay());
    }

    private function row(int $id = 1, ?string $poster = '/poster.jpg', ?string $date = '2026-12-10'): array
    {
        return ['id' => $id, 'title' => 'Fixture '.$id, 'poster_path' => $poster, 'release_date' => $date, 'vote_average' => 8.0, 'vote_count' => 400];
    }

    private function fake(array $rows = [], int $page = 1): void
    {
        Http::fake(['*' => Http::response(['page' => $page, 'results' => $rows, 'total_pages' => 5, 'total_results' => 100])]);
    }

    public static function categories(): array
    {
        return [['popular', 'movie/popular', null], ['trending', 'trending/movie/week', null], ['top_rated', 'discover/movie', 'vote_average.desc'],
            ['now_playing', 'discover/movie', 'popularity.desc'], ['upcoming', 'discover/movie', 'popularity.desc']];
    }

    #[DataProvider('categories')]
    public function test_categories_use_the_correct_provider_and_keep_order(string $category, string $path, ?string $sort): void
    {
        if ($category === 'trending') {
            Http::fake(['*' => Http::response(['page' => 1, 'results' => [$this->row(9), $this->row(1)], 'total_pages' => 1, 'total_results' => 2])]);
        } else {
            $this->fake([$this->row(9), $this->row(1)]);
        }
        $this->getJson('/api/internal/v1/movies/discover?category='.$category)->assertOk()->assertJsonPath('data.0.tmdb_id', 9)->assertJsonPath('data.1.tmdb_id', 1);
        Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://api.themoviedb.org/3/'.$path.'?') && ($sort === null || $request['sort_by'] === $sort));
        Http::assertSentCount(1);
        if ($category === 'now_playing') {
            Http::assertSent(fn ($request) => $request['primary_release_date.gte'] === '2026-10-02' && $request['primary_release_date.lte'] === '2026-11-13');
        }
        if ($category === 'top_rated') {
            Http::assertSent(fn ($request) => $request['vote_count.gte'] === 300);
        }
    }

    public function test_combined_filters_and_any_all_genres_are_provider_side(): void
    {
        $this->fake([], 2);
        foreach (['any' => '18|35', 'all' => '18,35'] as $match => $provider) {
            $this->getJson('/api/internal/v1/movies/discover?category=popular&genres[]=35&genres[]=18&genre_match='.$match.'&year_from=2000&year_to=2020&rating_min=7.5&runtime_min=90&runtime_max=180&original_language=fr&sort=vote_average.desc&page=2')
                ->assertOk()->assertJsonPath('meta.page', 2)->assertJsonCount(0, 'data');
            Http::assertSent(fn ($request) => $request['with_genres'] === $provider && $request['sort_by'] === 'vote_average.desc'
                && $request['primary_release_date.gte'] === '2000-01-01' && $request['primary_release_date.lte'] === '2020-12-31'
                && $request['vote_average.gte'] === 7.5 && $request['vote_count.gte'] === 300
                && $request['with_runtime.gte'] === 90 && $request['with_runtime.lte'] === 180 && $request['with_original_language'] === 'fr'
                && $request['include_adult'] === 'false' && $request['include_video'] === 'false');
        }
        Http::assertSentCount(2);
    }

    public static function sorts(): array
    {
        return array_map(fn ($sort) => [$sort], ['popularity.desc', 'vote_average.desc', 'primary_release_date.asc', 'primary_release_date.desc', 'title.asc', 'title.desc']);
    }

    #[DataProvider('sorts')]
    public function test_sorting_is_forwarded_globally(string $sort): void
    {
        $this->fake();
        $this->getJson('/api/internal/v1/movies/discover?category=upcoming&sort='.$sort)->assertOk();
        Http::assertSent(fn ($request) => $request['sort_by'] === $sort);
    }

    public function test_upcoming_is_future_poster_only_without_detail_calls(): void
    {
        $this->fake([$this->row(9), $this->row(1, null), $this->row(2, '/poster.jpg', '2026-11-13'), $this->row(3, '/poster.jpg', null), $this->row(8)]);
        $this->getJson('/api/internal/v1/movies/discover?category=upcoming')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.0.tmdb_id', 9)->assertJsonPath('data.1.tmdb_id', 8);
        Http::assertSent(fn ($request) => $request['primary_release_date.gte'] === '2026-11-14' && $request['sort_by'] === 'popularity.desc');
        Http::assertSentCount(1);
        $this->assertDatabaseCount('movies', 2);
        $this->assertNull(Movie::first()->metadata_fetched_at);
    }

    public function test_canonical_cache_keys_share_equivalent_genre_sets_and_expire(): void
    {
        $this->fake([$this->row(1)]);
        $first = '/api/internal/v1/movies/discover?genres[]=35&genres[]=18&genres[]=35&rating_min=0';
        $second = '/api/internal/v1/movies/discover?category=popular&genres[]=18&genres[]=35&genre_match=any&sort=popularity.desc';
        $this->getJson($first)->assertOk();
        $this->getJson($second)->assertOk();
        Http::assertSentCount(1);
        $this->travel(61)->seconds();
        $this->getJson($second)->assertOk();
        Http::assertSentCount(2);
        $this->getJson($second.'&runtime_min=90')->assertOk();
        Http::assertSentCount(3);
    }

    public function test_plain_popular_discovery_reuses_existing_ranking_cache(): void
    {
        $this->fake([$this->row()]);
        $this->getJson('/api/internal/v1/movies/popular')->assertOk();
        $this->getJson('/api/internal/v1/movies/discover?category=popular')->assertOk();
        Http::assertSentCount(1);
    }

    public function test_trending_filters_a_bounded_cached_pool_with_true_counts_and_provider_order(): void
    {
        Http::fake(function ($request) {
            $page = (int) $request['page'];
            $rows = [];
            for ($i = 1; $i <= 20; $i++) {
                $id = ($page - 1) * 20 + $i;
                $rows[] = $this->row($id, '/poster.jpg', $id <= 25 ? '2026-01-01' : '2020-01-01')
                    + ['genre_ids' => $id % 2 ? [18, 35] : [18], 'original_language' => $id <= 25 ? 'fr' : 'en'];
            }

            return Http::response(['page' => $page, 'results' => $rows, 'total_pages' => 200, 'total_results' => 4000]);
        });
        $base = '/api/internal/v1/movies/discover?category=trending&year_from=2026&original_language=fr&genres[]=18&genres[]=35';
        $this->getJson($base.'&genre_match=all')->assertOk()->assertJsonPath('meta.total_results', 13)
            ->assertJsonPath('meta.total_pages', 1)->assertJsonPath('data.0.tmdb_id', 1);
        $this->getJson($base.'&genre_match=any')->assertOk()->assertJsonPath('meta.total_results', 25)
            ->assertJsonPath('meta.total_pages', 2)->assertJsonPath('data.0.tmdb_id', 1);
        $this->getJson($base.'&genre_match=any&page=2')->assertOk()->assertJsonCount(5, 'data')->assertJsonPath('data.0.tmdb_id', 21);
        $this->getJson('/api/internal/v1/movies/discover?category=trending&rating_min=9')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 0);
        Http::assertSentCount(3);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/trending/movie/week?'));
    }

    public function test_upcoming_date_cache_rolls_over_at_midnight(): void
    {
        $this->travelTo(now('UTC')->endOfDay()->subSeconds(10));
        $this->fake([$this->row()]);
        $this->getJson('/api/internal/v1/movies/discover?category=upcoming')->assertOk();
        $this->travel(20)->seconds();
        $this->getJson('/api/internal/v1/movies/discover?category=upcoming')->assertOk();
        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request['primary_release_date.gte'] === '2026-11-15');
    }

    public function test_summary_updates_preserve_hydrated_fields(): void
    {
        Movie::create(['tmdb_id' => 1, 'title' => 'Saved', 'runtime' => 120, 'overview' => 'Saved overview', 'metadata_fetched_at' => now()->subDay()]);
        $this->fake([$this->row()]);
        $this->getJson('/api/internal/v1/movies/discover?category=upcoming')->assertOk();
        $movie = Movie::first();
        $this->assertSame(120, $movie->runtime);
        $this->assertSame('Saved overview', $movie->overview);
        $this->assertTrue($movie->metadata_fetched_at->equalTo(now()->subDay()));
    }

    public static function invalid(): array
    {
        return [['category=bad'], ['sort=bad'], ['genres[]=999'], ['genres=18'], ['genre_match=bad'], ['year_from=1887'], ['year_to=2101'],
            ['year_from=2028&year_to=2020'], ['rating_min=11'], ['runtime_min=-1'], ['runtime_max=601'], ['runtime_min=100&runtime_max=90'],
            ['original_language=eng'], ['query=title'], ['page=501'], ['category=trending&runtime_min=90'], ['category=trending&sort=title.asc']];
    }

    #[DataProvider('invalid')]
    public function test_invalid_discovery_does_not_call_provider(string $query): void
    {
        $this->getJson('/api/internal/v1/movies/discover?'.$query)->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_discovery_requires_internal_authentication(): void
    {
        $this->withoutHeader('X-VYBE-Service-Token')->getJson('/api/internal/v1/movies/discover')->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_provider_failures_do_not_cache_or_invent_results(): void
    {
        Http::fakeSequence()->push(['message' => 'provider secret'], 503)->push(['message' => 'provider secret'], 503)
            ->push(['page' => 1, 'results' => [], 'total_pages' => 0, 'total_results' => 0]);
        $this->getJson('/api/internal/v1/movies/discover?category=upcoming')->assertStatus(503)->assertJsonPath('code', 'UPSTREAM_UNAVAILABLE');
        $this->getJson('/api/internal/v1/movies/discover?category=upcoming')->assertOk()->assertJsonCount(0, 'data');
        Http::assertSentCount(3);
    }

    public function test_malformed_listing_fails_before_persistence(): void
    {
        $this->fake([$this->row(), ['id' => 'bad']]);
        $this->getJson('/api/internal/v1/movies/discover?category=upcoming')->assertStatus(503);
        $this->assertDatabaseCount('movies', 0);
    }
}
