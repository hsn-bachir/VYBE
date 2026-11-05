<?php

namespace Tests\Feature;

use App\Models\AdministrativeAction;
use App\Models\Report;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ModerationTest extends TestCase
{
    use RefreshDatabase;

    private function review(User $author, int $movie = 550): Review
    {
        return $author->reviews()->create(['tmdb_id' => $movie, 'body' => 'A film with a surprising ending.', 'contains_spoilers' => false]);
    }

    private function signIn(User $user): void
    {
        Auth::forgetGuards();
        $this->actingAs($user, 'web');
    }

    private function reportUrl(Review $review): string
    {
        return "/api/v1/movies/{$review->tmdb_id}/reviews/{$review->id}/reports";
    }

    private function report(Review $review, User $reporter): Report
    {
        return Report::query()->create(['reporter_id' => $reporter->id, 'target_type' => 'review',
            'target_id' => $review->id, 'reason' => 'spoiler', 'status' => 'pending']);
    }

    public function test_reporting_requires_eligible_account_visible_other_review_and_strict_input(): void
    {
        $author = User::factory()->create();
        $review = $this->review($author);
        $url = $this->reportUrl($review);
        $this->postJson($url, ['reason' => 'spam'])->assertUnauthorized();
        $this->signIn(User::factory()->unverified()->create());
        $this->postJson($url, ['reason' => 'spam'])->assertForbidden();
        $this->signIn(User::factory()->create(['account_status' => 'restricted']));
        $this->postJson($url, ['reason' => 'spam'])->assertForbidden();
        $this->signIn(User::factory()->create());
        $this->postJson($url, ['reason' => 'invalid'])->assertUnprocessable();
        $this->postJson($url, ['reason' => 'spam', 'reporter_id' => $author->id])->assertUnprocessable();
        $this->postJson($url, ['reason' => 'spam', 'description' => str_repeat('a', 1001)])->assertUnprocessable();
        $this->postJson("/api/v1/movies/551/reviews/{$review->id}/reports", ['reason' => 'spam'])->assertNotFound();
        $this->postJson('/api/v1/movies/550/reviews/0001/reports', ['reason' => 'spam'])->assertUnprocessable();
        $this->signIn($author);
        $this->postJson($url, ['reason' => 'spam'])->assertUnprocessable();
        $review->visibility = 'hidden'; $review->save();
        $this->signIn(User::factory()->create());
        $this->postJson($url, ['reason' => 'spam'])->assertNotFound();
        $this->assertDatabaseCount('reports', 0);
    }

    public function test_report_duplicate_preserves_original_and_deleted_target_keeps_safe_metadata(): void
    {
        $review = $this->review(User::factory()->create());
        $reporter = User::factory()->create();
        $this->signIn($reporter);
        $url = $this->reportUrl($review);
        $first = $this->postJson($url, ['reason' => 'spoiler', 'description' => '  Reveals the ending.  '])
            ->assertCreated()->assertJsonPath('data.description', 'Reveals the ending.')->assertJsonMissingPath('data.resolved_by');
        $this->postJson($url, ['reason' => 'hate'])->assertOk()->assertJsonPath('data.id', $first->json('data.id'))
            ->assertJsonPath('data.reason', 'spoiler');
        $this->assertDatabaseCount('reports', 1);
        $review->delete();
        $this->signIn(User::factory()->create(['role' => 'moderator']));
        $this->getJson('/api/v1/admin/reports/'.$first->json('data.id'))->assertOk()
            ->assertJsonPath('data.target_available', false)->assertJsonMissingPath('data.review.body');
    }

    public function test_moderator_resolution_is_atomic_idempotent_and_public_spoiler_is_effective_or(): void
    {
        $author = User::factory()->create();
        $review = $this->review($author);
        $report = $this->report($review, User::factory()->create());
        $moderator = User::factory()->create(['role' => 'moderator']);
        $this->signIn($moderator);
        $url = "/api/v1/admin/reports/{$report->id}/resolve";
        $this->postJson($url, ['action' => 'mark_spoiler', 'reason' => 'Plot twist revealed'])->assertOk()
            ->assertJsonPath('data.status', 'resolved')->assertJsonPath('data.review.moderator_spoiler', true);
        $this->postJson($url, ['action' => 'mark_spoiler', 'reason' => 'Different reason'])->assertOk()
            ->assertJsonPath('data.resolution_note', 'Plot twist revealed');
        $this->postJson($url, ['action' => 'hide', 'reason' => 'Changed mind'])->assertStatus(409);
        $this->assertDatabaseCount('administrative_actions', 1);
        $this->assertDatabaseHas('administrative_actions', ['actor_id' => $moderator->id,
            'action' => 'report.resolved', 'target_type' => 'report', 'target_id' => $report->id]);
        $this->getJson('/api/v1/movies/550/reviews')->assertJsonPath('data.0.contains_spoilers', true);
        $this->signIn($author);
        $this->patchJson("/api/v1/movies/550/reviews/{$review->id}",
            ['body' => 'Revised text', 'contains_spoilers' => false])->assertOk()
            ->assertJsonPath('data.moderator_spoiler', true)->assertJsonPath('data.contains_spoilers', true);
        $this->assertFalse($review->fresh()->contains_spoilers);
    }

    public function test_visibility_filters_public_before_pagination_and_preserves_owner_edits(): void
    {
        $author = User::factory()->create();
        $visible = $this->review($author);
        $hidden = $this->review(User::factory()->create());
        $moderator = User::factory()->create(['role' => 'moderator']);
        $this->signIn($moderator);
        $this->putJson("/api/v1/admin/reviews/{$hidden->id}/visibility",
            ['visibility' => 'hidden', 'reason' => 'Harassment'])->assertOk();
        $this->getJson('/api/v1/movies/550/reviews?per_page=1')->assertOk()
            ->assertJsonPath('meta.total_results', 1)->assertJsonPath('data.0.id', $visible->id);
        $this->signIn($hidden->user);
        $this->getJson('/api/v1/me/reviews/550')->assertOk()
            ->assertJsonPath('data.visibility', 'hidden');
        $this->patchJson("/api/v1/movies/550/reviews/{$hidden->id}", ['body' => 'Edited'])->assertOk();
        $this->assertSame('hidden', $hidden->fresh()->visibility);
        $this->signIn($moderator);
        $this->putJson("/api/v1/admin/reviews/{$hidden->id}/visibility",
            ['visibility' => 'visible', 'reason' => 'Restored'])->assertOk();
        $this->getJson('/api/v1/movies/550/reviews')->assertJsonPath('meta.total_results', 2);
    }

    public function test_moderator_permissions_history_scope_and_deleted_target_dismissal(): void
    {
        $review = $this->review(User::factory()->create());
        $report = $this->report($review, User::factory()->create());
        $user = User::factory()->create();
        $this->signIn($user);
        $this->getJson('/api/v1/admin/reports')->assertForbidden();
        $moderator = User::factory()->create(['role' => 'moderator']);
        $this->signIn($moderator);
        $this->getJson('/api/v1/admin/users')->assertForbidden();
        $this->getJson('/api/v1/admin/reports')->assertOk()->assertJsonPath('meta.total_results', 1);
        AdministrativeAction::query()->create(['actor_id' => $moderator->id, 'action' => 'user.updated',
            'target_type' => 'user', 'target_id' => $user->id, 'details' => ['email_changed' => true], 'created_at' => now()]);
        $review->delete();
        $this->postJson("/api/v1/admin/reports/{$report->id}/resolve", ['action' => 'hide', 'reason' => 'Gone'])
            ->assertStatus(409)->assertJsonPath('code', 'TARGET_UNAVAILABLE');
        $this->postJson("/api/v1/admin/reports/{$report->id}/dismiss", ['reason' => 'Target deleted'])->assertOk()
            ->assertJsonPath('data.target_available', false);
        $this->postJson("/api/v1/admin/reports/{$report->id}/dismiss", ['reason' => 'Another'])->assertOk()
            ->assertJsonPath('data.resolution_note', 'Target deleted');
        $this->getJson('/api/v1/admin/actions')->assertOk()->assertJsonPath('meta.total_results', 1)
            ->assertJsonPath('data.0.action', 'report.dismissed');
        $this->assertDatabaseCount('administrative_actions', 2);
    }

    public function test_restricted_moderator_can_read_but_not_mutate_and_audit_failure_rolls_back(): void
    {
        $review = $this->review(User::factory()->create());
        $moderator = User::factory()->create(['role' => 'moderator', 'account_status' => 'restricted']);
        $this->signIn($moderator);
        $this->getJson('/api/v1/admin/reviews')->assertOk();
        $this->putJson("/api/v1/admin/reviews/{$review->id}/visibility", ['visibility' => 'hidden', 'reason' => 'Bad'])
            ->assertForbidden();
        DB::table('users')->where('id', $moderator->id)->update(['account_status' => 'active']);
        $this->signIn($moderator->fresh());
        AdministrativeAction::creating(fn () => throw new \RuntimeException('Audit failure'));
        try {
            $this->putJson("/api/v1/admin/reviews/{$review->id}/visibility", ['visibility' => 'hidden', 'reason' => 'Bad'])
                ->assertStatus(500);
        } finally {
            AdministrativeAction::flushEventListeners();
        }
        $this->assertSame('visible', $review->fresh()->visibility);
        $this->assertDatabaseCount('administrative_actions', 0);
    }

    public function test_spoiler_direct_change_preserves_author_flag_and_noop_has_no_audit(): void
    {
        $author = User::factory()->create();
        $review = $this->review($author);
        $review->contains_spoilers = true; $review->save();
        $this->signIn(User::factory()->create(['role' => 'admin']));
        $url = "/api/v1/admin/reviews/{$review->id}/spoiler";
        $this->putJson($url, ['moderator_spoiler' => true, 'reason' => 'Spoiler'])->assertOk();
        $this->putJson($url, ['moderator_spoiler' => true, 'reason' => 'Again'])->assertOk();
        $this->putJson($url, ['moderator_spoiler' => false, 'reason' => 'Cleared'])->assertOk()
            ->assertJsonPath('data.contains_spoilers', true);
        $this->putJson($url, ['moderator_spoiler' => 1, 'reason' => 'Bad'])->assertUnprocessable();
        $this->assertDatabaseCount('administrative_actions', 2);
    }

    public function test_report_csrf_is_enforced(): void
    {
        $author = User::factory()->create();
        $review = $this->review($author);
        $this->signIn(User::factory()->create());
        $this->app->instance('env', 'local');
        $this->postJson($this->reportUrl($review), ['reason' => 'spam'])->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie');
        $this->withHeader('X-XSRF-TOKEN', $csrf->getCookie('XSRF-TOKEN', false)->getValue())
            ->postJson($this->reportUrl($review), ['reason' => 'spam'])->assertCreated();
    }

    public function test_report_rate_limit_is_five_attempts_per_hour_per_user(): void
    {
        $this->signIn(User::factory()->create());
        for ($i = 0; $i < 5; $i++) {
            $next = $this->review(User::factory()->create(), 550 + $i);
            $this->postJson($this->reportUrl($next), ['reason' => 'spam'])->assertCreated();
        }
        $sixth = $this->review(User::factory()->create(), 556);
        $this->postJson($this->reportUrl($sixth), ['reason' => 'spam'])->assertTooManyRequests();
        $this->assertDatabaseCount('reports', 5);
    }
}
