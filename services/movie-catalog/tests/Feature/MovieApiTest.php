<?php

namespace Tests\Feature;

use App\Models\Movie;
use App\Services\MovieService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MovieApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.internal_token' => 'test-internal', 'catalog.tmdb_token' => 'test-provider']);
        Http::preventStrayRequests();
        Sleep::fake();
        $this->withHeader('X-VYBE-Service-Token', 'test-internal');
    }

    private function detail(int $id = 550): array
    {
        return ['id' => $id, 'title' => 'Fixture movie', 'original_title' => 'Original fixture',
            'overview' => 'Fixture overview', 'poster_path' => '/poster.jpg', 'backdrop_path' => null,
            'release_date' => '1999-10-15', 'runtime' => 139, 'original_language' => 'en',
            'genres' => [['id' => 18, 'name' => 'Drama']], 'vote_average' => 8.456, 'vote_count' => 1000];
    }

    private function listing(array $rows, int $page = 1): array
    {
        return ['page' => $page, 'results' => $rows, 'total_pages' => 700, 'total_results' => 14000];
    }

    private function stored(bool $hydrated = true): Movie
    {
        return Movie::create(['tmdb_id' => 550, 'title' => 'Stored movie', 'runtime' => 139,
            'genres' => [['id' => 18, 'name' => 'Drama']], 'overview' => 'Stored overview',
            'metadata_fetched_at' => $hydrated ? now()->subDays(8) : null]);
    }

    public static function routes(): array
    {
        return [['popular'], ['search?query=fixture'], ['550'], ['bad-id']];
    }

    #[DataProvider('routes')]
    public function test_every_movie_route_requires_configured_service_authentication(string $route): void
    {
        $this->withoutHeader('X-VYBE-Service-Token')->getJson('/api/internal/v1/movies/'.$route)->assertForbidden();
        $this->withHeader('X-VYBE-Service-Token', 'wrong')->getJson('/api/internal/v1/movies/'.$route)->assertForbidden();
        config(['catalog.internal_token' => '']);
        $this->getJson('/api/internal/v1/movies/'.$route)->assertStatus(503)->assertJsonPath('code', 'SERVICE_MISCONFIGURED');
        Http::assertNothingSent();
    }

    public static function invalidRequests(): array
    {
        return [['popular?page=0'], ['popular?page=501'], ['popular?page=1.5'], ['popular?page[]=1'],
            ['popular?page='], ['search'], ['search?query=%20%20'], ['search?query[]=a'],
            ['search?query='.str_repeat('a', 201)], ['search?query=a&page=-1'],
            ['0'], ['-1'], ['1.5'], ['abc'], ['2147483648'], ['9999999999999999999999999'], ['01']];
    }

    #[DataProvider('invalidRequests')]
    public function test_invalid_input_is_json_422_even_without_accept_header(string $route): void
    {
        $this->get('/api/internal/v1/movies/'.$route)->assertStatus(422)->assertJsonStructure(['message', 'errors']);
        Http::assertNothingSent();
    }

    public function test_detail_is_normalized_persisted_and_reused_without_duplicate_rows(): void
    {
        Http::fake(['*' => Http::response($this->detail())]);
        $expected = ['data' => ['tmdb_id' => 550, 'title' => 'Fixture movie', 'original_title' => 'Original fixture',
            'overview' => 'Fixture overview', 'poster_path' => '/poster.jpg', 'backdrop_path' => null,
            'release_date' => '1999-10-15', 'runtime' => 139, 'original_language' => 'en',
            'genres' => [['id' => 18, 'name' => 'Drama']], 'tmdb_rating' => 8.46, 'tmdb_vote_count' => 1000],
            'meta' => ['stale' => false]];
        $this->getJson('/api/internal/v1/movies/550')->assertOk()->assertExactJson($expected);
        $this->getJson('/api/internal/v1/movies/550')->assertOk()->assertExactJson($expected);
        $this->assertDatabaseCount('movies', 1);
        $this->assertNotNull(Movie::first()->metadata_fetched_at);
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request->url() === 'https://api.themoviedb.org/3/movie/550?language=en-US'
            && $request->hasHeader('Authorization', 'Bearer test-provider') && ! $request->hasHeader('X-VYBE-Service-Token'));
    }

    public function test_freshness_expires_at_configured_boundary_and_refreshes_existing_row(): void
    {
        $this->freezeTime();
        config(['catalog.metadata_ttl_seconds' => 60]);
        $movie = $this->stored();
        $movie->update(['metadata_fetched_at' => now()->subSeconds(59)]);
        Http::fake(['*' => Http::response($this->detail())]);
        $this->getJson('/api/internal/v1/movies/550')->assertJsonPath('data.title', 'Stored movie');
        Http::assertNothingSent();
        $this->travel(1)->seconds();
        $this->getJson('/api/internal/v1/movies/550')->assertJsonPath('data.title', 'Fixture movie')->assertJsonPath('meta.stale', false);
        $this->assertSame(now()->toDateTimeString(), $movie->fresh()->metadata_fetched_at->toDateTimeString());
        $this->assertDatabaseCount('movies', 1);
    }

    public function test_summary_upserts_preserve_hydrated_fields_and_do_not_refresh_metadata(): void
    {
        $movie = $this->stored();
        $timestamp = $movie->metadata_fetched_at->toISOString();
        Http::fake(['*' => Http::response($this->listing([
            ['id' => 550, 'title' => 'Summary title', 'overview' => null],
            ['id' => 551, 'title' => 'Summary only'],
        ]))]);
        $this->getJson('/api/internal/v1/movies/popular')->assertOk();
        $movie->refresh();
        $this->assertSame('Summary title', $movie->title);
        $this->assertSame('Stored overview', $movie->overview);
        $this->assertSame(139, $movie->runtime);
        $this->assertSame([['id' => 18, 'name' => 'Drama']], $movie->genres);
        $this->assertSame($timestamp, $movie->metadata_fetched_at->toISOString());
        $this->assertNull(Movie::where('tmdb_id', 551)->first()->metadata_fetched_at);
    }

    public function test_rankings_preserve_provider_order_and_snapshot_values_on_cache_hit(): void
    {
        Http::fake(['*' => Http::response($this->listing([$this->detail(900), $this->detail(1), $this->detail(550)]))]);
        $first = $this->getJson('/api/internal/v1/movies/popular')->assertOk()->assertJsonPath('meta.total_pages', 500);
        $this->assertSame([900, 1, 550], array_column($first->json('data'), 'tmdb_id'));
        Movie::where('tmdb_id', 900)->update(['title' => 'Changed locally']);
        $this->getJson('/api/internal/v1/movies/popular')->assertExactJson($first->json());
        $this->assertNull(Movie::first()->metadata_fetched_at);
        Http::assertSentCount(1);
    }

    public function test_search_normalizes_whitespace_and_keys_distinguish_queries_pages_and_operations(): void
    {
        Http::fake(fn ($request) => Http::response($this->listing([], (int) ($request['page'] ?? 1))));
        foreach (['search?query=two%20%20words', 'search?query=%20two%20words%20', 'search?query=other',
            'search?query=two%20words&page=2', 'popular', 'popular?page=500'] as $route) {
            $this->getJson('/api/internal/v1/movies/'.$route)->assertOk()->assertJsonPath('data', []);
        }
        Http::assertSentCount(5);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/search/movie?') && $request['query'] === 'two words'
            && $request['include_adult'] === 'false' && $request['language'] === 'en-US');
    }

    public function test_empty_search_is_successfully_cached(): void
    {
        Http::fake(['*' => Http::response(['results' => [], 'page' => 1, 'total_pages' => 0, 'total_results' => 0])]);
        for ($i = 0; $i < 2; $i++) {
            $this->getJson('/api/internal/v1/movies/search?query=unknown')->assertExactJson([
                'data' => [], 'meta' => ['page' => 1, 'total_pages' => 0, 'total_results' => 0],
            ]);
        }
        Http::assertSentCount(1);
    }

    public function test_expired_rankings_refetch_and_never_invent_an_outage_fallback(): void
    {
        $this->freezeTime();
        config(['catalog.ranking_ttl_seconds' => 10]);
        Http::fakeSequence()->push($this->listing([$this->detail(2)]))->push($this->listing([$this->detail(3)]))->pushStatus(503)->pushStatus(503);
        $this->getJson('/api/internal/v1/movies/popular')->assertJsonPath('data.0.tmdb_id', 2);
        $this->travel(10)->seconds();
        $this->getJson('/api/internal/v1/movies/popular')->assertJsonPath('data.0.tmdb_id', 3);
        $this->travel(10)->seconds();
        $this->getJson('/api/internal/v1/movies/popular')->assertStatus(503)->assertJsonPath('code', 'UPSTREAM_UNAVAILABLE');
        Http::assertSentCount(4);
    }

    public function test_failed_refresh_serves_stale_details_and_cooldown_prevents_repeated_calls(): void
    {
        $this->freezeTime();
        $movie = $this->stored();
        $before = $movie->metadata_fetched_at->toISOString();
        Http::fake(['*' => Http::response(['secret' => 'do-not-leak'], 503)]);
        for ($i = 0; $i < 2; $i++) {
            $this->getJson('/api/internal/v1/movies/550')->assertOk()->assertJsonPath('meta.stale', true)->assertJsonPath('data.runtime', 139);
        }
        Http::assertSentCount(2);
        $this->assertSame($before, $movie->fresh()->metadata_fetched_at->toISOString());
        $this->travel(30)->seconds();
        $this->getJson('/api/internal/v1/movies/550')->assertJsonPath('meta.stale', true);
        Http::assertSentCount(4);
    }

    public function test_missing_or_summary_only_rows_are_not_a_stale_fallback(): void
    {
        Http::fake(['*' => Http::response([], 503)]);
        $this->getJson('/api/internal/v1/movies/550')->assertStatus(503);
        $this->stored(false);
        $this->getJson('/api/internal/v1/movies/550')->assertStatus(503);
        $this->assertNull(Movie::first()->metadata_fetched_at);
    }

    public function test_summary_row_is_hydrated_even_when_recently_updated(): void
    {
        $movie = $this->stored(false);
        Http::fake(['*' => Http::response($this->detail())]);
        $this->getJson('/api/internal/v1/movies/550')->assertOk()->assertJsonPath('meta.stale', false);
        $this->assertNotNull($movie->fresh()->metadata_fetched_at);
        $this->assertDatabaseCount('movies', 1);
    }

    public function test_refresh_lock_serves_stale_or_503_without_duplicate_provider_work(): void
    {
        $lock = Cache::lock('catalog:detail:lock:550', 20);
        $this->assertTrue($lock->get());
        try {
            $this->getJson('/api/internal/v1/movies/550')->assertStatus(503);
            $this->stored();
            $this->getJson('/api/internal/v1/movies/550')->assertOk()->assertJsonPath('meta.stale', true);
            Http::assertNothingSent();
        } finally {
            $lock->release();
        }
    }

    public static function failures(): array
    {
        return [[401, 1], [403, 1], [400, 1], [422, 1], [429, 1], [500, 2], [502, 2], [503, 2], [504, 2]];
    }

    #[DataProvider('failures')]
    public function test_provider_failures_are_safe_503_with_bounded_retries(int $status, int $requests): void
    {
        Http::fake(['*' => Http::response(['message' => 'provider-secret'], $status)]);
        $this->getJson('/api/internal/v1/movies/550')->assertStatus(503)->assertExactJson([
            'message' => 'Movie service unavailable', 'code' => 'UPSTREAM_UNAVAILABLE',
        ]);
        Http::assertSentCount($requests);
    }

    public function test_provider_not_found_is_not_retried_or_hidden_by_stale_details(): void
    {
        $this->stored();
        Http::fake(['*' => Http::response(['status_code' => 34], 404)]);
        $this->getJson('/api/internal/v1/movies/550')->assertNotFound()->assertExactJson(['message' => 'Movie not found', 'code' => 'MOVIE_NOT_FOUND']);
        Http::assertSentCount(1);
    }

    public function test_list_404_is_unavailable_not_movie_not_found(): void
    {
        Http::fake(['*' => Http::response([], 404)]);
        $this->getJson('/api/internal/v1/movies/popular')->assertStatus(503);
        Http::assertSentCount(1);
    }

    public function test_connection_failure_and_timeout_are_bounded_and_can_serve_stale(): void
    {
        $this->stored();
        Http::fake(['*' => Http::failedConnection('cURL error 28: timeout with sensitive details')]);
        $this->getJson('/api/internal/v1/movies/550')->assertOk()->assertJsonPath('meta.stale', true);
        Sleep::assertSleptTimes(1);
    }

    public function test_transient_failure_can_recover_on_the_single_retry(): void
    {
        Http::fakeSequence()->pushStatus(502)->push($this->detail());
        $this->getJson('/api/internal/v1/movies/550')->assertOk()->assertJsonPath('meta.stale', false);
        Http::assertSentCount(2);
    }

    public function test_retry_after_defers_all_provider_operations_until_expiry(): void
    {
        $this->freezeTime();
        Http::fakeSequence()->push([], 429, ['Retry-After' => '60'])->push($this->listing([]));
        $this->getJson('/api/internal/v1/movies/popular')->assertStatus(503);
        $this->getJson('/api/internal/v1/movies/search?query=test')->assertStatus(503);
        Http::assertSentCount(1);
        $this->travel(60)->seconds();
        $this->getJson('/api/internal/v1/movies/popular')->assertOk();
        Http::assertSentCount(2);
    }

    public function test_missing_provider_token_fails_without_sending_a_request(): void
    {
        config(['catalog.tmdb_token' => '']);
        $this->getJson('/api/internal/v1/movies/550')->assertStatus(503);
        Http::assertNothingSent();
    }

    public static function malformedDetails(): array
    {
        return [['<html>oops</html>'], [[]], [['id' => 550, 'title' => 'summary']],
            [['id' => 551, 'title' => 'wrong movie', 'runtime' => null, 'genres' => []]],
            [['id' => 550, 'title' => '', 'runtime' => null, 'genres' => []]],
            [['id' => 550, 'title' => 'bad genre', 'runtime' => null, 'genres' => [['id' => 1]]]]];
    }

    #[DataProvider('malformedDetails')]
    public function test_malformed_detail_never_marks_a_summary_as_hydrated(array|string $body): void
    {
        $movie = $this->stored(false);
        Http::fake(['*' => Http::response($body)]);
        $this->getJson('/api/internal/v1/movies/550')->assertStatus(503);
        $this->assertNull($movie->fresh()->metadata_fetched_at);
        Http::assertSentCount(1);
    }

    public function test_invalid_optional_values_are_safely_normalized_to_null(): void
    {
        Http::fake(['*' => Http::response(array_replace($this->detail(), [
            'release_date' => '2025-02-30', 'runtime' => -1, 'vote_average' => 99,
            'vote_count' => -1, 'poster_path' => 'https://evil.test/image.jpg', 'backdrop_path' => '/../a.jpg',
        ]))]);
        $response = $this->getJson('/api/internal/v1/movies/550')->assertOk();
        foreach (['release_date', 'runtime', 'tmdb_rating', 'tmdb_vote_count', 'poster_path', 'backdrop_path'] as $field) {
            $response->assertJsonPath('data.'.$field, null);
        }
    }

    public function test_malformed_ranking_is_neither_partially_persisted_nor_cached(): void
    {
        Http::fakeSequence()->push($this->listing([$this->detail(), ['id' => 2]]))->push($this->listing([$this->detail()]));
        $this->getJson('/api/internal/v1/movies/popular')->assertStatus(503);
        $this->assertDatabaseCount('movies', 0);
        $this->getJson('/api/internal/v1/movies/popular')->assertOk();
        $this->assertDatabaseCount('movies', 1);
    }

    public function test_unexpected_exception_is_safe_json_even_when_debug_is_enabled(): void
    {
        config(['app.debug' => true]);
        $this->mock(MovieService::class, function ($mock): void {
            $mock->shouldReceive('ranking')->andThrow(new \RuntimeException('sensitive internal configuration'));
        });
        $this->getJson('/api/internal/v1/movies/popular')->assertStatus(500)->assertExactJson([
            'message' => 'Internal server error', 'code' => 'INTERNAL_ERROR',
        ]);
    }

    public function test_database_unique_constraint_rejects_duplicate_external_ids(): void
    {
        $this->stored();
        $this->expectException(UniqueConstraintViolationException::class);
        $this->stored();
    }

    public function test_provider_request_has_bounded_timeouts_and_does_not_follow_redirects(): void
    {
        Http::fake(function ($request, $options) {
            $this->assertSame(2, $options['connect_timeout']);
            $this->assertSame(5, $options['timeout']);
            $this->assertFalse($options['allow_redirects']);
            $this->assertSame('GET', $request->method());

            return Http::response($this->listing([]));
        });
        $this->getJson('/api/internal/v1/movies/popular')->assertOk();
    }

    public function test_timeout_without_hydrated_details_returns_safe_503(): void
    {
        Http::fake(['*' => Http::failedConnection()]);
        $this->getJson('/api/internal/v1/movies/550')->assertStatus(503)->assertJsonPath('code', 'UPSTREAM_UNAVAILABLE');
        Sleep::assertSleptTimes(1);
        $this->assertDatabaseCount('movies', 0);
    }

    public function test_retry_after_http_date_on_second_attempt_is_honored(): void
    {
        $this->freezeTime();
        Http::fakeSequence()->pushStatus(500)->push([], 503, ['Retry-After' => now()->addMinutes(2)->toRfc7231String()]);
        $this->getJson('/api/internal/v1/movies/popular')->assertStatus(503);
        $this->getJson('/api/internal/v1/movies/search?query=fixture')->assertStatus(503);
        Http::assertSentCount(2);
        $this->assertTrue(Cache::has('catalog:tmdb:retry-after'));
    }

    public function test_search_ranking_expires_and_refetches_with_the_same_order(): void
    {
        config(['catalog.ranking_ttl_seconds' => 10]);
        Http::fake(['*' => Http::response($this->listing([$this->detail(5), $this->detail(1)]))]);
        $first = $this->getJson('/api/internal/v1/movies/search?query=fixture')->assertOk();
        $this->travel(11)->seconds();
        $this->getJson('/api/internal/v1/movies/search?query=fixture')->assertExactJson($first->json());
        Http::assertSentCount(2);
        $this->assertDatabaseCount('movies', 2);
    }

    public function test_database_cache_stores_rankings_and_coordinates_detail_lock(): void
    {
        config(['cache.default' => 'database']);
        Http::fake(['*' => Http::response($this->listing([$this->detail()]))]);
        $this->getJson('/api/internal/v1/movies/popular')->assertOk();
        $this->getJson('/api/internal/v1/movies/popular')->assertOk();
        Http::assertSentCount(1);
        $this->assertDatabaseCount('cache', 1);
        $lock = Cache::lock('catalog:detail:lock:550', 20);
        $this->assertTrue($lock->get());
        try {
            $this->getJson('/api/internal/v1/movies/550')->assertStatus(503);
            Http::assertSentCount(1);
        } finally {
            $lock->release();
        }
    }
}
