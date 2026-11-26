<?php

namespace Tests\Feature;

use App\Models\Collection;
use App\Models\User;
use App\Services\CollectionService;
use App\Services\Recommendations\PreferenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class PublicCollectionsTest extends TestCase
{
    use RefreshDatabase;

    private const OWNER = '/api/v1/me/collections';

    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
        Http::preventStrayRequests();
    }

    private function collection(?User $owner = null, string $visibility = 'public'): Collection
    {
        return ($owner ?? User::factory()->create())->collections()->create([
            'name' => 'Weekend', 'description' => 'Films to share', 'visibility' => $visibility,
        ]);
    }

    private function catalog(): void
    {
        Http::fake(function ($request) {
            $ids = $request['tmdb_ids'];

            return Http::response(['data' => array_map(fn ($id) => ['tmdb_id' => $id, 'title' => 'Fixture '.$id,
                'poster_path' => null, 'backdrop_path' => null, 'overview' => null, 'release_date' => null,
                'tmdb_rating' => null, 'tmdb_vote_count' => null], $ids),
                'meta' => ['requested_count' => count($ids), 'returned_count' => count($ids), 'missing_tmdb_ids' => []]]);
        });
    }

    public function test_owner_visibility_is_explicit_backward_compatible_and_revocable(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'web');
        $private = $this->postJson(self::OWNER, ['name' => 'Private'])->assertCreated()
            ->assertJsonPath('data.visibility', 'private')->json('data.id');
        $public = $this->postJson(self::OWNER, ['name' => 'Shared', 'visibility' => 'public'])->assertCreated()
            ->assertJsonPath('data.visibility', 'public')->json('data.id');
        $this->patchJson(self::OWNER.'/'.$public, ['description' => 'Updated'])->assertOk()->assertJsonPath('data.visibility', 'public');
        $this->patchJson(self::OWNER.'/'.$private, ['visibility' => 'public'])->assertOk()->assertJsonPath('data.visibility', 'public');
        $this->get('/api/v1/collections/'.$private)->assertOk();
        $this->patchJson(self::OWNER.'/'.$private, ['visibility' => 'private'])->assertOk();
        foreach (['', '/movies'] as $suffix) {
            $this->get('/api/v1/collections/'.$private.$suffix)->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        }
        $this->get('/api/v1/users/'.$user->id.'/collections')->assertOk()->assertJsonPath('meta.total_results', 1);
        Http::assertNothingSent();
    }

    public static function invalidVisibility(): array
    {
        return [[null], [''], ['friends'], [true], [1], [['public']]];
    }

    #[DataProvider('invalidVisibility')]
    public function test_invalid_visibility_is_rejected_on_create_and_update(mixed $visibility): void
    {
        $user = User::factory()->create();
        $c = $this->collection($user, 'private');
        $this->actingAs($user, 'web');
        $this->postJson(self::OWNER, ['name' => 'New', 'visibility' => $visibility])->assertUnprocessable()->assertJsonValidationErrors('visibility');
        $this->patchJson(self::OWNER.'/'.$c->id, ['visibility' => $visibility])->assertUnprocessable()->assertJsonValidationErrors('visibility');
        $this->assertSame('private', $c->fresh()->visibility);
    }

    public function test_public_resources_project_only_approved_fields_for_guest_and_member(): void
    {
        $c = $this->collection();
        $owner = $c->user;
        $expected = ['data' => ['id' => $c->id, 'name' => 'Weekend', 'description' => 'Films to share', 'movie_count' => 0,
            'creator' => ['id' => $owner->id, 'username' => $owner->username, 'avatar_url' => null]]];
        $url = '/api/v1/collections/'.$c->id;
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'application/json')
            ->assertHeader('Cache-Control', 'no-store, private')->assertExactJson($expected);
        $this->actingAs(User::factory()->create(), 'web')->withHeader('Accept', 'application/json')->get($url)->assertOk()->assertExactJson($expected);
        Http::assertNothingSent();
    }

    public function test_author_listing_filters_before_totals_previews_and_bounded_enrichment(): void
    {
        $user = User::factory()->create();
        $favorite = $user->collections()->where('system_key', 'favorites')->sole();
        // Defense in depth: even a corrupt legacy Favorites row cannot become public.
        $favorite->forceFill(['visibility' => 'public'])->save();
        $favorite->movies()->create(['tmdb_id' => 999]);
        $this->collection($user, 'private')->movies()->create(['tmdb_id' => 998]);
        $this->collection()->movies()->create(['tmdb_id' => 997]);
        for ($i = 1; $i <= 18; $i++) {
            $c = $this->collection($user);
            foreach ([$i * 10 + 1, $i * 10 + 2, $i * 10 + 3, $i * 10 + 4] as $id) {
                $c->movies()->create(['tmdb_id' => $id]);
            }
        }
        $this->catalog();
        DB::enableQueryLog();
        DB::flushQueryLog();
        $response = $this->get('/api/v1/users/'.$user->id.'/collections?per_page=50')->assertOk()
            ->assertJsonCount(18, 'data')->assertJsonPath('meta.total_results', 18)->assertJsonPath('meta.total_pages', 1)
            ->assertJsonPath('data.0.movie_count', 4)->assertJsonCount(3, 'data.0.preview_movies');
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertLessThanOrEqual(6, count($queries));
        $this->assertSame(184, $response->json('data.0.preview_movies.0.tmdb_id'));
        $this->assertEqualsCanonicalizing(['id', 'name', 'description', 'movie_count', 'creator', 'preview_movies'], array_keys($response->json('data.0')));
        Http::assertSentCount(2); // 54 preview IDs, bounded batches of 50.
        Http::assertSent(fn ($request) => count($request['tmdb_ids']) === 50);
        foreach (Http::recorded() as [$request]) {
            $this->assertEmpty(array_intersect([999, 998, 997], $request['tmdb_ids']));
            $this->assertLessThanOrEqual(50, count($request['tmdb_ids']));
        }
        $this->get('/api/v1/users/'.$user->id.'/collections?per_page=2&page=2')->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total_results', 18)->assertJsonPath('meta.total_pages', 9);
        $this->get('/api/v1/users/'.$user->id.'/collections?page=100')->assertJsonPath('data', [])->assertJsonPath('meta.total_results', 18);
    }

    public static function ineligibleOwners(): array
    {
        return [[['account_status' => 'banned']], [['account_status' => 'deactivated']],
            [['email_verified_at' => null]], [['invitation_pending' => true]]];
    }

    #[DataProvider('ineligibleOwners')]
    public function test_ineligible_owners_and_missing_targets_are_indistinguishable(array $attributes): void
    {
        $user = User::factory()->create();
        $c = $this->collection($user);
        $this->get('/api/v1/collections/'.$c->id)->assertOk();
        $user->forceFill($attributes)->save();
        foreach (['/api/v1/collections/'.$c->id, '/api/v1/collections/'.$c->id.'/movies', '/api/v1/users/'.$user->id.'/collections',
            '/api/v1/collections/2147483647', '/api/v1/collections/2147483647/movies', '/api/v1/users/2147483647/collections'] as $url) {
            $this->get($url)->assertNotFound()->assertExactJson(['message' => 'Not found.'])->assertHeader('Cache-Control', 'no-store, private');
        }
        Http::assertNothingSent();
    }

    public function test_private_and_favorites_are_unavailable_even_to_owner_or_admin_on_public_routes(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $private = $this->collection($user, 'private');
        $favorites = $user->collections()->where('system_key', 'favorites')->sole();
        $this->actingAs($user, 'web');
        foreach ([$private, $favorites] as $c) {
            foreach (['', '/movies'] as $suffix) {
                $this->get('/api/v1/collections/'.$c->id.$suffix)->assertNotFound()->assertExactJson(['message' => 'Not found.']);
            }
        }
        $this->patchJson(self::OWNER.'/'.$favorites->id, ['visibility' => 'public'])->assertForbidden();
        $this->assertSame('private', $favorites->fresh()->visibility);
        $this->get('/api/v1/users/'.$user->id.'/collections')->assertJsonPath('meta.total_results', 0);
        Http::assertNothingSent();
    }

    public function test_other_users_cannot_publish_edit_or_change_memberships(): void
    {
        $c = $this->collection();
        $this->actingAs(User::factory()->create(), 'web');
        $this->patchJson(self::OWNER.'/'.$c->id, ['visibility' => 'private'])->assertNotFound();
        $this->patchJson(self::OWNER.'/'.$c->id, ['name' => 'Attack'])->assertNotFound();
        $this->postJson(self::OWNER.'/'.$c->id.'/movies', ['tmdb_id' => 1])->assertNotFound();
        $this->deleteJson(self::OWNER.'/'.$c->id.'/movies/1')->assertNotFound();
        $this->deleteJson(self::OWNER.'/'.$c->id)->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_restricted_owner_private_operations_and_public_withdrawal_remain_available(): void
    {
        $user = User::factory()->create(['account_status' => 'restricted']);
        $public = $this->collection($user);
        $public->movies()->create(['tmdb_id' => 1]);
        $this->actingAs($user, 'web');
        $this->get('/api/v1/collections/'.$public->id)->assertOk();
        $this->postJson(self::OWNER, ['name' => 'Private'])->assertCreated()->assertJsonPath('data.visibility', 'private');
        $this->postJson(self::OWNER, ['name' => 'Public', 'visibility' => 'public'])->assertForbidden();
        foreach ([['visibility' => 'public'], ['name' => 'Expansion'], ['description' => 'Expansion'],
            ['visibility' => 'private', 'name' => 'Combined edit']] as $values) {
            $this->patchJson(self::OWNER.'/'.$public->id, $values)->assertForbidden();
        }
        $this->postJson(self::OWNER.'/'.$public->id.'/movies', ['tmdb_id' => 2])->assertForbidden();
        $this->postJson(self::OWNER.'/'.$public->id.'/movies', ['tmdb_id' => 1])->assertForbidden();
        Http::assertNothingSent();
        $this->assertSame('Weekend', $public->fresh()->name);
        $this->deleteJson(self::OWNER.'/'.$public->id.'/movies/1')->assertNoContent();
        $this->patchJson(self::OWNER.'/'.$public->id, ['visibility' => 'private'])->assertOk();
        $this->patchJson(self::OWNER.'/'.$public->id, ['name' => 'Private edit'])->assertOk();
        $this->catalog();
        $this->postJson(self::OWNER.'/'.$public->id.'/movies', ['tmdb_id' => 2])->assertCreated();
        $this->deleteJson(self::OWNER.'/'.$public->id.'/movies/2')->assertNoContent();
        $this->deleteJson(self::OWNER.'/'.$public->id)->assertNoContent();
        $other = $this->collection($user);
        $this->deleteJson(self::OWNER.'/'.$other->id)->assertNoContent();
    }

    public function test_movie_reads_have_public_projection_and_safe_missing_outage_and_empty_pages(): void
    {
        $c = $this->collection();
        $c->movies()->create(['tmdb_id' => 1]);
        $c->movies()->create(['tmdb_id' => 2]);
        $url = '/api/v1/collections/'.$c->id.'/movies';
        $this->catalog();
        $this->get($url.'?per_page=1')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.total_results', 2)->assertJsonPath('data.0.tmdb_id', 2)
            ->assertJsonPath('data.0.metadata_status', 'available')->assertJsonMissingPath('data.0.collection_id')
            ->assertJsonMissingPath('data.0.created_at');
        Http::assertSentCount(1);
        $this->get($url.'?page=100')->assertJsonPath('data', [])->assertJsonPath('meta.total_results', 2);
        Http::assertSentCount(1);
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['data' => [], 'meta' => ['requested_count' => 2, 'returned_count' => 0, 'missing_tmdb_ids' => [2, 1]]])]);
        $this->get($url)->assertJsonPath('data.0.metadata_status', 'missing')->assertJsonPath('meta.metadata_unavailable', false);
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response([], 503)]);
        $this->get($url)->assertOk()->assertJsonPath('data.0.movie', null)->assertJsonPath('data.0.metadata_status', 'unavailable')
            ->assertJsonPath('meta.metadata_unavailable', true);
        $this->get('/api/v1/users/'.$c->user_id.'/collections')->assertOk()->assertJsonPath('data.0.preview_movies.0.title', null)
            ->assertJsonPath('meta.preview_metadata_unavailable', true)->assertJsonPath('meta.total_results', 1);
    }

    public function test_public_validation_is_strict_body_free_and_no_store_without_accept_header(): void
    {
        foreach (['01', '0', '-1', '1.0', '2147483648', 'bad'] as $id) {
            foreach (['/api/v1/collections/'.$id, '/api/v1/collections/'.$id.'/movies', '/api/v1/users/'.$id.'/collections'] as $url) {
                $this->get($url)->assertUnprocessable()->assertJsonValidationErrors('id')->assertHeader('Cache-Control', 'no-store, private');
            }
        }
        foreach (['page=0', 'page=10001', 'per_page=51', 'per_page[]=1', 'contains_tmdb_id=1', 'include_previews=0', 'id=1'] as $query) {
            $this->get('/api/v1/users/1/collections?'.$query)->assertUnprocessable();
            $this->get('/api/v1/collections/1/movies?'.$query)->assertUnprocessable();
        }
        $this->get('/api/v1/collections/1?page=1')->assertUnprocessable();
        $this->call('GET', '/api/v1/collections/1', [], [], [], ['CONTENT_TYPE' => 'application/json'], '{}')
            ->assertUnprocessable()->assertJsonValidationErrors('body');
        Http::assertNothingSent();
    }

    public function test_public_routes_share_profile_read_throttle_and_sanitize_server_errors(): void
    {
        for ($i = 0; $i < 120; $i++) {
            $this->get('/api/v1/users/2147483647')->assertNotFound();
        }
        foreach (['/api/v1/collections/1', '/api/v1/collections/1/movies', '/api/v1/users/1/collections'] as $url) {
            $this->get($url)->assertTooManyRequests()->assertHeader('Retry-After')->assertHeader('Cache-Control', 'no-store, private')
                ->assertExactJson(['message' => 'Too many requests.']);
        }
        $this->travel(61)->seconds();
        $this->mock(CollectionService::class)->shouldReceive('publicCollection')->andThrow(new \RuntimeException('Private diagnostic'));
        $this->get('/api/v1/collections/1')->assertStatus(500)->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
    }

    public static function changedStatuses(): array
    {
        return [['restricted'], ['banned'], ['deactivated']];
    }

    #[DataProvider('changedStatuses')]
    public function test_add_rechecks_account_after_catalog_confirmation(string $status): void
    {
        $user = User::factory()->create();
        $c = $this->collection($user);
        $this->actingAs($user, 'web');
        $this->catalog();
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(function () use ($user, $status) {
            DB::table('users')->where('id', $user->id)->update(['account_status' => $status]);

            return Http::response(['data' => [['tmdb_id' => 1, 'title' => 'Fixture', 'poster_path' => null, 'backdrop_path' => null,
                'overview' => null, 'release_date' => null, 'tmdb_rating' => null, 'tmdb_vote_count' => null]],
                'meta' => ['requested_count' => 1, 'returned_count' => 1, 'missing_tmdb_ids' => []]]);
        });
        $this->postJson(self::OWNER.'/'.$c->id.'/movies', ['tmdb_id' => 1])->assertForbidden();
        $this->assertDatabaseMissing('collection_movies', ['collection_id' => $c->id, 'tmdb_id' => 1]);
    }

    public function test_add_rechecks_visibility_after_network_io_for_restricted_private_owner(): void
    {
        $user = User::factory()->create(['account_status' => 'restricted']);
        $c = $this->collection($user, 'private');
        $this->actingAs($user, 'web');
        Http::fake(function () use ($c) {
            DB::table('collections')->where('id', $c->id)->update(['visibility' => 'public']);

            return Http::response(['data' => [['tmdb_id' => 1, 'title' => 'Fixture', 'poster_path' => null, 'backdrop_path' => null,
                'overview' => null, 'release_date' => null, 'tmdb_rating' => null, 'tmdb_vote_count' => null]],
                'meta' => ['requested_count' => 1, 'returned_count' => 1, 'missing_tmdb_ids' => []]]);
        });
        $this->postJson(self::OWNER.'/'.$c->id.'/movies', ['tmdb_id' => 1])->assertForbidden();
        $this->assertDatabaseCount('collection_movies', 0);
    }

    public function test_publishing_uses_locked_current_owner_not_stale_user_instance(): void
    {
        $user = User::factory()->create();
        $c = $this->collection($user, 'private');
        DB::table('users')->where('id', $user->id)->update(['account_status' => 'restricted']);
        $service = app(CollectionService::class);
        foreach (['create', 'update'] as $operation) {
            try {
                $operation === 'create' ? $service->create($user, ['name' => 'Denied', 'visibility' => 'public'])
                    : $service->update($user, $c->id, ['visibility' => 'public']);
                $this->fail('A stale active user must not publish.');
            } catch (HttpException $exception) {
                $this->assertSame(403, $exception->getStatusCode());
            }
        }
        $this->assertSame('private', $c->fresh()->visibility);
        $this->assertDatabaseMissing('collections', ['name' => 'Denied']);
    }

    public function test_visibility_does_not_change_owner_recommendation_inputs_but_memberships_still_do(): void
    {
        $user = User::factory()->create();
        $c = $this->collection($user, 'private');
        $c->movies()->create(['tmdb_id' => 550]);
        $preferences = app(PreferenceService::class);
        $before = $preferences->activity($user);
        $this->actingAs($user, 'web');
        $this->patchJson(self::OWNER.'/'.$c->id, ['visibility' => 'public'])->assertOk();
        $this->assertSame($before, $preferences->activity($user));
        $this->patchJson(self::OWNER.'/'.$c->id, ['visibility' => 'private'])->assertOk();
        $this->assertSame($before, $preferences->activity($user));
        $this->deleteJson(self::OWNER.'/'.$c->id.'/movies/550')->assertNoContent();
        $after = $preferences->activity($user);
        $this->assertNotSame($before['revision'], $after['revision']);
        $this->assertNotContains(550, $after['excluded']);
        Http::assertNothingSent();
    }
}
