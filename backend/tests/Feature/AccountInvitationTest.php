<?php

namespace Tests\Feature;

use App\Mail\AccountInvitationMail;
use App\Models\AdministrativeAction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AccountInvitationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function createInvite(User $admin, string $username = 'invited_one', string $email = 'invited@example.test'): array
    {
        Mail::fake();
        $response = $this->actingAs($admin, 'web')->postJson('/api/v1/admin/users', compact('username', 'email'))
            ->assertCreated()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.user.invitation_pending', true)->assertJsonPath('data.user.role', 'user')
            ->assertJsonPath('data.user.email_verified_at', null)->assertJsonPath('data.invitation_delivery', 'accepted')
            ->assertJsonMissingPath('data.user.password')->assertJsonMissingPath('data.user.token');
        Mail::assertSent(AccountInvitationMail::class, 1);
        $mail = Mail::sent(AccountInvitationMail::class)->first();
        $this->assertStringContainsString('Activate your VYBE account', $mail->render());
        parse_str((string) parse_url($mail->activationUrl, PHP_URL_FRAGMENT), $fragment);
        return [$response->json('data.user.id'), $fragment['token'], $fragment['email']];
    }

    public function test_create_and_accept_is_single_use_and_keeps_token_out_of_database_and_api(): void
    {
        [$id, $token, $email] = $this->createInvite($this->admin());
        $record = DB::table('account_invitations')->where('user_id', $id)->first();
        $this->assertSame(hash('sha256', $token), $record->token_hash);
        $this->assertNotSame($token, $record->token_hash);
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.created', 'target_id' => $id]);
        $this->assertDatabaseHas('users', ['id' => $id, 'account_status' => 'active', 'invitation_pending' => true]);
        $this->postJson('/api/v1/auth/invitations/accept', [
            'email' => $email, 'token' => $token, 'password' => 'longPassword123', 'password_confirmation' => 'longPassword123',
        ])->assertNoContent()->assertHeader('Cache-Control', 'no-store, private');
        $user = User::findOrFail($id);
        $this->assertTrue($user->hasVerifiedEmail());
        $this->assertFalse($user->invitation_pending);
        $this->assertTrue(password_verify('longPassword123', $user->password));
        $this->assertDatabaseCount('account_invitations', 0);
        $this->postJson('/api/v1/auth/invitations/accept', [
            'email' => $email, 'token' => $token, 'password' => 'anotherPassword123', 'password_confirmation' => 'anotherPassword123',
        ])->assertUnprocessable()->assertJsonPath('errors.invitation.0', 'This invitation is invalid or expired.');
    }

    public function test_resend_replaces_token_and_expiry_and_old_link_cannot_activate(): void
    {
        $admin = $this->admin();
        [$id, $old, $email] = $this->createInvite($admin);
        Mail::fake();
        $this->postJson("/api/v1/admin/users/{$id}/invitation")->assertStatus(202)
            ->assertJsonPath('data.invitation_delivery', 'accepted');
        Mail::assertSent(AccountInvitationMail::class, 1);
        $mail = Mail::sent(AccountInvitationMail::class)->first();
        parse_str((string) parse_url($mail->activationUrl, PHP_URL_FRAGMENT), $fragment);
        $this->assertNotSame($old, $fragment['token']);
        $this->assertDatabaseCount('account_invitations', 1);
        foreach ([$old, str_repeat('0', 64)] as $invalid) {
            $this->postJson('/api/v1/auth/invitations/accept', [
                'email' => $email, 'token' => $invalid, 'password' => 'longPassword123', 'password_confirmation' => 'longPassword123',
            ])->assertUnprocessable()->assertJsonPath('errors.invitation.0', 'This invitation is invalid or expired.');
        }
        $this->postJson('/api/v1/auth/invitations/accept', [
            'email' => $email, 'token' => $fragment['token'], 'password' => 'longPassword123', 'password_confirmation' => 'longPassword123',
        ])->assertNoContent();
        $this->postJson("/api/v1/admin/users/{$id}/invitation")->assertNotFound();
    }

    public function test_expiry_email_binding_and_email_edit_invalidate_links(): void
    {
        $admin = $this->admin();
        [$id, $token, $email] = $this->createInvite($admin);
        $payload = ['email' => 'other@example.test', 'token' => $token, 'password' => 'longPassword123', 'password_confirmation' => 'longPassword123'];
        $this->postJson('/api/v1/auth/invitations/accept', $payload)->assertUnprocessable();
        DB::table('account_invitations')->where('user_id', $id)->update(['expires_at' => now()->subSecond()]);
        $this->postJson('/api/v1/auth/invitations/accept', [...$payload, 'email' => $email])->assertUnprocessable();
        $this->patchJson("/api/v1/admin/users/{$id}", ['email' => 'changed@example.test'])->assertOk();
        $this->assertDatabaseCount('account_invitations', 0);
        $this->postJson('/api/v1/auth/invitations/accept', [...$payload, 'email' => $email])->assertUnprocessable();
        $this->postJson("/api/v1/admin/users/{$id}/invitation")->assertStatus(202);
        $this->assertDatabaseHas('account_invitations', ['user_id' => $id, 'email' => 'changed@example.test']);
    }

    public function test_mail_failure_keeps_account_and_allows_resend(): void
    {
        $admin = $this->admin();
        Mail::shouldReceive('to')->once()->andThrow(new \RuntimeException('Transport offline'));
        $response = $this->actingAs($admin, 'web')->postJson('/api/v1/admin/users', [
            'username' => 'mail_failed', 'email' => 'failed@example.test',
        ])->assertCreated()->assertJsonPath('data.invitation_delivery', 'pending');
        $id = $response->json('data.user.id');
        $this->assertDatabaseHas('users', ['id' => $id, 'invitation_pending' => true]);
        $this->assertDatabaseHas('account_invitations', ['user_id' => $id]);
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.created', 'target_id' => $id]);
    }

    public function test_log_mailer_never_records_invitation_secret(): void
    {
        config(['mail.default' => 'log']);
        Mail::fake();
        $response = $this->actingAs($this->admin(), 'web')->postJson('/api/v1/admin/users', [
            'username' => 'log_guard', 'email' => 'log-guard@example.test',
        ])->assertCreated()->assertJsonPath('data.invitation_delivery', 'pending');
        Mail::assertNothingSent();
        $this->assertDatabaseHas('account_invitations', ['user_id' => $response->json('data.user.id')]);
    }

    public function test_admin_only_validation_and_ineligible_resend(): void
    {
        $body = ['username' => 'new_person', 'email' => 'new@example.test'];
        $this->postJson('/api/v1/admin/users', $body)->assertUnauthorized();
        $this->actingAs(User::factory()->create(), 'web')->postJson('/api/v1/admin/users', $body)->assertForbidden();
        Auth::forgetGuards();
        $admin = $this->admin();
        $this->actingAs($admin, 'web');
        foreach (['password' => 'secret', 'role' => 'admin', 'invitation_pending' => false, 'account_status' => 'active'] as $key => $value) {
            $this->postJson('/api/v1/admin/users', $body + [$key => $value])->assertUnprocessable();
        }
        $this->postJson('/api/v1/admin/users', ['username' => 'bad space', 'email' => 'not-an-email'])->assertUnprocessable();
        $this->postJson('/api/v1/admin/users', ['username' => $admin->username, 'email' => 'new@example.test'])->assertUnprocessable();
        $this->postJson("/api/v1/admin/users/{$admin->id}/invitation")->assertNotFound();
        $this->postJson('/api/v1/admin/users/999999/invitation')->assertNotFound();
        $this->postJson('/api/v1/admin/users/01/invitation')->assertUnprocessable();
        $this->assertDatabaseCount('administrative_actions', 0);
    }

    public function test_restricted_and_banned_admin_cannot_create_or_resend(): void
    {
        $admin = $this->admin();
        [$id] = $this->createInvite($admin);
        foreach (['restricted', 'banned', 'deactivated'] as $status) {
            DB::table('users')->where('id', $admin->id)->update(['account_status' => $status]);
            $this->postJson('/api/v1/admin/users', ['username' => 'someone_else', 'email' => 'someone@example.test'])->assertForbidden();
            $this->postJson("/api/v1/admin/users/{$id}/invitation")->assertForbidden();
        }
        $this->assertDatabaseCount('administrative_actions', 1);
    }

    public function test_invited_user_cannot_log_in_before_acceptance_and_acceptance_does_not_log_them_in(): void
    {
        [$id, $token, $email] = $this->createInvite($this->admin());
        Auth::forgetGuards();
        $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'longPassword123'])->assertUnauthorized();
        $this->postJson('/api/v1/auth/invitations/accept', [
            'email' => $email, 'token' => $token, 'password' => 'short', 'password_confirmation' => 'short',
        ])->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $id, 'invitation_pending' => true]);
        $this->postJson('/api/v1/auth/invitations/accept', [
            'email' => $email, 'token' => $token, 'password' => 'longPassword123', 'password_confirmation' => 'longPassword123',
        ])->assertNoContent();
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'longPassword123'])->assertOk()
            ->assertJsonPath('data.id', $id);
    }

    public function test_banned_or_promoted_invited_user_cannot_activate(): void
    {
        $admin = $this->admin();
        [$id, $token, $email] = $this->createInvite($admin);
        $body = ['email' => $email, 'token' => $token, 'password' => 'longPassword123', 'password_confirmation' => 'longPassword123'];
        foreach (['banned', 'deactivated'] as $status) {
            DB::table('users')->where('id', $id)->update(['account_status' => $status]);
            $this->postJson('/api/v1/auth/invitations/accept', $body)->assertUnprocessable()
                ->assertJsonPath('errors.invitation.0', 'This invitation is invalid or expired.');
        }
        DB::table('users')->where('id', $id)->update(['account_status' => 'active', 'role' => 'moderator']);
        $this->postJson('/api/v1/auth/invitations/accept', $body)->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $id, 'invitation_pending' => true]);
    }

    public function test_resend_is_limited_per_target(): void
    {
        [$id] = $this->createInvite($this->admin());
        Mail::fake();
        for ($i = 0; $i < 3; $i++) $this->postJson("/api/v1/admin/users/{$id}/invitation")->assertStatus(202);
        $this->postJson("/api/v1/admin/users/{$id}/invitation")->assertTooManyRequests()->assertHeader('Retry-After');
        Mail::assertSent(AccountInvitationMail::class, 3);
        $this->assertDatabaseCount('account_invitations', 1);
        $this->assertSame(3, DB::table('administrative_actions')->where('action', 'user.invitation_resent')->count());
    }

    public function test_creation_rolls_back_when_audit_fails(): void
    {
        $admin = $this->admin();
        Mail::fake();
        AdministrativeAction::creating(fn () => throw new \RuntimeException('Simulated audit write failure'));
        try {
            $this->actingAs($admin, 'web')->postJson('/api/v1/admin/users', [
                'username' => 'rollback_user', 'email' => 'rollback@example.test',
            ])->assertStatus(500)->assertJsonPath('code', 'INTERNAL_ERROR');
        } finally {
            AdministrativeAction::flushEventListeners();
        }
        $this->assertDatabaseMissing('users', ['username' => 'rollback_user']);
        $this->assertDatabaseCount('account_invitations', 0);
        $this->assertDatabaseCount('administrative_actions', 0);
        Mail::assertNothingSent();
    }

    public function test_duplicate_creation_is_safe_and_does_not_issue_another_token(): void
    {
        $admin = $this->admin();
        [$id] = $this->createInvite($admin);
        $this->postJson('/api/v1/admin/users', [
            'username' => 'invited_one', 'email' => 'invited@example.test',
        ])->assertUnprocessable();
        $this->assertDatabaseCount('account_invitations', 1);
        $this->assertSame(1, DB::table('administrative_actions')->where('action', 'user.created')->count());
        $this->assertDatabaseHas('users', ['id' => $id, 'invitation_pending' => true]);
    }

    public function test_acceptance_failure_rolls_back_password_and_token_consumption(): void
    {
        [$id, $token, $email] = $this->createInvite($this->admin());
        Auth::forgetGuards();
        User::saving(function (User $user) use ($id): void {
            if ($user->id === $id && $user->isDirty('invitation_pending') && ! $user->invitation_pending) {
                throw new \RuntimeException('Simulated write failure');
            }
        });
        try {
            $this->postJson('/api/v1/auth/invitations/accept', [
                'email' => $email, 'token' => $token, 'password' => 'longPassword123', 'password_confirmation' => 'longPassword123',
            ])->assertStatus(500)->assertJsonPath('code', 'INTERNAL_ERROR');
        } finally { User::flushEventListeners(); }
        $this->assertDatabaseHas('users', ['id' => $id, 'invitation_pending' => true, 'email_verified_at' => null]);
        $this->assertDatabaseHas('account_invitations', ['user_id' => $id, 'token_hash' => hash('sha256', $token)]);
    }

    public function test_invitation_mutations_require_csrf_in_stateful_browser_requests(): void
    {
        $admin = $this->admin();
        $this->app->instance('env', 'local');
        $this->actingAs($admin, 'web')->withHeader('Origin', 'http://localhost:5173');
        $body = ['username' => 'csrf_user', 'email' => 'csrf@example.test'];
        $this->postJson('/api/v1/admin/users', $body)->assertStatus(419)->assertHeader('Cache-Control', 'no-store, private');
        $bootstrap = $this->getJson('/sanctum/csrf-cookie');
        $this->withHeader('X-XSRF-TOKEN', $bootstrap->getCookie('XSRF-TOKEN', false)->getValue());
        Mail::fake();
        $this->postJson('/api/v1/admin/users', $body)->assertCreated();
    }
}
