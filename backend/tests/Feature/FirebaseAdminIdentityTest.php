<?php

namespace Tests\Feature;

use App\Mail\AccountInvitationMail;
use App\Models\AccountInvitation;
use App\Models\AdministrativeAction;
use App\Models\User;
use App\Services\FirebaseAdminIdentityService;
use App\Services\FirebaseAuthentication;
use App\Services\FirebaseIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Kreait\Firebase\Auth\UserRecord;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\EmailNotFound;
use Mockery;
use Tests\TestCase;

class FirebaseAdminIdentityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
{
    parent::setUp();

    config()->set('firebase_auth.mode', 'firebase');
    config()->set('firebase_auth.project_id', 'vybe-test');

    // Prevent tests from constructing the real Firebase Admin SDK.
    // Individual tests can replace this with their own strict mock.
    $this->app->instance(
        Auth::class,
        Mockery::mock(Auth::class)
    );

    Mail::fake();
}

    private function admin(string $role = 'admin', string $status = 'active'): User
    {
        $admin = User::factory()->create(['role' => $role, 'account_status' => $status]);
        $admin->firebase_uid = 'admin-uid';
        $admin->save();

        return $admin;
    }

    private function target(array $attributes = []): User
    {
        $user = User::factory()->create(array_merge(['email' => 'target@example.test'], $attributes));
        $user->firebase_uid = 'target-uid';
        $user->password = null;
        $user->save();

        return $user;
    }

    private function record(string $uid = 'target-uid', string $email = 'target@example.test', array $methods = ['password'], bool $verified = true): UserRecord
    {
        return UserRecord::fromResponseData([
            'localId' => $uid, 'email' => $email, 'emailVerified' => $verified,
            'createdAt' => '2026-01-01T00:00:00Z',
            ...(in_array('password', $methods, true) ? ['passwordUpdatedAt' => '2026-01-01T00:00:00Z'] : []),
            'providerUserInfo' => array_map(fn ($method) => ['rawId' => $email, 'providerId' => $method], $methods),
        ]);
    }

    private function fresh(string $uid = 'admin-uid'): void
    {
        $auth = Mockery::mock(FirebaseAuthentication::class);
        $auth->shouldReceive('verify')->andReturn(new FirebaseIdentity($uid, 'admin@example.test', true));
        $this->app->instance(FirebaseAuthentication::class, $auth);
    }

    public function test_create_and_accept_invitation_provisions_firebase_without_sql_password(): void
    {
        $admin = $this->admin();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUserByEmail')->twice()->with('invited@example.test')->andThrow(new EmailNotFound);
        $firebase->shouldReceive('createUser')->once()->withArgs(fn ($values) => $values['email'] === 'invited@example.test' && $values['emailVerified'] === false && ! isset($values['password']))
            ->andReturnUsing(fn ($values) => $this->record($values['uid'], $values['email'], [], false));
        $firebase->shouldReceive('getUser')->once()->andReturnUsing(fn ($uid) => $this->record($uid, 'invited@example.test', [], false));
        $firebase->shouldReceive('updateUser')->once()->withArgs(fn ($uid, $values) => str_starts_with($uid, 'vybe-invite-') && $values === ['password' => 'New-password123', 'emailVerified' => true])
            ->andReturnUsing(fn ($uid) => $this->record($uid, 'invited@example.test', ['password']));
        $firebase->shouldReceive('revokeRefreshTokens')->once();
        $this->app->instance(Auth::class, $firebase);
        $this->actingAs($admin, 'web')->postJson('/api/v1/admin/users', [
            'username' => 'invited_user', 'email' => 'invited@example.test', 'role' => 'moderator',
        ])->assertCreated()->assertJsonPath('data.user.role', 'moderator')->assertJsonPath('data.invitation_delivery', 'accepted');
        $user = User::query()->where('email', 'invited@example.test')->sole();
        $this->assertNull($user->password);
        $this->assertTrue($user->invitation_pending);
        Mail::assertSent(AccountInvitationMail::class, 1);
        $fragment = parse_url(Mail::sent(AccountInvitationMail::class)->first()->activationUrl, PHP_URL_FRAGMENT);
        parse_str($fragment, $params);
        $this->postJson('/api/v1/auth/firebase/invitations/accept', [
            'email' => 'invited@example.test', 'token' => $params['token'],
            'password' => 'New-password123', 'password_confirmation' => 'New-password123',
        ])->assertNoContent();
        $this->assertDatabaseHas('users', ['id' => $user->id, 'invitation_pending' => false, 'password' => null]);
        $this->assertDatabaseCount('account_invitations', 0);
        $this->postJson('/api/v1/auth/firebase/invitations/accept', [
            'email' => 'invited@example.test', 'token' => $params['token'],
            'password' => 'New-password123', 'password_confirmation' => 'New-password123',
        ])->assertUnprocessable();
    }

    public function test_existing_mapped_firebase_email_is_not_taken_over(): void
    {
        $admin = $this->admin();
        $owner = $this->target();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUserByEmail')->once()->andReturn($this->record('target-uid', 'invited@example.test'));
        $this->app->instance(Auth::class, $firebase);
        $this->actingAs($admin, 'web')->postJson('/api/v1/admin/users', [
            'username' => 'invited_user', 'email' => 'invited@example.test',
        ])->assertStatus(409)->assertJsonPath('code', 'IDENTITY_CONFLICT');
        $this->assertDatabaseCount('users', 2);
        $this->assertSame('target-uid', $owner->fresh()->firebase_uid);
    }

    public function test_existing_unmapped_firebase_identity_requires_both_invitation_and_sign_in_proof(): void
    {
        $admin = $this->admin();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUserByEmail')->twice()->with('existing@example.test')
            ->andReturn($this->record('existing-uid', 'existing@example.test', ['google.com'], false));
        $firebase->shouldReceive('getUser')->once()->with('existing-uid')
            ->andReturn($this->record('existing-uid', 'existing@example.test', ['google.com'], false));
        $firebase->shouldReceive('updateUser')->once()->with('existing-uid', ['emailVerified' => true])
            ->andReturn($this->record('existing-uid', 'existing@example.test', ['google.com']));
        $firebase->shouldReceive('revokeRefreshTokens')->once()->with('existing-uid');
        $this->app->instance(Auth::class, $firebase);
        $this->actingAs($admin, 'web')->postJson('/api/v1/admin/users', [
            'username' => 'existing_user', 'email' => 'existing@example.test',
        ])->assertCreated()->assertJsonPath('data.invitation_delivery', 'accepted');
        $user = User::query()->where('email', 'existing@example.test')->sole();
        $this->assertNull($user->firebase_uid);
        $this->assertTrue($user->invitation_pending);
        $mail = Mail::sent(AccountInvitationMail::class)->first();
        $this->assertStringContainsString('existing=1', $mail->activationUrl);
        parse_str(parse_url($mail->activationUrl, PHP_URL_FRAGMENT), $params);
        $this->postJson('/api/v1/auth/firebase/invitations/accept', [
            'email' => 'existing@example.test', 'token' => $params['token'], 'password' => 'New-password123',
            'password_confirmation' => 'New-password123',
        ])->assertUnprocessable();
        $auth = Mockery::mock(FirebaseAuthentication::class);
        $auth->shouldReceive('verify')->once()->with('existing-token')
            ->andReturn(new FirebaseIdentity('existing-uid', 'existing@example.test', false));
        $this->app->instance(FirebaseAuthentication::class, $auth);
        $this->postJson('/api/v1/auth/firebase/invitations/accept', [
            'email' => 'existing@example.test', 'token' => $params['token'], 'id_token' => 'existing-token',
        ])->assertNoContent();
        $this->assertSame('existing-uid', $user->fresh()->firebase_uid);
        $this->assertNull($user->fresh()->password);
        $this->assertFalse($user->fresh()->invitation_pending);
    }

    public function test_existing_identity_invitation_rejects_a_different_firebase_email(): void
    {
        $user = User::factory()->create(['email' => 'invited@example.test', 'email_verified_at' => null,
            'invitation_pending' => true, 'password' => null]);
        $token = str_repeat('c', 64);
        AccountInvitation::query()->create(['user_id' => $user->id, 'email' => $user->email,
            'token_hash' => hash('sha256', $token), 'expires_at' => now()->addHour()]);
        $auth = Mockery::mock(FirebaseAuthentication::class);
        $auth->shouldReceive('verify')->once()->with('wrong-token')
            ->andReturn(new FirebaseIdentity('wrong-uid', 'other@example.test', true));
        $this->app->instance(FirebaseAuthentication::class, $auth);
        $this->postJson('/api/v1/auth/firebase/invitations/accept', [
            'email' => 'invited@example.test', 'token' => $token, 'id_token' => 'wrong-token',
        ])->assertUnprocessable()->assertJsonValidationErrors('invitation');
        $this->assertNull($user->fresh()->firebase_uid);
        $this->assertDatabaseCount('account_invitations', 1);
    }

    public function test_duplicate_sql_username_or_email_is_rejected_before_firebase_provisioning(): void
    {
        $admin = $this->admin();
        User::factory()->create(['username' => 'taken_user', 'email' => 'taken@example.test']);
        $this->actingAs($admin, 'web')->postJson('/api/v1/admin/users', [
            'username' => 'taken_user', 'email' => 'fresh@example.test',
        ])->assertUnprocessable()->assertJsonValidationErrors('username');
        $this->postJson('/api/v1/admin/users', [
            'username' => 'fresh_user', 'email' => 'taken@example.test',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertDatabaseCount('users', 2);
    }

    public function test_only_active_verified_admin_can_create_and_moderator_cannot_reset(): void
    {
        $target = $this->target();
        $ordinary = User::factory()->create();
        $ordinary->firebase_uid = 'ordinary-uid';
        $ordinary->save();
        $this->actingAs($ordinary, 'web')->postJson('/api/v1/admin/users', [
            'username' => 'invited_user', 'email' => 'invited@example.test',
        ])->assertForbidden();
        $moderator = $this->admin('moderator');
        $this->actingAs($moderator, 'web')->postJson("/api/v1/admin/users/{$target->id}/password-reset", [])->assertForbidden();
        $this->postJson('/api/v1/admin/users', [
            'username' => 'invited_user', 'email' => 'invited@example.test',
        ])->assertForbidden();
        $banned = User::factory()->create(['role' => 'admin', 'account_status' => 'banned']);
        $this->actingAs($banned, 'web')->postJson('/api/v1/admin/users', [
            'username' => 'invited_user', 'email' => 'invited@example.test',
        ])->assertForbidden();
    }

    public function test_direct_password_change_requires_matching_one_use_firebase_confirmation_and_revokes_sessions(): void
    {
        config(['session.driver' => 'database', 'session.connection' => null]);
        $admin = $this->admin();
        $target = $this->target();
        DB::table('sessions')->insert(['id' => 'target-session', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUser')->with('target-uid')->andReturn($this->record());
        $firebase->shouldReceive('updateUser')->once()->with('target-uid', ['password' => 'New-password123'])->andReturn($this->record());
        $firebase->shouldReceive('revokeRefreshTokens')->once()->with('target-uid');
        $this->app->instance(Auth::class, $firebase);
        $this->fresh();
        $body = ['admin_id_token' => 'fresh-admin-token', 'password' => 'New-password123', 'password_confirmation' => 'New-password123'];
        $this->actingAs($admin, 'web')->putJson("/api/v1/admin/users/{$target->id}/password", $body)->assertNoContent();
        $this->assertDatabaseMissing('sessions', ['id' => 'target-session']);
        $this->assertNull($target->fresh()->password);
        $this->assertNotNull($target->fresh()->password_session_version);
        $this->putJson("/api/v1/admin/users/{$target->id}/password", $body)->assertStatus(409)->assertJsonPath('code', 'REAUTH_REPLAYED');
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.password_changed', 'target_id' => $target->id]);
    }

    public function test_sso_only_target_cannot_gain_password_from_admin_action(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUser')->andReturn($this->record(methods: ['google.com', 'github.com']));
        $this->app->instance(Auth::class, $firebase);
        $this->fresh();
        $this->actingAs($admin, 'web')->getJson("/api/v1/admin/users/{$target->id}/identity-methods")
            ->assertOk()->assertJsonPath('data.methods.0', 'google.com');
        $this->postJson("/api/v1/admin/users/{$target->id}/password-reset", [])->assertStatus(409)
            ->assertJsonPath('code', 'PASSWORD_PROVIDER_UNAVAILABLE');
        $this->putJson("/api/v1/admin/users/{$target->id}/password", [
            'admin_id_token' => 'fresh-admin-token', 'password' => 'New-password123', 'password_confirmation' => 'New-password123',
        ])->assertStatus(409)->assertJsonPath('code', 'PASSWORD_PROVIDER_UNAVAILABLE');
        $this->assertNull($target->fresh()->password_session_version);
    }

    public function test_email_change_resets_verification_and_keeps_firebase_uid(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUser')->once()->with('target-uid')->andReturn($this->record());
        $emailLookups = 0;
        $firebase->shouldReceive('getUserByEmail')->twice()->with('new@example.test')->andReturnUsing(function () use (&$emailLookups) {
            if (++$emailLookups === 1) {
                throw new EmailNotFound;
            }

            return $this->record(email: 'new@example.test', verified: false);
        });
        $firebase->shouldReceive('updateUser')->once()->with('target-uid', ['email' => 'new@example.test', 'emailVerified' => false])
            ->andReturn($this->record(email: 'new@example.test', verified: false));
        $firebase->shouldReceive('revokeRefreshTokens')->once()->with('target-uid');
        $this->app->instance(Auth::class, $firebase);
        $this->fresh();
        $this->actingAs($admin, 'web')->patchJson("/api/v1/admin/users/{$target->id}", [
            'email' => 'new@example.test', 'admin_id_token' => 'fresh-admin-token',
        ])->assertOk()->assertJsonPath('data.email_verified_at', null);
        $this->assertSame('target-uid', $target->fresh()->firebase_uid);
        $this->assertNotNull($target->fresh()->password_session_version);
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.updated', 'target_id' => $target->id]);
    }

    public function test_missing_or_mismatched_administrator_confirmation_cannot_change_credentials(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        $body = ['password' => 'New-password123', 'password_confirmation' => 'New-password123'];
        $this->actingAs($admin, 'web')->putJson("/api/v1/admin/users/{$target->id}/password", $body)
            ->assertUnprocessable()->assertJsonValidationErrors('admin_id_token');
        $this->fresh('another-uid');
        $this->putJson("/api/v1/admin/users/{$target->id}/password", $body + ['admin_id_token' => 'mismatch-token'])
            ->assertForbidden()->assertJsonPath('code', 'IDENTITY_MISMATCH');
        $this->assertNull($target->fresh()->password_session_version);
    }

    public function test_stale_administrator_confirmation_is_rejected_before_firebase_write(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        $auth = Mockery::mock(FirebaseAuthentication::class);
        $auth->shouldReceive('verify')->once()->andThrow(new HttpResponseException(
            response()->json(['message' => 'Firebase authentication must be recent and valid.'], 401)));
        $this->app->instance(FirebaseAuthentication::class, $auth);
        $this->actingAs($admin, 'web')->putJson("/api/v1/admin/users/{$target->id}/password", [
            'admin_id_token' => 'old-token', 'password' => 'New-password123', 'password_confirmation' => 'New-password123',
        ])->assertUnauthorized();
        $this->assertDatabaseCount('administrative_actions', 0);
    }

    public function test_password_method_comes_from_credential_metadata_even_without_provider_entry(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        $firebase = Mockery::mock(Auth::class);
        $record = UserRecord::fromResponseData([
            'localId' => 'target-uid', 'email' => 'target@example.test', 'emailVerified' => true,
            'createdAt' => '2026-01-01T00:00:00Z', 'passwordUpdatedAt' => '2026-01-02T00:00:00Z',
            'providerUserInfo' => [['rawId' => 'google-id', 'providerId' => 'google.com']],
        ]);
        $firebase->shouldReceive('getUser')->once()->with('target-uid')->andReturn($record);
        $this->app->instance(Auth::class, $firebase);
        $this->actingAs($admin, 'web')->getJson("/api/v1/admin/users/{$target->id}/identity-methods")
            ->assertOk()->assertJsonPath('data.methods.0', 'password')->assertJsonPath('data.methods.1', 'google.com');
    }

    public function test_cache_outage_fails_closed_before_administrator_password_write(): void
    {
        $admin = $this->admin();
        $this->fresh();
        $identity = app(FirebaseAdminIdentityService::class);
        Cache::shouldReceive('add')->once()->andThrow(new \RuntimeException('Cache unavailable'));
        try {
            $identity->confirm($admin, 'fresh-admin-token');
            $this->fail('Confirmation should fail when the cache is unavailable.');
        } catch (HttpResponseException $e) {
            $this->assertSame(503, $e->getResponse()->getStatusCode());
            $this->assertSame('REAUTH_UNAVAILABLE', $e->getResponse()->getData(true)['code']);
        }
        $this->assertDatabaseCount('administrative_actions', 0);
    }

    public function test_password_reset_uses_firebase_delivery_and_preserves_sso_methods(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUser')->twice()->with('target-uid')->andReturn($this->record(methods: ['password', 'google.com']));
        $firebase->shouldReceive('sendPasswordResetLink')->once()->with('target@example.test', Mockery::type('array'));
        $this->app->instance(Auth::class, $firebase);
        $this->actingAs($admin, 'web')->postJson("/api/v1/admin/users/{$target->id}/password-reset", [])
            ->assertStatus(202)->assertJsonPath('data.reset_delivery', 'accepted');
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.password_reset_initiated', 'target_id' => $target->id]);
        $this->assertNull($target->fresh()->password);
    }

    public function test_sql_email_collision_never_updates_firebase(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        User::factory()->create(['email' => 'taken@example.test']);
        $this->actingAs($admin, 'web')->patchJson("/api/v1/admin/users/{$target->id}", [
            'email' => 'taken@example.test', 'admin_id_token' => 'fresh-admin-token',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertSame('target@example.test', $target->fresh()->email);
    }

    public function test_firebase_email_collision_never_overwrites_another_uid(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUser')->once()->with('target-uid')->andReturn($this->record());
        $firebase->shouldReceive('getUserByEmail')->once()->with('taken@example.test')
            ->andReturn($this->record('other-uid', 'taken@example.test'));
        $this->app->instance(Auth::class, $firebase);
        $this->fresh();
        $this->actingAs($admin, 'web')->patchJson("/api/v1/admin/users/{$target->id}", [
            'email' => 'taken@example.test', 'admin_id_token' => 'fresh-admin-token',
        ])->assertStatus(409)->assertJsonPath('code', 'IDENTITY_CONFLICT');
        $this->assertSame('target@example.test', $target->fresh()->email);
        $this->assertNotNull($target->fresh()->password_session_version);
    }

    public function test_expired_invitation_is_not_accepted_or_sent_to_firebase(): void
    {
        $target = $this->target(['email_verified_at' => null, 'invitation_pending' => true]);
        AccountInvitation::query()->create(['user_id' => $target->id, 'email' => $target->email,
            'token_hash' => hash('sha256', str_repeat('a', 64)), 'expires_at' => now()->subMinute()]);
        $this->postJson('/api/v1/auth/firebase/invitations/accept', [
            'email' => $target->email, 'token' => str_repeat('a', 64),
            'password' => 'New-password123', 'password_confirmation' => 'New-password123',
        ])->assertUnprocessable()->assertJsonValidationErrors('invitation');
        $this->assertTrue($target->fresh()->invitation_pending);
    }

    public function test_failed_provisioning_keeps_one_pending_reservation_and_resend_recovers_it(): void
    {
        $admin = $this->admin();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUserByEmail')->twice()->with('retry@example.test')->andThrow(new EmailNotFound);
        $firebase->shouldReceive('createUser')->once()->andThrow(new \RuntimeException('Remote timeout'));
        $this->app->instance(Auth::class, $firebase);
        $body = ['username' => 'retry_user', 'email' => 'retry@example.test'];
        $this->actingAs($admin, 'web')->postJson('/api/v1/admin/users', $body)
            ->assertStatus(503)->assertJsonPath('code', 'IDENTITY_UNAVAILABLE');
        $reserved = User::query()->where('email', 'retry@example.test')->sole();
        $this->assertTrue($reserved->invitation_pending);
        $this->assertNull($reserved->password);
        $this->assertDatabaseCount('account_invitations', 0);
        $this->postJson('/api/v1/admin/users', $body)->assertUnprocessable();

        $recovered = Mockery::mock(Auth::class);
        $recovered->shouldReceive('getUserByEmail')->once()->with('retry@example.test')
            ->andReturn($this->record($reserved->firebase_uid, 'retry@example.test', [], false));
        $this->app->instance(Auth::class, $recovered);
        $this->postJson("/api/v1/admin/users/{$reserved->id}/invitation")
            ->assertStatus(202)->assertJsonPath('data.invitation_delivery', 'accepted');
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('account_invitations', 1);
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.created', 'target_id' => $reserved->id]);
    }

    public function test_log_mailer_reports_pending_instead_of_delivered_invitation(): void
    {
        config()->set('mail.default', 'log');
        $admin = $this->admin();
        $target = $this->target(['email_verified_at' => null, 'invitation_pending' => true]);
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUserByEmail')->once()->with($target->email)->andReturn($this->record());
        $this->app->instance(Auth::class, $firebase);
        $this->actingAs($admin, 'web')->postJson("/api/v1/admin/users/{$target->id}/invitation")
            ->assertStatus(202)->assertJsonPath('data.invitation_delivery', 'pending');
        Mail::assertNothingSent();
        $this->assertDatabaseCount('account_invitations', 1);
    }

    public function test_firebase_invitation_acceptance_can_retry_after_sql_failure(): void
    {
        $target = $this->target(['email_verified_at' => null, 'invitation_pending' => true]);
        $token = str_repeat('b', 64);
        AccountInvitation::query()->create(['user_id' => $target->id, 'email' => $target->email,
            'token_hash' => hash('sha256', $token), 'expires_at' => now()->addHour()]);
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUser')->twice()->with('target-uid')->andReturn($this->record(verified: false));
        $firebase->shouldReceive('updateUser')->twice()->with('target-uid', ['password' => 'New-password123', 'emailVerified' => true])
            ->andReturn($this->record());
        $firebase->shouldReceive('revokeRefreshTokens')->twice()->with('target-uid');
        $this->app->instance(Auth::class, $firebase);
        $body = ['email' => $target->email, 'token' => $token,
            'password' => 'New-password123', 'password_confirmation' => 'New-password123'];
        User::saving(function (User $user) use ($target): void {
            if ($user->id === $target->id && $user->isDirty('invitation_pending') && ! $user->invitation_pending) {
                throw new \RuntimeException('Simulated SQL failure');
            }
        });
        try {
            $this->postJson('/api/v1/auth/firebase/invitations/accept', $body)->assertStatus(500);
        } finally {
            User::flushEventListeners();
        }
        $this->assertTrue($target->fresh()->invitation_pending);
        $this->assertDatabaseCount('account_invitations', 1);
        $this->postJson('/api/v1/auth/firebase/invitations/accept', $body)->assertNoContent();
        $this->assertFalse($target->fresh()->invitation_pending);
        $this->assertNull($target->fresh()->password);
    }

    public function test_firebase_reset_delivery_failure_is_reported_without_issuing_laravel_reset_token(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUser')->twice()->with('target-uid')->andReturn($this->record());
        $firebase->shouldReceive('sendPasswordResetLink')->once()->andThrow(new \RuntimeException('Remote failure'));
        $this->app->instance(Auth::class, $firebase);
        $this->actingAs($admin, 'web')->postJson("/api/v1/admin/users/{$target->id}/password-reset", [])
            ->assertStatus(503)->assertJsonPath('code', 'IDENTITY_UNAVAILABLE');
        $this->assertDatabaseCount('password_reset_tokens', 0);
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.password_reset_delivery_failed', 'target_id' => $target->id]);
    }

    public function test_email_change_retries_after_sql_audit_failure_with_old_sessions_revoked(): void
    {
        $admin = $this->admin();
        $target = $this->target();
        $firebase = Mockery::mock(Auth::class);
        $recordLookups = 0;
        $firebase->shouldReceive('getUser')->twice()->with('target-uid')->andReturnUsing(function () use (&$recordLookups) {
            return ++$recordLookups === 1 ? $this->record() : $this->record(email: 'new@example.test', verified: false);
        });
        $emailLookups = 0;
        $firebase->shouldReceive('getUserByEmail')->times(4)->with('new@example.test')->andReturnUsing(function () use (&$emailLookups) {
            if (++$emailLookups === 1) {
                throw new EmailNotFound;
            }

            return $this->record(email: 'new@example.test', verified: false);
        });
        $firebase->shouldReceive('updateUser')->once()->with('target-uid', ['email' => 'new@example.test', 'emailVerified' => false])
            ->andReturn($this->record(email: 'new@example.test', verified: false));
        $firebase->shouldReceive('revokeRefreshTokens')->once()->with('target-uid');
        $this->app->instance(Auth::class, $firebase);
        $this->fresh();
        AdministrativeAction::creating(function (AdministrativeAction $action): void {
            if ($action->action === 'user.updated') {
                throw new \RuntimeException('Simulated SQL audit failure');
            }
        });
        $body = ['email' => 'new@example.test', 'admin_id_token' => 'first-admin-token'];
        try {
            $this->actingAs($admin, 'web')->patchJson("/api/v1/admin/users/{$target->id}", $body)->assertStatus(500);
        } finally {
            AdministrativeAction::flushEventListeners();
        }
        $this->assertSame('target@example.test', $target->fresh()->email);
        $this->assertNotNull($target->fresh()->password_session_version);
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.email_change_requested', 'target_id' => $target->id]);
        $this->patchJson("/api/v1/admin/users/{$target->id}", ['email' => 'new@example.test', 'admin_id_token' => 'second-admin-token'])
            ->assertOk()->assertJsonPath('data.email', 'new@example.test');
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.updated', 'target_id' => $target->id]);
    }
}
