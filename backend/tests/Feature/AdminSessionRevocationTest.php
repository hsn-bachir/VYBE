<?php

namespace Tests\Feature;

use App\Models\AdministrativeAction;
use App\Models\User;
use App\Services\AdminUserService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AdminSessionRevocationTest extends TestCase
{
    use RefreshDatabase;

    private ?string $sessionDirectory = null;

    private function sessions(string $driver): void
    {
        $this->sessionDirectory = storage_path('framework/testing/m77-sessions-'.Str::uuid());
        File::ensureDirectoryExists($this->sessionDirectory);
        config(['session.driver' => $driver, 'session.connection' => null, 'session.files' => $this->sessionDirectory]);
    }

    protected function tearDown(): void
    {
        try {
            if ($this->sessionDirectory !== null
                && str_starts_with($this->sessionDirectory, storage_path('framework/testing/m77-sessions-'))) {
                File::deleteDirectory($this->sessionDirectory);
            }
        } finally {
            parent::tearDown();
        }
    }

    public static function statuses(): array
    {
        $cases = [];
        foreach (['file', 'database'] as $driver) {
            foreach (['restricted', 'banned', 'deactivated'] as $status) {
                $cases["$driver $status"] = [$driver, $status];
            }
        }

        return $cases;
    }

    #[DataProvider('statuses')]
    public function test_restoration_never_restores_an_old_session(string $driver, string $status): void
    {
        $this->sessions($driver);
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['password_session_version' => 'old-version', 'remember_token' => 'old-remember']);
        DB::table('sessions')->insert(['id' => 'old-session', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        $service = app(AdminUserService::class);
        $service->status($admin, $target->id, $status, 'Policy');
        $version = $target->fresh()->password_session_version;
        $this->assertNotSame('old-version', $version);
        $this->assertNotSame('old-remember', $target->fresh()->getRememberToken());
        if ($driver === 'database') {
            $this->assertDatabaseMissing('sessions', ['id' => 'old-session']);
        }
        $this->withSession(['password_session_version' => 'old-version'])->actingAs($target->fresh(), 'web')
            ->getJson('/api/v1/auth/me')->assertStatus($status === 'restricted' ? 401 : 403);
        $service->status($admin, $target->id, 'active', 'Restored');
        $this->assertNotSame($version, $target->fresh()->password_session_version);
        Auth::forgetGuards();
        $this->withSession(['password_session_version' => 'old-version'])->actingAs($target->fresh(), 'web')
            ->getJson('/api/v1/auth/me')->assertUnauthorized();
        Auth::forgetGuards();
        $this->postJson('/api/v1/auth/login', ['email' => $target->email, 'password' => 'password'])->assertOk();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $target->id);
    }

    public static function roles(): array
    {
        return [['file', 'user', 'moderator'], ['file', 'moderator', 'user'],
            ['database', 'user', 'moderator'], ['database', 'moderator', 'user']];
    }

    #[DataProvider('roles')]
    public function test_role_changes_reject_old_sessions_and_fresh_login_uses_the_new_role(string $driver, string $from, string $to): void
    {
        $this->sessions($driver);
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['role' => $from, 'password_session_version' => 'old-version']);
        app(AdminUserService::class)->role($admin, $target->id, $to, 'Rotation');
        $this->withSession(['password_session_version' => 'old-version'])->actingAs($target->fresh(), 'web')
            ->getJson('/api/v1/auth/me')->assertUnauthorized();
        Auth::forgetGuards();
        $this->postJson('/api/v1/auth/login', ['email' => $target->email, 'password' => 'password'])->assertOk();
        $this->getJson('/api/v1/me/access')->assertOk()->assertJsonPath('data.role', $to);
    }

    public static function drivers(): array
    {
        return [['file'], ['database']];
    }

    #[DataProvider('drivers')]
    public function test_noop_changes_preserve_sessions_and_audit_failure_rolls_back_revocation(string $driver): void
    {
        $this->sessions($driver);
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['password_session_version' => 'old-version', 'remember_token' => 'old-remember']);
        DB::table('sessions')->insert(['id' => 'rollback-session', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        $service = app(AdminUserService::class);
        $service->role($admin, $target->id, 'user', 'No change');
        $service->status($admin, $target->id, 'active', 'No change');
        $this->assertSame('old-version', $target->fresh()->password_session_version);
        $this->assertSame('old-remember', $target->fresh()->getRememberToken());
        $this->assertDatabaseCount('administrative_actions', 0);
        AdministrativeAction::creating(fn () => throw new \RuntimeException('Audit unavailable'));
        try {
            foreach (['role', 'status'] as $operation) {
                try {
                    $service->{$operation}($admin, $target->id, $operation === 'role' ? 'moderator' : 'restricted', 'Roll back');
                    $this->fail('Expected audit failure');
                } catch (\RuntimeException $error) {
                    $this->assertSame('Audit unavailable', $error->getMessage());
                }
                $current = $target->fresh();
                $this->assertSame('user', $current->role);
                $this->assertSame('active', $current->account_status);
                $this->assertSame('old-version', $current->password_session_version);
                $this->assertSame('old-remember', $current->getRememberToken());
                $this->assertDatabaseHas('sessions', ['id' => 'rollback-session']);
            }
        } finally {
            AdministrativeAction::flushEventListeners();
        }
        $this->assertDatabaseCount('administrative_actions', 0);
        $this->withSession(['password_session_version' => 'old-version'])->actingAs($target->fresh(), 'web')
            ->getJson('/api/v1/auth/me')->assertOk();
    }
}
