<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\MovieNightMovie;
use App\Models\MovieNightVote;
use App\Models\User;
use App\Services\MovieNights\MovieNightVotingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MovieNightFinalizationTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = '/api/v1/me/movie-nights';

    private User $host;

    private User $participant;

    private MovieNight $night;

    private MovieNightMovie $first;

    private MovieNightMovie $second;

    private MovieNightMovie $third;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['app.debug' => true]);
        config(['movie_catalog.url' => 'http://catalog.invalid', 'movie_catalog.token' => '']);
        $this->travelTo(CarbonImmutable::parse('2027-01-15T18:00:00Z'));
        $this->host = User::factory()->create();
        $this->participant = User::factory()->create();
        $this->night = new MovieNight(['title' => 'Final cinema', 'starts_at' => now()->addDay(), 'timezone' => 'Asia/Beirut',
            'location' => 'Private hall', 'meeting_url' => 'https://example.com/private-room']);
        $this->night->host()->associate($this->host);
        $this->night->save();
        $this->invite($this->participant);
        $this->first = $this->candidate(550);
        $this->second = $this->candidate(551);
        $this->third = $this->candidate(552);
    }

    private function signIn(User $user): void
    {
        Auth::forgetGuards();
        $this->actingAs($user, 'web');
    }

    private function invite(User $user, MovieNightRsvp $status = MovieNightRsvp::Accepted): void
    {
        $invitation = new MovieNightInvitation(['rsvp_status' => $status]);
        $invitation->movieNight()->associate($this->night);
        $invitation->invitedUser()->associate($user);
        $invitation->save();
    }

    private function candidate(int $tmdbId, ?MovieNight $night = null): MovieNightMovie
    {
        $candidate = new MovieNightMovie(['tmdb_id' => $tmdbId]);
        $candidate->movieNight()->associate($night ?? $this->night);
        $candidate->nominatedBy()->associate($this->host);
        $candidate->save();

        return $candidate;
    }

    private function vote(User $actor, ?MovieNightMovie $candidate = null): void
    {
        app(MovieNightVotingService::class)->cast($actor, $this->night->id, ($candidate ?? $this->first)->id);
    }

    private function url(string $action = 'finalize'): string
    {
        return self::BASE.'/'.$this->night->id.($action === '' ? '' : '/'.$action);
    }

    private function finalize(array $body = []): TestResponse
    {
        return $this->postJson($this->url(), $body);
    }

    public static function selections(): array
    {
        return [[[]], [['tmdb_id' => 550]]];
    }

    #[DataProvider('selections')]
    public function test_unique_leader_finalizes_automatically_or_explicitly_and_preserves_records(array $body): void
    {
        $this->vote($this->host);
        $this->vote($this->participant);
        $this->signIn($this->host);
        $this->finalize($body)->assertOk()->assertExactJson(['data' => [
            'id' => $this->night->id, 'title' => 'Final cinema',
            'host' => ['id' => $this->host->id, 'username' => $this->host->username, 'avatar_url' => $this->host->avatar_url],
            'starts_at' => $this->night->starts_at->toISOString(), 'timezone' => 'Asia/Beirut', 'status' => 'finalized',
            'my_rsvp' => 'accepted', 'finalized_tmdb_id' => 550, 'finalized_at' => now()->toISOString(), 'cancelled_at' => null,
            'voting_open' => false, 'created_at' => $this->night->created_at->toISOString(), 'updated_at' => now()->toISOString(),
            'location' => 'Private hall', 'meeting_url' => 'https://example.com/private-room']])
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->assertDatabaseCount('movie_night_invitations', 1);
        $this->assertDatabaseCount('movie_night_movies', 3);
        $this->assertDatabaseCount('movie_night_votes', 2);
        $this->assertDatabaseHas('movie_nights', ['id' => $this->night->id, 'status' => 'finalized', 'finalized_tmdb_id' => 550]);
        Http::assertNothingSent();
    }

    public function test_tie_has_machine_readable_safe_leaders_and_host_can_choose_one(): void
    {
        $this->vote($this->host);
        $this->vote($this->participant, $this->second);
        $this->signIn($this->host);
        $this->finalize()->assertStatus(409)->assertExactJson(['message' => 'Choose one of the tied leaders.',
            'code' => 'MOVIE_NIGHT_TIE', 'leaders' => [550, 551]])->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame('scheduled', $this->night->fresh()->status->value);
        $this->finalize(['tmdb_id' => 552])->assertUnprocessable()->assertJsonValidationErrors('tmdb_id');
        $this->getJson($this->url('votes'))->assertOk()->assertJsonPath('data.leaders', [550, 551]);
        $this->finalize(['tmdb_id' => 551])->assertOk()->assertJsonPath('data.finalized_tmdb_id', 551);
        $this->finalize(['tmdb_id' => 550])->assertStatus(409);
        $this->assertSame(551, $this->night->fresh()->finalized_tmdb_id);
    }

    public static function nonleaders(): array
    {
        return [[551], [552], [999]];
    }

    #[DataProvider('nonleaders')]
    public function test_nonleading_or_unrelated_selection_is_rejected_without_mutation(int $tmdbId): void
    {
        $this->vote($this->host);
        $this->signIn($this->host);
        $this->finalize(['tmdb_id' => $tmdbId])->assertUnprocessable()->assertJsonValidationErrors('tmdb_id');
        $this->assertSame('scheduled', $this->night->fresh()->status->value);
        $this->assertNull($this->night->fresh()->finalized_tmdb_id);
        $this->assertNull($this->night->fresh()->finalized_at);
    }

    public function test_cross_event_movie_and_votes_cannot_supply_a_winner(): void
    {
        $other = $this->night->replicate();
        $other->save();
        $foreign = $this->candidate(553, $other);
        app(MovieNightVotingService::class)->cast($this->host, $other->id, $foreign->id);
        $this->vote($this->host);
        $this->signIn($this->host);
        $this->finalize(['tmdb_id' => 553])->assertUnprocessable()->assertJsonValidationErrors('tmdb_id');
        $this->finalize()->assertOk()->assertJsonPath('data.finalized_tmdb_id', 550);
    }

    public static function emptyCases(): array
    {
        return [['shortlist-empty'], ['no-votes'], ['invalid-cohort']];
    }

    #[DataProvider('emptyCases')]
    public function test_at_least_one_authoritative_valid_vote_is_required(string $kind): void
    {
        if ($kind === 'shortlist-empty') {
            $this->night->movies()->delete();
        } elseif ($kind === 'invalid-cohort') {
            foreach ([null, MovieNightRsvp::Pending, MovieNightRsvp::Declined] as $status) {
                $user = User::factory()->create();
                if ($status) {
                    $this->invite($user, $status);
                }
                $vote = new MovieNightVote;
                $vote->movieNight()->associate($this->night);
                $vote->voter()->associate($user);
                $vote->movie()->associate($this->first);
                $vote->save();
            }
        }
        $this->signIn($this->host);
        $this->finalize()->assertStatus(409)->assertExactJson(['message' => 'At least one valid vote is required.']);
        $this->getJson($this->url('votes'))->assertOk()->assertJsonPath('data.total_votes', 0)->assertJsonPath('data.leaders', []);
        $this->assertSame('scheduled', $this->night->fresh()->status->value);
    }

    public function test_accepted_participant_cannot_finalize_but_can_view_final_details_and_winner_metadata_fallback(): void
    {
        $this->vote($this->host);
        $this->signIn($this->participant);
        $this->finalize()->assertForbidden()->assertExactJson(['message' => 'This action is unauthorized.']);
        $this->signIn($this->host);
        $this->finalize()->assertOk();
        $this->signIn($this->participant);
        $this->getJson($this->url(''))->assertOk()->assertJsonPath('data.title', 'Final cinema')
            ->assertJsonPath('data.host.id', $this->host->id)->assertJsonPath('data.starts_at', $this->night->starts_at->toISOString())
            ->assertJsonPath('data.timezone', 'Asia/Beirut')->assertJsonPath('data.location', 'Private hall')
            ->assertJsonPath('data.meeting_url', 'https://example.com/private-room')->assertJsonPath('data.status', 'finalized')
            ->assertJsonPath('data.finalized_tmdb_id', 550)->assertJsonPath('data.finalized_at', now()->toISOString())
            ->assertJsonPath('data.voting_open', false)->assertJsonMissingPath('data.host.email')->assertJsonMissingPath('data.host.firebase_uid');
        $this->getJson($this->url('movies'))->assertOk()->assertJsonPath('data.0.tmdb_id', 550)
            ->assertJsonPath('data.0.movie', null)->assertJsonPath('meta.metadata_unavailable', true);
        Http::assertNothingSent();
    }

    public static function privateActors(): array
    {
        return [['pending'], ['declined'], ['outsider'], ['admin']];
    }

    #[DataProvider('privateActors')]
    public function test_private_finalization_is_hidden_and_nonaccepted_summaries_never_expose_winner(string $kind): void
    {
        $this->vote($this->host);
        if (in_array($kind, ['pending', 'declined'], true)) {
            $this->night->invitations()->first()->update(['rsvp_status' => $kind]);
            $actor = $this->participant;
        } else {
            $actor = User::factory()->create(['role' => $kind === 'admin' ? User::ROLE_ADMIN : User::ROLE_USER]);
        }
        $this->signIn($actor);
        $this->finalize()->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        $this->signIn($this->host);
        $this->finalize()->assertOk();
        $this->signIn($actor);
        $this->finalize()->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        $this->getJson($this->url(''))->assertNotFound();
        $listing = $this->getJson(self::BASE)->assertOk();
        $received = $this->getJson(self::BASE.'/invitations')->assertOk();
        if (in_array($kind, ['pending', 'declined'], true)) {
            $fields = ['id', 'title', 'host', 'starts_at', 'timezone', 'status', 'my_rsvp'];
            $listing->assertJsonCount(0, 'data')->assertJsonPath('meta.total_results', 0);
            $this->assertSame($fields, array_keys($received->json('data.0.movie_night')));
            $this->assertSame($kind, $received->json('data.0.movie_night.my_rsvp'));
        } else {
            $listing->assertJsonCount(0, 'data');
            $received->assertJsonCount(0, 'data');
        }
        Http::assertNothingSent();
    }

    public static function ineligible(): array
    {
        return [[['account_status' => User::STATUS_RESTRICTED], 403], [['account_status' => User::STATUS_BANNED], 403],
            [['account_status' => User::STATUS_DEACTIVATED], 403], [['email_verified_at' => null], 403], [['invitation_pending' => true], 404]];
    }

    #[DataProvider('ineligible')]
    public function test_host_account_eligibility_is_enforced(array $fields, int $status): void
    {
        $this->vote($this->host);
        $this->host->forceFill($fields)->save();
        $this->signIn($this->host);
        $this->finalize()->assertStatus($status);
        $this->assertSame('scheduled', $this->night->fresh()->status->value);
    }

    public static function times(): array
    {
        return [[-1], [0], [1]];
    }

    #[DataProvider('times')]
    public function test_finalization_is_allowed_before_at_and_after_start(int $offset): void
    {
        $this->vote($this->host);
        $this->travelTo($this->night->starts_at->addSeconds($offset));
        $this->signIn($this->host);
        $this->finalize()->assertOk()->assertJsonPath('data.finalized_at', now()->toISOString())->assertJsonPath('data.voting_open', false);
    }

    public function test_cancelled_event_is_not_finalizable(): void
    {
        $this->vote($this->host);
        $this->signIn($this->host);
        $this->postJson($this->url('cancel'))->assertOk();
        $this->finalize()->assertStatus(409)->assertExactJson(['message' => 'Movie night is closed.']);
        $this->assertNull($this->night->fresh()->finalized_tmdb_id);
    }

    public function test_finalization_is_irreversible_and_all_open_state_mutations_close_with_frozen_totals(): void
    {
        $this->vote($this->host);
        $this->vote($this->participant);
        $this->signIn($this->host);
        $this->finalize()->assertOk();
        $before = $this->night->fresh();
        $totals = $this->getJson($this->url('votes'))->assertOk()->assertJsonPath('data.voting_open', false)->json();
        $this->travel(1)->minutes();
        $this->finalize(['tmdb_id' => 551])->assertStatus(409);
        $this->postJson($this->url('cancel'))->assertStatus(409);
        $this->patchJson($this->url(''), ['title' => 'Changed', 'starts_at' => now()->addDays(2)->format('Y-m-d\\TH:i:s\\Z')])->assertStatus(409);
        $this->postJson($this->url('movies'), ['tmdb_id' => 554])->assertStatus(409);
        $this->deleteJson($this->url('movies').'/'.$this->third->id)->assertStatus(409);
        $this->putJson($this->url('vote'), ['movie_night_movie_id' => $this->second->id])->assertStatus(409);
        $this->postJson($this->url('invitations'), ['invited_user_id' => User::factory()->create()->id])->assertStatus(409);
        $this->signIn($this->participant);
        $this->putJson($this->url('rsvp'), ['rsvp_status' => 'declined'])->assertStatus(409);
        $this->signIn($this->host);
        $this->getJson($this->url('votes'))->assertOk()->assertExactJson($totals);
        $after = $this->night->fresh();
        $this->assertSame(550, $after->finalized_tmdb_id);
        $this->assertTrue($before->finalized_at->eq($after->finalized_at));
        $this->assertTrue($before->updated_at->eq($after->updated_at));
        $this->assertSame('Final cinema', $after->title);
        $this->assertDatabaseCount('movie_night_votes', 2);
        Http::assertNothingSent();
    }

    public static function invalidBodies(): array
    {
        return [[['tmdb_id' => null]], [['tmdb_id' => 0]], [['tmdb_id' => -1]], [['tmdb_id' => '01']], [['tmdb_id' => 2147483648]],
            [['tmdb_id' => true]], [['tmdb_id' => 1.5]], [['tmdb_id' => [550]]], [['status' => 'finalized']],
            [['finalized_at' => '2027-01-01']], [['finalized_tmdb_id' => 550]], [['host_user_id' => 1]],
            [['tmdb_id' => 550, 'votes' => 99]], [['tmdb_id' => 550, 'leaders' => [550]]], [['tmdb_id' => 550, 'night' => 1]]];
    }

    #[DataProvider('invalidBodies')]
    public function test_invalid_ids_and_unexpected_mutation_fields_are_rejected(array $body): void
    {
        $this->vote($this->host);
        $this->signIn($this->host);
        $this->finalize($body)->assertUnprocessable();
        $this->assertSame('scheduled', $this->night->fresh()->status->value);
    }

    public function test_strict_event_ids_and_unknown_query_fields(): void
    {
        $this->signIn($this->host);
        foreach (['01', '0', '-1', 'bad', '9223372036854775808'] as $id) {
            $this->postJson(self::BASE.'/'.$id.'/finalize')->assertUnprocessable();
        }
        $this->postJson(self::BASE.'/9223372036854775807/finalize')->assertNotFound();
        $this->postJson($this->url().'?winner=550')->assertUnprocessable();
    }

    public function test_guest_firebase_mapping_session_revocation_and_csrf(): void
    {
        $this->finalize()->assertUnauthorized();
        $this->vote($this->host);
        config(['firebase_auth.mode' => 'firebase']);
        $this->signIn($this->host);
        $this->finalize()->assertUnauthorized();
        $this->host->forceFill(['firebase_uid' => 'final-host', 'password_session_version' => 'new'])->save();
        $this->signIn($this->host);
        $this->withSession(['password_session_version' => 'old'])->finalize()->assertUnauthorized();
        $this->signIn($this->host);
        $this->withSession(['password_session_version' => 'new']);
        $this->app->instance('env', 'local');
        $this->finalize()->assertStatus(419)->assertExactJson(['message' => 'CSRF token mismatch.']);
        $this->withHeader('Origin', 'http://localhost:5173')->finalize()->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie')->getCookie('XSRF-TOKEN', false)->getValue();
        $this->withHeader('X-XSRF-TOKEN', $csrf)->finalize()->assertOk();
    }

    public function test_shared_write_throttle_and_private_errors(): void
    {
        $this->signIn($this->host);
        for ($i = 0; $i < 60; $i++) {
            $this->finalize()->assertStatus(409);
        }
        $this->finalize()->assertTooManyRequests()->assertHeader('Retry-After')->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_failed_finalization_rolls_back_all_terminal_fields_and_preserves_votes(): void
    {
        $this->vote($this->host);
        $this->signIn($this->host);
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE movie_nights ADD CONSTRAINT m56_fail CHECK (status <> 'finalized') NOT VALID");
        } else {
            DB::unprepared("CREATE TRIGGER m56_fail BEFORE UPDATE ON movie_nights BEGIN SELECT RAISE(ABORT, 'private diagnostic'); END");
        }
        try {
            config(['app.debug' => true]);
            $this->finalize()->assertStatus(500)->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
            $after = $this->night->fresh();
            $this->assertSame('scheduled', $after->status->value);
            $this->assertNull($after->finalized_tmdb_id);
            $this->assertNull($after->finalized_at);
            $this->assertDatabaseCount('movie_night_votes', 1);
        } finally {
            if (DB::getDriverName() === 'pgsql') {
                DB::statement('ALTER TABLE movie_nights DROP CONSTRAINT m56_fail');
            } else {
                DB::unprepared('DROP TRIGGER m56_fail');
            }
        }
        $this->finalize()->assertOk();
    }

    public function test_postgres_non_utc_finalization_timestamp_is_the_absolute_instant(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires real PostgreSQL timestamptz.');
        }
        $this->vote($this->host);
        $original = DB::selectOne('SHOW TIME ZONE')->TimeZone;
        try {
            DB::statement("SET TIME ZONE 'Asia/Beirut'");
            $this->signIn($this->host);
            $this->finalize()->assertOk()->assertJsonPath('data.finalized_at', now()->toISOString());
            $epoch = DB::table('movie_nights')->where('id', $this->night->id)->selectRaw('EXTRACT(EPOCH FROM finalized_at) AS epoch')->first()->epoch;
            $this->assertSame(now()->timestamp, (int) $epoch);
        } finally {
            DB::selectOne("SELECT set_config('TimeZone', ?, false)", [$original]);
        }
    }
}
