<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    private function registration(array $overrides = []): array
    {
        return array_merge(['username' => 'Movie_Fan', 'email' => ' FAN@example.com ', 'password' => 'Cinema-lover123', 'password_confirmation' => 'Cinema-lover123'], $overrides);
    }

    public function test_registration_normalizes_hashes_and_authenticates(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registration())->assertCreated()
            ->assertExactJson(['data' => ['id' => 1, 'username' => 'movie_fan', 'email' => 'fan@example.com', 'avatar_url' => null, 'email_verified_at' => null]]);
        $user = User::firstOrFail();
        $this->assertTrue(Hash::check('Cinema-lover123', $user->password));
        $this->assertAuthenticatedAs($user, 'web');
        Auth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $user->id)->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_duplicate_normalized_email_is_validation_error(): void
    {
        User::factory()->create(['email' => 'fan@example.com']);
        $this->postJson('/api/v1/auth/register', $this->registration())->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_registration_requires_valid_fields_and_confirmed_strong_password(): void
    {
        $this->postJson('/api/v1/auth/register', [])->assertUnprocessable()->assertJsonValidationErrors(['username', 'email', 'password']);
        $this->postJson('/api/v1/auth/register', $this->registration(['username' => str_repeat('x', 31), 'email' => 'invalid', 'password' => 'short']))->assertUnprocessable()->assertJsonValidationErrors(['username', 'email', 'password']);
        $this->postJson('/api/v1/auth/register', $this->registration(['password' => 'onlyletterslong', 'password_confirmation' => 'onlyletterslong']))->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_login_rotates_session_and_logout_removes_authentication(): void
    {
        $user = User::factory()->create(['password' => 'Cinema-lover123']);
        $this->getJson('/sanctum/csrf-cookie')->assertNoContent();
        $oldId = session()->getId();
        $this->postJson('/api/v1/auth/login', ['email' => strtoupper($user->email), 'password' => 'Cinema-lover123'])->assertOk();
        $this->assertNotSame($oldId, session()->getId());
        Auth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonMissingPath('data.password')->assertJsonMissingPath('data.remember_token');
        $token = session()->token();
        $id = session()->getId();
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertNotSame($id, session()->getId());
        $this->assertNotSame($token, session()->token());
        Auth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->assertGuest('web');
    }

    public function test_invalid_unknown_and_nullable_password_accounts_get_identical_errors(): void
    {
        User::factory()->create(['email' => 'null@example.com', 'password' => null]);
        User::factory()->create(['email' => 'known@example.com']);
        foreach (['unknown@example.com', 'null@example.com', 'known@example.com'] as $email) {
            $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'incorrect-password'])->assertUnauthorized()->assertExactJson(['message' => 'Invalid email or password.']);
        }
        $this->assertGuest('web');
    }

    public function test_guests_cannot_access_authenticated_endpoints(): void
    {
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->postJson('/api/v1/auth/logout')->assertUnauthorized();
    }

    public function test_login_validation_and_rate_limit(): void
    {
        $this->postJson('/api/v1/auth/login', [])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => 'fan@example.com', 'password' => 'wrong'])->assertUnauthorized();
        }
        $this->postJson('/api/v1/auth/login', ['email' => ' FAN@EXAMPLE.COM ', 'password' => 'wrong'])->assertTooManyRequests()->assertHeader('Retry-After');
    }

    public function test_csrf_is_enforced_with_the_test_bypass_disabled(): void
    {
        // The real middleware checks app's environment, not the PHPUnit process.
        // Keep the already-configured isolated DB, but enable actual CSRF enforcement.
        $this->app->instance('env', 'local');
        $this->withHeader('Origin', 'http://localhost:5173');
        $this->postJson('/api/v1/auth/register', $this->registration())->assertStatus(419);
        $this->postJson('/api/v1/auth/login', [])->assertStatus(419);
        $bootstrap = $this->getJson('/sanctum/csrf-cookie')->assertNoContent();
        $bootstrap->assertCookie('XSRF-TOKEN')->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')->assertHeader('Access-Control-Allow-Credentials', 'true');
        $xsrf = $bootstrap->getCookie('XSRF-TOKEN', false)->getValue();
        $this->withHeader('X-XSRF-TOKEN', $xsrf)->postJson('/api/v1/auth/register', $this->registration())->assertCreated();
        Auth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertOk();
        $this->withHeader('X-XSRF-TOKEN', 'invalid')->postJson('/api/v1/auth/logout')->assertStatus(419);
        $bootstrap = $this->getJson('/sanctum/csrf-cookie');
        $this->withHeader('X-XSRF-TOKEN', $bootstrap->getCookie('XSRF-TOKEN', false)->getValue())->postJson('/api/v1/auth/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_unapproved_origin_does_not_receive_cors_permission(): void
    {
        $response = $this->withHeader('Origin', 'https://untrusted.example')->getJson('/sanctum/csrf-cookie');
        $this->assertNotSame('https://untrusted.example', $response->headers->get('Access-Control-Allow-Origin'));
    }
}
