<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FirebaseAuthentication;
use App\Services\FirebaseIdentity;
use App\Services\FirebaseUserResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth as LaravelAuth;
use Illuminate\Support\Facades\DB;
use Kreait\Firebase\Auth\UserRecord;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;
use Kreait\Firebase\Exception\Auth\RevokedIdToken;
use Lcobucci\JWT\Token\DataSet;
use Lcobucci\JWT\UnencryptedToken;
use Mockery;
use Tests\TestCase;

class FirebaseSessionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('firebase_auth.mode', 'firebase');
        config()->set('firebase_auth.project_id', 'vybe-test');
    }

    private function token(array $claims = []): UnencryptedToken
    {
        $token = Mockery::mock(UnencryptedToken::class);
        $token->shouldReceive('claims')->andReturn(new DataSet(array_merge([
            'sub' => 'firebase-user-1', 'aud' => ['vybe-test'],
            'iss' => 'https://securetoken.google.com/vybe-test', 'auth_time' => time(),
        ], $claims), ''));

        return $token;
    }

    private function firebase(?UnencryptedToken $token = null, array $record = []): void
    {
        $auth = Mockery::mock(Auth::class);
        $auth->shouldReceive('verifyIdToken')->once()->with('test-token', true)->andReturn($token ?? $this->token());
        $auth->shouldReceive('getUser')->once()->with('firebase-user-1')->andReturn(UserRecord::fromResponseData(array_merge([
            'localId' => 'firebase-user-1', 'email' => 'fan@example.com',
            'emailVerified' => true, 'createdAt' => '2026-01-01T00:00:00Z',
        ], $record)));
        $this->app->instance(Auth::class, $auth);
    }

    public function test_fresh_token_provisions_one_local_user_and_persists_a_rotated_session(): void
    {
        $this->firebase();
        $this->getJson('/sanctum/csrf-cookie')->assertNoContent();
        $oldId = session()->getId();
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertOk()
            ->assertJsonPath('data.email', 'fan@example.com')->assertJsonMissingPath('data.firebase_uid');
        $user = User::query()->sole();
        $this->assertSame('firebase-user-1', $user->firebase_uid);
        $this->assertNull($user->password);
        $this->assertNotNull($user->email_verified_at);
        $this->assertMatchesRegularExpression('/^[a-z0-9_]{3,30}$/', $user->username);
        $this->assertNotSame($oldId, session()->getId());
        LaravelAuth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $user->id);
        $this->getJson('/api/v1/me/access')->assertOk()->assertJsonPath('data.role', 'user');
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        LaravelAuth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_existing_uid_resolves_without_changing_user_id_or_role(): void
    {
        $user = User::factory()->create(['email' => 'fan@example.com', 'role' => User::ROLE_ADMIN]);
        $user->firebase_uid = 'firebase-user-1';
        $user->save();
        $this->firebase();
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertOk()->assertJsonPath('data.id', $user->id);
        $this->assertDatabaseCount('users', 1);
        $this->getJson('/api/v1/admin/users')->assertOk();
    }

    public function test_email_collision_cannot_link_an_unrelated_account(): void
    {
        User::factory()->create(['email' => 'fan@example.com']);
        $this->firebase();
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])
            ->assertStatus(409)->assertJsonPath('code', 'IDENTITY_CONFLICT');
        $this->assertGuest('web');
        $this->assertDatabaseCount('users', 1);
    }

    public function test_provisioning_retries_username_collision_and_converges_on_one_uid(): void
    {
        $firstCandidate = 'fan_'.substr(hash('sha256', 'firebase-user-1:0'), 0, 10);
        User::factory()->create(['username' => $firstCandidate, 'email' => 'other@example.com']);
        $identity = new FirebaseIdentity('firebase-user-1', 'fan@example.com', false);
        $resolver = app(FirebaseUserResolver::class);
        $first = $resolver->resolve($identity);
        $second = $resolver->resolve($identity);
        $this->assertSame($first->id, $second->id);
        $this->assertNotSame($firstCandidate, $first->username);
        $this->assertDatabaseCount('users', 2);
    }

    public function test_first_sign_in_converges_if_another_request_inserts_the_same_uid(): void
    {
        $inserted = false;
        User::creating(function (User $candidate) use (&$inserted): void {
            if ($candidate->firebase_uid !== 'firebase-user-1' || $inserted) {
                return;
            }
            $inserted = true;
            DB::table('users')->insert([
                'username' => 'winner_123', 'email' => 'fan@example.com',
                'firebase_uid' => 'firebase-user-1', 'password' => null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        });
        $resolved = app(FirebaseUserResolver::class)->resolve(new FirebaseIdentity('firebase-user-1', 'fan@example.com', false));
        $this->assertSame('winner_123', $resolved->username);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_recent_authentication_and_expected_project_are_required(): void
    {
        foreach ([['auth_time' => time() - 600], ['aud' => ['other-project']], ['aud' => ['vybe-test', 'other-project']]] as $claims) {
            $auth = Mockery::mock(Auth::class);
            $auth->shouldReceive('verifyIdToken')->once()->andReturn($this->token($claims));
            $auth->shouldNotReceive('getUser');
            $this->app->instance(Auth::class, $auth);
            $this->app->forgetInstance(FirebaseAuthentication::class);
            $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertUnauthorized();
        }
        $this->assertDatabaseCount('users', 0);
    }

    public function test_invalid_expired_and_revoked_tokens_are_rejected(): void
    {
        foreach ([new FailedToVerifyToken('invalid'), new FailedToVerifyToken('expired')] as $failure) {
            $auth = Mockery::mock(Auth::class);
            $auth->shouldReceive('verifyIdToken')->once()->andThrow($failure);
            $this->app->instance(Auth::class, $auth);
            $this->app->forgetInstance(FirebaseAuthentication::class);
            $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertUnauthorized();
        }
        $auth = Mockery::mock(Auth::class);
        $auth->shouldReceive('verifyIdToken')->once()->andThrow(new RevokedIdToken($this->token()));
        $this->app->instance(Auth::class, $auth);
        $this->app->forgetInstance(FirebaseAuthentication::class);
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertUnauthorized();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_firebase_unavailable_and_disabled_user_fail_closed(): void
    {
        $auth = Mockery::mock(Auth::class);
        $auth->shouldReceive('verifyIdToken')->once()->andThrow(new FailedToVerifyToken('backend detail', 0, new \RuntimeException('offline')));
        $this->app->instance(Auth::class, $auth);
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertStatus(503)->assertDontSee('backend detail');
        $this->app->forgetInstance(FirebaseAuthentication::class);
        $this->firebase(record: ['disabled' => true]);
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertUnauthorized();
    }

    public function test_existing_session_cannot_switch_identity_and_legacy_password_login_is_closed(): void
    {
        $user = User::factory()->create(['password' => 'Cinema-lover123']);
        $this->actingAs($user, 'web');
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertStatus(409);
        $this->assertAuthenticatedAs($user, 'web');
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Cinema-lover123'])->assertNotFound();
        $this->postJson('/api/v1/auth/register', [
            'username' => 'another_user', 'email' => 'another@example.com',
            'password' => 'Cinema-lover123', 'password_confirmation' => 'Cinema-lover123',
        ])->assertNotFound();
    }

    public function test_banned_user_can_establish_session_but_cannot_access_app_and_can_logout(): void
    {
        $user = User::factory()->create(['email' => 'fan@example.com', 'account_status' => User::STATUS_BANNED]);
        $user->firebase_uid = 'firebase-user-1';
        $user->save();
        $this->firebase();
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertOk();
        LaravelAuth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertForbidden()->assertJsonPath('code', 'ACCOUNT_BANNED');
        $this->getJson('/api/v1/me/access')->assertForbidden();
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
    }

    public function test_restricted_user_retains_read_access_and_existing_write_limits(): void
    {
        $user = User::factory()->create(['email' => 'fan@example.com', 'account_status' => User::STATUS_RESTRICTED]);
        $user->firebase_uid = 'firebase-user-1';
        $user->save();
        $this->firebase();
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertOk();
        LaravelAuth::forgetGuards();
        $this->getJson('/api/v1/me/access')->assertOk()->assertJsonPath('data.account_status', 'restricted');
        $this->putJson('/api/v1/me/ratings/123', ['rating' => 4])->assertForbidden()->assertJsonPath('code', 'ACCOUNT_RESTRICTED');
    }

    public function test_exchange_requires_csrf_and_valid_input(): void
    {
        $this->postJson('/api/v1/auth/firebase/session', [])->assertUnprocessable()->assertJsonValidationErrors('id_token');
        $this->app->instance('env', 'local');
        $this->withHeader('Origin', 'http://localhost:5173');
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie')->getCookie('XSRF-TOKEN', false)->getValue();
        $this->firebase();
        $this->withHeader('X-XSRF-TOKEN', $csrf)->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertOk();
    }

    public function test_exchange_is_rate_limited_per_token_and_ip(): void
    {
        $auth = Mockery::mock(Auth::class);
        $auth->shouldReceive('verifyIdToken')->times(5)->andThrow(new FailedToVerifyToken('invalid'));
        $this->app->instance(Auth::class, $auth);
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])->assertUnauthorized();
        }
        $this->postJson('/api/v1/auth/firebase/session', ['id_token' => 'test-token'])
            ->assertTooManyRequests()->assertHeader('Retry-After');
    }
}
