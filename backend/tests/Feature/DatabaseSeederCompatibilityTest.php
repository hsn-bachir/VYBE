<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DatabaseSeederCompatibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_seed_creates_a_normalized_unprivileged_account(): void
    {
        config(['firebase_auth.mode' => 'legacy']);
        $this->artisan('db:seed', ['--class' => 'Database\\Seeders\\DatabaseSeeder'])->assertExitCode(0);

        $this->assertDatabaseCount('users', 1);
        $user = User::query()->sole();
        $this->assertSame('test_user', $user->username);
        $this->assertSame(User::ROLE_USER, $user->role);
        $this->assertNull($user->firebase_uid);
    }

    public function test_firebase_mode_does_not_seed_an_unlinked_password_account(): void
    {
        config(['firebase_auth.mode' => 'firebase']);
        $this->artisan('db:seed', ['--class' => 'Database\\Seeders\\DatabaseSeeder'])->assertExitCode(0);

        $this->assertDatabaseCount('users', 0);
    }
}
