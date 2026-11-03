<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\RatingService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RatingsTest extends TestCase
{
    use RefreshDatabase;

    private const OWN = '/api/v1/me/ratings/550';

    private const PUBLIC = '/api/v1/movies/550/ratings';

    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
        Http::preventStrayRequests();
    }

    private function signIn(): User
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        return $user;
    }

    private function catalog(bool $missing = false): void
    {
        Http::fake(fn () => Http::response(['data' => $missing ? [] : [['tmdb_id' => 550, 'title' => 'Fixture',
            'poster_path' => null, 'backdrop_path' => null, 'overview' => null, 'release_date' => null, 'tmdb_rating' => 8.4, 'tmdb_vote_count' => 100]],
            'meta' => ['requested_count' => 1, 'returned_count' => $missing ? 0 : 1, 'missing_tmdb_ids' => $missing ? [550] : []]]));
    }

    public static function methods(): array
    {
        return [['GET', []], ['PUT', ['rating' => 5]], ['DELETE', []]];
    }

    #[DataProvider('methods')]
    public function test_private_routes_require_verified_session(string $method, array $body): void
    {
        $this->json($method, self::OWN, $body)->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
        $this->actingAs(User::factory()->unverified()->create(), 'web');
        $this->json($method, self::OWN, $body)->assertForbidden()->assertJsonPath('message', 'Your email address is not verified.');
        $this->getJson(self::PUBLIC)->assertOk();
        Http::assertNothingSent();
    }

    public function test_guest_statistics_are_core_only_empty_and_have_all_buckets(): void
    {
        $this->get(self::PUBLIC)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertExactJson(['data' => [
            'tmdb_id' => 550, 'average_rating' => null, 'total_ratings' => 0, 'distribution' => ['1' => 0, '2' => 0, '3' => 0, '4' => 0, '5' => 0],
        ]]);
        $this->getJson('/api/v1/movies/2147483647/ratings')->assertOk();
        Http::assertNothingSent();
    }

    public function test_put_replaces_one_row_preserves_creation_and_statistics_update_after_delete(): void
    {
        $user = $this->signIn();
        $this->catalog();
        $this->getJson(self::OWN)->assertExactJson(['data' => null]);
        $first = $this->putJson(self::OWN, ['rating' => 3])->assertOk()->assertJsonPath('data.rating', 3)
            ->assertJsonStructure(['data' => ['tmdb_id', 'rating', 'updated_at']])->assertJsonMissingPath('data.user_id');
        $row = $user->movieRatings()->first();
        $created = $row->created_at->toISOString();
        Http::assertSentCount(1);
        $this->travel(5)->seconds();
        $this->putJson(self::OWN, ['rating' => 5])->assertOk()->assertJsonPath('data.rating', 5);
        $this->putJson(self::OWN, ['rating' => 5])->assertOk();
        $this->assertDatabaseCount('movie_ratings', 1);
        $this->assertSame($row->id, $user->movieRatings()->first()->id);
        $this->assertSame($created, $row->fresh()->created_at->toISOString());
        $this->assertNotSame($first->json('data.updated_at'), $row->fresh()->updated_at->toISOString());
        $this->getJson(self::PUBLIC)->assertJsonPath('data.average_rating', 5)->assertJsonPath('data.distribution.5', 1);
        $this->deleteJson(self::OWN)->assertNoContent();
        $this->deleteJson(self::OWN)->assertNoContent();
        $this->getJson(self::PUBLIC)->assertJsonPath('data.average_rating', null)->assertJsonPath('data.total_ratings', 0);
        Http::assertSentCount(1);
    }

    public function test_owner_isolation_and_library_independence(): void
    {
        $a = $this->signIn();
        $a->movieRatings()->create(['tmdb_id' => 550, 'rating' => 5]);
        $a->watchlistEntries()->create(['tmdb_id' => 550]);
        $a->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);
        $c = $a->collections()->create(['name' => 'Films']);
        $c->movies()->create(['tmdb_id' => 550]);
        $b = User::factory()->create();
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($b, 'web');
        $this->getJson(self::OWN)->assertExactJson(['data' => null]);
        $this->deleteJson(self::OWN)->assertNoContent();
        $this->assertSame(5, $a->movieRatings()->first()->rating);
        $this->catalog();
        $this->putJson(self::OWN, ['rating' => 1])->assertOk();
        $this->getJson(self::PUBLIC)->assertJsonPath('data.average_rating', 3)->assertJsonPath('data.total_ratings', 2);
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($a, 'web');
        $this->deleteJson(self::OWN)->assertNoContent();
        $this->assertDatabaseCount('watchlist_entries', 1);
        $this->assertDatabaseCount('watched_movies', 1);
        $this->assertDatabaseCount('collection_movies', 1);
        $this->assertSame(1, $b->movieRatings()->first()->rating);
    }

    public function test_aggregation_uses_one_grouped_query_and_consistent_rounding(): void
    {
        foreach ([1, 4, 5] as $rating) {
            User::factory()->create()->movieRatings()->create(['tmdb_id' => 550, 'rating' => $rating]);
        }
        User::factory()->create()->movieRatings()->create(['tmdb_id' => 551, 'rating' => 2]);
        DB::enableQueryLog();
        DB::flushQueryLog();
        $stats = app(RatingService::class)->statistics(550);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertCount(1, $queries);
        $this->assertStringContainsString('group by', strtolower($queries[0]['query']));
        $this->assertSame(3.33, $stats['average_rating']);
        $this->assertSame(3, $stats['total_ratings']);
        $this->assertEquals((object) [1 => 1, 2 => 0, 3 => 0, 4 => 1, 5 => 1], $stats['distribution']);
        Http::assertNothingSent();
    }

    public static function invalidBodies(): array
    {
        return array_map(fn ($value) => [['rating' => $value]], [0, 6, -1, 4.5, '5', true, false, null, [], ['value' => 5]]);
    }

    #[DataProvider('invalidBodies')]
    public function test_strict_json_rating_validation(array $body): void
    {
        $this->signIn();
        $this->putJson(self::OWN, $body)->assertUnprocessable()->assertJsonValidationErrors('rating');
        $this->assertDatabaseCount('movie_ratings', 0);
        Http::assertNothingSent();
    }

    public function test_empty_float_form_and_mass_assignment_are_rejected(): void
    {
        $this->signIn();
        $this->putJson(self::OWN, [])->assertUnprocessable();
        $this->call('PUT', self::OWN, [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], '{"rating":5.0}')->assertUnprocessable();
        $this->put(self::OWN, ['rating' => 5])->assertUnprocessable();
        foreach (['user_id', 'tmdb_id', 'average_rating', 'total_ratings', 'created_at', 'updated_at', 'tmdb_rating'] as $field) {
            $this->putJson(self::OWN, ['rating' => 5, $field => 1])->assertUnprocessable();
        }
        $this->putJson(self::OWN.'?rating=5', ['rating' => 5])->assertUnprocessable();
        $this->deleteJson(self::OWN, ['user_id' => 1])->assertUnprocessable();
        $this->getJson(self::PUBLIC.'?user_id=1')->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_all_routes_validate_canonical_ids(): void
    {
        $this->signIn();
        foreach (['0', '01', '-1', '+1', '1.0', 'abc', '2147483648'] as $id) {
            foreach (['GET', 'PUT', 'DELETE'] as $method) {
                $this->json($method, '/api/v1/me/ratings/'.$id, ['rating' => 5])->assertUnprocessable();
            }
            $this->getJson('/api/v1/movies/'.$id.'/ratings')->assertUnprocessable();
        }
        Http::assertNothingSent();
    }

    public function test_catalog_miss_is_unresolved_not_not_found_and_outage_does_not_block_existing_operations(): void
    {
        $user = $this->signIn();
        $this->catalog(true);
        $this->putJson(self::OWN, ['rating' => 5])->assertUnprocessable()->assertJsonValidationErrors('tmdb_id');
        Http::assertSentCount(1);
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(fn () => Http::response(['secret' => 'never expose'], 500));
        $this->putJson(self::OWN, ['rating' => 5])->assertStatus(503)->assertJsonPath('code', 'UPSTREAM_UNAVAILABLE');
        $user->movieRatings()->create(['tmdb_id' => 550, 'rating' => 3]);
        $this->getJson(self::OWN)->assertJsonPath('data.rating', 3);
        $this->putJson(self::OWN, ['rating' => 4])->assertOk();
        $this->getJson(self::PUBLIC)->assertJsonPath('data.average_rating', 4);
        $this->deleteJson(self::OWN)->assertNoContent();
        Http::assertSentCount(1);
    }

    public function test_database_uniqueness_indexes_cascades_and_range_checks(): void
    {
        $user = $this->signIn();
        $user->movieRatings()->create(['tmdb_id' => 550, 'rating' => 5]);
        $this->assertSame($user->id, $user->movieRatings()->first()->user->id);
        $indexes = Schema::getIndexes('movie_ratings');
        $this->assertTrue(collect($indexes)->contains(fn ($index) => $index['unique'] && $index['columns'] === ['user_id', 'tmdb_id']));
        $this->assertTrue(collect($indexes)->contains(fn ($index) => $index['columns'] === ['tmdb_id', 'rating']));
        foreach ([['tmdb_id' => 550, 'rating' => 3], ['tmdb_id' => 551, 'rating' => 0], ['tmdb_id' => 552, 'rating' => 6]] as $data) {
            try {
                DB::transaction(fn () => DB::table('movie_ratings')->insert(['user_id' => $user->id] + $data));
                $this->fail('A database constraint was not enforced.');
            } catch (QueryException) {
                $this->assertTrue(true);
            }
        }
        $user->delete();
        $this->assertDatabaseCount('movie_ratings', 0);
    }

    public function test_csrf_put_cors_and_sanitized_failures(): void
    {
        $this->signIn()->movieRatings()->create(['tmdb_id' => 550, 'rating' => 2]);
        $this->app->instance('env', 'local');
        $this->putJson(self::OWN, ['rating' => 4])->assertStatus(419)->assertExactJson(['message' => 'CSRF token mismatch.']);
        $this->deleteJson(self::OWN)->assertStatus(419);
        $bootstrap = $this->getJson('/sanctum/csrf-cookie');
        $this->withHeader('X-XSRF-TOKEN', $bootstrap->getCookie('XSRF-TOKEN', false)->getValue())->putJson(self::OWN, ['rating' => 4])->assertOk();
        $preflight = $this->withHeaders(['Origin' => 'http://localhost:5173', 'Access-Control-Request-Method' => 'PUT'])->options(self::OWN)->assertNoContent();
        $this->assertStringContainsString('PUT', $preflight->headers->get('Access-Control-Allow-Methods'));
        $this->mock(RatingService::class)->shouldReceive('statistics')->andThrow(new \RuntimeException('SQL secret'));
        $this->getJson(self::PUBLIC)->assertStatus(500)->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
        Http::assertNothingSent();
    }

    public function test_public_and_private_limits_are_bounded_and_writes_share_library_limit(): void
    {
        for ($i = 0; $i < 120; $i++) {
            $this->getJson(self::PUBLIC)->assertOk();
        }
        $this->getJson(self::PUBLIC)->assertTooManyRequests()->assertHeader('Retry-After')->assertExactJson(['message' => 'Too many requests.']);
        $this->signIn();
        for ($i = 0; $i < 60; $i++) {
            $this->deleteJson('/api/v1/me/watchlist/550')->assertNoContent();
        }
        $this->deleteJson(self::OWN)->assertTooManyRequests()->assertHeader('Cache-Control', 'no-store, private');
        for ($i = 0; $i < 120; $i++) {
            $this->getJson(self::OWN)->assertOk();
        }
        $this->getJson(self::OWN)->assertTooManyRequests();
    }
}
