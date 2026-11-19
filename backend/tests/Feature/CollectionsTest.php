<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CollectionsTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/me/collections';

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

    private function catalog(array $missing = []): void
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

    public static function endpoints(): array
    {
        return [['GET', '', []], ['POST', '', ['name' => 'A']], ['GET', '/1', []], ['PATCH', '/1', ['name' => 'B']],
            ['DELETE', '/1', []], ['GET', '/1/movies', []], ['POST', '/1/movies', ['tmdb_id' => 1]], ['DELETE', '/1/movies/1', []]];
    }

    #[DataProvider('endpoints')]
    public function test_all_endpoints_require_auth_and_verification(string $method, string $suffix, array $body): void
    {
        $this->json($method, self::URL.$suffix, $body)->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
        $this->actingAs(User::factory()->unverified()->create(), 'web');
        $this->json($method, self::URL.$suffix, $body)->assertForbidden()->assertHeader('Cache-Control', 'no-store, private');
        Http::assertNothingSent();
    }

    public function test_crud_preserves_case_allows_custom_duplicates_and_reserves_favorites(): void
    {
        $user = $this->signIn();
        $favorite = $user->collections()->where('system_key', 'favorites')->sole();
        $this->postJson(self::URL, ['name' => ' Favorites '])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->patchJson(self::URL.'/'.$favorite->id, ['name' => 'Other'])->assertForbidden();
        $this->deleteJson(self::URL.'/'.$favorite->id)->assertForbidden();
        $ids = [];
        foreach (['Sci-Fi', 'sci-fi', 'SCI-FI', 'Sci-Fi', 'Sci-Fi Favorites'] as $name) {
            $ids[] = $this->postJson(self::URL, ['name' => '  '.$name.'  ', 'description' => '  Notes  '])
                ->assertCreated()->assertJsonPath('data.name', $name)->assertJsonPath('data.description', 'Notes')
                ->assertJsonPath('data.movie_count', 0)->assertJsonMissingPath('data.user_id')->json('data.id');
        }
        $this->assertCount(5, array_unique($ids));
        $this->getJson(self::URL.'/'.$ids[0])->assertOk()->assertJsonPath('data.name', 'Sci-Fi');
        $this->patchJson(self::URL.'/'.$ids[0], ['name' => 'Weekend', 'description' => null])->assertOk()
            ->assertJsonPath('data.name', 'Weekend')->assertJsonPath('data.description', null);
        $this->patchJson(self::URL.'/'.$ids[0], ['description' => '  '])->assertOk()->assertJsonPath('data.description', null);
        $this->patchJson(self::URL.'/'.$ids[0], [])->assertUnprocessable();
        $this->deleteJson(self::URL.'/'.$ids[0])->assertNoContent();
        $this->deleteJson(self::URL.'/'.$ids[0])->assertNotFound()->assertJsonPath('message', 'Not found.');
        $indexes = Schema::getIndexes('collections');
        foreach ($indexes as $index) {
            $this->assertFalse($index['unique'] && in_array('name', $index['columns']), 'Names must not have a unique index.');
        }
        Http::assertNothingSent();
    }

    public static function invalidCollections(): array
    {
        return [[['name' => '']], [['name' => '   ']], [['name' => null]], [['name' => []]], [['name' => str_repeat('a', 101)]],
            [['name' => 'A', 'description' => str_repeat('x', 2001)]], [['name' => 'A', 'description' => false]],
            ...array_map(fn ($key) => [['name' => 'A', $key => 1]], ['user_id', 'collection_id', 'id', 'created_at', 'updated_at', 'privacy', 'is_public'])];
    }

    #[DataProvider('invalidCollections')]
    public function test_validation_rejects_invalid_and_unsupported_fields(array $body): void
    {
        $c = $this->signIn()->collections()->create(['name' => 'Original']);
        $this->postJson(self::URL, $body)->assertUnprocessable();
        $this->patchJson(self::URL.'/'.$c->id, $body)->assertUnprocessable();
        $this->assertSame('Original', $c->fresh()->name);
        Http::assertNothingSent();
    }

    public function test_owned_and_nonexistent_objects_have_identical_not_found_responses(): void
    {
        $c = User::factory()->create()->collections()->create(['name' => 'Private']);
        $this->signIn();
        foreach ([['GET', '', []], ['PATCH', '', ['name' => 'Attack']], ['DELETE', '', []], ['GET', '/movies', []],
            ['POST', '/movies', ['tmdb_id' => 1]], ['DELETE', '/movies/1', []]] as [$method, $suffix, $body]) {
            $hidden = $this->json($method, self::URL.'/'.$c->id.$suffix, $body)->assertNotFound()->json();
            $this->json($method, self::URL.'/99999'.$suffix, $body)->assertNotFound()->assertExactJson($hidden);
        }
        $this->getJson(self::URL)->assertJsonCount(1, 'data')->assertJsonPath('data.0.system_key', 'favorites');
        Http::assertNothingSent();
    }

    public function test_memberships_are_independent_idempotent_and_cascade_only_inside_owner(): void
    {
        $user = $this->signIn();
        $a = $user->collections()->create(['name' => 'Same']);
        $b = $user->collections()->create(['name' => 'Same']);
        $user->watchlistEntries()->create(['tmdb_id' => 1]);
        $user->watchedMovies()->create(['tmdb_id' => 1, 'watched_at' => now()]);
        $this->catalog();
        $first = $this->postJson(self::URL.'/'.$a->id.'/movies', ['tmdb_id' => 1])->assertCreated()->json();
        $original = $a->movies()->first()->toArray();
        $this->travel(1)->days();
        $this->postJson(self::URL.'/'.$a->id.'/movies', ['tmdb_id' => 1])->assertOk()->assertExactJson($first);
        $this->assertEquals($original, $a->movies()->first()->toArray());
        $this->postJson(self::URL.'/'.$b->id.'/movies', ['tmdb_id' => 1])->assertCreated();
        Http::assertSentCount(2);
        $this->deleteJson(self::URL.'/'.$a->id.'/movies/1')->assertNoContent();
        $this->deleteJson(self::URL.'/'.$a->id.'/movies/1')->assertNoContent();
        $this->assertDatabaseHas('collection_movies', ['collection_id' => $b->id, 'tmdb_id' => 1]);
        $this->deleteJson(self::URL.'/'.$a->id)->assertNoContent();
        $this->assertDatabaseCount('collection_movies', 1);
        $this->deleteJson(self::URL.'/'.$b->id)->assertNoContent();
        $this->assertDatabaseCount('collection_movies', 0);
        $this->assertDatabaseCount('watchlist_entries', 1);
        $this->assertDatabaseCount('watched_movies', 1);
        $user->collections()->create(['name' => 'Cascade'])->movies()->create(['tmdb_id' => 1]);
        $user->delete();
        $this->assertDatabaseCount('collections', 0);
        $this->assertDatabaseCount('collection_movies', 0);
    }

    public function test_every_new_user_has_one_favorites_collection_with_independent_membership(): void
    {
        $user = $this->signIn();
        $favorite = $user->collections()->where('system_key', 'favorites')->sole();
        $custom = $user->collections()->create(['name' => 'Weekend']);
        $this->catalog();
        $this->postJson(self::URL.'/'.$favorite->id.'/movies', ['tmdb_id' => 550])->assertCreated();
        $this->postJson(self::URL.'/'.$custom->id.'/movies', ['tmdb_id' => 550])->assertCreated();
        $this->assertDatabaseHas('collection_movies', ['collection_id' => $favorite->id, 'tmdb_id' => 550]);
        $this->assertDatabaseHas('collection_movies', ['collection_id' => $custom->id, 'tmdb_id' => 550]);
        $this->deleteJson(self::URL.'/'.$favorite->id.'/movies/550')->assertNoContent();
        $this->assertDatabaseHas('collection_movies', ['collection_id' => $custom->id, 'tmdb_id' => 550]);
        $this->assertSame(1, $user->collections()->where('system_key', 'favorites')->count());
    }

    public function test_database_membership_unique_constraint_is_authoritative(): void
    {
        $c = $this->signIn()->collections()->create(['name' => 'Unique memberships']);
        $c->movies()->create(['tmdb_id' => 1]);
        $this->expectException(UniqueConstraintViolationException::class);
        $c->movies()->create(['tmdb_id' => 1]);
    }

    public function test_listing_uses_count_and_exists_without_n_plus_one_or_filtering(): void
    {
        $user = $this->signIn();
        for ($i = 0; $i < 23; $i++) {
            $c = $user->collections()->create(['name' => 'Duplicate']);
            if ($i === 22) {
                $c->movies()->create(['tmdb_id' => 550]);
            }
        }
        User::factory()->create()->collections()->create(['name' => 'Other']);
        $this->catalog();
        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->getJson(self::URL.'?contains_tmdb_id=550')->assertOk()->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.total_results', 24)->assertJsonPath('data.0.system_key', 'favorites')
            ->assertJsonPath('data.0.contains_movie', false)->assertJsonPath('data.1.contains_movie', true)
            ->assertJsonPath('data.1.movie_count', 1)->assertJsonPath('data.1.preview_movies.0.tmdb_id', 550);
        $queries = array_filter(DB::getQueryLog(), fn ($q) => str_contains($q['query'], 'collections') || str_contains($q['query'], 'collection_movies'));
        DB::disableQueryLog();
        $this->assertCount(3, $queries);
        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->getJson(self::URL.'?contains_tmdb_id=550&include_previews=0')->assertOk()
            ->assertJsonPath('data.1.contains_movie', true)->assertJsonPath('data.1.preview_movies', []);
        $membershipQueries = array_filter(DB::getQueryLog(), fn ($q) => str_contains($q['query'], 'collections') || str_contains($q['query'], 'collection_movies'));
        DB::disableQueryLog();
        $this->assertCount(2, $membershipQueries);
        Http::assertSentCount(1);
        $this->getJson(self::URL.'?page=2')->assertJsonCount(4, 'data')->assertJsonMissingPath('data.0.contains_movie');
        $this->getJson(self::URL.'?page=100')->assertJsonPath('data', [])->assertJsonPath('meta.total_results', 24);
        $this->getJson(self::URL.'?per_page=50')->assertJsonCount(24, 'data');
        Http::assertSentCount(2);
    }

    public function test_movie_pages_batch_once_preserve_missing_outage_order_counts_and_empty_pages(): void
    {
        $c = $this->signIn()->collections()->create(['name' => 'Films']);
        $url = self::URL.'/'.$c->id.'/movies';
        $this->getJson($url)->assertJsonPath('meta.total_pages', 0);
        Http::assertNothingSent();
        foreach ([1, 2, 3] as $id) {
            $c->movies()->create(['tmdb_id' => $id]);
        }
        $this->catalog([2]);
        $this->getJson($url.'?per_page=2')->assertJsonPath('meta.total_results', 3)->assertJsonPath('data.0.tmdb_id', 3)
            ->assertJsonPath('data.0.movie.tmdb_id', 3)->assertJsonPath('data.1.metadata_status', 'missing');
        Http::assertSentCount(1);
        $this->getJson($url.'?page=100')->assertJsonPath('data', [])->assertJsonPath('meta.total_results', 3);
        Http::assertSentCount(1);
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response([], 503)]);
        $this->getJson($url)->assertJsonPath('meta.metadata_unavailable', true)->assertJsonPath('meta.total_results', 3)
            ->assertJsonPath('data.0.metadata_status', 'unavailable')->assertJsonPath('data.0.movie', null);
        $this->postJson($url, ['tmdb_id' => 1])->assertOk();
        $this->postJson($url, ['tmdb_id' => 4])->assertStatus(503)->assertJsonPath('code', 'UPSTREAM_UNAVAILABLE');
        $this->deleteJson($url.'/1')->assertNoContent();
    }

    public function test_cache_miss_is_422_and_deletion_during_confirmation_is_safe_404(): void
    {
        $user = $this->signIn();
        $c = $user->collections()->create(['name' => 'Films']);
        $this->catalog([999]);
        $this->postJson(self::URL.'/'.$c->id.'/movies', ['tmdb_id' => 999])->assertUnprocessable()->assertJsonValidationErrors('tmdb_id');
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(function ($request) use ($c) {
            $c->delete();

            return Http::response(['data' => [['tmdb_id' => 1, 'title' => 'Fixture', 'poster_path' => null, 'backdrop_path' => null,
                'overview' => null, 'release_date' => null, 'tmdb_rating' => null, 'tmdb_vote_count' => null]],
                'meta' => ['requested_count' => 1, 'returned_count' => 1, 'missing_tmdb_ids' => []]]);
        });
        $this->postJson(self::URL.'/'.$c->id.'/movies', ['tmdb_id' => 1])->assertNotFound()->assertJsonPath('message', 'Not found.');
        $this->assertDatabaseCount('collection_movies', 0);
    }

    public function test_strict_ids_bounded_pagination_and_mass_assignment_on_memberships(): void
    {
        $c = $this->signIn()->collections()->create(['name' => 'Films']);
        $this->deleteJson(self::URL.'/'.$c->id, ['user_id' => 1])->assertUnprocessable();
        $this->deleteJson(self::URL.'/'.$c->id.'/movies/1', ['collection_id' => 1])->assertUnprocessable();
        foreach (['01', '0', '-1', 'no', '2147483648', '1.0'] as $id) {
            $this->getJson(self::URL.'/'.$id)->assertUnprocessable();
            $this->getJson(self::URL.'?contains_tmdb_id='.$id)->assertUnprocessable();
            $this->deleteJson(self::URL.'/'.$c->id.'/movies/'.$id)->assertUnprocessable();
        }
        foreach (['page=0', 'page=10001', 'page[]=1', 'per_page=0', 'per_page=51', 'contains_tmdb_id[]=1', 'include_previews=maybe'] as $query) {
            $this->getJson(self::URL.'?'.$query)->assertUnprocessable();
        }
        foreach (['page=0', 'per_page=51'] as $query) {
            $this->getJson(self::URL.'/'.$c->id.'/movies?'.$query)->assertUnprocessable();
        }
        foreach ([['tmdb_id' => '1'], ['tmdb_id' => false], ['tmdb_id' => 1.2], ['tmdb_id' => 0], ['tmdb_id' => 2147483648],
            ['tmdb_id' => 1, 'collection_id' => 2], ['tmdb_id' => 1, 'user_id' => 1], ['tmdb_id' => 1, 'created_at' => 'yesterday']] as $body) {
            $this->postJson(self::URL.'/'.$c->id.'/movies', $body)->assertUnprocessable();
        }
        Http::assertNothingSent();
    }

    public function test_csrf_no_accept_json_patch_cors_and_shared_rate_limits(): void
    {
        $this->get(self::URL)->assertUnauthorized()->assertHeader('Content-Type', 'application/json');
        $c = $this->signIn()->collections()->create(['name' => 'Films']);
        $this->app->instance('env', 'local');
        foreach ([['POST', '', ['name' => 'New']], ['PATCH', '/'.$c->id, ['name' => 'Edit']], ['DELETE', '/'.$c->id, []],
            ['POST', '/'.$c->id.'/movies', ['tmdb_id' => 1]], ['DELETE', '/'.$c->id.'/movies/1', []]] as [$method, $suffix, $body]) {
            $this->json($method, self::URL.$suffix, $body)->assertStatus(419)->assertExactJson(['message' => 'CSRF token mismatch.']);
        }
        $bootstrap = $this->getJson('/sanctum/csrf-cookie');
        $this->withHeader('X-XSRF-TOKEN', $bootstrap->getCookie('XSRF-TOKEN', false)->getValue())
            ->patchJson(self::URL.'/'.$c->id, ['description' => 'Updated'])->assertOk();
        config(['cors.allowed_origins' => ['http://localhost:5173']]);
        $response = $this->withHeaders(['Origin' => 'http://localhost:5173', 'Access-Control-Request-Method' => 'PATCH'])
            ->options(self::URL.'/'.$c->id)->assertNoContent();
        $this->assertStringContainsString('PATCH', $response->headers->get('Access-Control-Allow-Methods'));
        Http::assertNothingSent();
    }

    public function test_collection_operations_share_existing_library_throttles(): void
    {
        $this->signIn();
        for ($i = 0; $i < 60; $i++) {
            $this->deleteJson('/api/v1/me/watchlist/1')->assertNoContent();
        }
        $this->postJson(self::URL, ['name' => 'Limited'])->assertTooManyRequests()->assertHeader('Retry-After')->assertExactJson(['message' => 'Too many requests.']);
        for ($i = 0; $i < 120; $i++) {
            $this->getJson('/api/v1/me/watchlist')->assertOk();
        }
        $this->getJson(self::URL)->assertTooManyRequests()->assertHeader('Retry-After');
    }
}
