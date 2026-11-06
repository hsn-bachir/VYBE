<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class LibraryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
        Http::preventStrayRequests();
    }

    private function signedIn(): User
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'web');

        return $user;
    }

    private function fakeCatalog(array $missing = []): void
    {
        Http::fake(function ($request) use ($missing) {
            $ids = $request['tmdb_ids'];
            $data = array_map(fn ($id) => ['tmdb_id' => $id, 'title' => 'Fixture '.$id, 'poster_path' => null,
                'backdrop_path' => null, 'overview' => null, 'release_date' => null, 'tmdb_rating' => null, 'tmdb_vote_count' => null],
                array_values(array_diff($ids, $missing)));

            return Http::response(['data' => array_reverse($data), 'meta' => ['requested_count' => count($ids),
                'returned_count' => count($data), 'missing_tmdb_ids' => array_values(array_intersect($ids, $missing))]]);
        });
    }

    public static function libraries(): array
    {
        return [['watchlist', 'watchlist_entries'], ['watched', 'watched_movies']];
    }

    public function test_delete_preflight_is_allowed_only_for_the_configured_frontend(): void
    {
        config(['cors.allowed_origins' => ['http://localhost:5173']]);
        $response = $this->withHeaders(['Origin' => 'http://localhost:5173', 'Access-Control-Request-Method' => 'DELETE',
            'Access-Control-Request-Headers' => 'X-XSRF-TOKEN'])->options('/api/v1/me/watchlist/550')->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        $this->assertStringContainsString('DELETE', $response->headers->get('Access-Control-Allow-Methods'));
        Http::assertNothingSent();
    }

    public function test_private_errors_are_json_even_without_accept_header(): void
    {
        $this->get('/api/v1/me/watchlist')->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
        $this->actingAs(User::factory()->unverified()->create(), 'web');
        $this->get('/api/v1/me/watchlist')->assertForbidden()->assertHeader('Cache-Control', 'no-store, private');
        Http::assertNothingSent();
    }

    #[DataProvider('libraries')]
    public function test_add_duplicate_delete_and_repeated_delete_are_owner_scoped(string $kind, string $table): void
    {
        $user = $this->signedIn();
        $this->fakeCatalog();
        $url = '/api/v1/me/'.$kind;
        $first = $this->postJson($url, ['tmdb_id' => 550])->assertCreated()->assertJsonPath('data.tmdb_id', 550)
            ->assertJsonMissingPath('data.user_id')->assertHeader('Cache-Control', 'no-store, private')->json();
        $before = DB::table($table)->first();
        $this->travel(1)->days();
        $this->postJson($url, ['tmdb_id' => 550])->assertOk()->assertExactJson($first);
        $this->assertEquals($before, DB::table($table)->first());
        Http::assertSentCount(1);
        $other = User::factory()->create();
        $this->app['auth']->forgetGuards();
        $this->actingAs($other, 'web')->deleteJson($url.'/550')->assertNoContent();
        $this->assertDatabaseHas($table, ['user_id' => $user->id, 'tmdb_id' => 550]);
        $this->app['auth']->forgetGuards();
        $this->actingAs($user, 'web')->deleteJson($url.'/550')->assertNoContent();
        $this->deleteJson($url.'/550')->assertNoContent();
        $this->assertDatabaseCount($table, 0);
        Http::assertSentCount(1);
    }

    public function test_watched_and_watchlist_are_independent_and_readding_has_new_timestamp(): void
    {
        $this->signedIn();
        $this->fakeCatalog();
        $this->freezeTime();
        $this->postJson('/api/v1/me/watchlist', ['tmdb_id' => 1])->assertCreated();
        $stamp = $this->postJson('/api/v1/me/watched', ['tmdb_id' => 1])->assertCreated()->json('data.watched_at');
        $this->getJson('/api/v1/me/movies/1/library-state')->assertExactJson(['data' => ['tmdb_id' => 1, 'in_watchlist' => true, 'watched_at' => $stamp]]);
        $this->deleteJson('/api/v1/me/watched/1')->assertNoContent();
        $this->getJson('/api/v1/me/movies/1/library-state')->assertJsonPath('data.in_watchlist', true)->assertJsonPath('data.watched_at', null);
        $this->travel(60)->seconds();
        $new = $this->postJson('/api/v1/me/watched', ['tmdb_id' => 1])->assertCreated()->json('data.watched_at');
        $this->assertNotSame($stamp, $new);
        Http::assertSentCount(3);
    }

    #[DataProvider('libraries')]
    public function test_guest_and_unverified_access_is_denied(string $kind, string $table): void
    {
        Http::fake();
        $this->getJson('/api/v1/me/'.$kind)->assertUnauthorized();
        $this->postJson('/api/v1/me/'.$kind, ['tmdb_id' => 1])->assertUnauthorized();
        $this->deleteJson('/api/v1/me/'.$kind.'/1')->assertUnauthorized();
        $this->getJson('/api/v1/me/movies/1/library-state')->assertUnauthorized();
        $this->actingAs(User::factory()->unverified()->create(), 'web');
        $this->getJson('/api/v1/me/'.$kind)->assertForbidden();
        $this->postJson('/api/v1/me/'.$kind, ['tmdb_id' => 1])->assertForbidden();
        $this->deleteJson('/api/v1/me/'.$kind.'/1')->assertForbidden();
        $this->getJson('/api/v1/me/movies/1/library-state')->assertForbidden();
        Http::assertNothingSent();
    }

    public static function invalidBodies(): array
    {
        return [[[]], [['tmdb_id' => '1']], [['tmdb_id' => 0]], [['tmdb_id' => -1]], [['tmdb_id' => 1.5]],
            [['tmdb_id' => true]], [['tmdb_id' => [1]]], [['tmdb_id' => 2147483648]],
            [['tmdb_id' => 1, 'user_id' => 99]], [['tmdb_id' => 1, 'watched_at' => '2000-01-01']]];
    }

    #[DataProvider('invalidBodies')]
    public function test_invalid_or_unapproved_fields_never_reach_catalog(array $body): void
    {
        $this->signedIn();
        Http::fake();
        $this->postJson('/api/v1/me/watchlist', $body)->assertUnprocessable();
        $this->postJson('/api/v1/me/watched', $body)->assertUnprocessable();
        Http::assertNothingSent();
        $this->assertDatabaseCount('watchlist_entries', 0);
        $this->assertDatabaseCount('watched_movies', 0);
    }

    public function test_unresolved_reference_is_validation_not_a_claimed_tmdb_404(): void
    {
        $this->signedIn();
        $this->fakeCatalog([999]);
        $this->postJson('/api/v1/me/watchlist', ['tmdb_id' => 999])->assertUnprocessable()->assertJsonValidationErrors('tmdb_id');
        $this->assertDatabaseCount('watchlist_entries', 0);
        Http::assertSentCount(1);
    }

    public function test_outage_blocks_only_new_adds_not_duplicates_state_or_removal(): void
    {
        $user = $this->signedIn();
        $user->watchlistEntries()->create(['tmdb_id' => 1]);
        $user->watchedMovies()->create(['tmdb_id' => 1, 'watched_at' => now()]);
        Http::fake(['*' => Http::failedConnection('private detail')]);
        foreach (['watchlist', 'watched'] as $kind) {
            $this->postJson('/api/v1/me/'.$kind, ['tmdb_id' => 1])->assertOk();
            $this->postJson('/api/v1/me/'.$kind, ['tmdb_id' => 2])->assertStatus(503)->assertJsonPath('code', 'UPSTREAM_UNAVAILABLE');
            $this->deleteJson('/api/v1/me/'.$kind.'/1')->assertNoContent();
        }
        $this->getJson('/api/v1/me/movies/1/library-state')->assertOk()->assertJsonPath('data.in_watchlist', false);
        $this->assertDatabaseCount('watchlist_entries', 0);
        $this->assertDatabaseCount('watched_movies', 0);
    }

    #[DataProvider('libraries')]
    public function test_pagination_order_owner_isolation_partial_missing_and_empty_pages(string $kind, string $table): void
    {
        $user = $this->signedIn();
        $relation = $kind === 'watched' ? 'watchedMovies' : 'watchlistEntries';
        foreach ([1, 2, 3] as $id) {
            $values = ['tmdb_id' => $id, 'created_at' => now()->subDays(1)];
            if ($kind === 'watched') {
                $values['watched_at'] = now()->subDays(1);
            }
            $user->$relation()->create($values);
        }
        $other = User::factory()->create();
        $other->$relation()->create(['tmdb_id' => 4] + ($kind === 'watched' ? ['watched_at' => now()] : []));
        $this->fakeCatalog([2]);
        DB::enableQueryLog();
        DB::flushQueryLog();
        $response = $this->getJson('/api/v1/me/'.$kind.'?per_page=2')->assertOk()
            ->assertJsonPath('meta.total_results', 3)->assertJsonPath('meta.total_pages', 2)->assertJsonPath('meta.metadata_unavailable', false)
            ->assertJsonPath('data.0.tmdb_id', 3)->assertJsonPath('data.0.movie.tmdb_id', 3)
            ->assertJsonPath('data.1.metadata_status', 'missing')->assertJsonPath('data.1.movie', null);
        $queries = array_filter(DB::getQueryLog(), fn ($q) => str_contains($q['query'], $kind === 'watched' ? 'watched_movies' : 'watchlist_entries'));
        DB::disableQueryLog();
        $this->assertCount(2, $queries);
        $this->assertCount(2, $response->json('data'));
        Http::assertSentCount(1);
        $this->getJson('/api/v1/me/'.$kind.'?page=3&per_page=2')->assertJsonPath('data', [])->assertJsonPath('meta.total_results', 3);
        Http::assertSentCount(1);
        $this->getJson('/api/v1/me/'.$kind.'?page=2&per_page=2')->assertJsonPath('data.0.tmdb_id', 1);
        Http::assertSentCount(2);
    }

    public function test_all_missing_and_outage_keep_relationships_and_totals(): void
    {
        $user = $this->signedIn();
        $user->watchlistEntries()->create(['tmdb_id' => 1]);
        Http::fakeSequence()->push(['data' => [], 'meta' => ['requested_count' => 1, 'returned_count' => 0, 'missing_tmdb_ids' => [1]]])->pushStatus(503);
        $this->getJson('/api/v1/me/watchlist')->assertJsonPath('data.0.metadata_status', 'missing')->assertJsonPath('meta.metadata_unavailable', false);
        $this->getJson('/api/v1/me/watchlist')->assertOk()->assertJsonPath('data.0.tmdb_id', 1)->assertJsonPath('data.0.metadata_status', 'unavailable')
            ->assertJsonPath('data.0.movie', null)->assertJsonPath('meta.total_results', 1)->assertJsonPath('meta.metadata_unavailable', true);
    }

    public function test_empty_list_and_state_do_not_request_catalog_and_pagination_is_bounded(): void
    {
        $this->signedIn();
        Http::fake();
        $this->getJson('/api/v1/me/watchlist')->assertJsonPath('meta.total_pages', 0)->assertJsonPath('meta.per_page', 20);
        $this->getJson('/api/v1/me/movies/1/library-state')->assertExactJson(['data' => ['tmdb_id' => 1, 'in_watchlist' => false, 'watched_at' => null]]);
        foreach (['per_page=51', 'per_page=0', 'page=0', 'page=10001', 'page[]=1'] as $query) {
            $this->getJson('/api/v1/me/watchlist?'.$query)->assertUnprocessable();
        }
        foreach (['01', '0', '-1', 'no', '2147483648'] as $id) {
            $this->getJson('/api/v1/me/movies/'.$id.'/library-state')->assertUnprocessable();
            $this->deleteJson('/api/v1/me/watched/'.$id)->assertUnprocessable();
        }
        Http::assertNothingSent();
    }

    #[DataProvider('libraries')]
    public function test_database_unique_constraint_is_final_authority(string $kind, string $table): void
    {
        $user = $this->signedIn();
        $relation = $kind === 'watched' ? 'watchedMovies' : 'watchlistEntries';
        $values = ['tmdb_id' => 1] + ($kind === 'watched' ? ['watched_at' => now()] : []);
        $user->$relation()->create($values);
        $this->expectException(UniqueConstraintViolationException::class);
        $user->$relation()->create($values);
    }

    #[DataProvider('libraries')]
    public function test_foreign_key_rejects_missing_user(string $kind, string $table): void
    {
        $this->expectException(QueryException::class);
        DB::table($table)->insert(['user_id' => 999, 'tmdb_id' => 1] + ($kind === 'watched' ? ['watched_at' => now()] : []));
    }

    public function test_user_deletion_cascades_both_lists(): void
    {
        $user = $this->signedIn();
        $user->watchlistEntries()->create(['tmdb_id' => 1]);
        $user->watchedMovies()->create(['tmdb_id' => 1, 'watched_at' => now()]);
        $user->delete();
        $this->assertDatabaseCount('watchlist_entries', 0);
        $this->assertDatabaseCount('watched_movies', 0);
    }

    public function test_csrf_is_required_even_without_origin_and_valid_token_allows_writes(): void
    {
        $this->signedIn();
        $this->fakeCatalog();
        $this->app->instance('env', 'local');
        $this->postJson('/api/v1/me/watchlist', ['tmdb_id' => 1])->assertStatus(419);
        $this->deleteJson('/api/v1/me/watched/1')->assertStatus(419);
        $bootstrap = $this->getJson('/sanctum/csrf-cookie');
        $this->withHeader('X-XSRF-TOKEN', $bootstrap->getCookie('XSRF-TOKEN', false)->getValue())
            ->postJson('/api/v1/me/watchlist', ['tmdb_id' => 1])->assertCreated();
    }

    public function test_write_throttle_is_shared_between_library_operations(): void
    {
        $this->signedIn();
        Http::fake();
        for ($i = 0; $i < 60; $i++) {
            $this->deleteJson('/api/v1/me/watchlist/1')->assertNoContent();
        }
        $this->deleteJson('/api/v1/me/watched/1')->assertTooManyRequests()->assertHeader('Retry-After');
        Http::assertNothingSent();
    }
}
