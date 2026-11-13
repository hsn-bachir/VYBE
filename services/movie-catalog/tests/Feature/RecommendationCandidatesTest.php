<?php

namespace Tests\Feature;

use App\Models\Movie;
use App\Services\MovieExperienceService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;
use Tests\UsesPostgresSafeRefreshDatabase;

class RecommendationCandidatesTest extends TestCase
{
    use UsesPostgresSafeRefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.internal_token' => 'test-internal', 'catalog.tmdb_token' => 'test-provider']);
        Http::preventStrayRequests();
    }

    public function test_token_validation_and_cache_only_reference_metadata(): void
    {
        $url = '/api/internal/v1/movies/recommendation-candidates';
        $this->postJson($url, [])->assertForbidden();
        $this->withHeader('X-VYBE-Service-Token', 'test-internal');
        $this->postJson($url, ['sources' => [['kind' => 'bogus', 'id' => 1]]])->assertUnprocessable();
        Movie::create(['tmdb_id' => 1, 'title' => 'Fixture', 'genres' => [['id' => 18, 'name' => 'Drama']]]);
        Cache::put('catalog:recommendation-credits:1', ['writers' => [['tmdb_id' => 4, 'name' => 'Writer']]]);
        $this->postJson($url, ['reference_ids' => [1]])->assertOk()->assertJsonPath('data.0.genres.0.id', 18)->assertJsonPath('data.0.writers.0.id', 4);
        Http::assertNothingSent();
    }

    public function test_bounded_shared_page_cache_deduplication_and_no_detail_requests(): void
    {
        Http::fake(fn () => Http::response(['page' => 1, 'total_pages' => 1, 'total_results' => 20, 'results' => array_map(fn ($id) => [
            'id' => $id, 'title' => 'Fixture '.$id, 'poster_path' => '/poster.jpg', 'genre_ids' => [18], 'vote_average' => 8, 'vote_count' => 400,
        ], range(1, 20))]));
        $this->withHeader('X-VYBE-Service-Token', 'test-internal');
        $request = ['sources' => [['kind' => 'genre', 'id' => 18], ['kind' => 'actor', 'id' => 4], ['kind' => 'director', 'id' => 5]], 'exclude_ids' => []];
        // No second page exists; provider total_pages must stop refills.
        $this->postJson('/api/internal/v1/movies/recommendation-candidates', $request)->assertOk()->assertJsonCount(20, 'data');
        $count = count(Http::recorded());
        $this->assertLessThanOrEqual(8, $count);
        $this->postJson('/api/internal/v1/movies/recommendation-candidates', $request)->assertOk();
        Http::assertSentCount($count);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/credits') || preg_match('~/movie/\d+\?~', $r->url()));
    }

    public function test_provider_failure_returns_partial_existing_sources_or_service_error(): void
    {
        $this->withHeader('X-VYBE-Service-Token', 'test-internal');
        Http::fake(['*' => Http::response([], 401)]);
        $this->postJson('/api/internal/v1/movies/recommendation-candidates', [])->assertStatus(503);
    }

    public function test_actual_writing_roles_are_cached_without_changing_experience_dto(): void
    {
        $data = app(MovieExperienceService::class)->capture(['videos' => ['results' => []],
            'credits' => ['cast' => [], 'crew' => [
                ['id' => 1, 'name' => 'Writer', 'job' => 'Screenplay'],
                ['id' => 2, 'name' => 'Producer', 'job' => 'Producer'],
                ['id' => 3, 'name' => 'Director', 'job' => 'Director'],
            ]], 'recommendations' => ['results' => []]], 100);
        $this->assertArrayNotHasKey('writers', $data);
        $this->assertSame([['tmdb_id' => 1, 'name' => 'Writer']], Cache::get('catalog:recommendation-credits:100')['writers']);
        Http::assertNothingSent();
    }

    public function test_empty_provider_pool_is_an_honest_empty_response(): void
    {
        Http::fake(['*' => Http::response(['page' => 1, 'total_pages' => 0, 'total_results' => 0, 'results' => []])]);
        $this->withHeader('X-VYBE-Service-Token', 'test-internal')->postJson('/api/internal/v1/movies/recommendation-candidates', [])->assertOk()->assertJsonCount(0, 'data');
        Http::assertSentCount(1);
    }
}
