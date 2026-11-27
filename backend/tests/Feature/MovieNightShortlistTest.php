<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\MovieNightMovie;
use App\Models\MovieNightVote;
use App\Models\User;
use App\Services\MovieNights\MovieNightService;
use App\Services\MovieNights\MovieNightTransitions;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MySqlWriteFailure;
use Tests\TestCase;

class MovieNightShortlistTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = '/api/v1/me/movie-nights';

    private User $host;

    private User $participant;

    private MovieNight $night;

    protected function setUp(): void
    {
        parent::setUp();
        config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
        Http::preventStrayRequests();
        $this->travelTo(CarbonImmutable::parse('2027-01-15T18:00:00Z'));
        $this->host = User::factory()->create();
        $this->participant = User::factory()->create();
        $this->night = new MovieNight(['title' => 'Private shortlist', 'starts_at' => now()->addDay(), 'timezone' => 'Asia/Beirut']);
        $this->night->host()->associate($this->host);
        $this->night->save();
        $invitation = new MovieNightInvitation(['rsvp_status' => MovieNightRsvp::Accepted, 'responded_at' => now()]);
        $invitation->movieNight()->associate($this->night);
        $invitation->invitedUser()->associate($this->participant);
        $invitation->save();
    }

    private function signIn(User $user): void
    {
        Auth::forgetGuards();
        $this->actingAs($user, 'web');
    }

    private function url(): string
    {
        return self::BASE.'/'.$this->night->id.'/movies';
    }

    private function entry(int $tmdbId = 550, ?User $nominator = null, ?MovieNight $night = null): MovieNightMovie
    {
        $movie = new MovieNightMovie(['tmdb_id' => $tmdbId]);
        $movie->movieNight()->associate($night ?? $this->night);
        $movie->nominatedBy()->associate($nominator ?? $this->host);
        $movie->save();

        return $movie;
    }

    private function vote(MovieNightMovie $movie): MovieNightVote
    {
        $vote = new MovieNightVote;
        $vote->movieNight()->associate($this->night);
        $vote->movie()->associate($movie);
        $vote->voter()->associate($this->participant);
        $vote->save();

        return $vote;
    }

    private static function summary(int $id): array
    {
        return ['tmdb_id' => $id, 'title' => 'Fixture '.$id, 'overview' => null, 'poster_path' => null,
            'backdrop_path' => null, 'release_date' => null, 'tmdb_rating' => 8.0, 'tmdb_vote_count' => 100];
    }

    private static function detail(int $id): array
    {
        return ['data' => self::summary($id) + ['original_title' => 'Original', 'runtime' => 120,
            'original_language' => 'en', 'genres' => [], 'provider_secret' => 'never expose'], 'meta' => ['stale' => false]];
    }

    private function fakeCatalog(array $missing = []): void
    {
        $level = DB::transactionLevel();
        Http::fake(function ($request) use ($missing, $level) {
            $this->assertSame($level, DB::transactionLevel(), 'Catalog must run outside the service mutation transaction.');
            if ($request->method() === 'GET') {
                return Http::response(self::detail((int) basename($request->url())));
            }
            $ids = $request['tmdb_ids'];
            $data = array_map(self::summary(...), array_values(array_diff($ids, $missing)));

            return Http::response(['data' => array_reverse($data), 'meta' => ['requested_count' => count($ids),
                'returned_count' => count($data), 'missing_tmdb_ids' => array_values(array_intersect($ids, $missing))]]);
        });
    }

    public static function actors(): array
    {
        return [['host'], ['participant']];
    }

    #[DataProvider('actors')]
    public function test_eligible_host_and_participant_nominate_real_catalog_movies(string $actor): void
    {
        $this->fakeCatalog();
        $this->signIn($this->{$actor});
        $response = $this->postJson($this->url(), ['tmdb_id' => 550])->assertCreated()->assertJsonPath('data.tmdb_id', 550)
            ->assertJsonPath('data.nominated_by.id', $this->{$actor}->id)->assertHeader('Cache-Control', 'no-store, private');
        $this->assertSame(['id', 'tmdb_id', 'nominated_by', 'created_at', 'movie'], array_keys($response->json('data')));
        $this->assertSame(['id', 'username', 'avatar_url'], array_keys($response->json('data.nominated_by')));
        $this->assertEquals(self::summary(550), $response->json('data.movie'));
        $this->assertDatabaseHas('movie_night_movies', ['movie_night_id' => $this->night->id, 'tmdb_id' => 550, 'nominated_by_user_id' => $this->{$actor}->id]);
        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => $r->method() === 'GET' && str_ends_with($r->url(), '/movies/550') && $r->data() === []);
        $this->postJson($this->url(), ['tmdb_id' => 550])->assertStatus(409);
        $this->assertDatabaseCount('movie_night_movies', 1);
    }

    public function test_empty_shortlist_needs_no_catalog_call(): void
    {
        $this->signIn($this->host);
        $this->getJson($this->url())->assertOk()->assertExactJson(['data' => [], 'meta' => ['page' => 1, 'per_page' => 20,
            'total_pages' => 0, 'total_results' => 0, 'metadata_unavailable' => false]]);
        Http::assertNothingSent();
    }

    public function test_shared_deterministic_shortlist_batch_metadata_and_pagination(): void
    {
        $this->entry(550);
        $this->entry(551, $this->participant);
        $this->entry(552);
        $this->fakeCatalog();
        $this->signIn($this->host);
        $host = $this->getJson($this->url().'?per_page=2')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total_results', 3)->assertJsonPath('meta.total_pages', 2)->json();
        $this->signIn($this->participant);
        $this->getJson($this->url().'?per_page=2')->assertOk()->assertExactJson($host);
        $this->getJson($this->url().'?per_page=2&page=2')->assertOk()->assertJsonPath('data.0.tmdb_id', 552);
        Http::assertSentCount(3);
        Http::assertSent(fn ($r) => $r->method() === 'POST' && $r->data() === ['tmdb_ids' => [550, 551]]);
        $this->getJson($this->url().'?page=4&per_page=2')->assertOk()->assertJsonCount(0, 'data');
        Http::assertSentCount(3);
    }

    public function test_partial_missing_metadata_preserves_candidates(): void
    {
        $this->entry(550);
        $this->entry(551);
        $this->fakeCatalog([551]);
        $this->signIn($this->host);
        $this->getJson($this->url())->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.0.movie.tmdb_id', 550)
            ->assertJsonPath('data.1.movie', null)->assertJsonPath('meta.metadata_unavailable', false);
        $this->assertDatabaseCount('movie_night_movies', 2);
        Http::assertSentCount(1);
    }

    public static function catalogFailures(): array
    {
        return [['not-found', 404], ['unavailable', 503], ['timeout', 503], ['malformed', 503]];
    }

    #[DataProvider('catalogFailures')]
    public function test_catalog_validation_failures_preserve_safe_codes_and_never_insert(string $failure, int $status): void
    {
        $this->signIn($this->host);
        config(['app.debug' => true]);
        Http::fake(fn () => match ($failure) {
            'not-found' => Http::response(['message' => 'provider diagnostic', 'code' => 'MOVIE_NOT_FOUND'], 404),
            'timeout' => Http::failedConnection('private connection diagnostics'),
            'malformed' => Http::response(['secret' => 'diagnostic']),
            default => Http::response(['message' => 'provider diagnostic'], 503),
        });
        $this->postJson($this->url(), ['tmdb_id' => 550])->assertStatus($status)->assertExactJson($status === 404
            ? ['message' => 'Movie not found', 'code' => 'MOVIE_NOT_FOUND']
            : ['message' => 'Movie service unavailable', 'code' => 'UPSTREAM_UNAVAILABLE'])->assertHeader('Cache-Control', 'no-store, private');
        $this->assertDatabaseCount('movie_night_movies', 0);
        Http::assertSentCount(1);
    }

    public function test_batch_outage_keeps_ids_and_null_metadata(): void
    {
        $entry = $this->entry();
        Http::fake(['*' => Http::failedConnection()]);
        $this->signIn($this->participant);
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.0.id', $entry->id)->assertJsonPath('data.0.movie', null)
            ->assertJsonPath('meta.metadata_unavailable', true);
        $this->assertDatabaseCount('movie_night_movies', 1);
    }

    public static function privateActors(): array
    {
        return [['pending'], ['declined'], ['outsider'], ['admin']];
    }

    #[DataProvider('privateActors')]
    public function test_private_access_is_hidden_before_any_catalog_call(string $actor): void
    {
        $entry = $this->entry();
        if (in_array($actor, ['pending', 'declined'], true)) {
            $this->night->invitations()->first()->update(['rsvp_status' => $actor]);
            $user = $this->participant;
        } else {
            $user = User::factory()->create(['role' => $actor === 'admin' ? User::ROLE_ADMIN : User::ROLE_USER]);
        }
        $this->signIn($user);
        $this->getJson($this->url())->assertNotFound()->assertExactJson(['message' => 'Not found.']);
        $this->postJson($this->url(), ['tmdb_id' => 551])->assertNotFound();
        $this->deleteJson($this->url().'/'.$entry->id)->assertNotFound();
        Http::assertNothingSent();
    }

    public static function invalidIds(): array
    {
        return [[null], [0], [-1], [2147483648], ['01'], [true], [1.5], ['no'], [[550]]];
    }

    #[DataProvider('invalidIds')]
    public function test_invalid_ids_fail_before_provider(mixed $id): void
    {
        $this->signIn($this->host);
        $this->postJson($this->url(), ['tmdb_id' => $id])->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_strict_fields_and_pagination(): void
    {
        $this->signIn($this->host);
        foreach ([[], ['tmdb_id' => 550, 'nominated_by_user_id' => $this->participant->id], ['tmdb_id' => 550, 'night' => 1]] as $body) {
            $this->postJson($this->url(), $body)->assertUnprocessable();
        }
        foreach (['per_page=51', 'page=0', 'status=scheduled', 'night=1'] as $query) {
            $this->getJson($this->url().'?'.$query)->assertUnprocessable();
        }
        $this->deleteJson($this->url().'/01')->assertUnprocessable();
        $this->deleteJson($this->url().'/1', ['tmdb_id' => 550])->assertUnprocessable();
        $this->getJson(self::BASE.'/01/movies')->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_removal_permissions_cross_event_isolation_and_repeat(): void
    {
        $hostEntry = $this->entry();
        $own = $this->entry(551, $this->participant);
        $this->signIn($this->participant);
        $this->deleteJson($this->url().'/'.$hostEntry->id)->assertForbidden();
        $this->deleteJson($this->url().'/'.$own->id)->assertNoContent()->assertHeader('Cache-Control', 'no-store, private');
        $this->deleteJson($this->url().'/'.$own->id)->assertNotFound();
        $other = $this->night->replicate();
        $other->save();
        $foreign = $this->entry(552, night: $other);
        $this->signIn($this->host);
        $this->deleteJson($this->url().'/'.$foreign->id)->assertNotFound();
        $this->deleteJson($this->url().'/'.$hostEntry->id)->assertNoContent();
        $this->assertDatabaseHas('movie_night_movies', ['id' => $foreign->id]);
        Http::assertNothingSent();
    }

    public function test_host_can_remove_participant_nomination_but_nobody_can_remove_voted_candidate(): void
    {
        $own = $this->entry(550, $this->participant);
        $other = $this->entry(551, $this->participant);
        $vote = $this->vote($own);
        $this->signIn($this->host);
        $this->deleteJson($this->url().'/'.$other->id)->assertNoContent();
        foreach ([$this->host, $this->participant] as $actor) {
            $this->signIn($actor);
            $this->deleteJson($this->url().'/'.$own->id)->assertStatus(409);
        }
        $this->assertDatabaseHas('movie_night_votes', ['id' => $vote->id]);
        $this->assertDatabaseHas('movie_night_movies', ['id' => $own->id]);
    }

    public static function closedStates(): array
    {
        return [['cancelled'], ['finalized'], ['started']];
    }

    #[DataProvider('closedStates')]
    public function test_authorized_reads_survive_closed_events_but_writes_fail(string $state): void
    {
        $entry = $this->entry();
        if ($state === 'started') {
            $this->travelTo($this->night->starts_at);
        } else {
            $this->night->forceFill(['status' => $state, 'cancelled_at' => $state === 'cancelled' ? now() : null,
                'finalized_at' => $state === 'finalized' ? now() : null, 'finalized_tmdb_id' => $state === 'finalized' ? 550 : null])->save();
        }
        $this->fakeCatalog();
        foreach ([$this->host, $this->participant] as $actor) {
            $this->signIn($actor);
            $this->getJson($this->url())->assertOk()->assertJsonCount(1, 'data');
            $this->postJson($this->url(), ['tmdb_id' => 551])->assertStatus(409);
            $this->deleteJson($this->url().'/'.$entry->id)->assertStatus(409);
        }
        Http::assertSentCount(2);
    }

    public function test_deadline_is_exact_for_nominations_and_removal(): void
    {
        $this->fakeCatalog();
        $this->signIn($this->host);
        $this->travelTo($this->night->starts_at->subMicrosecond());
        $id = $this->postJson($this->url(), ['tmdb_id' => 550])->assertCreated()->json('data.id');
        $this->deleteJson($this->url().'/'.$id)->assertNoContent();
        $this->travelTo($this->night->starts_at);
        $this->postJson($this->url(), ['tmdb_id' => 550])->assertStatus(409);
    }

    public static function inflightChanges(): array
    {
        return [['decline', 404], ['cancel', 409], ['deadline', 409], ['restriction', 403], ['unverified', 404]];
    }

    #[DataProvider('inflightChanges')]
    public function test_revalidates_after_catalog_finishes(string $change, int $status): void
    {
        $this->signIn($this->participant);
        $level = DB::transactionLevel();
        Http::fake(function () use ($change, $level) {
            $this->assertSame($level, DB::transactionLevel());
            match ($change) {
                'decline' => app(MovieNightTransitions::class)->respond($this->participant, $this->night->id, MovieNightRsvp::Declined),
                'cancel' => app(MovieNightService::class)->cancel($this->host, $this->night->id),
                'deadline' => $this->travelTo($this->night->starts_at),
                'restriction' => $this->participant->forceFill(['account_status' => User::STATUS_RESTRICTED])->save(),
                'unverified' => $this->participant->forceFill(['email_verified_at' => null])->save(),
            };

            return Http::response(self::detail(550));
        });
        $this->postJson($this->url(), ['tmdb_id' => 550])->assertStatus($status);
        $this->assertDatabaseCount('movie_night_movies', 0);
    }

    public function test_decline_during_batch_enrichment_does_not_disclose_shortlist(): void
    {
        $this->entry();
        $this->signIn($this->participant);
        Http::fake(function () {
            app(MovieNightTransitions::class)->respond($this->participant, $this->night->id, MovieNightRsvp::Declined);

            return Http::response(['data' => [self::summary(550)], 'meta' => ['requested_count' => 1, 'returned_count' => 1, 'missing_tmdb_ids' => []]]);
        });
        $this->getJson($this->url())->assertNotFound()->assertExactJson(['message' => 'Not found.']);
    }

    public function test_capacity_and_maximum_batch_budget(): void
    {
        foreach (range(1, 50) as $id) {
            $this->entry($id);
        }
        $this->fakeCatalog();
        $this->signIn($this->host);
        $this->getJson($this->url().'?per_page=50')->assertOk()->assertJsonCount(50, 'data');
        Http::assertSent(fn ($r) => count($r['tmdb_ids'] ?? []) === 50);
        $this->postJson($this->url(), ['tmdb_id' => 51])->assertStatus(409);
        $this->assertDatabaseCount('movie_night_movies', 50);
    }

    public function test_batch_listing_query_count_is_bounded(): void
    {
        foreach (range(1, 8) as $id) {
            $this->entry($id);
        }
        $this->fakeCatalog();
        $this->signIn($this->host);
        DB::enableQueryLog();
        try {
            DB::flushQueryLog();
            $this->getJson($this->url().'?per_page=1')->assertOk();
            $one = count(DB::getQueryLog());
            DB::flushQueryLog();
            $this->getJson($this->url().'?per_page=8')->assertOk();
            $this->assertSame($one, count(DB::getQueryLog()));
        } finally {
            DB::disableQueryLog();
        }
        Http::assertSentCount(2);
    }

    public function test_pending_activation_and_unmapped_firebase_accounts_cannot_access_shortlist(): void
    {
        $entry = $this->entry();
        $this->host->forceFill(['invitation_pending' => true])->save();
        $this->signIn($this->host);
        $this->getJson($this->url())->assertNotFound();
        $this->postJson($this->url(), ['tmdb_id' => 551])->assertNotFound();
        $this->deleteJson($this->url().'/'.$entry->id)->assertNotFound();
        $this->host->forceFill(['invitation_pending' => false, 'firebase_uid' => null])->save();
        config(['firebase_auth.mode' => 'firebase']);
        foreach ([['GET', $this->url(), []], ['POST', $this->url(), ['tmdb_id' => 551]],
            ['DELETE', $this->url().'/'.$entry->id, []]] as [$method, $url, $body]) {
            $this->signIn($this->host);
            $this->json($method, $url, $body)->assertUnauthorized();
        }
        Http::assertNothingSent();
    }

    public function test_failed_nomination_rolls_back_and_hides_diagnostics(): void
    {
        $this->fakeCatalog();
        $this->signIn($this->host);
        config(['app.debug' => true]);
        $failure = null;
        if (DB::getDriverName() === 'mysql') {
            $this->assertDisposableDatabase();
            $failure = new MySqlWriteFailure(DB::connection(), 'insert into', 'movie_night_movies');
        } elseif (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE movie_night_movies ADD CONSTRAINT m54_insert_fail CHECK (tmdb_id <> 550) NOT VALID');
        } else {
            DB::unprepared("CREATE TRIGGER m54_insert_fail BEFORE INSERT ON movie_night_movies BEGIN SELECT RAISE(ABORT, 'private test diagnostic'); END");
        }
        try {
            $this->postJson($this->url(), ['tmdb_id' => 550])->assertStatus(500)
                ->assertExactJson(['message' => 'Unable to complete this request. Please try again.', 'code' => 'INTERNAL_ERROR']);
            $failure?->assertTriggered([550, $this->night->id, $this->host->id]);
            $this->assertDatabaseCount('movie_night_movies', 0);
        } finally {
            if ($failure !== null) {
                $failure->disarm();
            } elseif (DB::getDriverName() === 'pgsql') {
                DB::statement('ALTER TABLE movie_night_movies DROP CONSTRAINT m54_insert_fail');
            } else {
                DB::unprepared('DROP TRIGGER m54_insert_fail');
            }
        }
        $this->postJson($this->url(), ['tmdb_id' => 550])->assertCreated();
        $failure?->assertDisarmed();
    }

    public function test_account_gates_sessions_csrf_and_shared_throttles(): void
    {
        $entry = $this->entry();
        $this->getJson($this->url())->assertUnauthorized();
        $this->postJson($this->url(), ['tmdb_id' => 551])->assertUnauthorized();
        $this->deleteJson($this->url().'/'.$entry->id)->assertUnauthorized();
        $this->host->forceFill(['account_status' => User::STATUS_RESTRICTED])->save();
        $this->fakeCatalog();
        $this->signIn($this->host);
        $this->getJson($this->url())->assertOk();
        $this->postJson($this->url(), ['tmdb_id' => 551])->assertForbidden();
        $this->deleteJson($this->url().'/'.$entry->id)->assertForbidden();
        foreach ([['account_status' => User::STATUS_BANNED], ['account_status' => User::STATUS_DEACTIVATED],
            ['account_status' => User::STATUS_ACTIVE, 'email_verified_at' => null]] as $fields) {
            $this->host->forceFill($fields)->save();
            $this->signIn($this->host);
            $this->getJson($this->url())->assertForbidden();
            $this->postJson($this->url(), ['tmdb_id' => 551])->assertForbidden();
            $this->deleteJson($this->url().'/'.$entry->id)->assertForbidden();
        }
        $this->host->forceFill(['account_status' => User::STATUS_ACTIVE, 'email_verified_at' => now(), 'firebase_uid' => 'shortlist-host', 'password_session_version' => 'new'])->save();
        config(['firebase_auth.mode' => 'firebase']);
        $this->signIn($this->host);
        $this->withSession(['password_session_version' => 'old'])->getJson($this->url())->assertUnauthorized();
        $this->signIn($this->host);
        $this->withSession(['password_session_version' => 'new']);
        $this->app->instance('env', 'local');
        $this->postJson($this->url(), ['tmdb_id' => 551])->assertStatus(419);
        $this->withHeader('Origin', 'http://localhost:5173')->deleteJson($this->url().'/'.$entry->id)->assertStatus(419);
        $csrf = $this->getJson('/sanctum/csrf-cookie')->getCookie('XSRF-TOKEN', false)->getValue();
        $this->withHeader('X-XSRF-TOKEN', $csrf)->postJson($this->url(), ['tmdb_id' => 551])->assertCreated();
        $this->deleteJson($this->url().'/'.$entry->id)->assertNoContent();
        $this->travel(61)->seconds();
        for ($i = 0; $i < 60; $i++) {
            $this->deleteJson($this->url().'/999999')->assertNotFound();
        }
        $this->postJson($this->url(), ['tmdb_id' => 552])->assertTooManyRequests()->assertHeader('Retry-After');
    }
}
