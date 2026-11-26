<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Enums\MovieNightStatus;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\User;
use App\Services\MovieNights\MovieNightInvitationService;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MovieNightInvitationsTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/me/movie-nights';

    private User $host;

    private User $target;

    private MovieNight $night;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->travelTo(CarbonImmutable::parse('2027-01-15T18:00:00Z'));
        $this->host = User::factory()->create();
        $this->target = User::factory()->create(['username' => 'cinema_fan']);
        $this->night = new MovieNight(['title' => 'Private cinema', 'starts_at' => now()->addDay(), 'timezone' => 'Asia/Beirut', 'location' => 'Private place']);
        $this->night->host()->associate($this->host);
        $this->night->save();
    }

    private function signIn(User $user): void
    {
        Auth::forgetGuards();
        $this->actingAs($user, 'web');
    }

    private function path(string $suffix = 'invitations'): string
    {
        return self::URL.'/'.$this->night->id.'/'.$suffix;
    }

    private function invite(?User $target = null): TestResponse
    {
        return $this->postJson($this->path(), ['invited_user_id' => ($target ?? $this->target)->id]);
    }

    public static function endpoints(): array
    {
        return [['GET', '/1/eligible-users?query=cin', []], ['POST', '/1/invitations', ['invited_user_id' => 2]], ['GET', '/invitations', []], ['GET', '/1/invitations', []]];
    }

    #[DataProvider('endpoints')]
    public function test_authentication_and_account_gates(string $method, string $suffix, array $body): void
    {
        $this->json($method, self::URL.$suffix, $body)->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
        foreach ([['email_verified_at' => null], ['account_status' => User::STATUS_BANNED], ['account_status' => User::STATUS_DEACTIVATED]] as $fields) {
            $this->signIn(User::factory()->create($fields));
            $this->json($method, self::URL.$suffix, $body)->assertForbidden();
        }
        $this->signIn(User::factory()->create(['invitation_pending' => true]));
        $this->json($method, self::URL.$suffix, $body)->assertStatus($suffix === '/invitations' ? 403 : 404);
    }

    public function test_lookup_is_event_scoped_private_eligible_and_paginated(): void
    {
        User::factory()->create(['username' => 'cinema_two']);
        foreach ([['account_status' => User::STATUS_BANNED], ['account_status' => User::STATUS_RESTRICTED], ['account_status' => User::STATUS_DEACTIVATED], ['email_verified_at' => null], ['invitation_pending' => true]] as $i => $fields) {
            User::factory()->create($fields + ['username' => 'cinema_hidden'.$i]);
        }
        User::factory()->create(['username' => 'cinemaxfan']);
        User::factory()->create(['username' => 'unrelated', 'email' => 'cinema@example.com']);
        $this->signIn($this->host);
        $result = $this->getJson($this->path('eligible-users').'?query=%20CINEMA_%20&per_page=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total_results', 2)->assertJsonPath('meta.total_pages', 2)->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame(['id', 'username', 'avatar_url'], array_keys($result->json('data.0')));
        $this->getJson($this->path('eligible-users').'?query=cinema_&page=2&per_page=1')->assertOk()->assertJsonPath('data.0.username', 'cinema_two');
        $this->invite()->assertCreated();
        $this->getJson($this->path('eligible-users').'?query=cinema_')->assertOk()->assertJsonPath('meta.total_results', 1);
        $this->getJson($this->path('eligible-users').'?query='.$this->host->username)->assertOk()->assertJsonPath('meta.total_results', 0);
        Http::assertNothingSent();
    }

    public function test_create_pending_invitation_and_duplicate_self_rejection(): void
    {
        $this->signIn($this->host);
        $this->invite($this->host)->assertUnprocessable()->assertJsonValidationErrors('invited_user_id');
        $result = $this->invite()->assertCreated()->assertJsonPath('data.rsvp_status', 'pending')->assertJsonPath('data.responded_at', null)->assertJsonPath('data.participant.id', $this->target->id);
        $this->assertSame(['id', 'participant', 'rsvp_status', 'responded_at'], array_keys($result->json('data')));
        $this->assertSame(['id', 'username', 'avatar_url'], array_keys($result->json('data.participant')));
        foreach (MovieNightRsvp::cases() as $status) {
            MovieNightInvitation::query()->first()->update(['rsvp_status' => $status]);
            $this->invite()->assertStatus(409);
        }
        $this->assertDatabaseCount('movie_night_invitations', 1);
        $this->signIn($this->target);
        $this->getJson(self::URL.'/'.$this->night->id)->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        Http::assertNothingSent();
    }

    public static function ineligibleTargets(): array
    {
        return [[['account_status' => User::STATUS_RESTRICTED]], [['account_status' => User::STATUS_BANNED]], [['account_status' => User::STATUS_DEACTIVATED]], [['email_verified_at' => null]], [['invitation_pending' => true]]];
    }

    #[DataProvider('ineligibleTargets')]
    public function test_target_eligibility(array $fields): void
    {
        $this->target->forceFill($fields)->save();
        $this->signIn($this->host);
        $this->invite()->assertUnprocessable()->assertJsonValidationErrors('invited_user_id');
        $this->postJson($this->path(), ['invited_user_id' => 9223372036854775807])->assertUnprocessable();
        $this->assertDatabaseCount('movie_night_invitations', 0);
    }

    public function test_host_only_permissions_and_nonmember_privacy_including_admins(): void
    {
        $this->signIn($this->host);
        $this->invite()->assertCreated();
        $this->signIn($this->target);
        $this->getJson($this->path())->assertForbidden();
        $this->getJson($this->path('eligible-users').'?query=cin')->assertForbidden();
        $this->invite(User::factory()->create())->assertForbidden();
        foreach ([User::ROLE_USER, User::ROLE_ADMIN, User::ROLE_MODERATOR] as $role) {
            $this->signIn(User::factory()->create(['role' => $role]));
            $this->getJson($this->path())->assertNotFound();
            $this->getJson($this->path('eligible-users').'?query=cin')->assertNotFound();
            $this->invite()->assertNotFound();
        }
    }

    public function test_restricted_members_can_read_but_cannot_invite_or_lookup(): void
    {
        $this->signIn($this->host);
        $this->invite()->assertCreated();
        $this->host->forceFill(['account_status' => User::STATUS_RESTRICTED])->save();
        $this->signIn($this->host);
        $this->getJson($this->path())->assertOk();
        $this->getJson($this->path('eligible-users').'?query=cin')->assertForbidden();
        $this->invite()->assertForbidden();
        $this->target->forceFill(['account_status' => User::STATUS_RESTRICTED])->save();
        $this->signIn($this->target);
        $this->getJson(self::URL.'/invitations')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_exact_start_and_terminal_events(): void
    {
        $this->signIn($this->host);
        $start = $this->night->starts_at;
        $this->travelTo($start->subMicrosecond());
        $this->getJson($this->path('eligible-users').'?query=cin')->assertOk();
        $this->invite()->assertCreated();
        $this->travelTo($start);
        $this->invite(User::factory()->create())->assertStatus(409);
        $this->getJson($this->path('eligible-users').'?query=cin')->assertStatus(409);
        $this->travelTo($start->addSecond());
        $this->invite()->assertStatus(409);
        foreach ([MovieNightStatus::Cancelled, MovieNightStatus::Finalized] as $status) {
            $this->travelTo($start->subHour());
            $this->night->forceFill(['status' => $status, 'cancelled_at' => $status === MovieNightStatus::Cancelled ? now() : null, 'finalized_at' => $status === MovieNightStatus::Finalized ? now() : null, 'finalized_tmdb_id' => $status === MovieNightStatus::Finalized ? 550 : null])->save();
            $this->invite()->assertStatus(409);
            $this->getJson($this->path('eligible-users').'?query=cin')->assertStatus(409);
            $this->getJson($this->path())->assertOk()->assertJsonCount(1, 'data');
            $this->signIn($this->target);
            $this->getJson(self::URL.'/invitations')->assertOk()->assertJsonPath('data.0.movie_night.status', $status->value);
            $this->signIn($this->host);
        }
    }

    public function test_received_and_host_listing_scope_pagination_and_statuses(): void
    {
        $this->signIn($this->host);
        $id = $this->invite()->assertCreated()->json('data.id');
        $this->invite(User::factory()->create())->assertCreated();
        $this->getJson($this->path().'?per_page=1&page=2')->assertOk()->assertJsonPath('meta.total_results', 2)->assertJsonCount(1, 'data');
        $this->signIn($this->target);
        foreach (MovieNightRsvp::cases() as $status) {
            MovieNightInvitation::findOrFail($id)->update(['rsvp_status' => $status, 'responded_at' => $status === MovieNightRsvp::Pending ? null : now()]);
            $result = $this->getJson(self::URL.'/invitations?per_page=1')->assertOk();
            if ($status === MovieNightRsvp::Accepted) {
                $result->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 0);
            } else {
                $result->assertJsonCount(1, 'data')->assertJsonPath('meta.total_results', 1)->assertJsonPath('data.0.id', $id)->assertJsonPath('data.0.rsvp_status', $status->value)->assertJsonPath('data.0.movie_night.my_rsvp', $status->value);
                $this->assertArrayNotHasKey('location', $result->json('data.0.movie_night'));
                $this->assertArrayNotHasKey('meeting_url', $result->json('data.0.movie_night'));
                $this->assertSame(['id', 'username', 'avatar_url'], array_keys($result->json('data.0.movie_night.host')));
            }
            $this->signIn($this->host);
            $this->getJson($this->path())->assertOk()->assertJsonPath('data.0.rsvp_status', $status->value);
            $this->signIn($this->target);
        }
        $this->getJson(self::URL.'/invitations?page=2&per_page=1')->assertOk()->assertJsonCount(0, 'data');
        $this->signIn(User::factory()->create());
        $this->getJson(self::URL.'/invitations')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 0);
    }

    public function test_validation_allowlists_ids_and_search(): void
    {
        $this->signIn($this->host);
        foreach ([[], ['invited_user_id' => '01'], ['invited_user_id' => 0], ['invited_user_id' => '9223372036854775808'], ['invited_user_id' => $this->target->id, 'rsvp_status' => 'accepted'], ['invited_user_id' => $this->target->id, 'night' => 1], ['invited_user_id' => $this->target->id, 'host_user_id' => $this->host->id]] as $body) {
            $this->postJson($this->path(), $body)->assertUnprocessable();
        }
        foreach (['ci', 'cin%25', 'cin@x.com', str_repeat('a', 31), 'cin&email=x', 'cin&per_page=51', 'cin&page=0', 'cin&night=1'] as $query) {
            $this->getJson($this->path('eligible-users').'?query='.$query)->assertUnprocessable();
        }
        foreach (['per_page=51', 'page=0', 'status=pending', 'invited_user_id=1', 'night=1'] as $query) {
            $this->getJson(self::URL.'/invitations?'.$query)->assertUnprocessable();
            $this->getJson($this->path().'?'.$query)->assertUnprocessable();
        }
        $this->getJson(self::URL.'/01/invitations')->assertUnprocessable();
        $this->getJson(self::URL.'/9223372036854775807/invitations')->assertNotFound();
    }

    public function test_stale_actor_and_target_are_rechecked(): void
    {
        User::whereKey($this->target->id)->update(['account_status' => User::STATUS_RESTRICTED]);
        try {
            app(MovieNightInvitationService::class)->create($this->host, $this->night->id, $this->target->id);
            $this->fail('Stale target must be rejected.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('invited_user_id', $e->errors());
        }
        User::whereKey($this->host->id)->update(['email_verified_at' => null]);
        $this->expectException(AuthorizationException::class);
        app(MovieNightInvitationService::class)->create($this->host, $this->night->id, $this->target->id);
    }

    public function test_capacity(): void
    {
        $users = User::factory()->count(200)->create();
        DB::table('movie_night_invitations')->insert($users->map(fn ($user) => ['movie_night_id' => $this->night->id, 'invited_user_id' => $user->id, 'rsvp_status' => 'pending'])->all());
        $this->signIn($this->host);
        $this->invite()->assertStatus(409);
        $this->assertDatabaseCount('movie_night_invitations', 200);
    }

    public function test_csrf_and_shared_throttles(): void
    {
        $this->signIn($this->host);
        $this->app->instance('env', 'local');
        $this->invite()->assertStatus(419);
        $this->withHeader('Origin', 'http://localhost:5173');
        $this->invite()->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie')->getCookie('XSRF-TOKEN', false)->getValue();
        $this->withHeader('X-XSRF-TOKEN', $csrf);
        $this->invite()->assertCreated();
        $this->travel(61)->seconds();
        for ($i = 0; $i < 60; $i++) {
            $this->invite()->assertStatus(409);
        }
        $this->invite()->assertTooManyRequests()->assertHeader('Retry-After')->assertHeader('Cache-Control', 'no-store, private');
        for ($i = 0; $i < 120; $i++) {
            $this->getJson(self::URL.'/invitations')->assertOk();
        }
        $this->getJson($this->path())->assertTooManyRequests();
        $this->getJson($this->path('eligible-users').'?query=cin')->assertTooManyRequests();
    }

    public function test_m7_session_and_firebase_safeguards(): void
    {
        config(['firebase_auth.mode' => 'firebase']);
        $this->host->forceFill(['firebase_uid' => 'fixture-host', 'password_session_version' => 'new'])->save();
        $this->signIn($this->host);
        $this->withSession(['password_session_version' => 'old']);
        $this->invite()->assertUnauthorized();
        $this->signIn($this->host);
        $this->withSession(['password_session_version' => 'new']);
        $this->invite()->assertCreated();
        $this->target->forceFill(['firebase_uid' => 'fixture-target', 'password_session_version' => 'current'])->save();
        $this->signIn($this->target);
        $this->withSession(['password_session_version' => 'old'])->getJson(self::URL.'/invitations')->assertUnauthorized();
        $this->signIn($this->target);
        $this->withSession(['password_session_version' => 'current'])->getJson(self::URL.'/invitations')->assertOk();
        $this->signIn(User::factory()->create());
        $this->getJson(self::URL.'/invitations')->assertUnauthorized();
    }

    public function test_received_listing_has_bounded_queries(): void
    {
        $this->signIn($this->host);
        $this->invite()->assertCreated();
        for ($i = 0; $i < 7; $i++) {
            $night = $this->night->replicate();
            $night->save();
            app(MovieNightInvitationService::class)->create($this->host, $night->id, $this->target->id);
        }
        $this->signIn($this->target);
        DB::enableQueryLog();
        try {
            DB::flushQueryLog();
            $this->getJson(self::URL.'/invitations?per_page=1')->assertOk();
            $one = count(DB::getQueryLog());
            DB::flushQueryLog();
            $this->getJson(self::URL.'/invitations?per_page=8')->assertOk()->assertJsonCount(8, 'data');
            $this->assertSame($one, count(DB::getQueryLog()));
        } finally {
            DB::disableQueryLog();
        }
        Http::assertNothingSent();
    }

    public function test_postgres_failed_insert_rolls_back_and_hides_diagnostics(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Real PostgreSQL forced write failure.');
        }
        $this->signIn($this->host);
        DB::statement('ALTER TABLE movie_night_invitations ADD CONSTRAINT mn_invitation_fail CHECK (invited_user_id <> '.$this->target->id.') NOT VALID');
        try {
            config(['app.debug' => true]);
            $this->invite()->assertStatus(500)->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
            $this->assertDatabaseCount('movie_night_invitations', 0);
        } finally {
            DB::statement('ALTER TABLE movie_night_invitations DROP CONSTRAINT mn_invitation_fail');
        }
        $this->invite()->assertCreated();
    }
}
