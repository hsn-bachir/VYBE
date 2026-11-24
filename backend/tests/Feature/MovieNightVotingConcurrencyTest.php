<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\MovieNightMovie;
use App\Models\MovieNightVote;
use App\Models\User;
use App\Services\AccountAccess;
use App\Services\MovieNights\MovieNightService;
use App\Services\MovieNights\MovieNightShortlistService;
use App\Services\MovieNights\MovieNightTransitions;
use App\Services\MovieNights\MovieNightVotingService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class MovieNightVotingConcurrencyTest extends TestCase
{
    public static function races(): array
    {
        return [['same_identical'], ['same_different'], ['different_participants'], ['competing_changes'],
            ['removal_first'], ['vote_before_removal'], ['decline_first'], ['vote_before_decline'],
            ['cancelled'], ['finalized'], ['event_deadline'], ['candidate_deadline'], ['vote_row_deadline']];
    }

    #[DataProvider('races')]
    public function test_real_postgres_voting_serialization_and_deadlines(string $mode): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires isolated PostgreSQL and independent PHP processes.');
        }
        $this->assertDisposableDatabase();
        $this->assertSame('55433', (string) config('database.connections.pgsql.port'));
        Artisan::call('migrate', ['--force' => true]);
        Http::preventStrayRequests();
        $host = User::factory()->create();
        $participant = User::factory()->create();
        $instant = CarbonImmutable::parse('2030-01-15T18:00:00Z');
        $live = str_ends_with($mode, '_deadline');
        $night = new MovieNight(['title' => 'Voting contention', 'starts_at' => $live
            ? CarbonImmutable::now()->addSeconds(3)->startOfSecond() : $instant->addDay(), 'timezone' => 'UTC']);
        $night->host()->associate($host);
        $night->save();
        $invitation = new MovieNightInvitation(['rsvp_status' => MovieNightRsvp::Accepted, 'responded_at' => now()]);
        $invitation->movieNight()->associate($night);
        $invitation->invitedUser()->associate($participant);
        $invitation->save();
        $candidates = [];
        foreach ([550, 551, 552] as $id) {
            $candidate = new MovieNightMovie(['tmdb_id' => $id]);
            $candidate->movieNight()->associate($night);
            $candidate->nominatedBy()->associate($participant);
            $candidate->save();
            $candidates[] = $candidate;
        }
        $initialVote = null;
        if (in_array($mode, ['competing_changes', 'finalized', 'vote_row_deadline'], true)) {
            $initialVote = new MovieNightVote;
            $initialVote->movieNight()->associate($night);
            $initialVote->voter()->associate($mode === 'finalized' ? $host : $participant);
            $initialVote->movie()->associate($candidates[0]);
            $initialVote->save();
        }
        $processes = [];
        $script = <<<'WORKER'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$c = config('database.connections.pgsql');
