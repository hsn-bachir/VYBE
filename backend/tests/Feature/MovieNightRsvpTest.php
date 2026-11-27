<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Http\Resources\MovieNightResource;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\MovieNightMovie;
use App\Models\MovieNightVote;
use App\Models\User;
use App\Services\MovieNights\MovieNightInvitationService;
use App\Services\MovieNights\MovieNightService;
use App\Services\MovieNights\MovieNightTransitions;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MySqlWriteFailure;
use Tests\TestCase;

class MovieNightRsvpTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = '/api/v1/me/movie-nights';

    private User $host;

    private User $invitee;

    private MovieNight $night;

    private MovieNightInvitation $invitation;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->travelTo(CarbonImmutable::parse('2027-01-15T18:00:00Z'));
        $this->host = User::factory()->create();
        $this->invitee = User::factory()->create();
        $this->night = new MovieNight(['title' => 'Private RSVP', 'starts_at' => now()->addDay(), 'timezone' => 'Asia/Beirut',
            'location' => 'Private location', 'meeting_url' => 'https://example.com/private-room']);
        $this->night->host()->associate($this->host);
        $this->night->save();
        $this->invitation = app(MovieNightInvitationService::class)->create($this->host, $this->night->id, $this->invitee->id);
    }

    private function signIn(User $user): void
    {
        Auth::forgetGuards();
        $this->actingAs($user, 'web');
    }

    private function url(): string
    {
        return self::BASE.'/'.$this->night->id.'/rsvp';
    }

    private function respond(string $status = 'accepted'): TestResponse
    {
        return $this->putJson($this->url(), ['rsvp_status' => $status]);
    }

    private function vote(User $user): MovieNightVote
    {
        $movie = $this->night->movies()->first();
        if (! $movie) {
            $movie = new MovieNightMovie(['tmdb_id' => 550]);
            $movie->movieNight()->associate($this->night);
            $movie->nominatedBy()->associate($this->host);
            $movie->save();
        }
        $vote = new MovieNightVote;
        $vote->movieNight()->associate($this->night);
        $vote->movie()->associate($movie);
        $vote->voter()->associate($user);
        $vote->save();

        return $vote;
    }

    private function assertMinimalInvitationReads(string $status): void
    {
        $night = $this->night->fresh();
        $expected = ['id' => $night->id, 'title' => $night->title,
            'host' => ['id' => $this->host->id, 'username' => $this->host->username, 'avatar_url' => $this->host->avatar_url],
            'starts_at' => $night->starts_at->toISOString(), 'timezone' => $night->timezone,
            'status' => $night->status->value, 'my_rsvp' => $status];
        $this->getJson(self::BASE)->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 0);
        $received = $this->getJson(self::BASE.'/invitations')->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($expected, $received->json('data.0.movie_night'));
        $this->assertSame(['id', 'participant', 'rsvp_status', 'responded_at', 'movie_night'], array_keys($received->json('data.0')));
        $this->assertSame(['id', 'username', 'avatar_url'], array_keys($received->json('data.0.participant')));
        $this->getJson(self::BASE.'/'.$night->id)->assertNotFound()->assertExactJson(['message' => 'Not found.'])
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public static function minimalVisibilityStates(): array
    {
        return [['pending', 'scheduled'], ['declined', 'scheduled'], ['pending', 'cancelled'],
            ['declined', 'cancelled'], ['pending', 'finalized'], ['declined', 'finalized']];
    }

    #[DataProvider('minimalVisibilityStates')]
    public function test_nonaccepted_invitees_receive_only_minimal_information_in_every_event_state(string $rsvp, string $status): void
    {
        $this->invitation->update(['rsvp_status' => $rsvp, 'responded_at' => $rsvp === 'declined' ? now() : null]);
        $this->night->forceFill(['status' => $status, 'cancelled_at' => $status === 'cancelled' ? now() : null,
            'finalized_at' => $status === 'finalized' ? now() : null, 'finalized_tmdb_id' => $status === 'finalized' ? 550 : null])->save();
        $this->signIn($this->invitee);
        $this->assertMinimalInvitationReads($rsvp);
        $this->getJson(self::BASE.'/'.$this->night->id.'/invitations')->assertForbidden();
        $this->signIn($this->host);
        $this->getJson(self::BASE.'/'.$this->night->id)->assertOk()->assertJsonPath('data.location', 'Private location')
            ->assertJsonPath('data.meeting_url', 'https://example.com/private-room')
            ->assertJsonPath('data.finalized_tmdb_id', $status === 'finalized' ? 550 : null);
        $this->getJson(self::BASE.'/'.$this->night->id.'/invitations')->assertOk()->assertJsonPath('data.0.rsvp_status', $rsvp);
    }

    public function test_accept_decline_reaccept_changes_private_access_without_restoring_vote(): void
    {
        $this->signIn($this->invitee);
        $this->assertMinimalInvitationReads('pending');
        $this->respond()->assertOk()->assertJsonMissingPath('data.movie_night');
        $this->getJson(self::BASE.'/'.$this->night->id)->assertOk()->assertJsonPath('data.location', 'Private location')
            ->assertJsonPath('data.meeting_url', 'https://example.com/private-room');
        $vote = $this->vote($this->invitee);
        $hostVote = $this->vote($this->host);
        $this->travel(1)->minutes();
        $declined = $this->respond('declined')->assertOk();
        $this->assertSame(['id', 'participant', 'rsvp_status', 'responded_at'], array_keys($declined->json('data')));
        $this->assertMinimalInvitationReads('declined');
        $this->assertDatabaseMissing('movie_night_votes', ['id' => $vote->id]);
        $this->assertDatabaseHas('movie_night_votes', ['id' => $hostVote->id]);
        $this->respond('accepted')->assertOk();
        $this->getJson(self::BASE.'/'.$this->night->id)->assertOk()->assertJsonPath('data.location', 'Private location');
        $this->assertDatabaseMissing('movie_night_votes', ['id' => $vote->id]);
        $this->assertDatabaseHas('movie_night_votes', ['id' => $hostVote->id]);
    }

    public function test_detail_resource_reauthorizes_a_previously_accepted_model_after_decline(): void
    {
        $this->signIn($this->invitee);
        $this->respond()->assertOk();
        $snapshot = app(MovieNightService::class)->visible($this->invitee->refresh(), $this->night->id);
        $this->respond('declined')->assertOk();
        $request = Request::create(self::BASE.'/'.$this->night->id);
        $request->setUserResolver(fn () => $this->invitee);
        try {
            (new MovieNightResource($snapshot))->resolve($request);
            $this->fail('A stale detail model must not bypass current RSVP authorization.');
        } catch (AuthorizationException $exception) {
            $this->assertSame(404, $exception->status());
        }
    }

    public function test_guest_cannot_respond(): void
    {
        $this->respond()->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame(MovieNightRsvp::Pending, $this->invitation->fresh()->rsvp_status);
    }

    public static function statuses(): array
    {
        return [['accepted'], ['declined']];
    }

    #[DataProvider('statuses')]
    public function test_pending_invitee_can_respond_and_all_read_surfaces_update(string $status): void
    {
        $this->signIn($this->invitee);
        $response = $this->respond($status)->assertOk()->assertJsonPath('data.id', $this->invitation->id)
            ->assertJsonPath('data.rsvp_status', $status)->assertJsonPath('data.responded_at', now()->toISOString())
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame(['id', 'participant', 'rsvp_status', 'responded_at'], array_keys($response->json('data')));
        $this->assertSame(['id', 'username', 'avatar_url'], array_keys($response->json('data.participant')));
        $this->assertSame($this->invitee->id, $response->json('data.participant.id'));
        if ($status === 'accepted') {
            $this->getJson(self::BASE.'/invitations')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 0);
            $this->getJson(self::BASE)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.my_rsvp', $status);
            $this->getJson(self::BASE.'/'.$this->night->id)->assertOk()->assertJsonPath('data.my_rsvp', $status);
        } else {
            $this->getJson(self::BASE.'/invitations')->assertOk()->assertJsonPath('data.0.rsvp_status', $status)
                ->assertJsonPath('data.0.movie_night.my_rsvp', $status)->assertJsonPath('data.0.responded_at', now()->toISOString());
            $this->getJson(self::BASE)->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 0);
            $this->getJson(self::BASE.'/'.$this->night->id)->assertNotFound();
        }
        $this->signIn($this->host);
        $this->getJson(self::BASE.'/'.$this->night->id.'/invitations')->assertOk()->assertJsonPath('data.0.rsvp_status', $status)
            ->assertJsonPath('data.0.responded_at', now()->toISOString());
        Http::assertNothingSent();
    }

    #[DataProvider('statuses')]
    public function test_identical_requests_preserve_response_and_update_timestamps(string $status): void
    {
        $this->signIn($this->invitee);
        $first = $this->respond($status)->assertOk()->json('data');
        $before = $this->invitation->fresh();
        $this->travel(10)->minutes();
        $this->respond($status)->assertOk()->assertExactJson(['data' => $first]);
        $after = $this->invitation->fresh();
        $this->assertTrue($before->responded_at->eq($after->responded_at));
        $this->assertTrue($before->updated_at->eq($after->updated_at));
        $this->assertTrue($before->created_at->eq($after->created_at));
        $this->assertDatabaseCount('movie_night_invitations', 1);
    }

    public function test_changes_remove_only_own_vote_atomically_and_do_not_restore_it(): void
    {
        $this->signIn($this->invitee);
        $this->respond()->assertOk();
        $own = $this->vote($this->invitee);
        $hostVote = $this->vote($this->host);
        $this->travel(1)->minutes();
        $this->respond('declined')->assertOk()->assertJsonPath('data.responded_at', now()->toISOString());
        $this->assertDatabaseMissing('movie_night_votes', ['id' => $own->id]);
        $this->assertDatabaseHas('movie_night_votes', ['id' => $hostVote->id]);
        $this->assertDatabaseCount('movie_night_movies', 1);
        $this->travel(1)->minutes();
        $this->respond('accepted')->assertOk()->assertJsonPath('data.responded_at', now()->toISOString());
        $this->assertDatabaseMissing('movie_night_votes', ['id' => $own->id]);
        $this->assertDatabaseCount('movie_night_votes', 1);
    }

    public function test_hosts_cannot_rsvp_and_outsiders_receive_hidden_not_found_in_all_event_states(): void
    {
        $outsider = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $this->signIn($this->host);
        $this->respond()->assertForbidden();
        $this->getJson(self::BASE.'/'.$this->night->id)->assertOk()->assertJsonPath('data.my_rsvp', 'accepted');
        foreach (['scheduled', 'cancelled', 'finalized'] as $status) {
            $this->night->forceFill(['status' => $status, 'cancelled_at' => $status === 'cancelled' ? now() : null,
                'finalized_at' => $status === 'finalized' ? now() : null, 'finalized_tmdb_id' => $status === 'finalized' ? 550 : null])->save();
            $this->signIn($outsider);
            $this->respond()->assertNotFound()->assertExactJson(['message' => 'Not found.']);
            $this->getJson(self::BASE.'/'.$this->night->id)->assertNotFound();
        }
        $this->putJson(self::BASE.'/9223372036854775807/rsvp', ['rsvp_status' => 'accepted'])->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        $this->assertSame(MovieNightRsvp::Pending, $this->invitation->fresh()->rsvp_status);
    }

    public function test_another_invitee_cannot_choose_someone_elses_invitation(): void
    {
        $other = User::factory()->create();
        app(MovieNightInvitationService::class)->create($this->host, $this->night->id, $other->id);
        $this->signIn($other);
        $this->putJson($this->url(), ['rsvp_status' => 'declined', 'invited_user_id' => $this->invitee->id])->assertUnprocessable();
        $this->respond('declined')->assertOk()->assertJsonPath('data.participant.id', $other->id);
        $this->assertSame(MovieNightRsvp::Pending, $this->invitation->fresh()->rsvp_status);
    }

    public static function invalidBodies(): array
    {
        return [[[]], [['rsvp_status' => 'pending']], [['rsvp_status' => 'unknown']], [['rsvp_status' => null]],
            [['rsvp_status' => true]], [['rsvp_status' => ['accepted']]], [['rsvp_status' => 'Accepted']],
            [['rsvp_status' => 'accepted', 'night' => 1]], [['rsvp_status' => 'accepted', 'responded_at' => '2027-01-01T00:00:00Z']],
            [['rsvp_status' => 'accepted', 'user_id' => 1]], [['rsvp_status' => 'accepted', 'invitation_id' => 1]]];
    }

    #[DataProvider('invalidBodies')]
    public function test_validation_rejects_invalid_statuses_and_extra_fields(array $body): void
    {
        $this->signIn($this->invitee);
        $this->putJson($this->url(), $body)->assertUnprocessable()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame(MovieNightRsvp::Pending, $this->invitation->fresh()->rsvp_status);
        $this->assertNull($this->invitation->fresh()->responded_at);
    }

    public function test_sql_ids_and_query_allowlist(): void
    {
        $this->signIn($this->invitee);
        foreach (['01', '0', '-1', '1.0', 'no', '9223372036854775808'] as $id) {
            $this->putJson(self::BASE.'/'.$id.'/rsvp', ['rsvp_status' => 'accepted'])->assertUnprocessable();
        }
        $this->putJson($this->url().'?user_id='.$this->host->id, ['rsvp_status' => 'accepted'])->assertUnprocessable();
    }

    public static function ineligibleActors(): array
    {
        return [[['account_status' => User::STATUS_RESTRICTED]], [['account_status' => User::STATUS_BANNED]],
            [['account_status' => User::STATUS_DEACTIVATED]], [['email_verified_at' => null]], [['invitation_pending' => true]]];
    }

    #[DataProvider('ineligibleActors')]
    public function test_account_gates_preserve_invitation_and_vote(array $fields): void
    {
        $this->invitation->update(['rsvp_status' => MovieNightRsvp::Accepted, 'responded_at' => now()]);
        $vote = $this->vote($this->invitee);
        $this->invitee->forceFill($fields)->save();
        $this->signIn($this->invitee);
        $this->respond('declined')->assertForbidden();
        $this->assertSame(MovieNightRsvp::Accepted, $this->invitation->fresh()->rsvp_status);
        $this->assertDatabaseHas('movie_night_votes', ['id' => $vote->id]);
    }

    public function test_stale_actor_is_rechecked_under_lock(): void
    {
        User::whereKey($this->invitee->id)->update(['email_verified_at' => null]);
        $this->expectException(AuthorizationException::class);
        app(MovieNightTransitions::class)->respond($this->invitee, $this->night->id, MovieNightRsvp::Accepted);
    }

    public function test_exact_deadline_and_repeats_after_deadline_preserve_state_and_vote(): void
    {
        $this->signIn($this->invitee);
        $this->travelTo($this->night->starts_at->subMicrosecond());
        $this->respond()->assertOk();
        $vote = $this->vote($this->invitee);
        $before = $this->invitation->fresh();
        foreach ([$this->night->starts_at, $this->night->starts_at->addSecond()] as $instant) {
            $this->travelTo($instant);
            $this->respond('declined')->assertStatus(409);
            $this->respond('accepted')->assertStatus(409);
            $this->assertTrue($before->responded_at->eq($this->invitation->fresh()->responded_at));
            $this->assertDatabaseHas('movie_night_votes', ['id' => $vote->id]);
        }
    }

    public static function terminalStates(): array
    {
        return [['cancelled'], ['finalized']];
    }

    #[DataProvider('terminalStates')]
    public function test_terminal_events_reject_changes_and_repeats(string $status): void
    {
        $this->signIn($this->invitee);
        $this->respond()->assertOk();
        $vote = $this->vote($this->invitee);
        $this->night->forceFill(['status' => $status, 'cancelled_at' => $status === 'cancelled' ? now() : null,
            'finalized_at' => $status === 'finalized' ? now() : null, 'finalized_tmdb_id' => $status === 'finalized' ? 550 : null])->save();
        $this->respond('declined')->assertStatus(409);
        $this->respond('accepted')->assertStatus(409);
        $this->assertSame(MovieNightRsvp::Accepted, $this->invitation->fresh()->rsvp_status);
        $this->assertDatabaseHas('movie_night_votes', ['id' => $vote->id]);
    }

    public function test_csrf_with_and_without_origin(): void
    {
        $this->signIn($this->invitee);
        $this->app->instance('env', 'local');
        $this->respond()->assertStatus(419)->assertExactJson(['message' => 'CSRF token mismatch.']);
        $this->withHeader('Origin', 'http://localhost:5173');
        $this->respond()->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie')->getCookie('XSRF-TOKEN', false)->getValue();
        $this->withHeader('X-XSRF-TOKEN', $csrf)->respond()->assertOk();
    }

    public function test_shared_write_throttle_applies_to_repeated_rsvp(): void
    {
        $this->signIn($this->invitee);
        for ($i = 0; $i < 60; $i++) {
            $this->respond()->assertOk();
        }
        $this->respond()->assertTooManyRequests()->assertHeader('Retry-After')->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_m7_session_revocation_and_firebase_mapping(): void
    {
        config(['firebase_auth.mode' => 'firebase']);
        $this->signIn($this->invitee);
        $this->respond()->assertUnauthorized();
        $this->invitee->forceFill(['firebase_uid' => 'rsvp-fixture', 'password_session_version' => 'current'])->save();
        $this->signIn($this->invitee);
        $this->withSession(['password_session_version' => 'old'])->respond()->assertUnauthorized();
        $this->signIn($this->invitee);
        $this->withSession(['password_session_version' => 'current'])->respond()->assertOk();
        Http::assertNothingSent();
    }

    public function test_failed_vote_deletion_rolls_back_rsvp_and_timestamp(): void
    {
        $this->signIn($this->invitee);
        $this->respond()->assertOk();
        $before = $this->invitation->fresh();
        $vote = $this->vote($this->invitee);
        $failure = null;
        if (DB::getDriverName() === 'mysql') {
            $this->assertDisposableDatabase();
            $failure = new MySqlWriteFailure(DB::connection(), 'delete from', 'movie_night_votes');
        } elseif (DB::getDriverName() === 'pgsql') {
            DB::unprepared("CREATE FUNCTION m53_reject_vote_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only vote deletion failure'; END $$");
            DB::unprepared('CREATE TRIGGER m53_vote_delete BEFORE DELETE ON movie_night_votes FOR EACH ROW EXECUTE FUNCTION m53_reject_vote_delete()');
        } else {
            DB::unprepared("CREATE TRIGGER m53_vote_delete BEFORE DELETE ON movie_night_votes BEGIN SELECT RAISE(ABORT, 'test-only vote deletion failure'); END");
        }
        try {
            $this->travel(1)->minutes();
            config(['app.debug' => true]);
            $this->respond('declined')->assertStatus(500)->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
            $failure?->assertTriggered([$this->night->id, $this->invitee->id]);
            $after = $this->invitation->fresh();
            $this->assertSame(MovieNightRsvp::Accepted, $after->rsvp_status);
            $this->assertTrue($before->responded_at->eq($after->responded_at));
            $this->assertTrue($before->updated_at->eq($after->updated_at));
            $this->assertDatabaseHas('movie_night_votes', ['id' => $vote->id]);
            $this->getJson(self::BASE.'/'.$this->night->id)->assertOk()->assertJsonPath('data.location', 'Private location');
        } finally {
            if ($failure !== null) {
                $failure->disarm();
            } elseif (DB::getDriverName() === 'pgsql') {
                DB::unprepared('DROP TRIGGER m53_vote_delete ON movie_night_votes');
                DB::unprepared('DROP FUNCTION m53_reject_vote_delete()');
            } else {
                DB::unprepared('DROP TRIGGER m53_vote_delete');
            }
        }
        $this->respond('declined')->assertOk();
        $failure?->assertDisarmed();
        $this->assertDatabaseMissing('movie_night_votes', ['id' => $vote->id]);
    }
}
