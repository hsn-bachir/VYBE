<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Kreait\Firebase\Contract\Auth as FirebaseAuth;
use Tests\TestCase;

class LiveFirebaseSessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_opt_in_real_firebase_token_registers_with_a_chosen_username(): void
    {
        $idToken = getenv('VYBE_LIVE_FIREBASE_ID_TOKEN');
        if (! is_string($idToken) || $idToken === '') {
            $this->markTestSkipped('Requires an ephemeral VYBE_LIVE_FIREBASE_ID_TOKEN.');
        }

        config()->set('firebase_auth.mode', 'firebase');
        $this->postJson('/api/v1/auth/firebase/register', [
            'id_token' => $idToken, 'username' => 'live_firebase_test',
        ])->assertCreated()->assertJsonPath('data.username', 'live_firebase_test');
        $user = User::query()->sole();
        $this->assertNotNull($user->firebase_uid);
        $this->assertNull($user->password);
        Auth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $user->id);
    }

    public function test_opt_in_real_firebase_token_establishes_and_ends_a_laravel_session(): void
    {
        $idToken = getenv('VYBE_LIVE_FIREBASE_ID_TOKEN');
        if (! is_string($idToken) || $idToken === '') {
            $this->markTestSkipped('Requires an ephemeral VYBE_LIVE_FIREBASE_ID_TOKEN.');
        }

        config()->set('firebase_auth.mode', 'firebase');
        $parts = explode('.', $idToken);
        $claims = json_decode(base64_decode(strtr($parts[1] ?? '', '-_', '+/')) ?: '{}', true);
        $this->assertSame(3, count($parts));
        $this->assertSame((string) config('firebase_auth.project_id'), (string) ($claims['aud'] ?? ''), 'Firebase project mismatch.');
        $this->assertLessThanOrEqual((int) config('firebase_auth.max_auth_age_seconds'), time() - (int) ($claims['auth_time'] ?? 0), 'Firebase auth_time is stale.');
        $verifiedToken = app(FirebaseAuth::class)->verifyIdToken($idToken, true);
        $serverClaims = $verifiedToken->claims();
        $firebaseClaims = $serverClaims->get('firebase');
        $this->assertIsArray($firebaseClaims);
        $this->assertSame('password', $firebaseClaims['sign_in_provider'] ?? null);
        $this->assertSame([(string) config('firebase_auth.project_id')], $serverClaims->get('aud'));
        $this->assertSame('https://securetoken.google.com/'.config('firebase_auth.project_id'), $serverClaims->get('iss'));
        $this->assertNotEmpty($serverClaims->get('sub'));
        $authTime = $serverClaims->get('auth_time');
        $this->assertTrue(is_numeric($authTime) || $authTime instanceof \DateTimeInterface, get_debug_type($authTime));
        $exchange = $this->postJson('/api/v1/auth/firebase/session', ['id_token' => $idToken]);
        $this->assertSame(200, $exchange->status(), (string) $exchange->json('message'));
        $exchange->assertJsonStructure(['data' => ['id', 'username', 'email']]);
        $user = User::query()->sole();
        $this->assertNotNull($user->firebase_uid);
        $this->assertNull($user->password);
        Auth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $user->id);
        $this->getJson('/api/v1/me/access')->assertStatus($user->hasVerifiedEmail() ? 200 : 403);
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    }
}
