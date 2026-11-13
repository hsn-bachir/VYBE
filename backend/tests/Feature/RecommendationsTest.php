<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Recommendations\PreferenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class RecommendationsTest extends TestCase
{
    use RefreshDatabase;

    private function feature(int $id): array
    {
        return ['movie' => ['tmdb_id' => $id, 'title' => 'Fixture '.$id, 'overview' => null, 'poster_path' => '/poster.jpg', 'backdrop_path' => null, 'release_date' => '2020-01-01', 'tmdb_rating' => 8.0, 'tmdb_vote_count' => 500],
            'genres' => [['id' => 18, 'name' => 'Drama']], 'actors' => [['id' => 10, 'name' => 'Actor']], 'writers' => [['id' => 11, 'name' => 'Writer']], 'directors' => [['id' => 12, 'name' => 'Director']],
            'sources' => [['kind' => 'similar', 'id' => 1], ['kind' => 'similar', 'id' => 3]]];
    }

    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
        Http::preventStrayRequests();
        Http::fake(function ($request) {
            $ids = $request['reference_ids'] ?? range(1, 60);

            return Http::response(['data' => array_map($this->feature(...), $ids), 'meta' => ['partial' => false]]);
        });
    }

    public function test_auth_verification_account_access_and_private_headers(): void
    {
        $url = '/api/v1/me/recommendations';
        $this->getJson($url)->assertUnauthorized();
        $user = User::factory()->unverified()->create();
        $this->actingAs($user)->getJson($url)->assertForbidden();
        $user->forceFill(['email_verified_at' => now()])->save();
        $this->actingAs($user)->getJson($url)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('meta.personalized', false);
        $user->forceFill(['account_status' => 'banned'])->save();
        $this->actingAs($user)->getJson($url)->assertForbidden();
    }

    public function test_all_exclusions_cache_revision_signals_and_cross_user_isolation(): void
    {
        $user = User::factory()->create();
        $user->movieRatings()->create(['tmdb_id' => 1, 'rating' => 5]);
        $user->movieRatings()->create(['tmdb_id' => 2, 'rating' => 4]);
        $user->watchlistEntries()->create(['tmdb_id' => 3]);
        $user->watchedMovies()->create(['tmdb_id' => 4, 'watched_at' => now()]);
        $collection = $user->collections()->create(['name' => 'Test']);
        $collection->movies()->create(['tmdb_id' => 5]);
        $favorite = $user->collections()->where('system_key', 'favorites')->firstOrFail();
        $favorite->movies()->create(['tmdb_id' => 6]);
        $user->movieRatings()->create(['tmdb_id' => 6, 'rating' => 1]);
        $activity = app(PreferenceService::class)->activity($user);
        $this->assertEquals(-1, $activity['signals'][6]);
        $this->assertArrayNotHasKey(5, $activity['signals']);
        $first = $this->actingAs($user)->getJson('/api/v1/me/recommendations')->assertOk()->assertJsonPath('meta.personalized', true);
        $this->assertCount(6, $first->json('data.sections'));
        foreach ($first->json('data.sections') as $section) {
            $this->assertEmpty(array_intersect(range(1, 6), array_column($section['movies'], 'tmdb_id')));
        }
        $calls = count(Http::recorded());
        $this->getJson('/api/v1/me/recommendations')->assertOk();
        Http::assertSentCount($calls);
        $user->watchedMovies()->create(['tmdb_id' => 7, 'watched_at' => now()]);
        $next = $this->getJson('/api/v1/me/recommendations')->assertOk();
        foreach ($next->json('data.sections') as $section) {
            $this->assertNotContains(7, array_column($section['movies'], 'tmdb_id'));
        }
        $other = User::factory()->create();
        $response = $this->actingAs($other)->getJson('/api/v1/me/recommendations')->assertOk()->assertJsonPath('meta.personalized', false);
        $this->assertContains(1, array_column($response->json('data.sections.0.movies'), 'tmdb_id'));
    }

    public function test_cold_warm_measurements_and_constant_query_count(): void
    {
        $stages = [];
        Log::listen(function ($event) use (&$stages) {
            if ($event->message === 'Recommendation stages') {
                $stages[] = $event->context;
            }
        });
        $user = User::factory()->create();
        $this->actingAs($user);
        DB::enableQueryLog();
        $start = hrtime(true);
        $this->getJson('/api/v1/me/recommendations')->assertOk();
        $cold = (hrtime(true) - $start) / 1e6;
        $coldQueries = count(DB::getQueryLog());
        DB::flushQueryLog();
        $start = hrtime(true);
        $this->getJson('/api/v1/me/recommendations')->assertOk();
        $warm = (hrtime(true) - $start) / 1e6;
        $warmQueries = count(DB::getQueryLog());
        $this->assertLessThanOrEqual(12, $warmQueries);
        fwrite(STDOUT, sprintf("\nFYP fake-HTTP SQLite benchmark: cold %.2fms/%d SQL; warm %.2fms/%d SQL\n", $cold, $coldQueries, $warm, $warmQueries));
        fwrite(STDOUT, json_encode($stages)."\n");
    }

    public function test_provider_failure_is_bounded_and_safe(): void
    {
        Http::swap(new Factory);
        Http::fake(['*' => Http::response([], 503)]);
        $this->actingAs(User::factory()->create())->getJson('/api/v1/me/recommendations')->assertStatus(503);
        Http::assertSentCount(1);
    }

    public function test_mutation_during_candidate_retrieval_cannot_bypass_final_exclusions(): void
    {
        $user = User::factory()->create();
        Http::swap(new Factory);
        Http::fake(function ($request) use ($user) {
            if (! isset($request['reference_ids'])) {
                $user->watchedMovies()->firstOrCreate(['tmdb_id' => 1], ['watched_at' => now()]);
            }

            return Http::response(['data' => array_map($this->feature(...), isset($request['reference_ids']) ? [] : range(1, 20)), 'meta' => ['partial' => false]]);
        });
        $response = $this->actingAs($user)->getJson('/api/v1/me/recommendations')->assertOk();
        $this->assertNotContains(1, array_column($response->json('data.sections.0.movies'), 'tmdb_id'));
    }

    public function test_revisions_follow_rating_updates_deletion_and_library_removal(): void
    {
        $user = User::factory()->create();
        $preferences = app(PreferenceService::class);
        $user->movieRatings()->create(['tmdb_id' => 1, 'rating' => 3]);
        $neutral = $preferences->activity($user);
        $this->assertArrayNotHasKey(1, $neutral['signals']);
        $user->movieRatings()->where('tmdb_id', 1)->update(['rating' => 2]);
        $negative = $preferences->activity($user);
        $this->assertEquals(-.6, $negative['signals'][1]);
        $this->assertNotSame($neutral['revision'], $negative['revision']);
        $user->movieRatings()->delete();
        $this->assertNotContains(1, $preferences->activity($user)['excluded']);
        $user->watchlistEntries()->create(['tmdb_id' => 1]);
        $this->assertEquals(.2, $preferences->activity($user)['signals'][1]);
        $user->watchlistEntries()->delete();
        $user->watchedMovies()->create(['tmdb_id' => 1, 'watched_at' => now()]);
        $this->assertEquals(.05, $preferences->activity($user)['signals'][1]);
    }
}
