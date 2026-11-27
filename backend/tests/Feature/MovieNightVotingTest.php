<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\MovieNightMovie;
use App\Models\MovieNightVote;
use App\Models\User;
use App\Services\MovieNights\MovieNightTransitions;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MySqlWriteFailure;
use Tests\TestCase;

class MovieNightVotingTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = '/api/v1/me/movie-nights';

    private User $host;

    private User $participant;

    private MovieNight $night;

    private MovieNightMovie $first;

    private MovieNightMovie $second;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['movie_catalog.url' => 'http://catalog.invalid', 'movie_catalog.token' => '']);
        $this->travelTo(CarbonImmutable::parse('2027-01-15T18:00:00Z'));
        $this->host = User::factory()->create();
        $this->participant = User::factory()->create();
        $this->night = new MovieNight(['title' => 'Private voting', 'starts_at' => now()->addDay(), 'timezone' => 'Asia/Beirut']);
        $this->night->host()->associate($this->host);
        $this->night->save();
        $this->invite($this->participant);
        $this->first = $this->candidate(550);
        $this->second = $this->candidate(551);
    }

    private function signIn(User $user): void
    {
        Auth::forgetGuards();
        $this->actingAs($user, 'web');
    }

    private function invite(User $user, MovieNightRsvp $status = MovieNightRsvp::Accepted): MovieNightInvitation
    {
        $row = new MovieNightInvitation(['rsvp_status' => $status, 'responded_at' => $status === MovieNightRsvp::Pending ? null : now()]);
        $row->movieNight()->associate($this->night);
        $row->invitedUser()->associate($user);
        $row->save();

        return $row;
    }

    private function candidate(int $id, ?MovieNight $night = null): MovieNightMovie
    {
        $row = new MovieNightMovie(['tmdb_id' => $id]);
        $row->movieNight()->associate($night ?? $this->night);
        $row->nominatedBy()->associate($this->host);
        $row->save();

        return $row;
    }

    private function url(string $action = 'vote'): string
    {
        return self::BASE.'/'.$this->night->id.'/'.$action;
    }

    private function cast(?MovieNightMovie $candidate = null): TestResponse
    {
        return $this->putJson($this->url(), ['movie_night_movie_id' => ($candidate ?? $this->first)->id]);
    }

    private function totals(): TestResponse
    {
        return $this->getJson($this->url('votes'));
    }

    public static function actors(): array
    {
        return [['host'], ['participant']];
    }

    #[DataProvider('actors')]
    public function test_eligible_actor_casts_one_vote_and_repeats_preserve_timestamps(string $actor): void
    {
        $this->signIn($this->{$actor});
        $first = $this->cast()->assertOk()->assertExactJson(['data' => ['movie_night_movie_id' => $this->first->id,
            'updated_at' => now()->toISOString()]])->assertHeader('Cache-Control', 'no-store, private')->json();
        $before = MovieNightVote::query()->firstOrFail();
        $this->travel(1)->minutes();
        $this->cast()->assertOk()->assertExactJson($first);
        $after = $before->fresh();
        $this->assertTrue($before->updated_at->eq($after->updated_at));
        $this->assertTrue($before->created_at->eq($after->created_at));
        $this->assertSame($before->id, $after->id);
        $this->assertDatabaseCount('movie_night_votes', 1);
        $this->assertSame($actor === 'host' ? 0 : 1, $this->night->invitations()->where('invited_user_id', $this->{$actor}->id)->count());
        $this->totals()->assertOk()->assertJsonPath('data.total_votes', 1)->assertJsonPath('data.my_vote', $this->first->id);
        Http::assertNothingSent();
    }

    public function test_changes_update_existing_row_and_authoritative_totals_without_catalog(): void
    {
        $this->signIn($this->host);
        $this->cast()->assertOk();
        $this->signIn($this->participant);
        $this->cast()->assertOk();
        $row = MovieNightVote::where('voting_user_id', $this->participant->id)->firstOrFail();
        $this->travel(1)->minutes();
        $this->cast($this->second)->assertOk()->assertJsonPath('data.updated_at', now()->toISOString());
        $this->assertSame($row->id, $row->fresh()->id);
        $this->assertTrue($row->created_at->eq($row->fresh()->created_at));
        $this->assertDatabaseCount('movie_night_votes', 2);
        $this->totals()->assertOk()->assertExactJson(['data' => [
            'totals' => [['tmdb_id' => 550, 'movie_night_movie_id' => $this->first->id, 'votes' => 1],
                ['tmdb_id' => 551, 'movie_night_movie_id' => $this->second->id, 'votes' => 1]],
            'my_vote' => $this->second->id, 'total_votes' => 2, 'leaders' => [550, 551], 'voting_open' => true]]);
        $this->signIn($this->host);
        $this->totals()->assertOk()->assertJsonPath('data.my_vote', $this->first->id);
        Http::assertNothingSent();
    }

    public function test_zero_votes_empty_shortlist_and_no_other_voter_information(): void
    {
        $this->signIn($this->host);
        $this->totals()->assertOk()->assertExactJson(['data' => [
            'totals' => [['tmdb_id' => 550, 'movie_night_movie_id' => $this->first->id, 'votes' => 0],
                ['tmdb_id' => 551, 'movie_night_movie_id' => $this->second->id, 'votes' => 0]],
            'my_vote' => null, 'total_votes' => 0, 'leaders' => [], 'voting_open' => true]]);
        $this->signIn($this->participant);
        $this->cast($this->second)->assertOk();
        $this->signIn($this->host);
        $result = $this->totals()->assertOk()->assertJsonPath('data.my_vote', null)->assertJsonPath('data.total_votes', 1);
        $this->assertSame(['tmdb_id', 'movie_night_movie_id', 'votes'], array_keys($result->json('data.totals.0')));
        $this->assertSame(['totals', 'my_vote', 'total_votes', 'leaders', 'voting_open'], array_keys($result->json('data')));
        $this->signIn($this->participant);
        $this->putJson($this->url('rsvp'), ['rsvp_status' => 'declined'])->assertOk();
        $this->first->delete();
        $this->second->delete();
        $this->signIn($this->host);
        $this->totals()->assertOk()->assertExactJson(['data' => ['totals' => [], 'my_vote' => null,
            'total_votes' => 0, 'leaders' => [], 'voting_open' => true]]);
    }

    public static function privateActors(): array
    {
        return [['pending'], ['declined'], ['outsider'], ['admin']];
    }

    #[DataProvider('privateActors')]
    public function test_private_voting_is_hidden(string $kind): void
    {
        if (in_array($kind, ['pending', 'declined'], true)) {
            $this->night->invitations()->first()->update(['rsvp_status' => $kind]);
            $actor = $this->participant;
        } else {
            $actor = User::factory()->create(['role' => $kind === 'admin' ? User::ROLE_ADMIN : User::ROLE_USER]);
        }
        $this->signIn($actor);
        $this->cast()->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        $this->totals()->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        $this->putJson(self::BASE.'/9223372036854775807/vote', ['movie_night_movie_id' => $this->first->id])->assertNotFound();
        $this->assertDatabaseCount('movie_night_votes', 0);
        Http::assertNothingSent();
    }

    public function test_cross_event_missing_and_deleted_candidates_are_hidden(): void
    {
        $other = $this->night->replicate();
        $other->save();
        $foreign = $this->candidate(552, $other);
        $this->signIn($this->host);
        $this->cast($foreign)->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        $this->first->delete();
        $this->cast()->assertNotFound();
        $this->putJson($this->url(), ['movie_night_movie_id' => 9223372036854775807])->assertNotFound();
        $this->assertDatabaseCount('movie_night_votes', 0);
    }

    public static function invalidBodies(): array
    {
        return [[[]], [['movie_night_movie_id' => 0]], [['movie_night_movie_id' => -1]], [['movie_night_movie_id' => '01']],
            [['movie_night_movie_id' => '9223372036854775808']], [['movie_night_movie_id' => null]],
            [['movie_night_movie_id' => true]], [['movie_night_movie_id' => 1.5]], [['movie_night_movie_id' => [1]]],
            [['movie_night_movie_id' => 1, 'voting_user_id' => 1]], [['movie_night_movie_id' => 1, 'votes' => 99]],
            [['movie_night_movie_id' => 1, 'night' => 1]], [['movie_night_movie_id' => 1, 'updated_at' => '2027-01-01']],
            [['tmdb_id' => 550]]];
    }

    #[DataProvider('invalidBodies')]
    public function test_invalid_or_unexpected_fields_do_not_create_votes(array $body): void
    {
        $this->signIn($this->host);
        $this->putJson($this->url(), $body)->assertUnprocessable()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertDatabaseCount('movie_night_votes', 0);
    }

    public function test_strict_route_ids_and_no_query_fields(): void
    {
        $this->signIn($this->host);
        foreach (['0', '01', '-1', 'bad', '9223372036854775808'] as $id) {
            $this->getJson(self::BASE.'/'.$id.'/votes')->assertUnprocessable();
            $this->putJson(self::BASE.'/'.$id.'/vote', ['movie_night_movie_id' => $this->first->id])->assertUnprocessable();
        }
        $this->getJson($this->url('votes').'?user_id='.$this->participant->id)->assertUnprocessable();
        $this->putJson($this->url().'?voter_id='.$this->participant->id, ['movie_night_movie_id' => $this->first->id])->assertUnprocessable();
    }

    public static function ineligible(): array
    {
        return [[['account_status' => User::STATUS_RESTRICTED], 403, 200], [['account_status' => User::STATUS_BANNED], 403, 403],
            [['account_status' => User::STATUS_DEACTIVATED], 403, 403], [['email_verified_at' => null], 403, 403],
            [['invitation_pending' => true], 404, 404]];
    }

    #[DataProvider('ineligible')]
    public function test_account_eligibility_preserves_recorded_votes(array $fields, int $writeStatus, int $readStatus): void
    {
        $this->signIn($this->participant);
        $this->cast()->assertOk();
        $this->participant->forceFill($fields)->save();
        $this->signIn($this->participant);
        $this->cast($this->second)->assertStatus($writeStatus);
        $this->totals()->assertStatus($readStatus);
        $this->signIn($this->host);
        $this->totals()->assertOk()->assertJsonPath('data.total_votes', 1);
        $this->assertSame($this->first->id, MovieNightVote::query()->first()->movie_night_movie_id);
    }

    public function test_exact_start_blocks_changes_and_identical_repeats_but_keeps_totals(): void
    {
        $this->signIn($this->participant);
        $this->travelTo($this->night->starts_at->subMicrosecond());
        $this->cast()->assertOk();
        $this->totals()->assertOk()->assertJsonPath('data.voting_open', true);
        $before = MovieNightVote::query()->firstOrFail();
        foreach ([$this->night->starts_at, $this->night->starts_at->addSecond()] as $instant) {
            $this->travelTo($instant);
            $this->cast()->assertStatus(409);
            $this->cast($this->second)->assertStatus(409);
            $this->totals()->assertOk()->assertJsonPath('data.voting_open', false)->assertJsonPath('data.total_votes', 1);
        }
        $this->assertTrue($before->updated_at->eq($before->fresh()->updated_at));
    }

    public static function terminalStates(): array
    {
        return [['cancelled'], ['finalized']];
    }

    #[DataProvider('terminalStates')]
    public function test_terminal_states_freeze_totals_and_reject_writes(string $status): void
    {
        $this->signIn($this->host);
        $this->cast()->assertOk();
        $this->night->forceFill(['status' => $status, 'cancelled_at' => $status === 'cancelled' ? now() : null,
            'finalized_at' => $status === 'finalized' ? now() : null, 'finalized_tmdb_id' => $status === 'finalized' ? 550 : null])->save();
        $this->cast()->assertStatus(409);
        $this->cast($this->second)->assertStatus(409);
        $this->totals()->assertOk()->assertJsonPath('data.total_votes', 1)->assertJsonPath('data.voting_open', false);
        $this->signIn($this->participant);
        $this->totals()->assertOk()->assertJsonPath('data.total_votes', 1)->assertJsonPath('data.my_vote', null);
    }

    public function test_decline_removes_vote_reacceptance_does_not_restore_and_shortlist_protection_updates(): void
    {
        $this->signIn($this->participant);
        $this->cast()->assertOk();
        $this->signIn($this->host);
        $this->deleteJson($this->url('movies').'/'.$this->first->id)->assertStatus(409);
        $this->signIn($this->participant);
        $this->putJson($this->url('rsvp'), ['rsvp_status' => 'declined'])->assertOk();
        $this->cast()->assertNotFound();
        $this->totals()->assertNotFound();
        $this->putJson($this->url('rsvp'), ['rsvp_status' => 'accepted'])->assertOk();
        $this->totals()->assertOk()->assertJsonPath('data.my_vote', null)->assertJsonPath('data.total_votes', 0);
        $this->signIn($this->host);
        $this->deleteJson($this->url('movies').'/'.$this->first->id)->assertNoContent();
        $this->assertDatabaseCount('movie_night_votes', 0);
    }

    public function test_totals_and_internal_finalization_share_valid_vote_cohort(): void
    {
        $this->signIn($this->host);
        $this->cast()->assertOk();
        foreach ([null, MovieNightRsvp::Pending, MovieNightRsvp::Declined] as $status) {
            $user = User::factory()->create();
            if ($status) {
                $this->invite($user, $status);
            }
            $vote = new MovieNightVote;
            $vote->movieNight()->associate($this->night);
            $vote->movie()->associate($this->second);
            $vote->voter()->associate($user);
            $vote->save();
        }
        $this->totals()->assertOk()->assertJsonPath('data.total_votes', 1)->assertJsonPath('data.totals.1.votes', 0);
        $winner = app(MovieNightTransitions::class)->finalize($this->host, $this->night->id);
        $this->assertSame(550, $winner->finalized_tmdb_id);
    }

    public function test_totals_query_count_is_bounded(): void
    {
        $this->signIn($this->host);
        DB::enableQueryLog();
        try {
            DB::flushQueryLog();
            $this->totals()->assertOk();
            $two = count(DB::getQueryLog());
            foreach (range(552, 559) as $id) {
                $this->candidate($id);
            }
            DB::flushQueryLog();
            $this->totals()->assertOk()->assertJsonCount(10, 'data.totals');
            $this->assertSame($two, count(DB::getQueryLog()));
        } finally {
            DB::disableQueryLog();
        }
        Http::assertNothingSent();
    }

    public function test_authentication_firebase_session_csrf_and_throttles(): void
    {
        $this->cast()->assertUnauthorized();
        $this->totals()->assertUnauthorized();
        config(['firebase_auth.mode' => 'firebase']);
        $this->signIn($this->host);
        $this->cast()->assertUnauthorized();
        $this->host->forceFill(['firebase_uid' => 'vote-host', 'password_session_version' => 'new'])->save();
        $this->signIn($this->host);
        $this->withSession(['password_session_version' => 'old'])->totals()->assertUnauthorized();
        $this->signIn($this->host);
        $this->withSession(['password_session_version' => 'new']);
        $this->app->instance('env', 'local');
        $this->cast()->assertStatus(419)->assertExactJson(['message' => 'CSRF token mismatch.']);
        $this->withHeader('Origin', 'http://localhost:5173')->cast()->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie')->getCookie('XSRF-TOKEN', false)->getValue();
        $this->withHeader('X-XSRF-TOKEN', $csrf)->cast()->assertOk();
        $this->travel(61)->seconds();
        for ($i = 0; $i < 60; $i++) {
            $this->cast()->assertOk();
        }
        $this->cast()->assertTooManyRequests()->assertHeader('Retry-After')->assertHeader('Cache-Control', 'no-store, private');
        for ($i = 0; $i < 120; $i++) {
            $this->totals()->assertOk();
        }
        $this->totals()->assertTooManyRequests()->assertHeader('Retry-After');
        Http::assertNothingSent();
    }

    public function test_failed_change_rolls_back_previous_selection_and_timestamp(): void
    {
        $this->signIn($this->host);
        $this->cast()->assertOk();
        $before = MovieNightVote::query()->firstOrFail();
        $failure = null;
        if (DB::getDriverName() === 'mysql') {
            $this->assertDisposableDatabase();
            $failure = new MySqlWriteFailure(DB::connection(), 'update', 'movie_night_votes');
        } elseif (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE movie_night_votes ADD CONSTRAINT m55_change_fail CHECK (movie_night_movie_id <> '.$this->second->id.') NOT VALID');
        } else {
            DB::unprepared("CREATE TRIGGER m55_change_fail BEFORE UPDATE ON movie_night_votes BEGIN SELECT RAISE(ABORT, 'private test diagnostic'); END");
        }
        try {
            $this->travel(1)->minutes();
            config(['app.debug' => true]);
            $this->cast($this->second)->assertStatus(500)->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
            $failure?->assertTriggered([$this->second->id, $before->id]);
            $this->assertSame($this->first->id, $before->fresh()->movie_night_movie_id);
            $this->assertTrue($before->updated_at->eq($before->fresh()->updated_at));
            $this->assertDatabaseCount('movie_night_votes', 1);
        } finally {
            if ($failure !== null) {
                $failure->disarm();
            } elseif (DB::getDriverName() === 'pgsql') {
                DB::statement('ALTER TABLE movie_night_votes DROP CONSTRAINT m55_change_fail');
            } else {
                DB::unprepared('DROP TRIGGER m55_change_fail');
            }
        }
        $this->cast($this->second)->assertOk();
        $failure?->assertDisarmed();
    }

    public function test_postgres_non_utc_vote_timestamps_and_deadline(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Real PostgreSQL timestamp round trip.');
        }
        $original = DB::selectOne('SHOW TIME ZONE')->TimeZone;
        try {
            DB::statement("SET TIME ZONE 'Asia/Beirut'");
            $this->signIn($this->host);
            $this->cast()->assertOk()->assertJsonPath('data.updated_at', now()->toISOString());
            $epoch = DB::table('movie_night_votes')->selectRaw('EXTRACT(EPOCH FROM updated_at) AS epoch')->first()->epoch;
            $this->assertSame(now()->timestamp, (int) $epoch);
            $this->travelTo($this->night->starts_at);
            $this->cast($this->second)->assertStatus(409);
        } finally {
            DB::selectOne("SELECT set_config('TimeZone', ?, false)", [$original]);
        }
    }
}
