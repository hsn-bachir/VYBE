<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AdminDashboardOptimizationTest extends TestCase
{
    use RefreshDatabase;

    private function review(int $movie = 550): Review
    {
        return User::factory()->create()->reviews()->create([
            'tmdb_id' => $movie, 'body' => str_repeat('Review content ', 40), 'contains_spoilers' => false,
        ]);
    }

    private function report(Review $review, string $status = 'pending'): Report
    {
        return Report::query()->create([
            'reporter_id' => User::factory()->create()->id, 'target_type' => 'review',
            'target_id' => $review->id, 'reason' => 'spoiler', 'status' => $status,
        ]);
    }

    public function test_overview_uses_real_aggregates_and_hides_user_counts_from_moderators(): void
    {
        $attention = $this->review();
        $this->report($attention);
        $this->report($this->review(551), 'dismissed');
        $actioned = $this->review(552);
        $actioned->visibility = 'hidden';
        $actioned->moderator_spoiler = true;
        $actioned->save();
        User::factory()->create(['account_status' => 'restricted']);
        $moderator = User::factory()->create(['role' => 'moderator']);
        $this->getJson('/api/v1/admin/overview')->assertUnauthorized();
        $this->actingAs(User::factory()->create(), 'web')->getJson('/api/v1/admin/overview')->assertForbidden();
        Auth::forgetGuards();
        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->actingAs($moderator, 'web')->getJson('/api/v1/admin/overview')->assertOk()
            ->assertJsonPath('data.pending_reports', 1)->assertJsonPath('data.handled_reports', 1)
            ->assertJsonPath('data.hidden_reviews', 1)->assertJsonPath('data.enforced_spoilers', 1)
            ->assertJsonCount(2, 'data.recent_reports')->assertJsonMissingPath('data.users');
        $aggregates = array_filter(DB::getQueryLog(), fn ($query) => str_contains($query['query'], 'hidden_reviews')
            || str_contains($query['query'], 'pending_reports'));
        $this->assertCount(1, $aggregates);
        DB::disableQueryLog();
        $admin = User::factory()->create(['role' => 'admin']);
        Auth::forgetGuards();
        $this->actingAs($admin, 'web')->getJson('/api/v1/admin/overview')->assertOk()
            ->assertJsonPath('data.users.restricted', 1)->assertJsonPath('data.users.total', 9);
        $this->getJson('/api/v1/admin/overview?unknown=1')->assertUnprocessable();
    }

    public function test_review_scopes_compact_projection_and_full_inspection(): void
    {
        $attention = $this->review();
        $this->report($attention);
        $this->report($attention);
        $hidden = $this->review(551);
        $hidden->visibility = 'hidden';
        $hidden->save();
        $spoiler = $this->review(552);
        $spoiler->moderator_spoiler = true;
        $spoiler->save();
        $normal = $this->review(553);
        $this->actingAs(User::factory()->create(['role' => 'moderator']), 'web');

        $this->getJson('/api/v1/admin/reviews?scope=needs_attention&compact=1')->assertOk()
            ->assertJsonPath('meta.total_results', 1)->assertJsonPath('data.0.id', $attention->id)
            ->assertJsonPath('data.0.pending_report_count', 2)->assertJsonMissingPath('data.0.body');
        $this->getJson('/api/v1/admin/reviews?scope=actioned&actioned_type=hidden')->assertOk()
            ->assertJsonPath('meta.total_results', 1)->assertJsonPath('data.0.id', $hidden->id);
        $this->getJson('/api/v1/admin/reviews?scope=actioned&actioned_type=spoiler')->assertOk()
            ->assertJsonPath('meta.total_results', 1)->assertJsonPath('data.0.id', $spoiler->id);
        $this->getJson('/api/v1/admin/reviews?scope=all&tmdb_id=553')->assertOk()
            ->assertJsonPath('meta.total_results', 1)->assertJsonPath('data.0.id', $normal->id);
        $this->getJson('/api/v1/admin/reviews')->assertJsonPath('meta.total_results', 4);
        $this->getJson('/api/v1/admin/reviews/'.$attention->id)->assertOk()
            ->assertJsonPath('data.body', $attention->body);
        $this->getJson('/api/v1/admin/reviews?scope=invalid')->assertUnprocessable();
        $this->getJson('/api/v1/admin/reviews?per_page=51')->assertUnprocessable();
    }

    public function test_report_filters_compact_payload_and_optional_nonpunitive_reasons(): void
    {
        $review = $this->review();
        $report = $this->report($review);
        $this->actingAs(User::factory()->create(['role' => 'moderator']), 'web');
        $this->getJson("/api/v1/admin/reports?status=all&target_id={$review->id}&compact=1")
            ->assertOk()->assertJsonPath('meta.total_results', 1)->assertJsonMissingPath('data.0.review.body');
        $this->postJson("/api/v1/admin/reports/{$report->id}/dismiss", [])->assertOk()
            ->assertJsonPath('data.status', 'dismissed');
        $this->assertDatabaseHas('administrative_actions', ['action' => 'report.dismissed', 'reason' => null]);
        $this->putJson("/api/v1/admin/reviews/{$review->id}/visibility", ['visibility' => 'hidden'])->assertUnprocessable();
        $this->putJson("/api/v1/admin/reviews/{$review->id}/spoiler", ['moderator_spoiler' => true])->assertOk();
        $this->assertDatabaseHas('administrative_actions', ['action' => 'review.spoiler_set', 'reason' => null]);
        $this->putJson("/api/v1/admin/reviews/{$review->id}/visibility", ['visibility' => 'hidden', 'reason' => 'Policy violation'])->assertOk();
        $this->putJson("/api/v1/admin/reviews/{$review->id}/visibility", ['visibility' => 'visible'])->assertOk();
        $this->assertDatabaseHas('administrative_actions', ['action' => 'review.restored', 'reason' => null]);
    }

    public function test_batched_movie_titles_validate_ids_and_fail_safely(): void
    {
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
        Http::preventStrayRequests();
        $this->getJson('/api/v1/admin/movie-summaries?tmdb_ids[0]=550')->assertUnauthorized();
        $this->actingAs(User::factory()->create(['role' => 'moderator']), 'web');
        Http::fake(['*' => Http::response(['data' => [[
            'tmdb_id' => 550, 'title' => 'Fixture 550', 'overview' => null, 'poster_path' => null,
            'backdrop_path' => null, 'release_date' => null, 'tmdb_rating' => null, 'tmdb_vote_count' => null,
        ]], 'meta' => ['requested_count' => 2, 'returned_count' => 1, 'missing_tmdb_ids' => [551]]])]);
        $this->getJson('/api/v1/admin/movie-summaries?tmdb_ids[0]=550&tmdb_ids[1]=551')->assertOk()
            ->assertJsonPath('data.0.title', 'Fixture 550')->assertJsonPath('meta.missing_tmdb_ids.0', 551);
        Http::assertSentCount(1);
        $this->getJson('/api/v1/admin/movie-summaries?tmdb_ids[0]=0')->assertUnprocessable();
        $this->getJson('/api/v1/admin/movie-summaries?tmdb_ids[0]=550&tmdb_ids[1]=550')->assertUnprocessable();
        $this->getJson('/api/v1/admin/movie-summaries?tmdb_ids[1]=550')->assertUnprocessable();
        $this->getJson('/api/v1/admin/movie-summaries?tmdb_ids[0]=550&unknown=1')->assertUnprocessable();
        Http::assertSentCount(1);
        Http::fake(['*' => Http::response([], 503)]);
        $this->getJson('/api/v1/admin/movie-summaries?tmdb_ids[0]=550')->assertStatus(503);
    }

    public function test_routine_account_actions_accept_no_reason_but_sanctions_require_one(): void
    {
        Mail::fake();
        Notification::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create();
        $this->actingAs($admin, 'web');
        $base = "/api/v1/admin/users/{$target->id}";
        $this->putJson($base.'/role', ['role' => 'moderator'])->assertOk();
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.role_changed', 'reason' => null]);
        $this->putJson($base.'/status', ['account_status' => 'restricted'])->assertUnprocessable();
        $this->putJson($base.'/status', ['account_status' => 'restricted', 'reason' => '  '])->assertUnprocessable();
        $this->putJson($base.'/status', ['account_status' => 'restricted', 'reason' => 'Safety policy'])->assertOk();
        $this->putJson($base.'/status', ['account_status' => 'active'])->assertOk();
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.status_changed', 'reason' => null]);
        $this->patchJson($base, ['username' => 'new_account_name'])->assertOk();
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.updated', 'reason' => null]);
        $this->putJson($base.'/password', [
            'admin_current_password' => 'password', 'password' => 'newPassword123!',
            'password_confirmation' => 'newPassword123!',
        ])->assertNoContent();
        $this->assertTrue(Hash::check('newPassword123!', $target->fresh()->password));
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.password_changed', 'reason' => null]);
        $this->postJson($base.'/password-reset', [])->assertStatus(202);
        $this->assertDatabaseHas('administrative_actions', ['action' => 'user.password_reset_initiated', 'reason' => null]);
    }

    public function test_paginated_review_and_report_lists_use_bounded_database_queries(): void
    {
        for ($i = 0; $i < 20; $i++) $this->report($this->review(600 + $i));
        $this->actingAs(User::factory()->create(['role' => 'moderator']), 'web');
        $queries = [];
        DB::listen(function ($event) use (&$queries): void { $queries[] = $event->sql; });
        $this->getJson('/api/v1/admin/reviews?scope=needs_attention&compact=1')->assertOk()
            ->assertJsonCount(20, 'data');
        $reviewQueries = count($queries);
        $queries = [];
        $this->getJson('/api/v1/admin/reports?compact=1')->assertOk()->assertJsonCount(20, 'data');
        $reportQueries = count($queries);
        $this->assertLessThanOrEqual(10, $reviewQueries, 'Review page queries should not grow with 20 rows.');
        $this->assertLessThanOrEqual(10, $reportQueries, 'Report page queries should not grow with 20 rows.');
    }
}
