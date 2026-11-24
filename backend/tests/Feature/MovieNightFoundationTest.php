<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Enums\MovieNightStatus;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\MovieNightMovie;
use App\Models\MovieNightVote;
use App\Models\User;
use App\Services\MovieNights\MovieNightRules;
use App\Services\MovieNights\MovieNightTransitions;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class MovieNightFoundationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->travelTo(now()->utc()->startOfSecond());
    }

    private function night(?User $host = null): MovieNight
    {
        $night = new MovieNight(['title' => 'Friday cinema', 'starts_at' => now()->addDay(), 'timezone' => 'Asia/Beirut']);
        $night->host()->associate($host ?? User::factory()->create());
        $night->save();

        return $night->refresh();
    }

    private function invite(MovieNight $night, User $user, MovieNightRsvp $status = MovieNightRsvp::Accepted): MovieNightInvitation
    {
        $user->refresh();
        $invitation = new MovieNightInvitation(['rsvp_status' => $status]);
        $invitation->movieNight()->associate($night);
        $invitation->invitedUser()->associate($user);
        $invitation->save();

        return $invitation;
    }

    private function movie(MovieNight $night, int $tmdb = 550): MovieNightMovie
    {
        $movie = new MovieNightMovie(['tmdb_id' => $tmdb]);
        $movie->movieNight()->associate($night);
        $movie->nominatedBy()->associate($night->host);
        $movie->save();

        return $movie;
    }

    private function vote(MovieNight $night, MovieNightMovie $movie, User $user): MovieNightVote
    {
        $vote = new MovieNightVote;
        $vote->movieNight()->associate($night);
        $vote->movie()->associate($movie);
        $vote->voter()->associate($user);
        $vote->save();

        return $vote;
    }

    private function rejectsDatabaseWrite(callable $write): void
    {
        // Savepoint prevents an expected violation poisoning the PostgreSQL transaction.
        try {
            DB::transaction($write);
            $this->fail('Expected database constraint violation.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }

    private function rejectsState(callable $action, int $status = 409): void
    {
        try {
            $action();
            $this->fail('Expected state conflict.');
        } catch (HttpException $e) {
            $this->assertSame($status, $e->getStatusCode());
        }
    }

    public function test_relationships_and_host_implicit_participation(): void
    {
        $night = $this->night();
        $user = User::factory()->create();
        $invitation = $this->invite($night, $user);
        $movie = $this->movie($night);
        $vote = $this->vote($night, $movie, $night->host);
        $this->assertTrue($invitation->movieNight->is($night));
        $this->assertTrue($invitation->invitedUser->is($user));
        $this->assertTrue($movie->nominatedBy->is($night->host));
        $this->assertTrue($vote->voter->is($night->host));
        $this->assertTrue($vote->movie->is($movie));
        $this->assertTrue($vote->movieNight->is($night));
        $this->assertSame(1, $night->invitations()->count());
        $this->assertSame(1, $night->movies()->count());
        $this->assertSame(1, $night->votes()->count());
        $this->assertSame(1, $movie->votes()->count());
        $this->assertTrue(Gate::forUser($night->host)->allows('vote', $night));
    }

    public function test_duplicate_invitations_and_nominations_are_rejected(): void
    {
        $night = $this->night();
        $user = User::factory()->create();
        $this->invite($night, $user);
        $this->rejectsDatabaseWrite(fn () => $this->invite($night, $user));
        $this->movie($night);
        $this->movie($this->night());
        $this->rejectsDatabaseWrite(fn () => $this->movie($night));
    }

    public function test_one_vote_per_event_and_vote_can_change(): void
    {
        $night = $this->night();
        $first = $this->movie($night);
        $second = $this->movie($night, 551);
        $vote = $this->vote($night, $first, $night->host);
        $this->rejectsDatabaseWrite(fn () => $this->vote($night, $second, $night->host));
        $vote->movie()->associate($second);
        $vote->save();
        $this->assertSame($second->id, $vote->refresh()->movie_night_movie_id);
        $other = $this->night($night->host);
        $this->vote($other, $this->movie($other), $night->host);
        $this->assertDatabaseCount('movie_night_votes', 2);
    }

    public function test_database_and_domain_reject_cross_event_votes(): void
    {
        $night = $this->night();
        $foreign = $this->movie($this->night());
        $this->rejectsDatabaseWrite(fn () => $this->vote($night, $foreign, $night->host));
        $this->rejectsState(fn () => app(MovieNightRules::class)->assertMovie($night, $foreign), 404);
    }

    public function test_foreign_keys_preserve_referenced_users_events_and_voted_movies(): void
    {
        $night = $this->night();
        $movie = $this->movie($night);
        $this->vote($night, $movie, $night->host);
        $this->rejectsDatabaseWrite(fn () => $movie->delete());
        $this->rejectsDatabaseWrite(fn () => $night->delete());
        $this->rejectsDatabaseWrite(fn () => $night->host->delete());
        $this->rejectsDatabaseWrite(fn () => DB::table('movie_night_invitations')->insert([
            'movie_night_id' => $night->id, 'invited_user_id' => 999999,
        ]));
    }

    public function test_membership_is_distinct_from_accepted_private_visibility(): void
    {
        $night = $this->night();
        $outsider = User::factory()->create();
        $this->assertCount(0, MovieNight::query()->visibleTo($outsider)->get());
        $this->assertSame(404, Gate::forUser($outsider)->inspect('view', $night)->status());
        $this->assertFalse(Gate::forUser(null)->allows('view', $night));
        foreach (MovieNightRsvp::cases() as $status) {
            $user = User::factory()->create();
            $this->invite($night, $user, $status);
            $this->assertCount(1, MovieNight::query()->forMember($user)->get());
            $this->assertCount($status === MovieNightRsvp::Accepted ? 1 : 0, MovieNight::query()->visibleTo($user)->get());
            $this->assertTrue(Gate::forUser($user)->allows('viewInvitation', $night));
            $this->assertSame($status === MovieNightRsvp::Accepted, Gate::forUser($user)->allows('view', $night));
        }
        $this->assertTrue(Gate::forUser($night->host)->allows('view', $night));
    }

    public function test_account_state_verification_and_pending_activation_gates(): void
    {
        $night = $this->night();
        foreach ([User::STATUS_RESTRICTED, User::STATUS_BANNED, User::STATUS_DEACTIVATED] as $status) {
            $night->host->forceFill(['account_status' => $status])->save();
            foreach (['create', 'vote', 'nominate', 'update', 'invite', 'finalize', 'cancel'] as $ability) {
                $this->assertFalse(Gate::forUser($night->host)->allows($ability, $ability === 'create' ? MovieNight::class : $night));
            }
            $this->assertSame($status === User::STATUS_RESTRICTED, Gate::forUser($night->host)->allows('view', $night));
        }
        $night->host->forceFill(['account_status' => User::STATUS_ACTIVE, 'email_verified_at' => null])->save();
        $this->assertFalse(Gate::forUser($night->host)->allows('create', MovieNight::class));
        $this->assertFalse(Gate::forUser($night->host)->allows('view', $night));
        $night->host->forceFill(['email_verified_at' => now(), 'invitation_pending' => true])->save();
        $this->assertFalse(Gate::forUser($night->host)->allows('create', MovieNight::class));
    }

    public function test_host_only_actions_and_accepted_participant_permissions(): void
    {
        $night = $this->night();
        foreach (MovieNightRsvp::cases() as $status) {
            $user = User::factory()->create();
            $this->invite($night, $user, $status);
            foreach (['update', 'cancel', 'invite', 'finalize'] as $ability) {
                $this->assertFalse(Gate::forUser($user)->allows($ability, $night));
                $this->assertTrue(Gate::forUser($night->host)->allows($ability, $night));
            }
            foreach (['nominate', 'vote'] as $ability) {
                $this->assertSame($status === MovieNightRsvp::Accepted, Gate::forUser($user)->allows($ability, $night));
            }
            $this->assertTrue(Gate::forUser($user)->allows('rsvp', $night));
        }
        $this->assertFalse(Gate::forUser($night->host)->allows('rsvp', $night));
        $this->assertFalse(Gate::forUser(User::factory()->create())->allows('rsvp', $night));
    }

    public function test_deadline_closes_at_exact_start_and_finalization_stays_available(): void
    {
        $night = $this->night();
        $this->travelTo($night->starts_at->subSecond());
        $this->assertTrue($night->votingIsOpen());
        $this->travelTo($night->starts_at);
        foreach (['vote', 'nominate', 'update', 'invite'] as $ability) {
            $this->assertFalse(Gate::forUser($night->host)->allows($ability, $night));
        }
        $this->assertTrue(Gate::forUser($night->host)->allows('finalize', $night));
        $this->rejectsState(fn () => app(MovieNightRules::class)->assertOpen($night));
    }

    public function test_terminal_events_stay_visible_and_deny_mutations(): void
    {
        foreach ([MovieNightStatus::Finalized, MovieNightStatus::Cancelled] as $status) {
            $night = $this->night();
            $night->forceFill(['status' => $status,
                'finalized_tmdb_id' => $status === MovieNightStatus::Finalized ? 550 : null,
                'finalized_at' => $status === MovieNightStatus::Finalized ? now() : null,
                'cancelled_at' => $status === MovieNightStatus::Cancelled ? now() : null])->save();
            $user = User::factory()->create();
            $this->invite($night, $user);
            foreach ([$night->host, $user] as $actor) {
                $this->assertTrue(Gate::forUser($actor)->allows('view', $night));
                foreach (['update', 'invite', 'cancel', 'finalize', 'nominate', 'vote', 'rsvp'] as $ability) {
                    $this->assertFalse(Gate::forUser($actor)->allows($ability, $night));
                }
            }
            $this->rejectsState(fn () => app(MovieNightRules::class)->assertOpen($night));
        }
    }

    public function test_declining_removes_vote_and_acceptance_does_not_restore_it(): void
    {
        $night = $this->night();
        $user = User::factory()->create();
        $invitation = $this->invite($night, $user);
        $this->vote($night, $this->movie($night), $user);
        $service = app(MovieNightTransitions::class);
        $service->respond($user, $night->id, MovieNightRsvp::Declined);
        $this->assertSame(MovieNightRsvp::Declined, $invitation->refresh()->rsvp_status);
        $this->assertNotNull($invitation->responded_at);
        $this->assertDatabaseCount('movie_night_votes', 0);
        $service->respond($user, $night->id, MovieNightRsvp::Accepted);
        $this->assertSame(MovieNightRsvp::Accepted, $invitation->refresh()->rsvp_status);
        $this->assertDatabaseCount('movie_night_votes', 0);
    }

    public function test_rsvp_after_deadline_preserves_vote(): void
    {
        $night = $this->night();
        $user = User::factory()->create();
        $invitation = $this->invite($night, $user);
        $this->vote($night, $this->movie($night), $user);
        $this->travelTo($night->starts_at);
        $this->rejectsState(fn () => app(MovieNightTransitions::class)->respond($user, $night->id, MovieNightRsvp::Declined));
        $this->assertSame(MovieNightRsvp::Accepted, $invitation->refresh()->rsvp_status);
        $this->assertDatabaseCount('movie_night_votes', 1);
    }

    public function test_pending_is_not_a_valid_rsvp_transition(): void
    {
        $night = $this->night();
        $user = User::factory()->create();
        $this->invite($night, $user);
        $this->expectException(ValidationException::class);
        app(MovieNightTransitions::class)->respond($user, $night->id, MovieNightRsvp::Pending);
    }

    public function test_voted_movies_cannot_be_removed(): void
    {
        $night = $this->night();
        $movie = $this->movie($night);
        $this->assertTrue(Gate::forUser($night->host)->allows('removeMovie', [$night, $movie]));
        app(MovieNightRules::class)->assertRemovable($night, $movie);
        $this->vote($night, $movie, $night->host);
        $this->assertFalse(Gate::forUser($night->host)->allows('removeMovie', [$night, $movie]));
        $this->rejectsState(fn () => app(MovieNightRules::class)->assertRemovable($night, $movie));
    }

    public function test_finalization_requires_valid_votes_without_catalog(): void
    {
        $night = $this->night();
        $this->vote($night, $this->movie($night), User::factory()->create());
        $this->rejectsState(fn () => app(MovieNightTransitions::class)->finalize($night->host, $night->id));
        $this->assertSame(MovieNightStatus::Scheduled, $night->refresh()->status);
        Http::assertNothingSent();
    }

    public function test_finalization_after_start_preserves_result_irreversibly(): void
    {
        $night = $this->night();
        $this->vote($night, $this->movie($night), $night->host);
        $this->travelTo($night->starts_at->addHour());
        $service = app(MovieNightTransitions::class);
        $finalized = $service->finalize($night->host, $night->id);
        $this->assertSame(MovieNightStatus::Finalized, $finalized->status);
        $this->assertSame(550, $finalized->finalized_tmdb_id);
        $timestamp = $finalized->finalized_at;
        $this->rejectsState(fn () => $service->finalize($night->host, $night->id, 551));
        $this->assertTrue($timestamp->equalTo($night->refresh()->finalized_at));
        $this->assertSame(550, $night->finalized_tmdb_id);
        Http::assertNothingSent();
    }

    public function test_tie_requires_leader_and_nonleader_failure_is_atomic(): void
    {
        $night = $this->night();
        $user = User::factory()->create();
        $this->invite($night, $user);
        $this->vote($night, $this->movie($night), $night->host);
        $this->vote($night, $this->movie($night, 551), $user);
        $this->movie($night, 552);
        $service = app(MovieNightTransitions::class);
        $this->rejectsState(fn () => $service->finalize($night->host, $night->id));
        try {
            $service->finalize($night->host, $night->id, 552);
            $this->fail('Nonleader must not win.');
        } catch (ValidationException) {
            $this->assertSame(MovieNightStatus::Scheduled, $night->refresh()->status);
            $this->assertNull($night->finalized_at);
        }
        $this->assertSame(551, $service->finalize($night->host, $night->id, 551)->finalized_tmdb_id);
    }

    public function test_nonhost_cannot_finalize_and_stale_actor_is_rechecked(): void
    {
        $night = $this->night();
        $user = User::factory()->create();
        $this->invite($night, $user);
        $this->vote($night, $this->movie($night), $night->host);
        try {
            app(MovieNightTransitions::class)->finalize($user, $night->id);
            $this->fail('Only host may finalize.');
        } catch (AuthorizationException) {
            $this->assertSame(MovieNightStatus::Scheduled, $night->refresh()->status);
        }
        User::query()->whereKey($night->host->id)->update(['account_status' => User::STATUS_RESTRICTED]);
        $this->expectException(HttpResponseException::class);
        app(MovieNightTransitions::class)->finalize($night->host, $night->id);
    }

    public function test_event_validation_accepts_utc_and_iana_timezone(): void
    {
        $data = ['title' => 'Cinema', 'starts_at' => now()->addDay()->format('Y-m-d\TH:i:s\Z'),
            'timezone' => 'Asia/Beirut', 'meeting_url' => 'https://example.com/room'];
        $this->assertSame($data, app(MovieNightRules::class)->validateEventFields($data));
        $this->assertSame([], app(MovieNightRules::class)->validateEventFields([], true));
    }

    public function test_event_validation_rejects_ambiguous_time_invalid_zone_unsafe_url(): void
    {
        $rules = app(MovieNightRules::class);
        $validator = Validator::make(['title' => '   ', 'starts_at' => '2026-11-23T20:00:00',
            'timezone' => 'Mars/Olympus', 'meeting_url' => 'javascript:alert(1)'], $rules->eventFields());
        $this->assertSame(['title', 'starts_at', 'timezone', 'meeting_url'], array_keys($validator->errors()->toArray()));
        $validator = Validator::make(['title' => 'Cinema', 'starts_at' => now()->format('Y-m-d\TH:i:s\Z'),
            'timezone' => 'UTC'], $rules->eventFields());
        $this->assertTrue($validator->errors()->has('starts_at'));
    }

    public function test_migration_round_trip_preserves_existing_users(): void
    {
        $user = User::factory()->create();
        $migration = require database_path('migrations/2026_11_23_000001_create_movie_night_tables.php');
        $migration->down();
        $this->assertFalse(Schema::hasTable('movie_nights'));
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $migration->up();
        foreach (['movie_nights', 'movie_night_invitations', 'movie_night_movies', 'movie_night_votes'] as $table) {
            $this->assertTrue(Schema::hasTable($table));
        }
        $night = $this->night($user);
        $this->vote($night, $this->movie($night), $user);
        $this->assertDatabaseCount('movie_night_votes', 1);
    }

    public function test_plurality_wins_and_declined_votes_are_ignored(): void
    {
        $night = $this->night();
        $first = $this->movie($night);
        $second = $this->movie($night, 551);
        $this->vote($night, $first, $night->host);
        $accepted = User::factory()->create();
        $this->invite($night, $accepted);
        $this->vote($night, $first, $accepted);
        foreach ([MovieNightRsvp::Declined, MovieNightRsvp::Pending] as $status) {
            $user = User::factory()->create();
            $this->invite($night, $user, $status);
            $this->vote($night, $second, $user);
        }
        $this->assertSame(550, app(MovieNightTransitions::class)->finalize($night->host, $night->id)->finalized_tmdb_id);
    }

    public function test_failed_finalization_write_rolls_back_all_result_fields(): void
    {
        $night = $this->night();
        $this->vote($night, $this->movie($night), $night->host);
        // A temporary database constraint simulates a failed write without replacing model events.
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('PostgreSQL write-failure rollback acceptance.');
        }
        DB::statement("ALTER TABLE movie_nights ADD CONSTRAINT mn_test_write_failure CHECK (status <> 'finalized')");
        try {
            app(MovieNightTransitions::class)->finalize($night->host, $night->id);
            $this->fail('Expected write failure.');
        } catch (QueryException) {
            $this->assertSame(MovieNightStatus::Scheduled, $night->refresh()->status);
            $this->assertNull($night->finalized_at);
            $this->assertNull($night->finalized_tmdb_id);
            $this->assertDatabaseCount('movie_night_votes', 1);
        } finally {
            DB::statement('ALTER TABLE movie_nights DROP CONSTRAINT mn_test_write_failure');
        }
    }

    public function test_postgres_checks_reject_inconsistent_state_and_invalid_tmdb(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('PostgreSQL CHECK enforcement acceptance.');
        }
        $night = $this->night();
        $this->rejectsDatabaseWrite(fn () => DB::table('movie_nights')->where('id', $night->id)->update(['status' => 'finalized']));
        $this->rejectsDatabaseWrite(fn () => $this->movie($night, 0));
        $this->rejectsDatabaseWrite(fn () => DB::table('movie_nights')->where('id', $night->id)->update(['status' => 'unknown']));
        $this->rejectsDatabaseWrite(fn () => DB::table('movie_night_invitations')->insert([
            'movie_night_id' => $night->id, 'invited_user_id' => $night->host->id, 'rsvp_status' => 'unknown',
        ]));
    }

    private function withBeirutSession(callable $test): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires real PostgreSQL non-UTC session timezone.');
        }
        $original = DB::selectOne('SHOW TIME ZONE')->TimeZone;
        try {
            DB::statement("SET TIME ZONE 'Asia/Beirut'");
            $test();
            $this->assertSame('Asia/Beirut', DB::selectOne('SHOW TIME ZONE')->TimeZone);
        } finally {
            DB::selectOne("SELECT set_config('TimeZone', ?, false)", [$original]);
        }
    }

    private function assertUtcInstant(Model $model, string $field, CarbonInterface $expected): void
    {
        $model->refresh();
        $actual = $model->getAttribute($field);
        $this->assertSame($expected->getTimestamp(), $actual->getTimestamp(), $model->getTable().'.'.$field);
        $this->assertSame('UTC', $actual->getTimezone()->getName());
        // Check the stored instant independently of Eloquent's date decoding.
        $stored = DB::table($model->getTable())->where('id', $model->getKey())
            ->selectRaw('EXTRACT(EPOCH FROM "'.$field.'") AS epoch')->first();
        $this->assertSame($expected->getTimestamp(), (int) $stored->epoch);
    }

    public function test_non_utc_postgres_round_trip_for_all_movie_night_timestamps(): void
    {
        $host = User::factory()->create();
        $invitee = User::factory()->create();
        $this->withBeirutSession(function () use ($host, $invitee): void {
            // Exercise both UTC+02 winter and UTC+03 summer offsets.
            foreach (['2027-01-15T18:00:00Z', '2027-07-15T18:00:00Z'] as $instant) {
                $now = CarbonImmutable::parse($instant);
                $this->travelTo($now);
                $night = $this->night($host);
                $this->assertUtcInstant($night, 'starts_at', $now->addDay());
                $start = $now->addHours(3);
                // Offset-bearing inputs must retain their instant as well.
                $night->starts_at = $start->setTimezone('Asia/Beirut');
                $night->save();
                $invitation = $this->invite($night, $invitee, MovieNightRsvp::Pending);
                $movie = $this->movie($night);
                $vote = $this->vote($night, $movie, $host);
                app(MovieNightTransitions::class)->respond($invitee, $night->id, MovieNightRsvp::Accepted);
                $finalized = app(MovieNightTransitions::class)->finalize($host, $night->id);
                $cancelled = $this->night($host);
                $cancelled->forceFill(['status' => MovieNightStatus::Cancelled, 'cancelled_at' => $now])->save();
                $this->assertUtcInstant($night, 'starts_at', $start);
                $this->assertUtcInstant($finalized, 'finalized_at', $now);
                $this->assertUtcInstant($cancelled, 'cancelled_at', $now);
                $this->assertUtcInstant($invitation, 'responded_at', $now);
                foreach ([$night, $invitation, $movie, $vote, $cancelled] as $model) {
                    $this->assertUtcInstant($model, 'created_at', $now);
                    $this->assertUtcInstant($model, 'updated_at', $now);
                }
                $this->travelTo($now->addMinutes(5));
                $movie->touch();
                $vote->touch();
                $this->assertUtcInstant($movie, 'updated_at', $now->addMinutes(5));
                $this->assertUtcInstant($vote, 'updated_at', $now->addMinutes(5));
            }
        });
    }

    public function test_non_utc_postgres_voting_closes_at_absolute_start_boundary(): void
    {
        $host = User::factory()->create();
        $this->withBeirutSession(function () use ($host): void {
            $created = CarbonImmutable::parse('2027-07-15T18:00:00Z');
            $start = $created->addHour();
            $this->travelTo($created);
            $night = $this->night($host);
            $night->starts_at = $start;
            $night->save();
            $this->vote($night, $this->movie($night), $host);
            $this->assertUtcInstant($night, 'starts_at', $start);
            $this->travelTo($start->subMicrosecond());
            $this->assertTrue($night->votingIsOpen());
            $this->assertTrue(Gate::forUser($host->refresh())->allows('vote', $night));
            $this->travelTo($start);
            $this->assertFalse($night->votingIsOpen());
            $this->assertFalse(Gate::forUser($host)->allows('vote', $night));
            $this->rejectsState(fn () => app(MovieNightRules::class)->assertOpen($night));
            $this->travelTo($start->addSecond());
            $this->assertFalse($night->votingIsOpen());
            $finalized = app(MovieNightTransitions::class)->finalize($host, $night->id);
            $this->assertSame(550, $finalized->finalized_tmdb_id);
            $this->assertUtcInstant($finalized, 'finalized_at', $start->addSecond());
        });
    }
}
