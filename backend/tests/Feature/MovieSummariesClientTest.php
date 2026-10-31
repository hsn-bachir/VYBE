<?php

namespace Tests\Feature;

use App\Integrations\MovieCatalog\CatalogFailure;
use App\Integrations\MovieCatalog\MovieCatalogClient;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MovieSummariesClientTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test:8001', 'movie_catalog.token' => 'server-only-test-secret']);
        Http::preventStrayRequests();
    }

    private static function summary(int $id): array
    {
        return ['tmdb_id' => $id, 'title' => 'Fixture movie', 'poster_path' => null, 'backdrop_path' => null,
            'overview' => null, 'release_date' => '2001-02-03', 'tmdb_rating' => 8.4, 'tmdb_vote_count' => 100];
    }

    private function client(): MovieCatalogClient
    {
        return app(MovieCatalogClient::class);
    }

    public function test_one_json_post_deduplicates_and_reuses_transport_and_normalization(): void
    {
        Http::fake(function ($request, $options) {
            $this->assertSame('POST', $request->method());
            $this->assertSame('http://catalog.test:8001/api/internal/v1/movies/summaries', $request->url());
            $this->assertSame(['tmdb_ids' => [7, 8, 3, 9]], $request->data());
            $this->assertTrue($request->hasHeader('Content-Type', 'application/json'));
            $this->assertTrue($request->hasHeader('X-VYBE-Service-Token', 'server-only-test-secret'));
            $this->assertFalse($request->hasHeader('Cookie'));
            $this->assertFalse($request->hasHeader('Authorization'));
            $this->assertSame(2, $options['connect_timeout']);
            $this->assertSame(12, $options['timeout']);
            $this->assertFalse($options['allow_redirects']);

            return Http::response(['data' => [self::summary(3) + ['internal_id' => 55], self::summary(7)],
                'meta' => ['requested_count' => 4, 'returned_count' => 2, 'missing_tmdb_ids' => [9, 8], 'secret' => 'hidden'],
                'secret' => 'hidden']);
        });
        $this->assertSame(['data' => [self::summary(7), self::summary(3)], 'meta' => [
            'requested_count' => 4, 'returned_count' => 2, 'missing_tmdb_ids' => [8, 9],
        ]], $this->client()->summaries([7, 8, 3, 7, 9, 8]));
        Http::assertSentCount(1);
    }

    public function test_empty_list_needs_no_http_or_service_configuration(): void
    {
        config(['movie_catalog.token' => '']);
        Http::fake();
        $this->assertSame(['data' => [], 'meta' => ['requested_count' => 0, 'returned_count' => 0, 'missing_tmdb_ids' => []]],
            $this->client()->summaries([]));
        Http::assertNothingSent();
    }

    public function test_all_missing_maximum_batch_and_identifier_are_supported(): void
    {
        $ids = [...range(1, 49), 2147483647];
        $body = ['data' => [], 'meta' => ['requested_count' => 50, 'returned_count' => 0, 'missing_tmdb_ids' => $ids]];
        Http::fake(['*' => Http::response($body)]);
        $this->assertSame($body, $this->client()->summaries($ids));
        Http::assertSentCount(1);
    }

    public function test_single_summary_and_null_optional_values_are_supported(): void
    {
        $movie = array_replace(self::summary(1), ['release_date' => null, 'tmdb_rating' => null, 'tmdb_vote_count' => null]);
        $body = ['data' => [$movie], 'meta' => ['requested_count' => 1, 'returned_count' => 1, 'missing_tmdb_ids' => []]];
        Http::fake(['*' => Http::response($body)]);
        $this->assertSame($body, $this->client()->summaries([1]));
    }

    public static function invalidIds(): array
    {
        return [[['movie' => 1]], [[1 => 1]], [['1']], [[1.0]], [[true]], [[null]], [[[1]]], [[0]], [[-1]],
            [[2147483648]], [range(1, 51)], [array_fill(0, 51, 1)]];
    }

    #[DataProvider('invalidIds')]
    public function test_invalid_local_input_is_rejected_before_http(array $ids): void
    {
        Http::fake();
        try {
            $this->client()->summaries($ids);
            $this->fail('Expected invalid local input to be rejected.');
        } catch (InvalidArgumentException) {
            Http::assertNothingSent();
        }
    }

    public static function failures(): array
    {
        return [[301], [401], [403], [404], [422], [429], [500], [503]];
    }

    private function assertSafeFailure(): void
    {
        try {
            $this->client()->summaries([1, 2]);
            $this->fail('Expected safe CatalogFailure.');
        } catch (CatalogFailure $failure) {
            $this->assertSame(503, $failure->render()->getStatusCode());
            $this->assertSame(['message' => 'Movie service unavailable', 'code' => 'UPSTREAM_UNAVAILABLE'], $failure->render()->getData(true));
            $this->assertSame('Movie catalog request failed', $failure->getMessage());
            $this->assertNull($failure->getPrevious());
        }
    }

    #[DataProvider('failures')]
    public function test_upstream_errors_are_safe_and_not_retried(int $status): void
    {
        Http::fake(['*' => Http::response(['message' => 'secret', 'code' => 'MOVIE_NOT_FOUND',
            'errors' => ['tmdb_id' => ['secret'], 'tmdb_ids' => ['secret']]], $status)]);
        $this->assertSafeFailure();
        Http::assertSentCount(1);
    }

    public function test_connection_timeout_is_safe_and_not_retried(): void
    {
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;

            return Http::failedConnection('cURL error 28: secret service details');
        });
        $this->assertSafeFailure();
        $this->assertSame(1, $attempts);
    }

    public static function invalidConfiguration(): array
    {
        return [['movie_catalog.token', ''], ['movie_catalog.token', null],
            ['movie_catalog.url', 'not-a-url'], ['movie_catalog.url', 'file:///etc/passwd']];
    }

    #[DataProvider('invalidConfiguration')]
    public function test_invalid_configuration_is_safe_without_http(string $key, mixed $value): void
    {
        config([$key => $value]);
        Http::fake();
        $this->assertSafeFailure();
        Http::assertNothingSent();
    }

    public static function malformedResponses(): array
    {
        $valid = ['data' => [self::summary(1)], 'meta' => ['requested_count' => 2, 'returned_count' => 1, 'missing_tmdb_ids' => [2]]];
        $bodies = ['html' => '<html>secret</html>', 'scalar' => '"secret"', 'empty' => [],
            'data map' => array_replace($valid, ['data' => ['movie' => self::summary(1)]]),
            'non-array row' => array_replace($valid, ['data' => ['secret']]),
            'foreign movie' => array_replace($valid, ['data' => [self::summary(3)]]),
            'duplicate movies' => ['data' => [self::summary(1), self::summary(1)], 'meta' => ['requested_count' => 2, 'returned_count' => 2, 'missing_tmdb_ids' => []]],
            'duplicate missing' => ['data' => [], 'meta' => ['requested_count' => 2, 'returned_count' => 0, 'missing_tmdb_ids' => [1, 1]]],
            'scalar meta' => array_replace($valid, ['meta' => 'secret']),
            'missing fields' => array_replace($valid, ['data' => [['tmdb_id' => 1, 'title' => 'Incomplete']]]),
        ];
        foreach (['requested_count' => [1, '2', null], 'returned_count' => [0, '1', null],
            'missing_tmdb_ids' => [[], [1], [3], ['2'], [2.0], [null], [['id' => 2]], ['movie' => 2], null]] as $field => $values) {
            foreach ($values as $i => $value) {
                $bodies[$field.' '.$i] = array_replace($valid, ['meta' => array_replace($valid['meta'], [$field => $value])]);
            }
        }
        foreach (['tmdb_id' => '1', 'poster_path' => 'https://evil.test/image.jpg', 'release_date' => '2001-02-30',
            'tmdb_rating' => '8.4', 'tmdb_vote_count' => '100'] as $field => $value) {
            $bodies['invalid '.$field] = array_replace($valid, ['data' => [array_replace(self::summary(1), [$field => $value])]]);
        }

        return array_map(fn ($body) => [$body], $bodies);
    }

    #[DataProvider('malformedResponses')]
    public function test_malformed_or_inconsistent_response_is_rejected(array|string $body): void
    {
        Http::fake(['*' => Http::response(is_array($body) ? json_encode($body, JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR) : $body)]);
        $this->assertSafeFailure();
        Http::assertSentCount(1);
    }
}
