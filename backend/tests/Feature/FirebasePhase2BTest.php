<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FirebaseAuthentication;
use App\Services\FirebaseIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth as LaravelAuth;
use Kreait\Firebase\Auth\UserRecord;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\EmailNotFound;
use Kreait\Firebase\Exception\Auth\InvalidOobCode;
use Mockery;
use Tests\TestCase;

class FirebasePhase2BTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('firebase_auth.mode', 'firebase');
    }

    private function identity(bool $verified = false, string $email = 'fan@example.com'): void
    {
        $service = Mockery::mock(FirebaseAuthentication::class);
        $service->shouldReceive('verify')->andReturn(new FirebaseIdentity('firebase-uid-1', $email, $verified));
        $service->shouldReceive('lookup')->andReturn(new FirebaseIdentity('firebase-uid-1', $email, $verified));
        $this->app->instance(FirebaseAuthentication::class, $service);
    }

    private function linked(array $attributes = []): User
    {
        $user = User::factory()->create(array_merge(['email' => 'fan@example.com'], $attributes));
        $user->firebase_uid = 'firebase-uid-1';
        $user->save();

        return $user;
    }

    public function test_registration_creates_a_local_user_with_selected_username_and_no_sql_password(): void
    {
        $this->identity();
        $this->postJson('/api/v1/auth/firebase/register', ['id_token' => 'token', 'username' => 'Movie_Fan'])
            ->assertCreated()->assertJsonPath('data.username', 'movie_fan');
        $user = User::query()->sole();
        $this->assertSame('firebase-uid-1', $user->firebase_uid);
        $this->assertNull($user->password);
        $this->assertNull($user->email_verified_at);
        $this->assertSame(User::ROLE_USER, $user->role);
        LaravelAuth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertOk();
        $this->getJson('/api/v1/me/access')->assertForbidden();
    }

    public function test_registration_rejects_reserved_and_taken_usernames_without_provisioning(): void
    {
        $this->postJson('/api/v1/auth/firebase/register', ['id_token' => 'token', 'username' => 'admin'])
            ->assertUnprocessable()->assertJsonValidationErrors('username');
        User::factory()->create(['username' => 'movie_fan']);
        $this->identity();
        $this->postJson('/api/v1/auth/firebase/register', ['id_token' => 'token', 'username' => 'movie_fan'])
            ->assertUnprocessable()->assertJsonValidationErrors('username');
        $this->assertDatabaseCount('users', 1);
    }

    public function test_registration_retry_with_same_uid_does_not_create_a_second_user(): void
    {
        $existing = $this->linked(['username' => 'movie_fan']);
        $this->identity();
        $this->postJson('/api/v1/auth/firebase/register', ['id_token' => 'token', 'username' => 'movie_fan'])
            ->assertOk()->assertJsonPath('data.id', $existing->id);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_verification_status_uses_firebase_truth_and_syncs_email_changes(): void
    {
        $user = $this->linked(['email_verified_at' => now()]);
        $this->actingAs($user, 'web');
        $this->identity(false, 'new@example.com');
        $this->getJson('/api/v1/auth/email/verification-status')->assertOk()
            ->assertJsonPath('data.email', 'new@example.com')->assertJsonPath('data.email_verified_at', null);
        $user->refresh();
        $this->assertNotNull($user->password_session_version);
        $this->getJson('/api/v1/me/access')->assertForbidden();
    }

    public function test_verification_status_marks_email_verified_only_from_firebase_and_resend_uses_admin_sdk(): void
    {
        $user = $this->linked(['email_verified_at' => null]);
        $this->actingAs($user, 'web');
        $this->identity(false);
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('sendEmailVerificationLink')->once()->with('fan@example.com', Mockery::type('array'));
        $this->app->instance(Auth::class, $firebase);
        $this->postJson('/api/v1/auth/email/verification-notification')->assertOk();
        $this->assertNull($user->fresh()->email_verified_at);
        $this->identity(true);
        $this->getJson('/api/v1/auth/email/verification-status')->assertOk()->assertJsonPath('data.email', 'fan@example.com');
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_firebase_email_collision_does_not_take_another_local_identity(): void
    {
        $user = $this->linked(['email_verified_at' => now(), 'password_session_version' => 'old-version']);
        User::factory()->create(['email' => 'new@example.com']);
        $this->actingAs($user, 'web')->withSession(['password_session_version' => 'old-version']);
        $this->identity(true, 'new@example.com');
        $this->getJson('/api/v1/auth/email/verification-status')->assertStatus(409)->assertJsonPath('code', 'IDENTITY_CONFLICT');
        $this->assertSame('fan@example.com', $user->fresh()->email);
        $this->assertNull($user->fresh()->email_verified_at);
        $this->assertNotSame('old-version', $user->fresh()->password_session_version);
    }

    public function test_password_reset_forwards_to_firebase_without_updating_sql_password_and_revokes_sessions(): void
    {
        $user = $this->linked(['password' => 'Legacy-password123', 'password_session_version' => 'old-version']);
        $oldHash = $user->password;
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('verifyPasswordResetCode')->once()->with('reset-code')->andReturn('fan@example.com');
        $firebase->shouldReceive('getUserByEmail')->once()->andReturn(UserRecord::fromResponseData([
            'localId' => 'firebase-uid-1', 'email' => 'fan@example.com', 'emailVerified' => true,
            'createdAt' => '2026-01-01T00:00:00Z',
            'passwordUpdatedAt' => '2026-01-01T00:00:00Z',
        ]));
        $firebase->shouldReceive('confirmPasswordReset')->once()->with('reset-code', 'New-password123', true)->andReturn('fan@example.com');
        $this->app->instance(Auth::class, $firebase);
        $this->postJson('/api/v1/auth/firebase/password/reset', [
            'oob_code' => 'reset-code', 'password' => 'New-password123', 'password_confirmation' => 'New-password123',
        ])->assertNoContent();
        $this->assertSame($oldHash, $user->fresh()->password);
        $this->assertNotSame('old-version', $user->fresh()->password_session_version);
        $this->actingAs($user, 'web')->withSession(['password_session_version' => 'old-version'])
            ->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_invalid_reset_code_does_not_change_local_session_version(): void
    {
        $user = $this->linked(['password_session_version' => 'old-version']);
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('verifyPasswordResetCode')->once()->andThrow(new InvalidOobCode('bad code'));
        $this->app->instance(Auth::class, $firebase);
        $this->postJson('/api/v1/auth/firebase/password/reset', [
            'oob_code' => 'bad', 'password' => 'New-password123', 'password_confirmation' => 'New-password123',
        ])->assertUnprocessable()->assertJsonPath('code', 'RESET_LINK_INVALID');
        $this->assertSame('old-version', $user->fresh()->password_session_version);
    }

    public function test_forgot_password_does_not_disclose_account_existence(): void
    {
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUserByEmail')->once()->with('unknown@example.com')
            ->andThrow(new EmailNotFound);
        $this->app->instance(Auth::class, $firebase);
        $this->postJson('/api/v1/auth/firebase/password/forgot', ['email' => 'UNKNOWN@example.com'])
            ->assertStatus(202)->assertJsonPath('message', 'If an account exists, a reset email has been sent.');
    }

    public function test_forgot_password_sends_only_for_password_identities_with_same_generic_response(): void
    {
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUserByEmail')->once()->with('sso@example.com')
            ->andReturn(UserRecord::fromResponseData([
                'localId' => 'sso-uid', 'email' => 'sso@example.com',
                'createdAt' => '2026-01-01T00:00:00Z',
                'providerUserInfo' => [['rawId' => 'google-id', 'providerId' => 'google.com']],
            ]));
        $firebase->shouldNotReceive('sendPasswordResetLink');
        $this->app->instance(Auth::class, $firebase);
        $this->postJson('/api/v1/auth/firebase/password/forgot', ['email' => 'sso@example.com'])
            ->assertStatus(202)->assertJsonPath('message', 'If an account exists, a reset email has been sent.');
    }

    public function test_forgot_password_sends_firebase_email_for_password_credential(): void
    {
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUserByEmail')->once()->with('fan@example.com')
            ->andReturn(UserRecord::fromResponseData([
                'localId' => 'firebase-uid-1', 'email' => 'fan@example.com',
                'createdAt' => '2026-01-01T00:00:00Z', 'passwordUpdatedAt' => '2026-01-01T00:00:00Z',
            ]));
        $firebase->shouldReceive('sendPasswordResetLink')->once()->with('fan@example.com', Mockery::type('array'));
        $this->app->instance(Auth::class, $firebase);
        $this->postJson('/api/v1/auth/firebase/password/forgot', ['email' => 'FAN@example.com'])
            ->assertStatus(202)->assertJsonPath('message', 'If an account exists, a reset email has been sent.');
    }

    public function test_reset_code_for_sso_only_identity_cannot_add_password_or_revoke_sessions(): void
    {
        $user = $this->linked(['password_session_version' => 'old-version']);
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('verifyPasswordResetCode')->once()->with('sso-code')->andReturn('fan@example.com');
        $firebase->shouldReceive('getUserByEmail')->once()->with('fan@example.com')
            ->andReturn(UserRecord::fromResponseData([
                'localId' => 'firebase-uid-1', 'email' => 'fan@example.com',
                'createdAt' => '2026-01-01T00:00:00Z',
                'providerUserInfo' => [['rawId' => 'google-id', 'providerId' => 'google.com']],
            ]));
        $firebase->shouldNotReceive('confirmPasswordReset');
        $this->app->instance(Auth::class, $firebase);
        $this->postJson('/api/v1/auth/firebase/password/reset', [
            'oob_code' => 'sso-code', 'password' => 'New-password123',
            'password_confirmation' => 'New-password123',
        ])->assertUnprocessable()->assertJsonPath('code', 'RESET_LINK_INVALID');
        $this->assertSame('old-version', $user->fresh()->password_session_version);
    }

    public function test_legacy_password_management_is_closed_in_firebase_mode(): void
    {
        $this->postJson('/api/v1/auth/password/reset', [])->assertNotFound();
        $this->postJson('/api/v1/auth/invitations/accept', [])->assertNotFound();
    }

    public function test_operator_link_requires_a_verified_matching_identity_and_preserves_local_account(): void
    {
        $user = User::factory()->create([
            'email' => 'fan@example.com', 'role' => User::ROLE_ADMIN,
            'account_status' => User::STATUS_RESTRICTED,
        ]);
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('getUser')->twice()->with('firebase-uid-1')->andReturn(
            UserRecord::fromResponseData([
                'localId' => 'firebase-uid-1', 'email' => 'other@example.com',
                'emailVerified' => true, 'createdAt' => '2026-01-01T00:00:00Z',
            ]),
            UserRecord::fromResponseData([
                'localId' => 'firebase-uid-1', 'email' => 'fan@example.com',
                'emailVerified' => true, 'createdAt' => '2026-01-01T00:00:00Z',
            ]),
        );
        $this->app->instance(Auth::class, $firebase);
        $this->artisan('vybe:firebase-link', ['user_id' => $user->id, 'firebase_uid' => 'firebase-uid-1'])
            ->assertExitCode(1);
        $this->assertNull($user->fresh()->firebase_uid);
        $this->artisan('vybe:firebase-link', ['user_id' => $user->id, 'firebase_uid' => 'firebase-uid-1'])
            ->assertExitCode(0);
        $user->refresh();
        $this->assertSame('firebase-uid-1', $user->firebase_uid);
        $this->assertSame(User::ROLE_ADMIN, $user->role);
        $this->assertSame(User::STATUS_RESTRICTED, $user->account_status);
        $this->assertNotNull($user->password_session_version);
        $this->assertDatabaseCount('users', 1);
    }
}
