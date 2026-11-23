<?php

namespace Tests\Feature;

use App\Models\AdministrativeAction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AdminMoviesTest extends TestCase
{
    use RefreshDatabase;

    private function movie(): array
    {
        return ['tmdb_id' => 550, 'title' => 'Local movie', 'original_title' => null, 'overview' => null, 'poster_path' => null,
            'backdrop_path' => null, 'release_date' => null, 'runtime' => null, 'original_language' => null,
            'genres' => null, 'tmdb_rating' => null, 'tmdb_vote_count' => null, 'metadata_status' => 'not_hydrated', 'metadata_fetched_at' => null];
    }

    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test']);
        Http::preventStrayRequests();
    }

    public function test_reads_refresh_audit_and_failures(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin, 'web');
        Http::fake(['*' => Http::sequence()->push(['data' => [$this->movie()], 'meta' => ['page' => 1, 'total_pages' => 1, 'total_results' => 1]])
            ->push(['data' => $this->movie()])->push(['data' => array_replace($this->movie(), ['metadata_status' => 'fresh', 'metadata_fetched_at' => now()->toISOString()]), 'meta' => ['outcome' => 'refreshed']])
            ->push([], 409)->push([], 503)]);
        DB::enableQueryLog();
        $start = microtime(true);
        $this->getJson('/api/v1/admin/movies?q=550')->assertOk()->assertJsonPath('data.0.genres', null)->assertHeader('Cache-Control', 'no-store, private');
        fwrite(STDERR, "\nCore fake-Catalog listing ".round((microtime(true) - $start) * 1000, 2).' ms, '.count(DB::getQueryLog())." SQL\n");
        DB::flushQueryLog();
        $start = microtime(true);
        $this->getJson('/api/v1/admin/movies/550')->assertOk();
        fwrite(STDERR, "\nCore fake-Catalog inspection ".round((microtime(true) - $start) * 1000, 2).' ms, '.count(DB::getQueryLog())." SQL\n");
        DB::flushQueryLog();
        $start = microtime(true);
        $this->postJson('/api/v1/admin/movies/550/refresh')->assertOk();
        fwrite(STDERR, "\nCore fake-Catalog refresh ".round((microtime(true) - $start) * 1000, 2).' ms, '.count(DB::getQueryLog())." SQL\n");
        DB::disableQueryLog();
        $this->assertDatabaseHas('administrative_actions', ['actor_id' => $admin->id, 'action' => 'movie.refreshed', 'target_type' => 'movie', 'target_id' => 550]);
        $this->postJson('/api/v1/admin/movies/550/refresh')->assertConflict();
        $this->postJson('/api/v1/admin/movies/550/refresh')->assertStatus(503);
        $this->assertDatabaseHas('administrative_actions', ['action' => 'movie.refresh_failed']);
        $this->getJson('/api/v1/admin/movies/0')->assertUnprocessable();
        $this->getJson('/api/v1/admin/movies?status=bad')->assertUnprocessable();
        Http::assertSentCount(5);
        Http::assertSent(fn ($request) => $request->url() === 'http://catalog.test/api/internal/v1/movies/manage/550/refresh'
            && $request->method() === 'POST' && $request->hasHeader('X-VYBE-Service-Token', 'test'));
    }

    public static function roles(): array
    {
        return [[null, 'active', true, 401, 401], ['user', 'active', true, 403, 403], ['moderator', 'active', true, 403, 403],
            ['admin', 'active', false, 403, 403], ['admin', 'restricted', true, 200, 403], ['admin', 'banned', true, 403, 403], ['admin', 'deactivated', true, 403, 403]];
    }

    #[DataProvider('roles')]
    public function test_access(?string $role, string $status, bool $verified, int $read, int $write): void
    {
        Http::fake(['*' => Http::response(['data' => $this->movie()])]);
        if ($role) {
            $this->actingAs(User::factory()->create(['role' => $role, 'account_status' => $status, 'email_verified_at' => $verified ? now() : null]), 'web');
        }
        $this->getJson('/api/v1/admin/movies/550')->assertStatus($read);
        $this->postJson('/api/v1/admin/movies/550/refresh')->assertStatus($write);
    }

    public function test_refresh_never_accepts_stale_success_and_shares_the_write_throttle(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        Http::fake(['*' => Http::response(['data' => $this->movie(), 'meta' => ['outcome' => 'refreshed']])]);
        for ($request = 0; $request < 20; $request++) {
            $this->postJson('/api/v1/admin/movies/550/refresh')->assertStatus(503);
        }
        $this->postJson('/api/v1/admin/movies/550/refresh')->assertTooManyRequests();
        Http::assertSentCount(20);
        $this->assertDatabaseMissing('administrative_actions', ['action' => 'movie.refreshed']);
    }

    public function test_refresh_requires_csrf(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        $this->app->instance('env', 'local');
        $this->postJson('/api/v1/admin/movies/550/refresh')->assertStatus(419);
    }

    public static function refreshFailures(): array
    {
        return [
            'provider failure before write' => [503, ['code' => 'UPSTREAM_UNAVAILABLE'], 503, 'movie.refresh_failed'],
            'provider not found before write' => [404, ['code' => 'MOVIE_NOT_FOUND'], 404, 'movie.refresh_failed'],
            'lock or cooldown before write' => [409, [], 409, 'movie.refresh_failed'],
            'unclassified unavailable' => [503, [], 503, 'movie.refresh_unconfirmed'],
            'unclassified not found' => [404, [], 404, 'movie.refresh_unconfirmed'],
            'server error after possible write' => [500, ['message' => 'Internal secret'], 503, 'movie.refresh_unconfirmed'],
            'invalid success after possible write' => [200, ['data' => []], 503, 'movie.refresh_unconfirmed'],
        ];
    }

    #[DataProvider('refreshFailures')]
    public function test_audit_classifies_only_confirmed_prewrite_failures(int $upstreamStatus, array $body, int $status, string $action): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        Http::fake(['*' => Http::response($body, $upstreamStatus)]);
        $response = $this->postJson('/api/v1/admin/movies/550/refresh')->assertStatus($status);
        $this->assertStringNotContainsString('Internal secret', $response->getContent());
        $this->assertDatabaseHas('administrative_actions', ['target_id' => 550, 'action' => $action, 'details' => null]);
        $this->assertDatabaseCount('administrative_actions', 1);
        Http::assertSentCount(1);
    }

    public static function connectionLosses(): array
    {
        return [['timeout', false], ['connection lost', false], ['reply lost after remote commit', true]];
    }

    #[DataProvider('connectionLosses')]
    public function test_connection_losses_are_unconfirmed_and_never_automatically_retried(string $failure, bool $commit): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        $remoteCommitted = false;
        $calls = 0;
        Http::fake(function () use ($commit, $failure, &$remoteCommitted, &$calls) {
            $calls++;
            $remoteCommitted = $commit;
            throw new ConnectionException($failure);
        });
        $this->postJson('/api/v1/admin/movies/550/refresh')->assertStatus(503)->assertJsonPath('code', 'UPSTREAM_UNAVAILABLE');
        $this->assertSame($commit, $remoteCommitted);
        $this->assertSame(1, $calls);
        $this->assertDatabaseHas('administrative_actions', ['target_id' => 550, 'action' => 'movie.refresh_unconfirmed']);
        $this->assertDatabaseCount('administrative_actions', 1);
    }

    public function test_audit_completion_failure_leaves_requested_intent_without_retrying_catalog(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        Http::fake(['*' => Http::response(['data' => array_replace($this->movie(), [
            'metadata_status' => 'fresh', 'metadata_fetched_at' => now()->toISOString(),
        ]), 'meta' => ['outcome' => 'refreshed']])]);
        AdministrativeAction::updating(fn () => throw new \RuntimeException('Audit completion unavailable'));
        try {
            $this->postJson('/api/v1/admin/movies/550/refresh')->assertStatus(500);
        } finally {
            AdministrativeAction::flushEventListeners();
        }
        $this->assertDatabaseHas('administrative_actions', ['action' => 'movie.refresh_requested', 'target_id' => 550]);
        $this->assertDatabaseCount('administrative_actions', 1);
        Http::assertSentCount(1);
    }

    public function test_interruption_after_intent_preserves_incomplete_history_without_dispatch_or_retry(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        AdministrativeAction::created(fn () => throw new \RuntimeException('Simulated interruption after persisting intent'));
        try {
            $this->postJson('/api/v1/admin/movies/550/refresh')->assertStatus(500);
        } finally {
            AdministrativeAction::flushEventListeners();
        }
        $this->getJson('/api/v1/admin/actions?target_type=movie&target_id=550')->assertOk()
            ->assertJsonPath('data.0.action', 'movie.refresh_requested');
        $this->assertDatabaseCount('administrative_actions', 1);
        Http::assertNothingSent();
    }
}
