<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ReviewService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ReviewsTest extends TestCase
{
    use RefreshDatabase;

    private const PUBLIC = '/api/v1/movies/550/reviews';

    private const OWN = '/api/v1/me/reviews/550';

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
        Http::fake(fn () => Http::response(['data' => $missing ? [] : [['tmdb_id' => 550, 'title' => 'Fixture', 'poster_path' => null,
            'backdrop_path' => null, 'overview' => null, 'release_date' => null, 'tmdb_rating' => 8.4, 'tmdb_vote_count' => 100]],
            'meta' => ['requested_count' => 1, 'returned_count' => $missing ? 0 : 1, 'missing_tmdb_ids' => $missing ? [550] : []]]));
    }

    public static function protectedEndpoints(): array
    {
        return [['GET', self::OWN, []], ['POST', self::PUBLIC, ['body' => 'Review']], ['PATCH', self::PUBLIC.'/1', ['body' => 'Edit']], ['DELETE', self::PUBLIC.'/1', []]];
    }

    #[DataProvider('protectedEndpoints')]
    public function test_private_routes_require_a_verified_session(string $method, string $url, array $body): void
    {
        $this->json($method, $url, $body)->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
        $this->actingAs(User::factory()->unverified()->create(), 'web');
        $this->json($method, $url, $body)->assertForbidden()->assertJsonPath('message', 'Your email address is not verified.');
        $this->getJson(self::PUBLIC)->assertOk();
        Http::assertNothingSent();
    }

    public function test_guest_empty_listing_does_not_require_catalog_or_a_session(): void
    {
        $this->get(self::PUBLIC)->assertOk()->assertExactJson(['data' => [], 'meta' => ['page' => 1, 'per_page' => 20, 'total_pages' => 0, 'total_results' => 0]])
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->getJson('/api/v1/movies/2147483647/reviews')->assertOk();
        Http::assertNothingSent();
    }

    public function test_create_own_read_and_duplicate_do_not_expose_private_author_data(): void
    {
        $user = $this->signIn();
        $this->catalog();
        $this->getJson(self::OWN)->assertExactJson(['data' => null]);
        $created = $this->postJson(self::PUBLIC, ['body' => "  A thoughtful film.\n\nA second paragraph.  "])->assertCreated()
            ->assertJsonPath('data.body', "A thoughtful film.\n\nA second paragraph.")->assertJsonPath('data.contains_spoilers', false)
            ->assertJsonPath('data.author.id', $user->id)->assertJsonPath('data.author.username', $user->username)
            ->assertJsonPath('data.author.avatar_url', null)->assertJsonMissingPath('data.user_id');
        $this->assertSame(['id', 'username', 'avatar_url'], array_keys($created->json('data.author')));
        $this->getJson(self::OWN)->assertJsonPath('data.id', $created->json('data.id'));
        $this->getJson(self::PUBLIC)->assertJsonPath('data.0.body', "A thoughtful film.\n\nA second paragraph.")
            ->assertJsonMissingPath('data.0.author.email')->assertJsonMissingPath('data.0.author.email_verified_at');
        $this->postJson(self::PUBLIC, ['body' => 'Another'])->assertConflict()->assertExactJson(['message' => 'A review already exists for this movie.', 'code' => 'REVIEW_EXISTS']);
        $this->assertDatabaseCount('reviews', 1);
        Http::assertSentCount(1);
    }

    public function test_unicode_maximum_plain_text_and_strict_spoiler_flags(): void
    {
        $this->signIn();
        $this->catalog();
        $body = str_repeat('🎬', 5000);
        $created = $this->postJson(self::PUBLIC, ['body' => $body, 'contains_spoilers' => true])->assertCreated()
            ->assertJsonPath('data.body', $body)->assertJsonPath('data.contains_spoilers', true);
        $id = $created->json('data.id');
        $this->patchJson(self::PUBLIC.'/'.$id, ['body' => str_repeat('🎬', 5001)])->assertUnprocessable();
        $malicious = "<script>alert('xss')</script>\n<img src=x onerror=alert(1)>";
        $this->patchJson(self::PUBLIC.'/'.$id, ['body' => $malicious])->assertOk()->assertJsonPath('data.body', $malicious)->assertJsonPath('data.contains_spoilers', true);
        $this->patchJson(self::PUBLIC.'/'.$id, ['contains_spoilers' => false])->assertOk()->assertJsonPath('data.contains_spoilers', false)->assertJsonPath('data.body', $malicious);
        Http::assertSentCount(1);
    }

    public static function invalidBodies(): array
    {
        return [[[]], [['body' => '']], [['body' => '   ']], [['body' => "\u{2003}\u{00A0}"]], [['body' => null]], [['body' => 1]], [['body' => true]], [['body' => []]], [['body' => str_repeat('x', 5001)]],
            ...array_map(fn ($value) => [['body' => 'Valid', 'contains_spoilers' => $value]], ['true', 'false', 0, 1, null, [], ['value' => true]]),
            ...array_map(fn ($field) => [['body' => 'Valid', $field => 1]], ['user_id', 'author', 'author_id', 'owner_id', 'tmdb_id', 'review_id', 'created_at', 'updated_at', 'rating', 'review_count', 'is_approved', 'moderation_status'])];
    }

    #[DataProvider('invalidBodies')]
    public function test_invalid_creation_and_patch_fields_are_rejected(array $body): void
    {
        $r = $this->signIn()->reviews()->create(['tmdb_id' => 550, 'body' => 'Original', 'contains_spoilers' => true]);
        $this->postJson(self::PUBLIC, $body)->assertUnprocessable();
        $this->patchJson(self::PUBLIC.'/'.$r->id, $body)->assertUnprocessable();
        $this->assertSame('Original', $r->fresh()->body);
        Http::assertNothingSent();
    }

    public function test_edit_preserves_identity_creation_and_order_and_only_changes_supplied_fields(): void
    {
        $user = $this->signIn();
        $a = $user->reviews()->create(['tmdb_id' => 550, 'body' => 'First', 'contains_spoilers' => true]);
        $this->travel(2)->seconds();
        $b = User::factory()->create()->reviews()->create(['tmdb_id' => 550, 'body' => 'Second']);
        $created = $a->created_at->toISOString();
        $this->travel(2)->seconds();
        $edited = $this->patchJson(self::PUBLIC.'/'.$a->id, ['body' => 'Edited'])->assertOk()->assertJsonPath('data.id', $a->id)
            ->assertJsonPath('data.created_at', $created)->assertJsonPath('data.contains_spoilers', true);
        $this->assertNotSame($created, $edited->json('data.updated_at'));
        $this->getJson(self::PUBLIC)->assertJsonPath('data.0.id', $b->id)->assertJsonPath('data.1.id', $a->id);
        $this->patchJson(self::PUBLIC.'/'.$a->id, ['contains_spoilers' => false])->assertOk()->assertJsonPath('data.body', 'Edited');
        $this->assertDatabaseCount('reviews', 2);
        Http::assertNothingSent();
    }

    public function test_owner_movie_and_review_id_are_all_required_for_modification(): void
    {
        $user = $this->signIn();
        $other = User::factory()->create()->reviews()->create(['tmdb_id' => 550, 'body' => 'Other']);
        $own = $user->reviews()->create(['tmdb_id' => 551, 'body' => 'Wrong movie']);
        $this->getJson(self::OWN)->assertExactJson(['data' => null]);
        foreach ([$other->id, $own->id, 2147483647] as $id) {
            $this->patchJson(self::PUBLIC.'/'.$id, ['body' => 'Changed'])->assertNotFound()->assertExactJson(['message' => 'Not found.']);
            $this->deleteJson(self::PUBLIC.'/'.$id)->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        }
        $this->assertSame('Other', $other->fresh()->body);
        $this->assertDatabaseCount('reviews', 2);
        Http::assertNothingSent();
    }

    public function test_delete_and_rating_removal_preserve_other_independent_content_and_allow_recreation(): void
    {
        $user = $this->signIn();
        $r = $user->reviews()->create(['tmdb_id' => 550, 'body' => 'Review without rating']);
        $user->movieRatings()->create(['tmdb_id' => 550, 'rating' => 4]);
        $this->deleteJson('/api/v1/me/ratings/550')->assertNoContent();
        $this->assertDatabaseCount('reviews', 1);
        $user->movieRatings()->create(['tmdb_id' => 550, 'rating' => 5]);
        $user->watchlistEntries()->create(['tmdb_id' => 550]);
        $user->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);
        $user->collections()->create(['name' => 'Films'])->movies()->create(['tmdb_id' => 550]);
        $this->deleteJson(self::PUBLIC.'/'.$r->id)->assertNoContent();
        $this->deleteJson(self::PUBLIC.'/'.$r->id)->assertNotFound();
        foreach (['movie_ratings', 'watchlist_entries', 'watched_movies', 'collection_movies'] as $table) {
            $this->assertDatabaseCount($table, 1);
        }
        $this->catalog();
        $new = $this->postJson(self::PUBLIC, ['body' => 'New review'])->assertCreated()->json('data.id');
        $this->assertNotSame($r->id, $new);
    }

    public function test_public_pagination_order_and_eager_author_loading_are_bounded(): void
    {
        $users = User::factory()->count(23)->create();
        foreach ($users as $user) {
            $user->reviews()->create(['tmdb_id' => 550, 'body' => 'Body']);
        }
        $this->getJson(self::PUBLIC)->assertJsonCount(20, 'data')->assertJsonPath('meta.total_results', 23)->assertJsonPath('meta.total_pages', 2);
        $this->getJson(self::PUBLIC.'?page=2')->assertJsonCount(3, 'data');
        DB::enableQueryLog();
        DB::flushQueryLog();
        $result = app(ReviewService::class)->listing(550, 1, 50);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertCount(3, $queries);
        $this->assertCount(23, $result['entries']);
        $this->assertSame($users->last()->id, $result['entries']->first()->user_id);
        Http::assertNothingSent();
    }

    public function test_database_unique_key_default_fk_cascade_and_indexes(): void
    {
        $user = $this->signIn();
        $r = $user->reviews()->create(['tmdb_id' => 550, 'body' => 'Body']);
        $this->assertFalse($r->fresh()->contains_spoilers);
        $this->assertSame($user->id, $r->user->id);
        $indexes = Schema::getIndexes('reviews');
        $this->assertTrue(collect($indexes)->contains(fn ($i) => $i['unique'] && $i['columns'] === ['user_id', 'tmdb_id']));
        $this->assertTrue(collect($indexes)->contains(fn ($i) => $i['columns'] === ['tmdb_id', 'created_at', 'id']));
        try {
            DB::transaction(fn () => $user->reviews()->create(['tmdb_id' => 550, 'body' => 'Duplicate']));
            $this->fail('Unique key not enforced');
        } catch (UniqueConstraintViolationException) {
            $this->assertTrue(true);
        }
        $user->delete();
        $this->assertDatabaseCount('reviews', 0);
    }

    public function test_reference_miss_outage_and_existing_conflict_read_edit_delete_behavior(): void
    {
        $user = $this->signIn();
        $this->catalog(true);
        $this->postJson(self::PUBLIC, ['body' => 'Valid'])->assertUnprocessable()->assertJsonValidationErrors('tmdb_id');
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(fn () => Http::response([], 500));
        $this->postJson(self::PUBLIC, ['body' => 'Valid'])->assertStatus(503)->assertJsonPath('code', 'UPSTREAM_UNAVAILABLE');
        $r = $user->reviews()->create(['tmdb_id' => 550, 'body' => 'Existing']);
        $this->postJson(self::PUBLIC, ['body' => 'Duplicate'])->assertConflict()->assertJsonPath('code', 'REVIEW_EXISTS');
        $this->getJson(self::PUBLIC)->assertOk();
        $this->getJson(self::OWN)->assertOk();
        $this->patchJson(self::PUBLIC.'/'.$r->id, ['body' => 'Offline edit'])->assertOk();
        $this->deleteJson(self::PUBLIC.'/'.$r->id)->assertNoContent();
        Http::assertSentCount(1);
    }

    public function test_canonical_ids_query_and_empty_patch_contract(): void
    {
        $r = $this->signIn()->reviews()->create(['tmdb_id' => 550, 'body' => 'Body']);
        foreach (['0', '01', '-1', '+1', '1.0', 'abc', '2147483648'] as $id) {
            $this->getJson('/api/v1/movies/'.$id.'/reviews')->assertUnprocessable();
            $this->getJson('/api/v1/me/reviews/'.$id)->assertUnprocessable();
            $this->postJson('/api/v1/movies/'.$id.'/reviews', ['body' => 'Body'])->assertUnprocessable();
            $this->patchJson(self::PUBLIC.'/'.$id, ['body' => 'Body'])->assertUnprocessable();
            $this->deleteJson(self::PUBLIC.'/'.$id)->assertUnprocessable();
        }
        foreach (['page=0', 'page=10001', 'page[]=1', 'per_page=0', 'per_page=51', 'unknown=1'] as $query) {
            $this->getJson(self::PUBLIC.'?'.$query)->assertUnprocessable();
        }
        $this->patchJson(self::PUBLIC.'/'.$r->id, [])->assertUnprocessable();
        $this->deleteJson(self::PUBLIC.'/'.$r->id, ['user_id' => 1])->assertUnprocessable();
        $this->post(self::PUBLIC, ['body' => 'Form body'])->assertUnprocessable();
        $this->postJson(self::PUBLIC.'?user_id=1', ['body' => 'Body'])->assertUnprocessable();
        $this->getJson(self::OWN.'?page=1')->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_csrf_without_origin_safe_json_errors_and_shared_throttles(): void
    {
        $r = $this->signIn()->reviews()->create(['tmdb_id' => 550, 'body' => 'Body']);
        $this->app->instance('env', 'local');
        $this->postJson(self::PUBLIC, ['body' => 'Body'])->assertStatus(419)->assertExactJson(['message' => 'CSRF token mismatch.']);
        $this->patchJson(self::PUBLIC.'/'.$r->id, ['body' => 'Edit'])->assertStatus(419);
        $this->deleteJson(self::PUBLIC.'/'.$r->id)->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie');
        $this->withHeader('X-XSRF-TOKEN', $csrf->getCookie('XSRF-TOKEN', false)->getValue())->patchJson(self::PUBLIC.'/'.$r->id, ['body' => 'Edit'])->assertOk();
        $this->mock(ReviewService::class)->shouldReceive('listing')->andThrow(new \RuntimeException('SQL credentials'));
        $this->get(self::PUBLIC)->assertStatus(500)->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
    }

    public function test_limits_share_community_reads_and_library_writes(): void
    {
        for ($i = 0; $i < 120; $i++) {
            $this->getJson('/api/v1/movies/550/ratings')->assertOk();
        }
        $this->getJson(self::PUBLIC)->assertTooManyRequests()->assertHeader('Retry-After')->assertExactJson(['message' => 'Too many requests.']);
        $this->signIn();
        for ($i = 0; $i < 60; $i++) {
            $this->deleteJson('/api/v1/me/watchlist/550')->assertNoContent();
        }
        $this->postJson(self::PUBLIC, ['body' => 'Body'])->assertTooManyRequests()->assertHeader('Cache-Control', 'no-store, private');
    }
}
