<?php

namespace Tests\Feature;

use App\Models\Movie;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;
use Tests\UsesPostgresSafeRefreshDatabase;

class ManagedMoviesTest extends TestCase
{
    use UsesPostgresSafeRefreshDatabase;

    private const URL = '/api/internal/v1/movies/manage';

    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.internal_token' => 'test', 'catalog.tmdb_token' => 'fake']);
        Http::preventStrayRequests();
        Sleep::fake();
        $this->withHeader('X-VYBE-Service-Token', 'test');
    }

    public function test_local_reads_search_filters_and_pagination_never_fetch_provider(): void
    {
        Movie::create(['tmdb_id' => 550, 'title' => 'Local film', 'genres' => null]);
        Movie::create(['tmdb_id' => 551, 'title' => 'Fresh film', 'genres' => [], 'metadata_fetched_at' => now()]);
        Movie::create(['tmdb_id' => 552, 'title' => 'Stale film', 'metadata_fetched_at' => now()->subDays(8)]);
        DB::enableQueryLog();
        $this->getJson(self::URL)->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('data.0.metadata_status', 'not_hydrated')
            ->assertJsonPath('data.1.metadata_status', 'fresh')->assertJsonPath('data.2.metadata_status', 'stale');
        $this->assertCount(2, DB::getQueryLog());
        DB::disableQueryLog();
        $this->getJson(self::URL.'?q=LOCAL')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson(self::URL.'?q=551')->assertOk()->assertJsonPath('data.0.tmdb_id', 551);
        foreach (['fresh', 'stale', 'not_hydrated'] as $status) {
            $this->getJson(self::URL.'?status='.$status)->assertOk()->assertJsonCount(1, 'data');
        }
        $this->getJson(self::URL.'?q=%25')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson(self::URL.'?page=2')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson(self::URL.'/550')->assertOk()->assertJsonPath('data.genres', null);
        $this->getJson(self::URL.'/551')->assertOk()->assertJsonPath('data.genres', []);
        $this->getJson(self::URL.'/999')->assertNotFound();
        $this->getJson(self::URL.'?page=0&status=bad')->assertUnprocessable();
        $this->withHeader('X-VYBE-Service-Token', 'wrong')->getJson(self::URL)->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_force_refresh_fetches_fresh_movie_and_enforces_lock_and_cooldown(): void
    {
        Movie::create(['tmdb_id' => 550, 'title' => 'Old', 'metadata_fetched_at' => now()]);
        Http::fake(['*' => Http::response(['id' => 550, 'title' => 'New', 'runtime' => 100, 'genres' => [], 'vote_average' => 7])]);
        $lock = Cache::lock('catalog:detail:lock:550', 30);
        $lock->get();
        $this->postJson(self::URL.'/550/refresh')->assertConflict();
        Http::assertNothingSent();
        $lock->release();
        $start = microtime(true);
        DB::enableQueryLog();
        $this->postJson(self::URL.'/550/refresh')->assertOk()->assertJsonPath('meta.outcome', 'refreshed')->assertJsonPath('data.title', 'New');
        fwrite(STDERR, "\nCatalog fake-provider refresh ".round((microtime(true) - $start) * 1000, 2).' ms, '.count(DB::getQueryLog())." SQL\n");
        DB::disableQueryLog();
        Http::assertSentCount(1);
        $this->postJson(self::URL.'/550/refresh')->assertConflict();
        Http::assertSentCount(1);
        $this->postJson(self::URL.'/999/refresh')->assertNotFound();
    }

    public function test_failed_refresh_preserves_metadata_and_never_returns_stale_success(): void
    {
        $movie = Movie::create(['tmdb_id' => 550, 'title' => 'Keep', 'overview' => 'Keep overview', 'metadata_fetched_at' => now()->subDays(9)]);
        $before = $movie->fresh()->getAttributes();
        Http::fake(['*' => Http::response(['id' => 551, 'title' => 'Invalid', 'genres' => [], 'runtime' => 12])]);
        $this->postJson(self::URL.'/550/refresh')->assertStatus(503);
        $this->assertEquals($before, $movie->fresh()->getAttributes());
        $this->postJson(self::URL.'/550/refresh')->assertConflict();
        Http::assertSentCount(1);
    }

    public function test_local_read_measurements(): void
    {
        foreach (range(1, 40) as $id) {
            Movie::create(['tmdb_id' => $id, 'title' => "Fixture $id"]);
        }
        foreach ([self::URL, self::URL.'/1'] as $url) {
            $times = [];
            for ($sample = 0; $sample < 4; $sample++) {
                DB::enableQueryLog();
                DB::flushQueryLog();
                $start = microtime(true);
                $this->getJson($url)->assertOk();
                $times[] = round((microtime(true) - $start) * 1000, 2);
                $queries = count(DB::getQueryLog());
                DB::disableQueryLog();
            }
            fwrite(STDERR, "\n$url ".DB::getDriverName().' samples '.json_encode($times)." ms, $queries SQL\n");
        }
        Http::assertNothingSent();
    }

    public function test_timeout_and_provider_not_found_preserve_the_existing_movie(): void
    {
        $movie = Movie::create(['tmdb_id' => 550, 'title' => 'Keep', 'metadata_fetched_at' => now()]);
        Http::fake(['*' => Http::sequence()->pushFailedConnection()->pushFailedConnection()->push([], 404)]);
        $this->postJson(self::URL.'/550/refresh')->assertStatus(503);
        $this->assertSame('Keep', $movie->fresh()->title);
        Cache::forget('catalog:detail:cooldown:550');
        $this->postJson(self::URL.'/550/refresh')->assertNotFound();
        $this->assertSame('Keep', $movie->fresh()->title);
        $this->postJson(self::URL.'/550/refresh')->assertConflict();
    }
}
