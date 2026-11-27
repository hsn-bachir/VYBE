<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Enums\MovieNightStatus;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\User;
use App\Services\MovieNights\MovieNightService;
use App\Services\MovieNights\MovieNightTransitions;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class MovieNightManagementTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/me/movie-nights';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->travelTo(CarbonImmutable::parse('2027-01-15T18:00:00Z'));
    }

    private function signIn(User $user, string $guard = 'web'): void
    {
        // Sanctum's resolved guard can otherwise retain the previous actor
        // when a feature test switches users between requests.
        Auth::forgetGuards();
        $this->actingAs($user, $guard);
    }

    private function payload(array $fields = []): array
    {
        return array_merge(['title' => 'Friday cinema', 'starts_at' => now()->addDay()->format('Y-m-d\TH:i:s\Z'),
            'timezone' => 'Asia/Beirut', 'location' => 'Living room', 'meeting_url' => 'https://example.com/room'], $fields);
    }

    private function night(?User $host = null, array $fields = []): MovieNight
    {
        $night = new MovieNight($this->payload($fields));
        $night->host()->associate($host ?? User::factory()->create());
        $night->save();

        return $night->refresh();
    }

    private function invite(MovieNight $night, User $user, MovieNightRsvp $status = MovieNightRsvp::Pending): MovieNightInvitation
    {
        $invitation = new MovieNightInvitation(['rsvp_status' => $status]);
        $invitation->movieNight()->associate($night);
        $invitation->invitedUser()->associate($user);
        $invitation->save();

        return $invitation;
    }

    public static function endpoints(): array
    {
        return [['GET', '', []], ['POST', '', []], ['GET', '/1', []], ['PATCH', '/1', ['title' => 'Changed']], ['POST', '/1/cancel', []]];
    }

    #[DataProvider('endpoints')]
    public function test_all_endpoints_require_session_and_verified_account(string $method, string $suffix, array $body): void
    {
        $this->json($method, self::URL.$suffix, $body)->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
        $this->signIn(User::factory()->unverified()->create(), 'web');
        $this->json($method, self::URL.$suffix, $body)->assertForbidden()->assertHeader('Cache-Control', 'no-store, private');
        Http::assertNothingSent();
    }

    public function test_create_assigns_host_and_returns_only_safe_documented_fields(): void
    {
        $host = User::factory()->create(['firebase_uid' => 'fixture-uid']);
        $this->signIn($host, 'web');
        $response = $this->postJson(self::URL, $this->payload(['title' => '  Friday cinema  ']))->assertCreated()
            ->assertHeader('Cache-Control', 'no-store, private');
        $night = MovieNight::query()->sole();
        $response->assertExactJson(['data' => [
            'id' => $night->id, 'title' => 'Friday cinema',
            'host' => ['id' => $host->id, 'username' => $host->username, 'avatar_url' => null],
            'starts_at' => $night->starts_at->toISOString(), 'timezone' => 'Asia/Beirut', 'status' => 'scheduled',
            'finalized_tmdb_id' => null, 'finalized_at' => null, 'cancelled_at' => null, 'my_rsvp' => 'accepted',
            'voting_open' => true, 'created_at' => now()->toISOString(), 'updated_at' => now()->toISOString(),
            'location' => 'Living room', 'meeting_url' => 'https://example.com/room',
        ]]);
        $this->assertSame($host->id, $night->host_user_id);
        $this->assertDatabaseCount('movie_night_invitations', 0);
        $this->assertDatabaseCount('movie_night_votes', 0);
        Http::assertNothingSent();
    }

    public function test_optional_fields_can_be_omitted_and_cleared_on_patch(): void
    {
        $host = User::factory()->create();
        $this->signIn($host, 'web');
        $id = $this->postJson(self::URL, array_diff_key($this->payload(), ['location' => true, 'meeting_url' => true]))
            ->assertCreated()->assertJsonPath('data.location', null)->assertJsonPath('data.meeting_url', null)->json('data.id');
        $this->patchJson(self::URL.'/'.$id, ['location' => '  Hall  ', 'meeting_url' => 'https://example.com/new'])
            ->assertOk()->assertJsonPath('data.location', 'Hall');
        $this->patchJson(self::URL.'/'.$id, ['location' => null, 'meeting_url' => null])->assertOk()
            ->assertJsonPath('data.location', null)->assertJsonPath('data.meeting_url', null)->assertJsonPath('data.title', 'Friday cinema');
        $this->patchJson(self::URL.'/'.$id, [])->assertUnprocessable();
    }

    public static function invalidFields(): array
    {
        return [
            [['title' => '']], [['title' => '  ']], [['title' => null]], [['title' => []]], [['title' => str_repeat('a', 151)]],
            [['starts_at' => null]], [['starts_at' => '2027-01-16T20:00:00']], [['starts_at' => '2027-01-16T20:00:00+02:00']],
            [['starts_at' => '2027-02-30T18:00:00Z']], [['starts_at' => 'not a date']],
            [['timezone' => 'Mars/Olympus']], [['timezone' => null]], [['timezone' => []]],
            [['location' => str_repeat('a', 501)]], [['location' => false]],
            [['meeting_url' => 'http://example.com']], [['meeting_url' => 'javascript:alert(1)']],
            [['meeting_url' => 'https://example.com/'.str_repeat('a', 2048)]],
        ];
    }

    #[DataProvider('invalidFields')]
    public function test_invalid_fields_are_rejected_for_create_and_update(array $fields): void
    {
        $host = User::factory()->create();
        $night = $this->night($host);
        $original = $night->getRawOriginal();
        $this->signIn($host, 'web');
        $this->postJson(self::URL, $this->payload($fields))->assertUnprocessable();
        $this->patchJson(self::URL.'/'.$night->id, $fields)->assertUnprocessable();
        $this->assertSame($original, $night->refresh()->getRawOriginal());
        $this->assertDatabaseCount('movie_nights', 1);
    }

    public function test_required_fields_and_future_instant_are_enforced(): void
    {
        $host = User::factory()->create();
        $this->signIn($host, 'web');
        $this->postJson(self::URL, [])->assertUnprocessable()->assertJsonValidationErrors(['title', 'starts_at', 'timezone']);
        $night = $this->night($host);
        foreach ([now()->subSecond(), now()] as $start) {
            $fields = ['starts_at' => $start->format('Y-m-d\TH:i:s\Z')];
            $this->postJson(self::URL, $this->payload($fields))->assertUnprocessable()->assertJsonValidationErrors('starts_at');
            $this->patchJson(self::URL.'/'.$night->id, $fields)->assertUnprocessable()->assertJsonValidationErrors('starts_at');
        }
    }

    public function test_internal_fields_cannot_be_assigned_or_spoofed(): void
    {
        $host = User::factory()->create();
        $other = User::factory()->create();
        $night = $this->night($host);
        $this->signIn($host, 'web');
        foreach (['host_user_id', 'user_id', 'id', 'night', 'status', 'finalized_tmdb_id', 'finalized_at', 'cancelled_at',
            'created_at', 'updated_at', 'votes', 'invitations', 'movies'] as $field) {
            $this->postJson(self::URL, $this->payload([$field => $other->id]))->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->patchJson(self::URL.'/'.$night->id, [$field => $other->id])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->postJson(self::URL.'/'.$night->id.'/cancel', ['status' => 'finalized'])->assertUnprocessable();
        $this->assertSame($host->id, $night->refresh()->host_user_id);
        $this->assertSame(MovieNightStatus::Scheduled, $night->status);
        $this->assertDatabaseCount('movie_nights', 1);
    }

    public function test_listing_scopes_membership_paginates_and_sorts_stably(): void
    {
        $viewer = User::factory()->create();
        $hosted = $this->night($viewer);
        $ids = [$hosted->id];
        foreach (MovieNightRsvp::cases() as $status) {
            $night = $this->night();
            $this->invite($night, $viewer, $status);
            $this->invite($night, User::factory()->create(), MovieNightRsvp::Accepted);
            if ($status === MovieNightRsvp::Accepted) {
                $ids[] = $night->id;
            }
        }
        $hidden = $this->night();
        $this->signIn($viewer, 'web');
        $first = $this->getJson(self::URL.'?per_page=1')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('meta', ['page' => 1, 'per_page' => 1, 'total_pages' => 2, 'total_results' => 2])
            ->assertJsonPath('data.0.my_rsvp', 'accepted')
            ->assertJsonMissingPath('data.0.location')->assertJsonMissingPath('data.0.meeting_url')
            ->assertJsonMissingPath('data.0.invitations');
        $second = $this->getJson(self::URL.'?page=2&per_page=1')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.my_rsvp', 'accepted');
        $this->assertSame($ids, array_merge(array_column($first->json('data'), 'id'), array_column($second->json('data'), 'id')));
        $this->getJson(self::URL.'?page=3&per_page=1')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 2);
        $this->getJson(self::URL.'/'.$hidden->id)->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_empty_list_and_pagination_validation(): void
    {
        $this->signIn(User::factory()->create(), 'web');
        $this->getJson(self::URL)->assertOk()->assertExactJson(['data' => [], 'meta' => [
            'page' => 1, 'per_page' => 20, 'total_pages' => 0, 'total_results' => 0,
        ]]);
        foreach (['page=0', 'page=10001', 'page=x', 'per_page=0', 'per_page=51', 'status=unknown', 'host_user_id=1'] as $query) {
            $this->getJson(self::URL.'?'.$query)->assertUnprocessable();
        }
    }

    public function test_detail_requires_accepted_rsvp_and_has_safe_host_projection(): void
    {
        $night = $this->night();
        foreach (MovieNightRsvp::cases() as $status) {
            $viewer = User::factory()->create();
            $this->invite($night, $viewer, $status);
            $this->signIn($viewer, 'web');
            if ($status !== MovieNightRsvp::Accepted) {
                $this->getJson(self::URL.'/'.$night->id)->assertNotFound()->assertExactJson(['message' => 'Not found.']);

                continue;
            }
            $this->getJson(self::URL.'/'.$night->id)->assertOk()->assertJsonPath('data.my_rsvp', $status->value)
                ->assertJsonPath('data.location', 'Living room')->assertJsonPath('data.meeting_url', 'https://example.com/room')
                ->assertJsonMissingPath('data.host.email')->assertJsonMissingPath('data.host.firebase_uid')
                ->assertJsonMissingPath('data.host.account_status')->assertJsonMissingPath('data.host.role')
                ->assertJsonMissingPath('data.host.bio')->assertJsonMissingPath('data.invitations');
        }
    }

    public function test_nonmembers_including_admins_receive_same_404_as_missing_events(): void
    {
        $night = $this->night();
        foreach ([User::ROLE_USER, User::ROLE_MODERATOR, User::ROLE_ADMIN] as $role) {
            $this->signIn(User::factory()->create(['role' => $role]), 'web');
            foreach ([['GET', '', []], ['PATCH', '', ['title' => 'Attack']], ['POST', '/cancel', []]] as [$method, $suffix, $body]) {
                $hidden = $this->json($method, self::URL.'/'.$night->id.$suffix, $body)->assertNotFound()
                    ->assertHeader('Cache-Control', 'no-store, private')->json();
                $this->json($method, self::URL.'/999999'.$suffix, $body)->assertNotFound()->assertExactJson($hidden);
            }
        }
        $this->assertSame('Friday cinema', $night->refresh()->title);
    }

    public function test_invitees_cannot_edit_or_cancel_even_when_admin(): void
    {
        $night = $this->night();
        foreach (MovieNightRsvp::cases() as $status) {
            $user = User::factory()->create(['role' => User::ROLE_ADMIN]);
            $this->invite($night, $user, $status);
            $this->signIn($user, 'web');
            $this->patchJson(self::URL.'/'.$night->id, ['title' => 'Attack'])->assertForbidden();
            $this->postJson(self::URL.'/'.$night->id.'/cancel')->assertForbidden();
        }
        $this->assertSame(MovieNightStatus::Scheduled, $night->refresh()->status);
    }

    public function test_host_can_edit_and_reschedule_before_original_deadline(): void
    {
        $host = User::factory()->create();
        $night = $this->night($host);
        $this->signIn($host, 'web');
        $new = now()->addDays(2)->format('Y-m-d\TH:i:s\Z');
        $this->patchJson(self::URL.'/'.$night->id, ['title' => 'New title', 'starts_at' => $new, 'timezone' => 'America/New_York'])
            ->assertOk()->assertJsonPath('data.title', 'New title')->assertJsonPath('data.starts_at', CarbonImmutable::parse($new)->toISOString())
            ->assertJsonPath('data.timezone', 'America/New_York')->assertJsonPath('data.location', 'Living room');
        $this->assertSame($host->id, $night->refresh()->host_user_id);
    }

    public function test_exact_start_prevents_edit_and_reschedule_but_allows_cancellation(): void
    {
        $host = User::factory()->create();
        $night = $this->night($host);
        $this->signIn($host, 'web');
        $this->travelTo($night->starts_at);
        $this->getJson(self::URL.'/'.$night->id)->assertOk()->assertJsonPath('data.voting_open', false);
        $this->patchJson(self::URL.'/'.$night->id, ['title' => 'Too late'])->assertStatus(409);
        $this->patchJson(self::URL.'/'.$night->id, ['starts_at' => now()->addDay()->format('Y-m-d\TH:i:s\Z')])->assertStatus(409);
        $this->travel(1)->seconds();
        $this->patchJson(self::URL.'/'.$night->id, ['title' => 'Still too late'])->assertStatus(409);
        $this->postJson(self::URL.'/'.$night->id.'/cancel')->assertOk()->assertJsonPath('data.status', 'cancelled');
    }

    public function test_cancel_retains_invites_and_repeated_cancel_is_409_without_rewriting_timestamp(): void
    {
        $host = User::factory()->create();
        $viewer = User::factory()->create();
        $night = $this->night($host);
        $this->invite($night, $viewer);
        $this->signIn($host, 'web');
        $cancelled = $this->postJson(self::URL.'/'.$night->id.'/cancel')->assertOk()
            ->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.voting_open', false)->json('data.cancelled_at');
        $this->travel(1)->minutes();
        $this->postJson(self::URL.'/'.$night->id.'/cancel')->assertStatus(409);
        $this->getJson(self::URL.'/'.$night->id)->assertOk()->assertJsonPath('data.cancelled_at', $cancelled);
        $this->assertDatabaseCount('movie_night_invitations', 1);
        foreach (['nominate', 'vote', 'finalize'] as $ability) {
            $this->assertFalse(Gate::forUser($host->refresh())->allows($ability, $night->refresh()));
        }
        try {
            app(MovieNightTransitions::class)->finalize($host, $night->id);
            $this->fail('Cancelled event cannot finalize.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        $this->signIn($viewer, 'web');
        $this->getJson(self::URL.'/'.$night->id)->assertNotFound();
        $this->getJson(self::URL.'?status=cancelled')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson(self::URL.'/invitations')->assertOk()->assertJsonPath('data.0.movie_night.status', 'cancelled');
        $this->getJson(self::URL.'?status=scheduled')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_terminal_events_cannot_be_edited_or_cancelled_and_still_appear(): void
    {
        $host = User::factory()->create();
        $this->signIn($host, 'web');
        foreach ([MovieNightStatus::Finalized, MovieNightStatus::Cancelled] as $status) {
            $night = $this->night($host);
            $night->forceFill(['status' => $status,
                'finalized_tmdb_id' => $status === MovieNightStatus::Finalized ? 550 : null,
                'finalized_at' => $status === MovieNightStatus::Finalized ? now() : null,
                'cancelled_at' => $status === MovieNightStatus::Cancelled ? now() : null])->save();
            $this->patchJson(self::URL.'/'.$night->id, ['title' => 'Changed'])->assertStatus(409);
            $this->postJson(self::URL.'/'.$night->id.'/cancel')->assertStatus(409);
            $this->getJson(self::URL.'/'.$night->id)->assertOk()->assertJsonPath('data.status', $status->value);
            $this->getJson(self::URL.'?status='.$status->value)->assertOk()->assertJsonCount(1, 'data');
        }
    }

    public function test_restricted_accounts_can_read_but_cannot_create_edit_or_cancel(): void
    {
        $user = User::factory()->create(['account_status' => User::STATUS_RESTRICTED]);
        $night = $this->night($user);
        $this->signIn($user, 'web');
        $this->getJson(self::URL)->assertOk();
        $this->getJson(self::URL.'/'.$night->id)->assertOk();
        $this->postJson(self::URL, $this->payload())->assertForbidden()->assertJsonPath('code', 'ACCOUNT_RESTRICTED');
        $this->patchJson(self::URL.'/'.$night->id, ['title' => 'Changed'])->assertForbidden();
        $this->postJson(self::URL.'/'.$night->id.'/cancel')->assertForbidden();
    }

    public function test_banned_deactivated_and_pending_accounts_cannot_access_event_workflows(): void
    {
        foreach ([User::STATUS_BANNED, User::STATUS_DEACTIVATED] as $status) {
            $user = User::factory()->create(['account_status' => $status]);
            $night = $this->night($user);
            $this->signIn($user, 'web');
            foreach ([['GET', '', []], ['GET', '/'.$night->id, []], ['POST', '', $this->payload()],
                ['PATCH', '/'.$night->id, ['title' => 'Changed']], ['POST', '/'.$night->id.'/cancel', []]] as [$method, $path, $body]) {
                $this->json($method, self::URL.$path, $body)->assertForbidden();
            }
        }
        $pending = User::factory()->create(['invitation_pending' => true]);
        $night = $this->night($pending);
        $this->signIn($pending, 'web');
        $this->getJson(self::URL)->assertForbidden();
        $this->getJson(self::URL.'/'.$night->id)->assertNotFound();
        $this->postJson(self::URL, $this->payload())->assertForbidden();
        $this->patchJson(self::URL.'/'.$night->id, ['title' => 'Changed'])->assertForbidden();
        $this->postJson(self::URL.'/'.$night->id.'/cancel')->assertForbidden();
    }

    public function test_firebase_mapping_and_session_revocation_are_preserved(): void
    {
        config(['firebase_auth.mode' => 'firebase']);
        $mapped = User::factory()->create(['firebase_uid' => 'movie-night-fixture']);
        $this->signIn($mapped, 'web');
        $this->postJson(self::URL, $this->payload())->assertCreated()->assertJsonPath('data.host.id', $mapped->id);
        $this->signIn(User::factory()->create(['firebase_uid' => null]), 'web');
        $this->getJson(self::URL)->assertUnauthorized();
        $mapped->forceFill(['password_session_version' => 'current-session-version'])->save();
        $this->signIn($mapped, 'web');
        $this->withSession(['password_session_version' => 'old-version'])->getJson(self::URL)->assertUnauthorized();
        $this->signIn($mapped, 'web');
        $this->withSession(['password_session_version' => 'current-session-version'])->getJson(self::URL)->assertOk();
        Http::assertNothingSent();
    }

    public function test_stale_actor_is_rechecked_inside_write_transaction(): void
    {
        $user = User::factory()->create();
        $night = $this->night($user);
        User::query()->whereKey($user->id)->update(['email_verified_at' => null]);
        $this->expectException(AuthorizationException::class);
        app(MovieNightService::class)->update($user, $night->id, ['title' => 'Changed']);
    }

    public function test_csrf_protects_every_write_with_and_without_origin(): void
    {
        $host = User::factory()->create();
        $night = $this->night($host);
        $this->signIn($host, 'web');
        $this->app->instance('env', 'local');
        foreach ([[], ['Origin' => 'http://localhost:5173']] as $headers) {
            $this->withHeaders($headers);
            $this->postJson(self::URL, $this->payload())->assertStatus(419)->assertExactJson(['message' => 'CSRF token mismatch.']);
            $this->patchJson(self::URL.'/'.$night->id, ['title' => 'Changed'])->assertStatus(419);
            $this->postJson(self::URL.'/'.$night->id.'/cancel')->assertStatus(419);
        }
        $csrf = $this->getJson('/sanctum/csrf-cookie')->getCookie('XSRF-TOKEN', false)->getValue();
        $this->withHeader('X-XSRF-TOKEN', $csrf)->patchJson(self::URL.'/'.$night->id, ['title' => 'With CSRF'])->assertOk();
        $this->withHeader('X-XSRF-TOKEN', $csrf)->postJson(self::URL, $this->payload())->assertCreated();
        $this->withHeader('X-XSRF-TOKEN', $csrf)->postJson(self::URL.'/'.$night->id.'/cancel')->assertOk();
    }

    public function test_existing_read_and_write_throttles_are_enforced(): void
    {
        $host = User::factory()->create();
        $this->signIn($host, 'web');
        for ($i = 0; $i < 60; $i++) {
            $this->deleteJson('/api/v1/me/watchlist/1')->assertNoContent();
        }
        $this->postJson(self::URL, $this->payload())->assertTooManyRequests()->assertHeader('Retry-After')
            ->assertHeader('Cache-Control', 'no-store, private')->assertExactJson(['message' => 'Too many requests.']);
        for ($i = 0; $i < 120; $i++) {
            $this->getJson('/api/v1/me/access')->assertOk();
        }
        $this->getJson(self::URL)->assertTooManyRequests()->assertHeader('Retry-After');
    }

    public function test_strict_sql_ids_and_no_accept_header_keep_private_json_errors(): void
    {
        $this->get(self::URL)->assertUnauthorized()->assertHeader('Content-Type', 'application/json');
        $this->signIn(User::factory()->create(), 'web');
        foreach (['01', '0', '-1', 'no', '1.0', '9223372036854775808'] as $id) {
            $this->getJson(self::URL.'/'.$id)->assertUnprocessable();
        }
        $this->getJson(self::URL.'/9223372036854775807')->assertNotFound();
    }

    public function test_list_query_count_is_bounded_and_makes_no_catalog_calls(): void
    {
        $viewer = User::factory()->create();
        for ($i = 0; $i < 8; $i++) {
            $night = $this->night();
            $this->invite($night, $viewer, MovieNightRsvp::Accepted);
        }
        $this->signIn($viewer, 'web');
        DB::enableQueryLog();
        try {
            DB::flushQueryLog();
            $this->getJson(self::URL.'?per_page=1')->assertOk();
            $one = count(DB::getQueryLog());
            DB::flushQueryLog();
            $this->getJson(self::URL.'?per_page=8')->assertOk()->assertJsonCount(8, 'data');
            $eight = count(DB::getQueryLog());
            $this->assertSame($one, $eight, 'Listing must not perform per-event relation queries.');
        } finally {
            DB::disableQueryLog();
        }
        Http::assertNothingSent();
    }

    public function test_all_backend_movie_night_endpoints_are_registered(): void
    {
        $routes = collect(Route::getRoutes())->filter(fn ($route) => str_starts_with($route->uri(), 'api/v1/me/movie-nights'));
        $this->assertCount(16, $routes);
        $this->assertSame(['cancel', 'destroy', 'eligible', 'finalize', 'index', 'index', 'index', 'index', 'received', 'respond', 'show', 'store', 'store', 'store', 'store', 'update'], $routes->map(fn ($route) => $route->getActionMethod())->sort()->values()->all());
    }

    public function test_postgres_http_round_trip_in_beirut_session_and_failed_writes_rollback(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Real PostgreSQL non-UTC persistence and rollback acceptance.');
        }
        $host = User::factory()->create();
        $this->signIn($host, 'web');
        $originalZone = DB::selectOne('SHOW TIME ZONE')->TimeZone;
        try {
            DB::statement("SET TIME ZONE 'Asia/Beirut'");
            foreach (['2027-01-15T18:00:00Z', '2027-07-15T18:00:00Z'] as $instant) {
                $this->travelTo(CarbonImmutable::parse($instant));
                $start = now()->addHours(3);
                $id = $this->postJson(self::URL, $this->payload(['starts_at' => $start->format('Y-m-d\TH:i:s\Z')]))
                    ->assertCreated()->assertJsonPath('data.starts_at', $start->toISOString())->json('data.id');
                $stored = DB::table('movie_nights')->where('id', $id)->selectRaw('EXTRACT(EPOCH FROM starts_at) AS epoch')->first();
                $this->assertSame($start->timestamp, (int) $stored->epoch);
                $new = $start->copy()->addHour();
                $this->patchJson(self::URL.'/'.$id, ['starts_at' => $new->format('Y-m-d\TH:i:s\Z')])->assertOk()
                    ->assertJsonPath('data.starts_at', $new->toISOString());
                $this->travelTo($new->copy()->subMicrosecond());
                $this->getJson(self::URL.'/'.$id)->assertOk()->assertJsonPath('data.voting_open', true);
                $this->travelTo($new);
                $this->getJson(self::URL.'/'.$id)->assertOk()->assertJsonPath('data.voting_open', false);
                $this->patchJson(self::URL.'/'.$id, ['title' => 'Late'])->assertStatus(409);
                $this->postJson(self::URL.'/'.$id.'/cancel')->assertOk()->assertJsonPath('data.cancelled_at', $new->toISOString());
                $stored = DB::table('movie_nights')->where('id', $id)->selectRaw('EXTRACT(EPOCH FROM cancelled_at) AS epoch')->first();
                $this->assertSame($new->timestamp, (int) $stored->epoch);
            }
            DB::statement("ALTER TABLE movie_nights ADD CONSTRAINT mn_management_fail CHECK (title <> 'Fail write' AND status <> 'cancelled') NOT VALID");
            try {
                config(['app.debug' => true]);
                $before = MovieNight::query()->count();
                $this->postJson(self::URL, $this->payload(['title' => 'Fail write']))->assertStatus(500)
                    ->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
                $this->assertSame($before, MovieNight::query()->count());
                $id = $this->postJson(self::URL, $this->payload())->assertCreated()->json('data.id');
                $this->patchJson(self::URL.'/'.$id, ['title' => 'Fail write'])->assertStatus(500)->assertJsonPath('code', 'INTERNAL_ERROR');
                $this->postJson(self::URL.'/'.$id.'/cancel')->assertStatus(500)->assertJsonPath('code', 'INTERNAL_ERROR');
                $this->assertDatabaseHas('movie_nights', ['id' => $id, 'title' => 'Friday cinema', 'status' => 'scheduled', 'cancelled_at' => null]);
            } finally {
                DB::statement('ALTER TABLE movie_nights DROP CONSTRAINT mn_management_fail');
            }
            $this->assertSame('Asia/Beirut', DB::selectOne('SHOW TIME ZONE')->TimeZone);
        } finally {
            DB::selectOne("SELECT set_config('TimeZone', ?, false)", [$originalZone]);
        }
    }
}
