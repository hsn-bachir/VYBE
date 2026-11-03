<?php

namespace Tests\Feature;

use App\Models\Movie;
use App\Services\MovieService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MovieSummariesTest extends TestCase
{
    use RefreshDatabase;

    private const ENDPOINT = '/api/internal/v1/movies/summaries';

    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.internal_token' => 'test-internal', 'catalog.tmdb_token' => '']);
        Http::preventStrayRequests();
        Http::fake();
        $this->withHeader('X-VYBE-Service-Token', 'test-internal');
    }

    public function test_order_duplicates_partial_missing_and_existing_summary_serialization(): void
    {
        Movie::create(['tmdb_id' => 7, 'title' => 'Fixture seven', 'release_date' => '2001-02-03',
            'tmdb_rating' => 8.40, 'tmdb_vote_count' => 100, 'runtime' => 95, 'genres' => [],
            'metadata_fetched_at' => now()->subDays(30)]);
        Movie::create(['tmdb_id' => 3, 'title' => 'Summary-only fixture']);
        $before = Movie::orderBy('id')->get()->toArray();
        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->postJson(self::ENDPOINT, ['tmdb_ids' => [3, 8, 7, 3, 9, 8]])->assertOk()->assertExactJson([
            'data' => [
                ['tmdb_id' => 3, 'title' => 'Summary-only fixture', 'poster_path' => null, 'backdrop_path' => null,
                    'overview' => null, 'release_date' => null, 'tmdb_rating' => null, 'tmdb_vote_count' => null],
                ['tmdb_id' => 7, 'title' => 'Fixture seven', 'poster_path' => null, 'backdrop_path' => null,
                    'overview' => null, 'release_date' => '2001-02-03', 'tmdb_rating' => 8.4, 'tmdb_vote_count' => 100],
            ],
            'meta' => ['requested_count' => 4, 'returned_count' => 2, 'missing_tmdb_ids' => [8, 9]],
        ]);

        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertCount(1, $queries);
        $this->assertStringContainsString('select', strtolower($queries[0]['query']));
        $this->assertSame($before, Movie::orderBy('id')->get()->toArray());
        Http::assertNothingSent();
    }

    public function test_single_and_all_missing_results_are_successful(): void
    {
        Movie::create(['tmdb_id' => 1, 'title' => 'Fixture']);
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => [1]])->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('meta', ['requested_count' => 1, 'returned_count' => 1, 'missing_tmdb_ids' => []]);
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => [8, 7, 8]])->assertOk()->assertExactJson([
            'data' => [], 'meta' => ['requested_count' => 2, 'returned_count' => 0, 'missing_tmdb_ids' => [8, 7]],
        ]);
        Http::assertNothingSent();
    }

    public function test_maximum_batch_is_one_query_and_preserves_requested_order(): void
    {
        foreach (range(1, 50) as $id) {
            Movie::create(['tmdb_id' => $id, 'title' => 'Fixture '.$id]);
        }
        DB::enableQueryLog();
        DB::flushQueryLog();
        $response = $this->postJson(self::ENDPOINT, ['tmdb_ids' => range(50, 1)])->assertOk()
            ->assertJsonPath('meta.requested_count', 50)->assertJsonPath('meta.returned_count', 50);
        $this->assertCount(1, DB::getQueryLog());
        DB::disableQueryLog();
        $this->assertSame(range(50, 1), array_column($response->json('data'), 'tmdb_id'));
        Http::assertNothingSent();
    }

    public static function invalidBodies(): array
    {
        return [
            'missing' => [[]], 'empty' => [['tmdb_ids' => []]], 'null' => [['tmdb_ids' => null]],
            'scalar' => [['tmdb_ids' => 1]], 'string' => [['tmdb_ids' => '1,2']],
            'map' => [['tmdb_ids' => ['movie' => 1]]], 'string id' => [['tmdb_ids' => ['1']]],
            'float' => [['tmdb_ids' => [1.5]]], 'boolean' => [['tmdb_ids' => [true]]],
            'null id' => [['tmdb_ids' => [null]]], 'nested' => [['tmdb_ids' => [[1]]]],
            'zero' => [['tmdb_ids' => [0]]], 'negative' => [['tmdb_ids' => [-1]]],
            'too large id' => [['tmdb_ids' => [2147483648]]], 'oversized' => [['tmdb_ids' => range(1, 51)]],
            'oversized duplicates' => [['tmdb_ids' => array_fill(0, 51, 1)]],
        ];
    }

    #[DataProvider('invalidBodies')]
    public function test_invalid_batches_return_standard_validation_errors_without_lookup(array $body): void
    {
        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->postJson(self::ENDPOINT, $body)->assertUnprocessable()->assertJsonStructure(['message', 'errors']);
        $this->assertCount(0, DB::getQueryLog());
        DB::disableQueryLog();
        Http::assertNothingSent();
    }

    public function test_internal_authentication_is_enforced_before_validation(): void
    {
        $this->withoutHeader('X-VYBE-Service-Token')->postJson(self::ENDPOINT, [])->assertForbidden()
            ->assertExactJson(['message' => 'Forbidden.', 'code' => 'FORBIDDEN']);
        $this->withHeader('X-VYBE-Service-Token', 'wrong')->postJson(self::ENDPOINT, ['tmdb_ids' => [1]])->assertForbidden();
        config(['catalog.internal_token' => '']);
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => [1]])->assertStatus(503)->assertJsonPath('code', 'SERVICE_MISCONFIGURED');
        Http::assertNothingSent();
    }

    public function test_json_object_with_numeric_keys_and_integer_valued_float_are_rejected(): void
    {
        foreach (['{"tmdb_ids":{"0":1}}', '{"tmdb_ids":[1.0]}'] as $body) {
            $this->call('POST', self::ENDPOINT, [], [], [], [
                'CONTENT_TYPE' => 'application/json', 'HTTP_X_VYBE_SERVICE_TOKEN' => 'test-internal',
            ], $body)
                ->assertUnprocessable()->assertJsonStructure(['message', 'errors']);
        }
        Http::assertNothingSent();
    }

    public function test_maximum_identifier_is_valid_and_reported_missing_without_hydration(): void
    {
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => [2147483647]])->assertOk()->assertExactJson([
            'data' => [], 'meta' => ['requested_count' => 1, 'returned_count' => 0, 'missing_tmdb_ids' => [2147483647]],
        ]);
        Http::assertNothingSent();
    }

    public function test_database_failure_is_sanitized_even_with_debug_enabled(): void
    {
        config(['app.debug' => true]);
        $this->mock(MovieService::class, function ($mock): void {
            $mock->shouldReceive('summaries')->once()->andThrow(new \RuntimeException('sensitive-database-details'));
        });
        $this->postJson(self::ENDPOINT, ['tmdb_ids' => [1]])->assertStatus(500)->assertExactJson([
            'message' => 'Internal server error', 'code' => 'INTERNAL_ERROR',
        ]);
    }
}
