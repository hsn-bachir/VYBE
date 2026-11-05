<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AdminUserManagementTest extends TestCase
{
    use RefreshDatabase;

    private function administrator(): User
    {
        $admin = User::factory()->create();
        DB::table('users')->where('id', $admin->id)->update(['role' => 'admin']);
        return $admin->fresh();
    }

    public function test_audit_migration_rolls_back_and_recreates_with_actor_fk(): void
    {
        $migration = require database_path('migrations/2026_11_03_000005_create_administrative_actions_table.php');
        $this->assertTrue(Schema::hasTable('administrative_actions'));
        $migration->down();
        $this->assertFalse(Schema::hasTable('administrative_actions'));
        $migration->up();
        $this->assertTrue(Schema::hasColumns('administrative_actions', ['actor_id', 'action', 'target_type', 'target_id', 'details', 'created_at']));
    }

    public function test_admin_only_read_access_and_safe_projection(): void
    {
        $target = User::factory()->create();
        $this->getJson('/api/v1/admin/users')->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
        foreach (['user', 'moderator'] as $role) {
            $actor = User::factory()->create(['role' => $role]);
            $this->actingAs($actor, 'web')->getJson('/api/v1/admin/users')->assertForbidden();
            Auth::forgetGuards();
        }
        $admin = $this->administrator();
        $this->actingAs($admin, 'web');
        $response = $this->getJson('/api/v1/admin/users')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame(['id', 'username', 'email', 'email_verified_at', 'role', 'account_status', 'invitation_pending', 'created_at', 'updated_at'], array_keys($response->json('data.0')));
        $this->getJson("/api/v1/admin/users/{$target->id}")->assertOk()->assertJsonPath('data.id', $target->id)->assertJsonMissingPath('data.password');
        $this->getJson('/api/v1/admin/users/999999')->assertNotFound();
        $this->getJson('/api/v1/admin/users/01')->assertUnprocessable();
    }

    public function test_unverified_and_blocked_admins_are_denied_but_restricted_admin_can_read(): void
    {
        $admin = $this->administrator();
        $this->actingAs($admin, 'web');
        DB::table('users')->where('id', $admin->id)->update(['email_verified_at' => null]);
        $this->getJson('/api/v1/admin/users')->assertForbidden();
        foreach (['restricted', 'banned', 'deactivated'] as $status) {
            DB::table('users')->where('id', $admin->id)->update(['email_verified_at' => now(), 'account_status' => $status]);
            $this->getJson('/api/v1/admin/users')->assertStatus($status === 'restricted' ? 200 : 403);
            $this->patchJson("/api/v1/admin/users/{$admin->id}", ['username' => 'new_admin'])->assertForbidden();
        }
    }

    public function test_listing_search_filter_pagination_and_query_validation(): void
    {
        $admin = $this->administrator();
        $a = User::factory()->create(['username' => 'cinema_one', 'email' => 'ONE@example.test']);
        User::factory()->create(['username' => 'cinema_two', 'role' => 'moderator']);
        User::factory()->create(['username' => 'other_user', 'account_status' => 'banned']);
        $this->actingAs($admin, 'web');
        $this->getJson('/api/v1/admin/users?per_page=2&page=2')->assertOk()->assertJsonPath('meta.total_results', 4)->assertJsonPath('data.0.id', $a->id + 1);
        $this->getJson('/api/v1/admin/users?q=cinema')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/admin/users?q=cin%25')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/users?q=cin_')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/users?q=ONE%40EXAMPLE.TEST')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $a->id);
        $this->getJson('/api/v1/admin/users?role=moderator&account_status=active')->assertOk()->assertJsonCount(1, 'data');
        foreach (['?q=ab', '?per_page=51', '?role=owner', '?unknown=x'] as $query) {
            $this->getJson('/api/v1/admin/users'.$query)->assertUnprocessable();
        }
    }

    public function test_edit_normalization_noop_email_verification_and_last_admin_protection(): void
    {
        $admin = $this->administrator();
        $target = User::factory()->create();
        $this->actingAs($admin, 'web');
        $this->patchJson("/api/v1/admin/users/{$target->id}", ['username' => '  New_Name  '])->assertOk()->assertJsonPath('data.username', 'new_name');
        $this->patchJson("/api/v1/admin/users/{$target->id}", ['username' => 'new_name'])->assertOk();
        $this->assertDatabaseCount('administrative_actions', 1);
        $this->patchJson("/api/v1/admin/users/{$target->id}", ['email' => '  NEW@example.test  '])->assertOk()->assertJsonPath('data.email', 'new@example.test')->assertJsonPath('data.email_verified_at', null);
        $this->patchJson("/api/v1/admin/users/{$admin->id}", ['email' => 'new_admin@example.test'])->assertStatus(409);
        $this->patchJson("/api/v1/admin/users/{$target->id}", ['password' => 'nope'])->assertUnprocessable();
        $this->patchJson("/api/v1/admin/users/{$target->id}", ['username' => $admin->username])->assertUnprocessable();
        $this->assertDatabaseCount('administrative_actions', 2);
        $this->assertSame(['username_changed' => false, 'email_changed' => true], DB::table('administrative_actions')->orderByDesc('id')->first() ? json_decode(DB::table('administrative_actions')->orderByDesc('id')->first()->details, true) : []);
    }

    public function test_role_status_audit_sessions_and_conflicts(): void
    {
        config(['session.driver' => 'database', 'session.connection' => null]);
        $admin = $this->administrator();
        $target = User::factory()->create();
        DB::table('sessions')->insert(['id' => 'session-for-target', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        $this->actingAs($admin, 'web');
        $role = "/api/v1/admin/users/{$target->id}/role";
        $status = "/api/v1/admin/users/{$target->id}/status";
        $this->putJson($role, ['role' => 'moderator', 'reason' => '  Community help  '])->assertOk()->assertJsonPath('data.role', 'moderator');
        $this->assertDatabaseMissing('sessions', ['id' => 'session-for-target']);
        $this->putJson($role, ['role' => 'moderator', 'reason' => 'Repeat'])->assertOk();
        $this->assertDatabaseCount('administrative_actions', 1);
        $this->putJson($role, ['role' => 'admin', 'reason' => 'No'])->assertUnprocessable();
        $this->putJson("/api/v1/admin/users/{$admin->id}/role", ['role' => 'user', 'reason' => 'No'])->assertStatus(409);
        $this->putJson($status, ['account_status' => 'restricted', 'reason' => 'Policy'])->assertOk();
        $this->putJson($status, ['account_status' => 'banned', 'reason' => 'Policy'])->assertOk();
        $this->putJson($status, ['account_status' => 'deactivated', 'reason' => 'Policy'])->assertOk();
        $this->putJson($status, ['account_status' => 'active', 'reason' => 'Appeal'])->assertOk();
        $this->putJson($status, ['account_status' => 'active', 'reason' => 'Repeat'])->assertOk();
        $this->putJson("/api/v1/admin/users/{$admin->id}/status", ['account_status' => 'banned', 'reason' => 'No'])->assertStatus(409);
        $this->assertDatabaseCount('administrative_actions', 5);
        $this->assertDatabaseHas('users', ['id' => $target->id, 'account_status' => 'active']);
    }

    public function test_actor_revocation_is_checked_again_inside_transaction_and_errors_do_not_audit(): void
    {
        $admin = $this->administrator();
        $target = User::factory()->create();
        $this->actingAs($admin, 'web');
        DB::table('users')->where('id', $admin->id)->update(['account_status' => 'restricted']);
        $this->putJson("/api/v1/admin/users/{$target->id}/role", ['role' => 'moderator', 'reason' => 'No'])->assertForbidden();
        $this->assertDatabaseCount('administrative_actions', 0);
    }

    public function test_second_administrator_may_change_email_but_is_signed_out_and_must_verify_again(): void
    {
        $admin = $this->administrator();
        $other = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin, 'web');
        $this->patchJson("/api/v1/admin/users/{$admin->id}", ['email' => 'replacement@example.test'])
            ->assertOk()->assertJsonPath('data.email_verified_at', null);
        Auth::forgetGuards();
        $this->getJson('/api/v1/admin/users')->assertUnauthorized();
        $this->assertDatabaseHas('users', ['id' => $other->id, 'role' => 'admin']);
        $this->assertDatabaseCount('administrative_actions', 1);
    }

    public function test_strict_mutation_contract_and_role_revocation_reject_retained_moderator_access(): void
    {
        $admin = $this->administrator();
        $target = User::factory()->create(['role' => 'moderator']);
        $this->actingAs($admin, 'web');
        $this->putJson("/api/v1/admin/users/{$target->id}/role", ['role' => 'user', 'reason' => 'Rotation'])->assertOk();
        Auth::forgetGuards();
        $this->actingAs($target, 'web');
        $this->getJson('/api/v1/admin/users')->assertForbidden();
        $this->getJson('/api/v1/me/access')->assertOk()->assertJsonPath('data.role', 'user');
        Auth::forgetGuards();
        $this->actingAs($admin, 'web');
        $this->putJson("/api/v1/admin/users/{$target->id}/status", ['account_status' => 'banned', 'reason' => 'Policy', 'user_id' => $admin->id])->assertUnprocessable();
        $this->patchJson("/api/v1/admin/users/{$target->id}", ['role' => 'admin'])->assertUnprocessable();
        $this->patchJson("/api/v1/admin/users/{$target->id}", [])->assertUnprocessable();
        $this->getJson("/api/v1/admin/users/{$target->id}?private=1")->assertUnprocessable();
        $this->assertDatabaseCount('administrative_actions', 1);
    }

    public function test_admin_mutations_require_csrf_and_reads_are_rate_limited(): void
    {
        $admin = $this->administrator();
        $target = User::factory()->create();
        $this->app->instance('env', 'local');
        $this->actingAs($admin, 'web')->withHeader('Origin', 'http://localhost:5173');
        $this->putJson("/api/v1/admin/users/{$target->id}/role", ['role' => 'moderator', 'reason' => 'Help'])->assertStatus(419)
            ->assertHeader('Cache-Control', 'no-store, private');
        $bootstrap = $this->getJson('/sanctum/csrf-cookie');
        $this->withHeader('X-XSRF-TOKEN', $bootstrap->getCookie('XSRF-TOKEN', false)->getValue())
            ->putJson("/api/v1/admin/users/{$target->id}/role", ['role' => 'moderator', 'reason' => 'Help'])->assertOk();
        for ($i = 0; $i < 60; $i++) $this->getJson('/api/v1/admin/users')->assertOk();
        $this->getJson('/api/v1/admin/users')->assertTooManyRequests()->assertHeader('Retry-After');
    }

    public function test_audit_failure_rolls_back_target_change_and_session_revocation(): void
    {
        config(['session.driver' => 'database', 'session.connection' => null]);
        $admin = $this->administrator();
        $target = User::factory()->create();
        DB::table('sessions')->insert(['id' => 'rollback-session', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        Schema::drop('administrative_actions');
        $this->actingAs($admin, 'web')->putJson("/api/v1/admin/users/{$target->id}/role", [
            'role' => 'moderator', 'reason' => 'Should roll back',
        ])->assertStatus(500)->assertJsonPath('code', 'INTERNAL_ERROR');
        $this->assertDatabaseHas('users', ['id' => $target->id, 'role' => 'user']);
        $this->assertDatabaseHas('sessions', ['id' => 'rollback-session']);
    }

    public function test_deleted_actor_becomes_null_without_erasing_audit_history(): void
    {
        $admin = $this->administrator();
        $target = User::factory()->create();
        $this->actingAs($admin, 'web')->putJson("/api/v1/admin/users/{$target->id}/role", [
            'role' => 'moderator', 'reason' => 'Service assignment',
        ])->assertOk();
        $admin->delete();
        $this->assertDatabaseHas('administrative_actions', ['actor_id' => null, 'action' => 'user.role_changed', 'target_id' => $target->id]);
    }
}
