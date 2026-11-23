<?php

namespace Tests\Feature;

use App\Models\MovieRating;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AdminAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    private const GENRES = '/api/v1/admin/genre-insights';

    private const ACTIVITY = '/api/v1/admin/activity-analytics';

    private const CATALOG = 'http://catalog.test/api/internal/v1/movies/genres';

    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
        Http::preventStrayRequests();
        $this->travelTo(CarbonImmutable::parse('2026-11-23T01:30:00+02:00'));
    }

    public function test_genre_weights_ties_and_partial_coverage_use_retained_watched_entries(): void
    {
        [$first, $second, $admin] = User::factory()->count(3)->create();
        $admin->forceFill(['role' => 'admin'])->save();
        foreach ([550, 551, 552, 553] as $id) {
            $first->watchedMovies()->create(['tmdb_id' => $id, 'watched_at' => now()]);
        }
        $second->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);
        Http::fake([self::CATALOG => Http::response(['data' => [
            ['tmdb_id' => 552, 'genres' => null],
            ['tmdb_id' => 550, 'genres' => [['id' => 18, 'name' => 'Drama'], ['id' => 18, 'name' => 'drama'], ['id' => 53, 'name' => 'Thriller']]],
            ['tmdb_id' => 551, 'genres' => [['id' => 35, 'name' => 'Comedy'], ['id' => 53, 'name' => 'Thriller'], ['id' => 12, 'name' => 'Adventure']]],
            ['tmdb_id' => 553, 'genres' => []],
        ]])]);

        $this->actingAs($admin, 'web');
        DB::enableQueryLog();
        $this->getJson(self::GENRES)->assertOk()->assertExactJson([
            'data' => [
                ['genre_id' => 53, 'name' => 'Thriller', 'watched_entries' => 3],
                ['genre_id' => 18, 'name' => 'Drama', 'watched_entries' => 2],
                ['genre_id' => 12, 'name' => 'Adventure', 'watched_entries' => 1],
                ['genre_id' => 35, 'name' => 'Comedy', 'watched_entries' => 1],
            ],
            'meta' => ['cohort_limit' => 50, 'total_watched_movies' => 4, 'total_watched_entries' => 5,
                'cohort_movies' => 4, 'cohort_watched_entries' => 5, 'covered_movies' => 3, 'covered_watched_entries' => 4, 'metadata_unavailable' => false],
        ]);
        $this->assertCount(2, DB::getQueryLog());
        DB::disableQueryLog();
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request->method() === 'POST' && $request->url() === self::CATALOG
            && $request->hasHeader('X-VYBE-Service-Token', 'test-only') && $request->data() === ['tmdb_ids' => [550, 551, 552, 553]]);
    }

    public function test_large_cohort_limits_one_batch_and_preserves_coverage_on_catalog_outage(): void
    {
        $members = User::factory()->count(20)->create();
        $ids = range(1, 80);
        foreach ($members as $member) {
            DB::table('watched_movies')->insert(array_map(fn ($id) => ['user_id' => $member->id, 'tmdb_id' => $id, 'watched_at' => now()], $ids));
        }
        $admin = User::factory()->create(['role' => 'admin']);
        Http::fake([self::CATALOG => Http::failedConnection()]);
        $this->actingAs($admin, 'web')->getJson(self::GENRES)->assertOk()->assertExactJson([
            'data' => [],
            'meta' => ['cohort_limit' => 50, 'total_watched_movies' => 80, 'total_watched_entries' => 1600,
                'cohort_movies' => 50, 'cohort_watched_entries' => 1000, 'covered_movies' => 0, 'covered_watched_entries' => 0, 'metadata_unavailable' => true],
        ]);
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request->data() === ['tmdb_ids' => range(1, 50)]);
        $this->getJson(self::ACTIVITY)->assertOk();
        Http::assertSentCount(1);
    }

    public function test_missing_genres_and_invalid_catalog_coverage_are_reported_separately(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);
        Http::fake([self::CATALOG => Http::sequence()->push(['data' => [['tmdb_id' => 550, 'genres' => null]]])
            ->push(['data' => [['tmdb_id' => 551, 'genres' => []]]])]);
        $this->actingAs($admin, 'web')->getJson(self::GENRES)->assertOk()->assertJsonPath('data', [])
            ->assertJsonPath('meta.metadata_unavailable', false)->assertJsonPath('meta.covered_movies', 0);
        $this->getJson(self::GENRES)->assertOk()->assertJsonPath('data', [])
            ->assertJsonPath('meta.metadata_unavailable', true)->assertJsonPath('meta.cohort_watched_entries', 1);
    }

    public function test_genre_ranking_returns_at_most_ten_rows(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);
        $genres = array_map(fn (int $id) => ['id' => $id, 'name' => "Genre $id"], range(12, 1));
        Http::fake([self::CATALOG => Http::response(['data' => [['tmdb_id' => 550, 'genres' => $genres]]])]);
        $response = $this->actingAs($admin, 'web')->getJson(self::GENRES)->assertOk()->assertJsonCount(10, 'data');
        $this->assertSame(range(1, 10), array_column($response->json('data'), 'genre_id'));
    }

    public function test_empty_activity_zero_fills_each_day_and_empty_genres_need_no_catalog(): void
    {
        Http::fake();
        $this->actingAs(User::factory()->create(['role' => 'admin', 'created_at' => '2025-01-01 00:00:00']), 'web');
        $this->getJson(self::GENRES)->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.total_watched_entries', 0)
            ->assertJsonPath('meta.metadata_unavailable', false);

        DB::enableQueryLog();
        $response = $this->getJson(self::ACTIVITY)->assertOk()->assertJsonCount(30, 'data.days')->assertJsonPath('data.range_days', 30)
            ->assertJsonPath('data.timezone', 'UTC')->assertJsonPath('data.start_date', '2026-10-24')->assertJsonPath('data.end_date', '2026-11-22')
            ->assertJsonPath('data.active_contributors', 0)->assertJsonPath('data.totals', $this->counts(0, 0, 0, 0));
        $this->assertCount(2, DB::getQueryLog());
        DB::disableQueryLog();
        for ($index = 0; $index < 30; $index++) {
            $day = CarbonImmutable::parse('2026-10-24', 'UTC')->addDays($index)->toDateString();
            $response->assertJsonPath("data.days.$index", ['date' => $day] + $this->counts(0, 0, 0, 0));
        }
        Http::assertNothingSent();
    }

    public static function ranges(): array
    {
        return [[7, '2026-11-16'], [30, '2026-10-24'], [90, '2026-08-25']];
    }

    #[DataProvider('ranges')]
    public function test_utc_range_boundaries_and_distinct_contributors(int $range, string $firstDay): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
        }
        $start = CarbonImmutable::parse($firstDay, 'UTC');
        $admin = User::factory()->create(['role' => 'admin', 'created_at' => $start->subSecond()]);
        $member = User::factory()->create(['created_at' => $start]);
        $other = User::factory()->create(['created_at' => '2026-11-22 23:59:59']);
        User::factory()->create(['created_at' => '2026-11-23 00:00:00']);
        $this->reviewAt($member, 550, $start->toDateTimeString());
        $this->reviewAt($member, 551, $start->subSecond()->toDateTimeString());
        $this->reviewAt($other, 550, '2026-11-23 00:00:00');
        $this->ratingAt($member, 550, '2026-11-22 23:59:59');
        $this->ratingAt($member, 551, '2026-11-23 00:00:00');
        $this->watchedAt($member, 550, $start->toDateTimeString());
        $this->watchedAt($other, 550, '2026-11-22 00:00:00');

        $this->actingAs($admin, 'web')->getJson(self::ACTIVITY.'?range='.$range)->assertOk()
            ->assertJsonCount(7, 'data')->assertJsonCount($range, 'data.days')->assertJsonPath('data.range_days', $range)->assertJsonPath('data.start_date', $firstDay)
            ->assertJsonPath('data.end_date', '2026-11-22')->assertJsonPath('data.totals', $this->counts(2, 1, 1, 2))
            ->assertJsonPath('data.days.0', ['date' => $firstDay] + $this->counts(1, 1, 0, 1))
            ->assertJsonPath('data.days.'.($range - 1), ['date' => '2026-11-22'] + $this->counts(1, 0, 1, 1))
            ->assertJsonPath('data.active_contributors', 2)->assertJsonCount(5, 'data.days.0');
    }

    public function test_deleted_records_and_updates_are_not_new_creations(): void
    {
        Http::fake();
        $admin = User::factory()->create(['role' => 'admin', 'created_at' => '2025-01-01 00:00:00']);
        $deleted = User::factory()->create(['created_at' => '2026-11-22 01:00:00']);
        $this->reviewAt($admin, 550, '2026-11-22 01:00:00');
        $this->ratingAt($admin, 550, '2026-11-15 01:00:00');
        $this->ratingAt($admin, 551, '2026-11-22 01:00:00');
        $this->watchedAt($admin, 550, '2026-11-22 01:00:00');
        $this->actingAs($admin, 'web')->putJson('/api/v1/me/ratings/550', ['rating' => 5])->assertOk();
        $this->assertEquals('2026-11-15 01:00:00', MovieRating::where('tmdb_id', 550)->firstOrFail()->created_at->toDateTimeString());
        $admin->reviews()->delete();
        $admin->movieRatings()->where('tmdb_id', 551)->delete();
        $admin->watchedMovies()->delete();
        $deleted->delete();
        $this->getJson(self::ACTIVITY.'?range=7')->assertOk()->assertJsonPath('data.totals', $this->counts(0, 0, 0, 0))
            ->assertJsonPath('data.active_contributors', 0);
        Http::assertNothingSent();
    }

    public function test_range_validation_and_shared_administrator_throttle(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        foreach (['range=', 'range=8', 'range=7.0', 'range[]=7'] as $query) {
            $this->getJson(self::ACTIVITY.'?'.$query)->assertUnprocessable()->assertJsonValidationErrors('range');
        }
        $this->getJson(self::ACTIVITY.'?unknown=1')->assertUnprocessable()->assertJsonValidationErrors('unknown');
        for ($request = 5; $request < 60; $request++) {
            $this->getJson(self::GENRES)->assertOk();
        }
        $this->getJson(self::ACTIVITY)->assertTooManyRequests()->assertHeader('Cache-Control', 'no-store, private');
    }

    public static function accessCases(): array
    {
        return [
            'guest' => [null, 'active', true, 401], 'unverified' => ['admin', 'active', false, 403],
            'member' => ['user', 'active', true, 403], 'moderator' => ['moderator', 'active', true, 403],
            'active admin' => ['admin', 'active', true, 200], 'restricted admin' => ['admin', 'restricted', true, 200],
            'banned admin' => ['admin', 'banned', true, 403], 'deactivated admin' => ['admin', 'deactivated', true, 403],
        ];
    }

    #[DataProvider('accessCases')]
    public function test_analytics_authorization_and_private_caching(?string $role, string $state, bool $verified, int $status): void
    {
        if ($role !== null) {
            $user = User::factory()->create(['role' => $role, 'email_verified_at' => $verified ? now() : null]);
            $this->actingAs($user, 'web');
            User::whereKey($user->id)->update(['account_status' => $state]);
        }
        foreach ([self::GENRES, self::ACTIVITY] as $endpoint) {
            $this->getJson($endpoint)->assertStatus($status)->assertHeader('Cache-Control', 'no-store, private');
        }
    }

    private function counts(int $registrations, int $reviews, int $ratings, int $watchedEntries): array
    {
        return ['registrations' => $registrations, 'reviews' => $reviews, 'ratings' => $ratings, 'watched_entries' => $watchedEntries];
    }

    private function reviewAt(User $user, int $id, string $createdAt): void
    {
        DB::table('reviews')->insert(['user_id' => $user->id, 'tmdb_id' => $id, 'body' => 'Review fixture.', 'created_at' => $createdAt]);
    }

    private function ratingAt(User $user, int $id, string $createdAt): void
    {
        DB::table('movie_ratings')->insert(['user_id' => $user->id, 'tmdb_id' => $id, 'rating' => 4, 'created_at' => $createdAt]);
    }

    private function watchedAt(User $user, int $id, string $createdAt): void
    {
        DB::table('watched_movies')->insert(['user_id' => $user->id, 'tmdb_id' => $id, 'watched_at' => now(), 'created_at' => $createdAt]);
    }
}
