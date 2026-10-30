<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MovieDiscoveryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test:8001', 'movie_catalog.token' => 'server-only-secret']);
        Http::preventStrayRequests();
    }

    private function summary(int $id = 550): array
    {
        return ['tmdb_id' => $id, 'title' => 'Test movie', 'overview' => null, 'poster_path' => '/poster.jpg',
            'backdrop_path' => null, 'release_date' => '1999-10-15', 'tmdb_rating' => 8.4, 'tmdb_vote_count' => 1000];
    }

    private function listing(array $movies, int $page = 1): array
    {
        return ['data' => $movies, 'meta' => ['page' => $page, 'total_pages' => 3, 'total_results' => 60]];
    }

    public function test_guest_popular_preserves_order_and_only_forwards_server_service_credential(): void
    {
        $body = $this->listing([$this->summary(900), $this->summary(1)]);
        Http::fake(['*' => Http::response($body + ['internal' => 'secret'], 200, ['X-Internal-Secret' => 'never-public', 'Set-Cookie' => 'internal=session'])]);
        $this->withHeaders(['X-VYBE-Service-Token' => 'attacker', 'Authorization' => 'Bearer browser-token'])
            ->getJson('/api/v1/movies/popular')->assertOk()->assertExactJson($body)->assertHeaderMissing('X-Internal-Secret');
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request->url() === 'http://catalog.test:8001/api/internal/v1/movies/popular?page=1'
            && $request->hasHeader('X-VYBE-Service-Token', 'server-only-secret') && ! $request->hasHeader('Authorization') && ! $request->hasHeader('Cookie'));
    }

    public function test_search_trims_query_preserves_pagination_and_allows_empty_results(): void
    {
        $body = $this->listing([], 2);
        Http::fake(['*' => Http::response($body)]);
        $this->getJson('/api/v1/movies/search?query=%20two%20%20words%20&page=2&language=fr')->assertExactJson($body);
        Http::assertSent(fn ($request) => $request['query'] === 'two words' && $request['page'] === 2 && ! isset($request['language']));
    }

    public function test_details_preserve_stale_metadata_and_strip_unknown_fields(): void
    {
        $movie = $this->summary() + ['original_title' => null, 'runtime' => null, 'original_language' => 'en', 'genres' => [['id' => 18, 'name' => 'Drama']]];
        Http::fake(['*' => Http::response(['data' => $movie + ['internal_token' => 'secret'], 'meta' => ['stale' => true, 'internal' => 'secret']])]);
        $this->getJson('/api/v1/movies/550')->assertExactJson(['data' => $movie, 'meta' => ['stale' => true]]);
    }

    public static function invalidRequests(): array
    {
        return [['popular?page=0'], ['popular?page=501'], ['popular?page=1.2'], ['popular?page[]=1'],
            ['search'], ['search?query=%20%20'], ['search?query[]=test'], ['search?query='.str_repeat('a', 201)],
            ['search?query=a&page=-1'], ['0'], ['-1'], ['bad'], ['01'], ['2147483648']];
    }

    #[DataProvider('invalidRequests')]
    public function test_invalid_input_is_422_before_any_service_call(string $path): void
    {
        $this->getJson('/api/v1/movies/'.$path)->assertStatus(422)->assertJsonStructure(['message', 'errors']);
        Http::assertNothingSent();
    }

    public function test_catalog_genuine_404_maps_to_public_404(): void
    {
        Http::fake(['*' => Http::response(['code' => 'MOVIE_NOT_FOUND', 'message' => 'internal details'], 404)]);
        $this->getJson('/api/v1/movies/550')->assertNotFound()->assertExactJson(['message' => 'Movie not found', 'code' => 'MOVIE_NOT_FOUND']);
        Http::assertSentCount(1);
    }

    public function test_catalog_validation_error_uses_safe_field_messages(): void
    {
        Http::fake(['*' => Http::response(['errors' => ['query' => ['server-only-secret'], 'internal_url' => ['secret']]], 422)]);
        $this->getJson('/api/v1/movies/search?query=test')->assertStatus(422)->assertExactJson([
            'message' => 'The request is invalid.', 'errors' => ['query' => ['The query field is invalid.']],
        ]);
    }

    public static function failures(): array
    {
        return [[403], [401], [404], [429], [500], [503], [302]];
    }

    #[DataProvider('failures')]
    public function test_upstream_failures_are_safe_and_never_retried(int $status): void
    {
        Http::fake(['*' => Http::response(['message' => 'server-only-secret'], $status)]);
        $this->getJson('/api/v1/movies/popular')->assertStatus(503)->assertExactJson(['message' => 'Movie service unavailable', 'code' => 'UPSTREAM_UNAVAILABLE']);
        Http::assertSentCount(1);
    }

    public function test_network_timeout_is_safe_and_not_retried(): void
    {
        Http::fake(['*' => Http::failedConnection('cURL error 28: server-only-secret')]);
        $this->getJson('/api/v1/movies/550')->assertStatus(503)->assertExactJson(['message' => 'Movie service unavailable', 'code' => 'UPSTREAM_UNAVAILABLE']);
    }

    public function test_timeouts_allow_catalog_attempts_and_redirects_are_disabled(): void
    {
        Http::fake(function ($request, $options) {
            $this->assertSame(2, $options['connect_timeout']);
            $this->assertSame(12, $options['timeout']);
            $this->assertFalse($options['allow_redirects']);

            return Http::response($this->listing([]));
        });
        $this->getJson('/api/v1/movies/popular')->assertOk();
    }

    public static function malformed(): array
    {
        return [['<html>internal error</html>'], [[]], [['data' => [], 'meta' => ['page' => '1', 'total_pages' => 1, 'total_results' => 1]]],
            [['data' => [['tmdb_id' => 1, 'title' => 'incomplete']], 'meta' => ['page' => 1, 'total_pages' => 1, 'total_results' => 1]]]];
    }

    #[DataProvider('malformed')]
    public function test_malformed_envelopes_fail_safely(array|string $body): void
    {
        Http::fake(['*' => Http::response($body)]);
        $this->getJson('/api/v1/movies/popular')->assertStatus(503)->assertJsonPath('code', 'UPSTREAM_UNAVAILABLE');
    }

    public function test_wrong_detail_identifier_and_invalid_image_urls_are_rejected(): void
    {
        $movie = $this->summary(551) + ['original_title' => null, 'runtime' => null, 'original_language' => null, 'genres' => []];
        Http::fakeSequence()->push(['data' => $movie, 'meta' => ['stale' => false]])
            ->push($this->listing([array_replace($this->summary(), ['poster_path' => 'https://evil.test/poster.jpg'])]));
        $this->getJson('/api/v1/movies/550')->assertStatus(503);
        $this->getJson('/api/v1/movies/popular')->assertStatus(503);
    }

    public function test_missing_service_configuration_fails_without_http(): void
    {
        config(['movie_catalog.token' => '']);
        $this->getJson('/api/v1/movies/popular')->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_movie_validation_is_json_without_an_accept_header(): void
    {
        $this->get('/api/v1/movies/popular?page=0')->assertStatus(422)->assertJsonStructure(['message', 'errors']);
        Http::assertNothingSent();
    }
}
