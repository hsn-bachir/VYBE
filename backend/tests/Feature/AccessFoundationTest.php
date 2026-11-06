<?php

namespace Tests\Feature;

use App\Models\User;
use App\Http\Middleware\EnsureRole;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Request;
use Tests\TestCase;

class AccessFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_defaults_and_database_constraints(): void
    {
        $user = User::factory()->create()->fresh();
        $this->assertSame('user', $user->role);
        $this->assertSame('active', $user->account_status);
        foreach (['role' => 'owner', 'account_status' => 'paused'] as $field => $value) {
            try {
                DB::table('users')->where('id', $user->id)->update([$field => $value]);
                $this->fail("Invalid {$field} was accepted.");
            } catch (QueryException) {
                $this->assertDatabaseHas('users', ['id' => $user->id, 'role' => 'user', 'account_status' => 'active']);
            }
        }
    }

    public function test_public_registration_cannot_choose_privileged_fields(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'username' => 'cinema_fan', 'email' => 'fan@example.com', 'password' => 'StrongPass123!',
            'password_confirmation' => 'StrongPass123!', 'role' => 'admin', 'account_status' => 'active',
        ])->assertUnprocessable();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_access_endpoint_is_private_verified_and_minimal(): void
    {
        $this->getJson('/api/v1/me/access')->assertUnauthorized();
        $user = User::factory()->unverified()->create();
        $this->actingAs($user, 'web');
        $this->getJson('/api/v1/me/access')->assertForbidden();
        $user->email_verified_at = now();
        $user->account_status = User::STATUS_RESTRICTED;
        $user->save();
        Auth::forgetGuards();
        $this->actingAs($user, 'web');
        $this->getJson('/api/v1/me/access')->assertOk()->assertExactJson(['data' => ['role' => 'user', 'account_status' => 'restricted']])
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonMissingPath('data.role')->assertJsonMissingPath('data.account_status');
    }

    public function test_restricted_account_can_use_library_and_delete_own_review_but_cannot_write_community(): void
    {
        $user = User::factory()->create(['account_status' => User::STATUS_RESTRICTED]);
        $review = $user->reviews()->create(['tmdb_id' => 550, 'body' => 'A good movie.', 'contains_spoilers' => false]);
        $this->actingAs($user, 'web');
        $this->postJson('/api/v1/me/collections', ['name' => 'Films'])->assertCreated();
        $this->putJson('/api/v1/me/ratings/550', ['rating' => 5])->assertForbidden()->assertJsonPath('code', 'ACCOUNT_RESTRICTED');
        $this->deleteJson('/api/v1/me/ratings/550')->assertForbidden()->assertJsonPath('code', 'ACCOUNT_RESTRICTED');
        $this->postJson('/api/v1/movies/550/reviews', ['body' => 'Another review'])->assertForbidden()->assertJsonPath('code', 'ACCOUNT_RESTRICTED');
        $this->patchJson("/api/v1/movies/550/reviews/{$review->id}", ['body' => 'Changed'])->assertForbidden()->assertJsonPath('code', 'ACCOUNT_RESTRICTED');
        $this->deleteJson("/api/v1/movies/550/reviews/{$review->id}")->assertNoContent();
    }

    public function test_retained_sessions_are_denied_after_ban_or_deactivation_but_can_logout(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'web');
        foreach ([User::STATUS_BANNED => 'ACCOUNT_BANNED', User::STATUS_DEACTIVATED => 'ACCOUNT_DEACTIVATED'] as $status => $code) {
            DB::table('users')->where('id', $user->id)->update(['account_status' => $status]);
            $this->getJson('/api/v1/auth/me')->assertForbidden()->assertJsonPath('code', $code);
            $this->getJson('/api/v1/me/profile')->assertForbidden()->assertJsonPath('code', $code);
            $this->postJson('/api/v1/me/collections', ['name' => 'Nope'])->assertForbidden()->assertJsonPath('code', $code);
            $this->getJson('/api/v1/me/access')->assertForbidden()->assertJsonPath('code', $code);
            $this->getJson('/api/v1/movies/550/ratings')->assertOk();
        }
        $this->assertDatabaseCount('collections', 0);
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
    }

    public function test_blocked_accounts_get_generic_login_failure(): void
    {
        foreach ([User::STATUS_BANNED, User::STATUS_DEACTIVATED] as $status) {
            $user = User::factory()->create(['account_status' => $status, 'password' => 'KnownPassword123!']);
            $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'KnownPassword123!'])
                ->assertUnauthorized()->assertExactJson(['message' => 'Invalid email or password.']);
            $this->assertGuest('web');
        }
    }

    public function test_state_change_during_catalog_validation_blocks_the_library_write(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'web');
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
        Http::preventStrayRequests();
        Http::fake(function () use ($user) {
            DB::table('users')->where('id', $user->id)->update(['account_status' => User::STATUS_BANNED]);
            return Http::response(['data' => [['tmdb_id' => 550, 'title' => 'Fixture', 'poster_path' => null,
                'backdrop_path' => null, 'overview' => null, 'release_date' => null, 'tmdb_rating' => 7.5,
                'tmdb_vote_count' => 100]], 'meta' => ['requested_count' => 1, 'returned_count' => 1, 'missing_tmdb_ids' => []]]);
        });
        $this->postJson('/api/v1/me/watchlist', ['tmdb_id' => 550])->assertForbidden()->assertJsonPath('code', 'ACCOUNT_BANNED');
        $this->assertDatabaseCount('watchlist_entries', 0);
    }

    public function test_initial_admin_provisioning_requires_existing_verified_active_account_and_is_idempotent(): void
    {
        $unverified = User::factory()->unverified()->create();
        $this->assertSame(1, Artisan::call('app:provision-admin', ['user_id' => $unverified->id]));
        $admin = User::factory()->create();
        $this->assertSame(0, Artisan::call('app:provision-admin', ['user_id' => $admin->id]));
        $this->assertSame('admin', $admin->fresh()->role);
        $this->assertSame(0, Artisan::call('app:provision-admin', ['user_id' => $admin->id]));
        $other = User::factory()->create();
        $this->assertSame(1, Artisan::call('app:provision-admin', ['user_id' => $other->id]));
        $this->assertSame('user', $other->fresh()->role);
        $this->assertTrue(Gate::forUser($admin->fresh())->allows('admin.read'));
        $this->assertFalse(Gate::forUser($other)->allows('admin.read'));
        $moderator = User::factory()->create(['role' => User::ROLE_MODERATOR])->fresh();
        $this->assertTrue(Gate::forUser($moderator)->allows('moderation.read'));
        $this->assertFalse(Gate::forUser($moderator)->allows('admin.read'));
        $moderator->account_status = User::STATUS_RESTRICTED;
        $this->assertFalse(Gate::forUser($moderator)->allows('privileged.write'));
    }

    public function test_role_middleware_checks_privilege_and_restricted_mutations(): void
    {
        $user = User::factory()->create()->fresh();
        $moderator = User::factory()->create(['role' => User::ROLE_MODERATOR])->fresh();
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN])->fresh();
        $run = function (User $actor, string $role, string $method = 'GET') {
            $request = Request::create('/api/v1/admin/check', $method);
            $request->setUserResolver(fn () => $actor);
            return app(EnsureRole::class)->handle($request, fn () => response()->noContent(), $role);
        };
        $this->assertSame(403, $run($user, User::ROLE_MODERATOR)->getStatusCode());
        $this->assertSame(403, $run($moderator, User::ROLE_ADMIN)->getStatusCode());
        $this->assertSame(204, $run($moderator, User::ROLE_MODERATOR)->getStatusCode());
        $this->assertSame(204, $run($admin, User::ROLE_ADMIN)->getStatusCode());
        $moderator->account_status = User::STATUS_RESTRICTED;
        $this->assertSame(204, $run($moderator, User::ROLE_MODERATOR)->getStatusCode());
        $this->assertSame(403, $run($moderator, User::ROLE_MODERATOR, 'POST')->getStatusCode());
    }
}
