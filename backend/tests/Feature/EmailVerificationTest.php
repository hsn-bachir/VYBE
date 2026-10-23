<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_verified_middleware_rejects_unverified_sessions_but_allows_verified_ones(): void
    {
        // Test-only route exercises Laravel's actual middleware without adding a placeholder API.
        Route::middleware(['web', 'auth:sanctum', 'verified'])->get('/test/verified-only', fn () => response()->json(['ok' => true]));
        $user = User::factory()->unverified()->create();
        $this->actingAs($user)->getJson('/test/verified-only')->assertForbidden();
        $this->getJson('/api/v1/auth/me')->assertOk();
        $this->postJson('/api/v1/auth/email/verification-notification')->assertOk();
        $user->markEmailAsVerified();
        $this->getJson('/test/verified-only')->assertOk();
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
    }

    private function link(User $user, int $minutes = 60): string
    {
        return URL::temporarySignedRoute('verification.verify', now()->addMinutes($minutes), [
            'id' => $user->getKey(), 'hash' => sha1($user->getEmailForVerification()),
        ]);
    }

    public function test_registration_sends_native_notification_and_starts_unverified(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/auth/register', ['username' => 'MOVIE_FAN', 'email' => 'fan@example.com', 'password' => 'Cinema-lover123', 'password_confirmation' => 'Cinema-lover123'])->assertCreated()->assertJsonPath('data.username', 'movie_fan')->assertJsonPath('data.email_verified_at', null);
        Notification::assertSentTo(User::firstOrFail(), VerifyEmail::class);
        $this->getJson('/api/v1/auth/email/verification-status')->assertOk()->assertJsonPath('data.email_verified_at', null);
    }

    public function test_username_validation_and_uniqueness(): void
    {
        Notification::fake();
        User::factory()->create(['username' => 'movie_fan']);
        $body = ['email' => 'new@example.com', 'password' => 'Cinema-lover123', 'password_confirmation' => 'Cinema-lover123'];
        foreach (['MOVIE_FAN', 'admin', 'support', 'system', 'root', 'vybe', 'bad-name', 'ab'] as $username) {
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.'.(10 + array_search($username, ['MOVIE_FAN', 'admin', 'support', 'system', 'root', 'vybe', 'bad-name', 'ab']))]);
            $this->postJson('/api/v1/auth/register', $body + ['username' => $username])->assertUnprocessable()->assertJsonValidationErrors('username');
        }
        $this->assertDatabaseCount('users', 1);
    }

    public function test_valid_link_verifies_only_its_authenticated_owner_and_reuse_is_harmless(): void
    {
        $user = User::factory()->unverified()->create();
        $other = User::factory()->unverified()->create();
        $link = $this->link($user);
        $this->actingAs($other)->get($link)->assertRedirect('http://localhost:5173/verify-email/error?reason=account');
        $this->assertNull($user->fresh()->email_verified_at);
        $this->actingAs($user)->get($link)->assertRedirect('http://localhost:5173/verify-email/success');
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.username', $user->username)->assertJsonPath('data.email_verified_at', $user->fresh()->email_verified_at->toISOString());
        $this->get($link)->assertRedirect('http://localhost:5173/verify-email/success');
    }

    public function test_expired_tampered_and_unauthenticated_links_do_not_verify(): void
    {
        $user = User::factory()->unverified()->create();
        $link = $this->link($user);
        $this->get($link)->assertRedirect('http://localhost:5173/login?verification=sign-in');
        $this->actingAs($user)->get($link.'&tampered=1')->assertRedirect('http://localhost:5173/verify-email/error?reason=invalid');
        $this->travel(61)->minutes();
        $this->get($link)->assertRedirect('http://localhost:5173/verify-email/error?reason=expired');
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_resend_is_authenticated_throttled_and_skips_verified_accounts(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/auth/email/verification-notification')->assertUnauthorized();
        $user = User::factory()->unverified()->create();
        $this->actingAs($user);
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/v1/auth/email/verification-notification')->assertOk();
        }
        Notification::assertSentToTimes($user, VerifyEmail::class, 3);
        $this->postJson('/api/v1/auth/email/verification-notification')->assertTooManyRequests();
        $verified = User::factory()->create();
        $this->actingAs($verified)->postJson('/api/v1/auth/email/verification-notification')->assertOk()->assertJsonPath('message', 'Email already verified.');
        Notification::assertNotSentTo($verified, VerifyEmail::class);
    }
}
