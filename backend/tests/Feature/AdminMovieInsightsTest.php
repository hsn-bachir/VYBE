<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\WatchedMovie;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AdminMovieInsightsTest extends TestCase
{
    use RefreshDatabase;

    private const OVERVIEW = '/api/v1/admin/overview';

    private const INSIGHTS = '/api/v1/admin/movie-insights';

    private const SUMMARIES = 'http://catalog.test/api/internal/v1/movies/summaries';

    protected function setUp(): void
    {
        parent::setUp();

        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
        Http::preventStrayRequests();
    }

    public function test_overview_counts_current_core_records_and_leaves_the_moderator_projection_unchanged(): void
    {
        Http::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $moderator = User::factory()->create(['role' => 'moderator']);
        $member = User::factory()->create(['account_status' => 'restricted']);
        $this->actingAs($admin, 'web')->getJson(self::OVERVIEW)->assertOk()->assertJsonPath('data.activity', [
            'total_reviews' => 0, 'total_ratings' => 0, 'total_watched_entries' => 0,
        ])->assertJsonPath('data.users.total', 3);

        $visible = $member->reviews()->create(['tmdb_id' => 550, 'body' => 'Visible review.']);
        $moderator->reviews()->create(['tmdb_id' => 551, 'body' => 'Hidden review.'])->forceFill([
            'visibility' => 'hidden', 'moderator_spoiler' => true,
        ])->save();
        DB::table('reports')->insert(['reporter_id' => $moderator->id, 'target_type' => 'review', 'target_id' => $visible->id,
            'reason' => 'spoiler', 'status' => 'pending', 'created_at' => now()]);
        $member->movieRatings()->create(['tmdb_id' => 550, 'rating' => 4]);
        $moderator->movieRatings()->create(['tmdb_id' => 550, 'rating' => 5]);
        $member->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);
        $member->watchedMovies()->create(['tmdb_id' => 551, 'watched_at' => now()]);
        $moderator->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);

        DB::enableQueryLog();
        $this->getJson(self::OVERVIEW)->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.users', ['total' => 3, 'restricted' => 1, 'banned' => 0, 'deactivated' => 0])
            ->assertJsonPath('data.activity', ['total_reviews' => 2, 'total_ratings' => 2, 'total_watched_entries' => 3])
            ->assertJsonPath('data.pending_reports', 1)->assertJsonPath('data.hidden_reviews', 1)
            ->assertJsonPath('data.enforced_spoilers', 1)->assertJsonCount(1, 'data.recent_reports');
        $this->assertCount(3, DB::getQueryLog());
        DB::disableQueryLog();

        Auth::forgetGuards();
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($moderator, 'web')->getJson(self::OVERVIEW)->assertOk()
            ->assertJsonCount(5, 'data')->assertJsonMissingPath('data.users')->assertJsonMissingPath('data.activity')
            ->assertJsonPath('data.pending_reports', 1)->assertJsonPath('data.handled_reports', 0)
            ->assertJsonPath('data.hidden_reviews', 1)->assertJsonPath('data.enforced_spoilers', 1)
            ->assertJsonCount(1, 'data.recent_reports');
        $this->assertCount(3, DB::getQueryLog());
        DB::disableQueryLog();
        Http::assertNothingSent();
    }

    public function test_empty_rankings_send_no_catalog_request(): void
    {
        Http::fake();
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        $this->getJson(self::OVERVIEW)->assertOk()->assertJsonPath('data.users.total', 1)
            ->assertJsonPath('data.activity', ['total_reviews' => 0, 'total_ratings' => 0, 'total_watched_entries' => 0])
            ->assertJsonPath('data.pending_reports', 0)->assertJsonPath('data.recent_reports', []);
        $this->getJson(self::INSIGHTS)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertExactJson([
            'data' => ['most_watched' => [], 'highest_rated' => []], 'meta' => ['metadata_unavailable' => false],
        ]);
        Http::assertNothingSent();
    }

    public function test_ranks_distinct_watchers_and_confidence_adjusted_vybe_ratings_in_one_batch(): void
    {
        $members = User::factory()->count(30)->create();
        foreach ($members as $index => $member) {
            $member->movieRatings()->create(['tmdb_id' => 550, 'rating' => $index < 24 ? 5 : 4]);
        }
        $alice = $members[0];
        $bob = $members[1];
        foreach ([553, 552, 550] as $id) {
            $alice->watchedMovies()->create(['tmdb_id' => $id, 'watched_at' => now()]);
        }
        $this->assertSame(0, WatchedMovie::query()->insertOrIgnore(['user_id' => $alice->id, 'tmdb_id' => 550, 'watched_at' => now()]));
        $bob->watchedMovies()->create(['tmdb_id' => 550, 'watched_at' => now()]);
        $alice->movieRatings()->create(['tmdb_id' => 552, 'rating' => 5]);
        $bob->movieRatings()->create(['tmdb_id' => 554, 'rating' => 1]);
        Http::fake([self::SUMMARIES => Http::response([
            'data' => [$this->movie(552, 9.9), $this->movie(550, 3.0)],
            'meta' => ['requested_count' => 4, 'returned_count' => 2, 'missing_tmdb_ids' => [553, 554]],
        ])]);
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        $metadata = fn (int $id) => ['title' => "Movie $id", 'poster_path' => '/poster.jpg', 'release_date' => '2024-01-02'];

        DB::enableQueryLog();
        $this->getJson(self::INSIGHTS)->assertOk()->assertExactJson([
            'data' => [
                'most_watched' => [
                    ['tmdb_id' => 550, 'watched_users' => 2, 'movie' => $metadata(550)],
                    ['tmdb_id' => 552, 'watched_users' => 1, 'movie' => $metadata(552)],
                    ['tmdb_id' => 553, 'watched_users' => 1, 'movie' => null],
                ],
                'highest_rated' => [
                    ['tmdb_id' => 550, 'rating_count' => 30, 'average_rating' => 4.8, 'movie' => $metadata(550)],
                    ['tmdb_id' => 552, 'rating_count' => 1, 'average_rating' => 5, 'movie' => $metadata(552)],
                    ['tmdb_id' => 554, 'rating_count' => 1, 'average_rating' => 1, 'movie' => null],
                ],
            ],
            'meta' => ['metadata_unavailable' => false],
        ]);
        $this->assertCount(3, DB::getQueryLog());
        DB::disableQueryLog();
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request->url() === self::SUMMARIES && $request->method() === 'POST'
            && $request->hasHeader('X-VYBE-Service-Token', 'test-only') && $request->data() === ['tmdb_ids' => [550, 552, 553, 554]]);
    }

    public function test_ranking_limits_and_equal_score_ties_preserve_stats_during_a_catalog_timeout(): void
    {
        [$admin, $member] = User::factory()->count(2)->create();
        $admin->forceFill(['role' => 'admin'])->save();
        foreach (range(611, 600) as $id) {
            $member->watchedMovies()->create(['tmdb_id' => $id, 'watched_at' => now()]);
        }
        foreach (range(711, 700) as $id) {
            $member->movieRatings()->create(['tmdb_id' => $id, 'rating' => 4]);
        }
        $admin->movieRatings()->create(['tmdb_id' => 711, 'rating' => 4]);
        Http::fake([self::SUMMARIES => Http::failedConnection()]);

        $response = $this->actingAs($admin, 'web')->getJson(self::INSIGHTS)->assertOk()
            ->assertJsonPath('meta.metadata_unavailable', true)->assertJsonCount(10, 'data.most_watched')->assertJsonCount(10, 'data.highest_rated')
            ->assertJsonPath('data.most_watched.0.movie', null)->assertJsonPath('data.most_watched.0.watched_users', 1)
            ->assertJsonPath('data.highest_rated.0.movie', null)->assertJsonPath('data.highest_rated.0.rating_count', 2)
            ->assertJsonPath('data.highest_rated.0.average_rating', 4);
        $watched = range(600, 609);
        $rated = [711, ...range(700, 708)];
        $this->assertSame($watched, array_column($response->json('data.most_watched'), 'tmdb_id'));
        $this->assertSame($rated, array_column($response->json('data.highest_rated'), 'tmdb_id'));
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request->data() === ['tmdb_ids' => [...$watched, ...$rated]]);
        $this->getJson(self::OVERVIEW)->assertOk()->assertJsonPath('data.activity.total_ratings', 13);
        Http::assertSentCount(1);
    }

    public static function accessCases(): array
    {
        return [
            'guest' => [null, 'active', false, 401, 401],
            'member' => ['user', 'active', true, 403, 403],
            'moderator' => ['moderator', 'active', true, 403, 200],
            'restricted moderator' => ['moderator', 'restricted', true, 403, 200],
            'unverified admin' => ['admin', 'active', false, 403, 403],
            'active admin' => ['admin', 'active', true, 200, 200],
            'restricted admin' => ['admin', 'restricted', true, 200, 200],
            'banned admin' => ['admin', 'banned', true, 403, 403],
            'deactivated admin' => ['admin', 'deactivated', true, 403, 403],
        ];
    }

    #[DataProvider('accessCases')]
    public function test_current_verified_administrator_access_and_private_responses(?string $role, string $status, bool $verified, int $insightsStatus, int $overviewStatus): void
    {
        if ($role !== null) {
            $user = User::factory()->create(['role' => $role, 'email_verified_at' => $verified ? now() : null]);
            $this->actingAs($user, 'web');
            // Check a retained session using the role and status read from Core.
            User::query()->whereKey($user->id)->update(['account_status' => $status]);
        }
        $this->getJson(self::INSIGHTS)->assertStatus($insightsStatus)->assertHeader('Cache-Control', 'no-store, private');
        $this->getJson(self::OVERVIEW)->assertStatus($overviewStatus)->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_insights_rechecks_a_demoted_administrator_and_shares_the_existing_read_throttle(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin, 'web');
        User::query()->whereKey($admin->id)->update(['role' => 'moderator']);
        $this->getJson(self::INSIGHTS)->assertForbidden();

        Auth::forgetGuards();
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'web');
        for ($i = 0; $i < 60; $i++) {
            $this->getJson(self::OVERVIEW)->assertOk();
        }
        $this->getJson(self::INSIGHTS)->assertTooManyRequests()->assertHeader('Cache-Control', 'no-store, private');
    }

    private function movie(int $id, float $tmdbRating): array
    {
        return ['tmdb_id' => $id, 'title' => "Movie $id", 'poster_path' => '/poster.jpg', 'release_date' => '2024-01-02',
            'overview' => 'Unused metadata', 'backdrop_path' => null, 'tmdb_rating' => $tmdbRating, 'tmdb_vote_count' => 1000];
    }
}