if (! $app->environment('testing') || config('database.default') !== 'pgsql'
    || ! in_array($c['host'], ['127.0.0.1', 'localhost', '::1'], true)
    || ! str_ends_with($c['database'], '_test') || ! empty($c['url'])
    || (string) $c['port'] !== '55433' || env('VYBE_DISPOSABLE_TEST_DB') !== '1') { exit(2); }
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\DB::selectOne("SELECT set_config('application_name', ?, false)", [$argv[5]]);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '10s'");
if ($argv[6] !== 'live') { Carbon\Carbon::setTestNow(Carbon\CarbonImmutable::parse($argv[6])); }
try {
    $actor = App\Models\User::findOrFail($argv[1]);
    if ($argv[4] === 'decline') {
        app(App\Services\MovieNights\MovieNightTransitions::class)->respond($actor, (int) $argv[2], App\Enums\MovieNightRsvp::Declined);
    } elseif ($argv[4] === 'remove') {
        app(App\Services\MovieNights\MovieNightShortlistService::class)->remove($actor, (int) $argv[2], (int) $argv[3]);
    } else {
        app(App\Services\MovieNights\MovieNightVotingService::class)->cast($actor, (int) $argv[2], (int) $argv[3]);
    }
    echo '200';
} catch (Illuminate\Database\Eloquent\ModelNotFoundException $e) { echo '404'; }
catch (Illuminate\Auth\Access\AuthorizationException $e) { echo $e->status() ?? 403; }
catch (Symfony\Component\HttpKernel\Exception\HttpException $e) { echo $e->getStatusCode(); }
WORKER;
        try {
            DB::beginTransaction();
            if (in_array($mode, ['removal_first', 'vote_before_removal', 'cancelled', 'finalized'], true)) {
                AccountAccess::lock($host, community: true);
            } elseif (in_array($mode, ['decline_first', 'vote_before_decline'], true)) {
                AccountAccess::lock($participant, community: true);
            }
            if ($mode === 'candidate_deadline') {
                DB::table('movie_night_movies')->where('id', $candidates[0]->id)->lockForUpdate()->first();
            } elseif ($mode === 'vote_row_deadline') {
                DB::table('movie_night_votes')->where('id', $initialVote->id)->lockForUpdate()->first();
            } else {
                DB::table('movie_nights')->where('id', $night->id)->lockForUpdate()->first();
            }
            $jobs = match ($mode) {
                'same_identical' => [[$participant, 0, 'cast'], [$participant, 0, 'cast']],
                'same_different' => [[$participant, 0, 'cast'], [$participant, 1, 'cast']],
                'different_participants' => [[$host, 0, 'cast'], [$participant, 0, 'cast']],
                'competing_changes' => [[$participant, 1, 'cast'], [$participant, 2, 'cast']],
                'vote_before_removal' => [[$participant, 0, 'remove']],
                'vote_before_decline' => [[$participant, 0, 'decline']],
                'vote_row_deadline' => [[$participant, 1, 'cast']],
                default => [[$participant, 0, 'cast']],
            };
            $tag = 'm55-'.bin2hex(random_bytes(6));
            foreach ($jobs as $i => [$actor, $index, $operation]) {
                $process = new Process([PHP_BINARY, '-r', $script, (string) $actor->id, (string) $night->id,
                    (string) $candidates[$index]->id, $operation, $tag.'-'.$i, $live ? 'live' : $instant->toISOString()], base_path());
                $process->setTimeout(18);
                $process->start();
                $processes[] = $process;
            }
            $deadline = microtime(true) + 6;
            do {
                DB::selectOne('SELECT pg_stat_clear_snapshot()');
                $waiting = (int) DB::selectOne("SELECT count(*) AS total FROM pg_stat_activity WHERE application_name LIKE ? AND wait_event_type = 'Lock'", [$tag.'-%'])->total;
                if ($waiting === count($jobs)) {
                    break;
                }
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertSame(count($jobs), $waiting, 'Workers must demonstrably wait on real PostgreSQL row locks.');
            match ($mode) {
                'removal_first' => app(MovieNightShortlistService::class)->remove($host, $night->id, $candidates[0]->id),
                'vote_before_removal' => app(MovieNightVotingService::class)->cast($host, $night->id, $candidates[0]->id),
                'decline_first' => app(MovieNightTransitions::class)->respond($participant, $night->id, MovieNightRsvp::Declined),
                'vote_before_decline' => app(MovieNightVotingService::class)->cast($participant, $night->id, $candidates[0]->id),
                'cancelled' => app(MovieNightService::class)->cancel($host, $night->id),
                'finalized' => app(MovieNightTransitions::class)->finalize($host, $night->id),
                default => null,
            };
            if ($live) {
                while (CarbonImmutable::now()->lt($night->starts_at)) {
                    usleep(20000);
                }
            }
            DB::commit();
            $results = [];
            foreach ($processes as $process) {
                $this->assertSame(0, $process->wait(), 'Worker must finish without unexpected errors.');
                $results[] = $process->getOutput();
            }
            $expected = match ($mode) {
                'removal_first', 'decline_first' => 404,
                'vote_before_removal', 'cancelled', 'finalized', 'event_deadline', 'candidate_deadline', 'vote_row_deadline' => 409,
                default => 200,
            };
            $this->assertSame(array_fill(0, count($jobs), (string) $expected), $results);
            $count = match ($mode) {
                'different_participants' => 2,
                'same_identical', 'same_different', 'competing_changes', 'vote_before_removal', 'finalized', 'vote_row_deadline' => 1,
                default => 0,
            };
            $this->assertSame($count, $night->votes()->count());
            $totals = app(MovieNightVotingService::class)->totals($host, $night->id);
            $this->assertSame($count, $totals['total_votes']);
            if ($mode === 'competing_changes') {
                $this->assertSame($initialVote->id, $night->votes()->first()->id);
                $this->assertContains($night->votes()->first()->movie_night_movie_id, [$candidates[1]->id, $candidates[2]->id]);
            }
            if ($mode === 'same_identical') {
                $this->assertSame($candidates[0]->id, $night->votes()->first()->movie_night_movie_id);
            }
            if ($mode === 'removal_first') {
                $this->assertDatabaseMissing('movie_night_movies', ['id' => $candidates[0]->id]);
            }
            if ($mode === 'vote_before_removal') {
                $this->assertDatabaseHas('movie_night_movies', ['id' => $candidates[0]->id]);
            }
            if ($mode === 'finalized') {
                $this->assertSame(550, $night->fresh()->finalized_tmdb_id);
            }
            if ($mode === 'vote_row_deadline') {
                $this->assertSame($candidates[0]->id, $initialVote->fresh()->movie_night_movie_id);
                $this->assertTrue($initialVote->updated_at->eq($initialVote->fresh()->updated_at));
            }
            Http::assertNothingSent();
        } finally {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            foreach ($processes as $process) {
                if ($process->isRunning()) {
                    $process->stop();
                }
            }
            DB::table('movie_night_votes')->where('movie_night_id', $night->id)->delete();
            DB::table('movie_night_movies')->where('movie_night_id', $night->id)->delete();
            DB::table('movie_night_invitations')->where('movie_night_id', $night->id)->delete();
            $night->delete();
            DB::table('collections')->whereIn('user_id', [$host->id, $participant->id])->delete();
            User::whereIn('id', [$host->id, $participant->id])->delete();
        }
    }
}
