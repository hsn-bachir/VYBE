<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth as LaravelAuth;
use Kreait\Firebase\Auth\UserRecord;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;
use Lcobucci\JWT\Token\DataSet;
use Lcobucci\JWT\UnencryptedToken;
use Mockery;
use Tests\TestCase;

class FirebaseSocialTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('firebase_auth.mode', 'firebase');
        config()->set('firebase_auth.project_id', 'vybe-test');
    }

    private function firebase(string $provider = 'google.com', ?string $email = 'social@example.com', bool $verified = true, int $calls = 1, ?int $lookups = null): void
    {
        $token = Mockery::mock(UnencryptedToken::class);
        $token->shouldReceive('claims')->andReturn(new DataSet([
            'sub' => 'social-uid', 'aud' => ['vybe-test'],
            'iss' => 'https://securetoken.google.com/vybe-test', 'auth_time' => time(),
            'firebase' => ['sign_in_provider' => $provider],
        ], ''));
        $record = UserRecord::fromResponseData([
            'localId' => 'social-uid', 'email' => $email,
            'emailVerified' => $verified, 'createdAt' => '2026-01-01T00:00:00Z',
        ]);
        $auth = Mockery::mock(Auth::class);
        $auth->shouldReceive('verifyIdToken')->times($calls)->with('social-token', true)->andReturn($token);
        $auth->shouldReceive('getUser')->times($lookups ?? $calls)->with('social-uid')->andReturn($record);
        $this->app->instance(Auth::class, $auth);
    }

    private function linked(array $attributes = []): User
    {
        $user = User::factory()->create(array_merge(['email' => 'social@example.com'], $attributes));
        $user->firebase_uid = 'social-uid';
        $user->save();

        return $user;
    }

    public function test_new_google_and_github_users_choose_a_username_before_sql_provisioning(): void
    {
        foreach (['google.com', 'github.com'] as $provider) {
            $this->firebase($provider, calls: 2);
            $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => $provider])
                ->assertStatus(202)->assertJsonPath('code', 'USERNAME_REQUIRED');
            $this->assertDatabaseCount('users', 0);
            $this->postJson('/api/v1/auth/firebase/register', ['id_token' => 'social-token', 'username' => 'Cinema_Club'])
                ->assertCreated()->assertJsonPath('data.username', 'cinema_club');
            $user = User::query()->sole();
            $this->assertSame('social-uid', $user->firebase_uid);
            $this->assertNull($user->password);
            $this->postJson('/api/v1/auth/logout')->assertNoContent();
            $user->delete();
        }
    }

    public function test_generic_exchange_cannot_assign_a_generated_username_to_a_new_social_uid(): void
    {
        $this->firebase('google.com');
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'social-token'])
            ->assertStatus(202)->assertJsonPath('code', 'USERNAME_REQUIRED');
        $this->assertGuest('web');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_existing_firebase_uid_keeps_sql_identity_role_and_session_for_google_or_github(): void
    {
        foreach (['google.com', 'github.com'] as $provider) {
            $user = $this->linked(['role' => User::ROLE_ADMIN]);
            $this->firebase($provider);
            $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => $provider])
                ->assertOk()->assertJsonPath('data.id', $user->id);
            LaravelAuth::forgetGuards();
            $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $user->id);
            $this->getJson('/api/v1/admin/users')->assertOk();
            $this->postJson('/api/v1/auth/logout')->assertNoContent();
            $user->delete();
        }
        $this->assertDatabaseCount('users', 0);
    }

    public function test_missing_github_email_and_unverified_email_cannot_bypass_verification(): void
    {
        $this->firebase('github.com', null);
        $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'github.com'])
            ->assertUnprocessable()->assertJsonPath('code', 'EMAIL_REQUIRED');
        $this->assertDatabaseCount('users', 0);

        $this->firebase('github.com', 'social@example.com', false, 2);
        $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'github.com'])
            ->assertStatus(202);
        $this->postJson('/api/v1/auth/firebase/register', ['id_token' => 'social-token', 'username' => 'social_user'])
            ->assertCreated()->assertJsonPath('data.email_verified_at', null);
        $this->getJson('/api/v1/me/access')->assertForbidden();
    }

    public function test_provider_claim_and_existing_sql_email_conflicts_fail_closed(): void
    {
        $this->firebase('google.com', lookups: 0);
        $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'github.com'])
            ->assertUnauthorized();
        $this->assertDatabaseCount('users', 0);

        User::factory()->create(['email' => 'social@example.com']);
        $this->firebase('github.com');
        $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'github.com'])
            ->assertStatus(409)->assertJsonPath('code', 'IDENTITY_CONFLICT');
        $this->assertDatabaseCount('users', 1);
    }

    public function test_social_login_preserves_bans_and_restrictions(): void
    {
        $banned = $this->linked(['account_status' => User::STATUS_BANNED]);
        $this->firebase();
        $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'google.com'])->assertOk();
        LaravelAuth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertForbidden()->assertJsonPath('code', 'ACCOUNT_BANNED');
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        $banned->delete();

        $restricted = $this->linked(['account_status' => User::STATUS_RESTRICTED]);
        $this->firebase('github.com');
        $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'github.com'])->assertOk();
        LaravelAuth::forgetGuards();
        $this->getJson('/api/v1/me/access')->assertOk()->assertJsonPath('data.account_status', 'restricted');
        $this->putJson('/api/v1/me/ratings/123', ['rating' => 4])->assertForbidden();
    }

    public function test_provider_link_authorization_requires_the_same_uid_and_a_session(): void
    {
        $user = $this->linked();
        $this->firebase();
        $this->postJson('/api/v1/auth/firebase/link/authorize', ['id_token' => 'social-token'])->assertUnauthorized();
        $this->actingAs($user, 'web');
        $this->postJson('/api/v1/auth/firebase/link/authorize', ['id_token' => 'social-token'])->assertNoContent();

        $other = User::factory()->create(['email' => 'other@example.com']);
        $other->firebase_uid = 'other-uid';
        $other->save();
        LaravelAuth::forgetGuards();
        $this->actingAs($other, 'web');
        $this->firebase();
        $this->postJson('/api/v1/auth/firebase/link/authorize', ['id_token' => 'social-token'])
            ->assertForbidden()->assertJsonPath('code', 'IDENTITY_MISMATCH');
    }

    public function test_social_exchange_requires_csrf_and_sanitizes_firebase_outages(): void
    {
        $this->app->instance('env', 'local');
        $this->withHeader('Origin', 'http://localhost:5173');
        $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'google.com'])
            ->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie')->getCookie('XSRF-TOKEN', false)->getValue();
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('verifyIdToken')->once()->andThrow(
            new FailedToVerifyToken('sensitive detail', 0, new \RuntimeException('network outage')));
        $this->app->instance(Auth::class, $firebase);
        $this->withHeader('X-XSRF-TOKEN', $csrf)
            ->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'google.com'])
            ->assertStatus(503)->assertDontSee('sensitive detail');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_social_exchange_uses_the_existing_token_and_ip_throttle(): void
    {
        $firebase = Mockery::mock(Auth::class);
        $firebase->shouldReceive('verifyIdToken')->times(5)->andThrow(new FailedToVerifyToken('invalid'));
        $this->app->instance(Auth::class, $firebase);
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'google.com'])
                ->assertUnauthorized();
        }
        $this->postJson('/api/v1/auth/firebase/social/session', ['id_token' => 'social-token', 'provider' => 'google.com'])
            ->assertTooManyRequests()->assertHeader('Retry-After');
    }
}
