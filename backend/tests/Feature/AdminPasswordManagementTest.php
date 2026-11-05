<?php

namespace Tests\Feature;

use App\Mail\AccountPasswordChangedMail;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AdminPasswordManagementTest extends TestCase
{
    use RefreshDatabase;

    private function payload(): array
    {
        return [
            'admin_current_password' => 'password',
            'password' => 'newPassword123!',
            'password_confirmation' => 'newPassword123!',
            'reason' => 'Requested account recovery',
        ];
    }

    public function test_session_version_migration_rolls_back_without_deleting_users(): void
    {
        $user = User::factory()->create();
        $migration = require database_path('migrations/2026_11_05_000001_add_password_session_version_to_users_table.php');
        $this->assertTrue(Schema::hasColumn('users', 'password_session_version'));
        $migration->down();
        $this->assertFalse(Schema::hasColumn('users', 'password_session_version'));
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $migration->up();
        $this->assertTrue(Schema::hasColumn('users', 'password_session_version'));
    }

    public function test_direct_change_hashes_revokes_and_audits_without_exposing_secrets(): void
    {
        config(['session.driver' => 'database']);
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['password' => 'oldPassword123!', 'account_status' => 'restricted']);
        DB::table('sessions')->insert(['id' => 'target-session', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        $oldToken = Password::broker()->createToken($target);

        $this->actingAs($admin, 'web')->putJson("/api/v1/admin/users/{$target->id}/password", $this->payload())
            ->assertNoContent()->assertHeader('Cache-Control', 'no-store, private');
        $target->refresh();
        $this->assertTrue(Hash::check('newPassword123!', $target->password));
        $this->assertFalse(Hash::check('oldPassword123!', $target->password));
        $this->assertNotNull($target->password_session_version);
        $this->assertSame('restricted', $target->account_status);
        $this->assertSame('user', $target->role);
        $this->assertDatabaseMissing('sessions', ['id' => 'target-session']);
        $this->assertFalse(Password::broker()->tokenExists($target, $oldToken));
        $this->assertDatabaseHas('administrative_actions', [
            'actor_id' => $admin->id, 'target_id' => $target->id,
            'action' => 'user.password_changed', 'reason' => 'Requested account recovery',
        ]);
        $audit = DB::table('administrative_actions')->where('target_id', $target->id)->first();
        $this->assertStringNotContainsString('newPassword123!', json_encode($audit));
        $this->assertStringNotContainsString('password', (string) $audit->details);
        Mail::assertSent(AccountPasswordChangedMail::class, 1);
        Auth::forgetGuards();
        $this->postJson('/api/v1/auth/login', ['email' => $target->email, 'password' => 'oldPassword123!'])->assertUnauthorized();
        $this->postJson('/api/v1/auth/login', ['email' => $target->email, 'password' => 'newPassword123!'])->assertOk()
            ->assertJsonPath('data.id', $target->id)->assertJsonMissingPath('data.password_session_version');
    }

    public function test_authorization_confirmation_and_ineligible_targets_fail_without_audit(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create();
        $url = "/api/v1/admin/users/{$target->id}/password";
        $this->putJson($url, $this->payload())->assertUnauthorized();
        foreach (['user', 'moderator'] as $role) {
            Auth::forgetGuards();
            $this->actingAs(User::factory()->create(['role' => $role]), 'web')->putJson($url, $this->payload())->assertForbidden();
        }
        Auth::forgetGuards();
        $this->actingAs($admin, 'web');
        $this->putJson($url, [...$this->payload(), 'admin_current_password' => 'wrong'])->assertUnprocessable();
        $this->putJson($url, [...$this->payload(), 'admin_current_password' => ''])->assertUnprocessable();
        $this->putJson($url, [...$this->payload(), 'password' => 'short', 'password_confirmation' => 'short'])->assertUnprocessable();
        $this->putJson($url, [...$this->payload(), 'user_id' => $admin->id])->assertUnprocessable();
        $this->putJson($url, [...$this->payload(), 'password_confirmation' => 'mismatch'])->assertUnprocessable();
        $this->putJson("/api/v1/admin/users/{$admin->id}/password", $this->payload())->assertStatus(409);
        $otherAdmin = User::factory()->create(['role' => 'admin']);
        $this->putJson("/api/v1/admin/users/{$otherAdmin->id}/password", $this->payload())->assertStatus(409);
        $invitee = User::factory()->create(['invitation_pending' => true]);
        $this->putJson("/api/v1/admin/users/{$invitee->id}/password", $this->payload())->assertStatus(409);
        DB::table('users')->where('id', $admin->id)->update(['password' => null]);
        $this->putJson($url, $this->payload())->assertUnprocessable();
        $this->assertDatabaseCount('administrative_actions', 0);
        $this->assertTrue(Hash::check('password', $target->fresh()->password));
    }

    public function test_live_admin_state_and_failed_audit_roll_back_password_and_sessions(): void
    {
        config(['session.driver' => 'database']);
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create();
        $url = "/api/v1/admin/users/{$target->id}/password";
        $this->actingAs($admin, 'web');
        foreach (['restricted', 'banned', 'deactivated'] as $status) {
            DB::table('users')->where('id', $admin->id)->update(['account_status' => $status]);
            $this->putJson($url, $this->payload())->assertForbidden();
        }
        DB::table('users')->where('id', $admin->id)->update(['account_status' => 'active', 'email_verified_at' => null]);
        $this->putJson($url, $this->payload())->assertForbidden();
        DB::table('users')->where('id', $admin->id)->update(['email_verified_at' => now()]);
        DB::table('sessions')->insert(['id' => 'rollback-session', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        Schema::drop('administrative_actions');
        $this->putJson($url, $this->payload())->assertStatus(500)->assertJsonPath('code', 'INTERNAL_ERROR');
        $this->assertTrue(Hash::check('password', $target->fresh()->password));
        $this->assertNull($target->fresh()->password_session_version);
        $this->assertDatabaseHas('sessions', ['id' => 'rollback-session']);
    }

    public function test_admin_reset_uses_broker_token_and_reset_invalidates_old_sessions(): void
    {
        config(['session.driver' => 'database']);
        Notification::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['password' => 'oldPassword123!']);
        DB::table('sessions')->insert(['id' => 'reset-session', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        $url = "/api/v1/admin/users/{$target->id}/password-reset";
        $this->actingAs($admin, 'web')->postJson($url, ['reason' => 'Account recovery'])
            ->assertStatus(202)->assertJsonPath('data.reset_delivery', 'accepted')->assertJsonMissingPath('data.token');
        $token = '';
        Notification::assertSentTo($target, ResetPassword::class, function (ResetPassword $notification) use (&$token) {
            $token = $notification->token;
            return true;
        });
        $this->assertNotSame('', $token);
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.password_reset_initiated', 'target_id' => $target->id, 'reason' => 'Account recovery']);
        $this->postJson($url, ['reason' => 'Again'])->assertStatus(429);
        Auth::forgetGuards();
        $body = ['email' => $target->email, 'token' => $token, 'password' => 'recoveredPassword123!', 'password_confirmation' => 'recoveredPassword123!'];
        $this->postJson('/api/v1/auth/password/reset', $body)->assertNoContent();
        $target->refresh();
        $this->assertTrue(Hash::check('recoveredPassword123!', $target->password));
        $this->assertFalse(Hash::check('oldPassword123!', $target->password));
        $this->assertDatabaseMissing('sessions', ['id' => 'reset-session']);
        $this->postJson('/api/v1/auth/password/reset', $body)->assertUnprocessable()->assertJsonPath('errors.token.0', 'This password reset link is invalid or expired.');
        $this->postJson('/api/v1/auth/password/reset', [...$body, 'email' => 'nobody@example.test'])->assertUnprocessable()->assertJsonPath('errors.token.0', 'This password reset link is invalid or expired.');
    }

    public function test_reset_expiry_delivery_failure_and_file_session_version(): void
    {
        Notification::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create();
        $token = Password::broker()->createToken($target);
        DB::table('password_reset_tokens')->where('email', $target->email)->update(['created_at' => now()->subHours(2)]);
        $this->postJson('/api/v1/auth/password/reset', [
            'email' => $target->email, 'token' => $token, 'password' => 'newPassword123!', 'password_confirmation' => 'newPassword123!',
        ])->assertUnprocessable();
        config(['mail.default' => 'log']);
        $this->actingAs($admin, 'web')->postJson("/api/v1/admin/users/{$target->id}/password-reset", ['reason' => 'Recovery'])
            ->assertStatus(202)->assertJsonPath('data.reset_delivery', 'pending');
        Notification::assertNothingSent();

        config(['session.driver' => 'file']);
        DB::table('users')->where('id', $target->id)->update(['password_session_version' => 'old-version']);
        $this->putJson("/api/v1/admin/users/{$target->id}/password", $this->payload())->assertNoContent();
        Auth::forgetGuards();
        $this->withSession(['password_session_version' => 'old-version'])->actingAs($target->fresh(), 'web')
            ->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_csrf_and_password_change_rate_limit(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create();
        $this->app->instance('env', 'local');
        $this->actingAs($admin, 'web')->withHeader('Origin', 'http://localhost:5173');
        $this->putJson("/api/v1/admin/users/{$target->id}/password", $this->payload())->assertStatus(419);
        $this->postJson("/api/v1/admin/users/{$target->id}/password-reset", ['reason' => 'Recovery'])->assertStatus(419);
        $this->postJson('/api/v1/auth/password/reset', [])->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie')->getCookie('XSRF-TOKEN', false)->getValue();
        $this->withHeader('X-XSRF-TOKEN', $csrf);
        for ($i = 0; $i < 4; $i++) {
            $this->putJson("/api/v1/admin/users/{$target->id}/password", [...$this->payload(), 'admin_current_password' => 'incorrect'])
                ->assertUnprocessable();
        }
        $this->putJson("/api/v1/admin/users/{$target->id}/password", $this->payload())->assertTooManyRequests();
        $this->assertDatabaseCount('administrative_actions', 0);
    }

    public function test_notification_failure_does_not_undo_committed_password_change(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create();
        Mail::shouldReceive('to')->once()->andThrow(new \RuntimeException('Mail transport unavailable'));
        $this->actingAs($admin, 'web')->putJson("/api/v1/admin/users/{$target->id}/password", $this->payload())->assertNoContent();
        $this->assertTrue(Hash::check('newPassword123!', $target->fresh()->password));
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.password_changed', 'target_id' => $target->id]);
    }

    public function test_reset_notification_link_uses_frontend_fragment(): void
    {
        $target = User::factory()->create();
        $message = (new ResetPassword(str_repeat('a', 64)))->toMail($target);
        $this->assertStringStartsWith(config('app.frontend_url').'/password/reset#email=', $message->actionUrl);
        $this->assertStringContainsString('&token='.str_repeat('a', 64), $message->actionUrl);
        $this->assertStringNotContainsString('?token=', $message->actionUrl);
    }

    public function test_admin_email_change_invalidates_old_address_reset_token(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create();
        Password::broker()->createToken($target);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $target->email]);
        $this->actingAs($admin, 'web')->patchJson("/api/v1/admin/users/{$target->id}", ['email' => 'new-address@example.test'])->assertOk();
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $target->email]);
    }
}

