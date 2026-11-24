<?php

namespace Tests\Feature;

use App\Enums\MovieNightRsvp;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\MovieNightMovie;
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

class MovieNightFinalizationConcurrencyTest extends TestCase
{
    public static function races(): array
    {
        return [['competing_auto'], ['competing_tie'], ['vote_first'], ['stale_vote_selection'], ['finalize_before_vote'],
            ['decline_first'], ['stale_decline_selection'], ['finalize_before_decline'], ['cancel_first'], ['finalize_before_cancel'],
            ['remove_first'], ['finalize_before_remove'], ['finalize_during_nomination'], ['edit_first'], ['finalize_before_edit']];
    }

    #[DataProvider('races')]
    public function test_postgres_finalization_resolves_only_the_authoritative_serialized_state(string $mode): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires isolated PostgreSQL and independent processes.');
        }
        $this->assertDisposableDatabase();
        $this->assertSame('55433', (string) config('database.connections.pgsql.port'));
        Artisan::call('migrate', ['--force' => true]);
        Http::preventStrayRequests();
        $host = User::factory()->create();
        $participant = User::factory()->create();
        $instant = CarbonImmutable::parse('2030-01-15T18:00:00Z');
        $night = new MovieNight(['title' => 'Finalization contention', 'starts_at' => $instant->addDay(),
            'timezone' => 'Asia/Beirut', 'location' => 'Private hall', 'meeting_url' => 'https://example.com/room']);
        $night->host()->associate($host);
        $night->save();
        $invitation = new MovieNightInvitation(['rsvp_status' => MovieNightRsvp::Accepted]);
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
        $tied = in_array($mode, ['competing_tie', 'vote_first', 'stale_vote_selection', 'decline_first', 'stale_decline_selection'], true);
        app(MovieNightVotingService::class)->cast($host, $night->id, $candidates[0]->id);
        app(MovieNightVotingService::class)->cast($participant, $night->id, $candidates[$tied ? 1 : 0]->id);
        $barrier = sys_get_temp_dir().'/vybe-m56-'.bin2hex(random_bytes(10));
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
Carbon\Carbon::setTestNow(Carbon\CarbonImmutable::parse('2030-01-15T18:00:00Z'));
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\DB::selectOne("SELECT set_config('application_name', ?, false)", [$argv[5]]);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '10s'");
if ($argv[4] === 'nominate') {
    config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
    Illuminate\Support\Facades\Http::fake(function () use ($argv) {
        if (Illuminate\Support\Facades\DB::transactionLevel() !== 0) { throw new RuntimeException('Catalog must not hold mutation locks.'); }
        file_put_contents($argv[6].'.ready', 'ready');
        $deadline = microtime(true) + 10;
        while (! is_file($argv[6].'.release') && microtime(true) < $deadline) { usleep(20000); clearstatcache(); }
        if (! is_file($argv[6].'.release')) { throw new RuntimeException('Provider barrier timed out.'); }
        return Illuminate\Support\Facades\Http::response(['data' => ['tmdb_id' => 553, 'title' => 'Fixture',
            'overview' => null, 'poster_path' => null, 'backdrop_path' => null, 'release_date' => null, 'tmdb_rating' => null,
            'tmdb_vote_count' => null, 'original_title' => null, 'runtime' => null, 'original_language' => null,
            'genres' => []], 'meta' => ['stale' => false]]);
    });
}
try {
    $actor = App\Models\User::findOrFail($argv[1]);
    $nightId = (int) $argv[2];
    $choice = (int) $argv[3];
    if ($argv[4] === 'finalize') {
        $row = app(App\Services\MovieNights\MovieNightTransitions::class)->finalize($actor, $nightId, $choice ?: null);
        echo json_encode(['status' => 200, 'winner' => $row->finalized_tmdb_id]);
    } else {
        match ($argv[4]) {
            'vote' => app(App\Services\MovieNights\MovieNightVotingService::class)->cast($actor, $nightId, $choice),
            'decline' => app(App\Services\MovieNights\MovieNightTransitions::class)->respond($actor, $nightId, App\Enums\MovieNightRsvp::Declined),
            'cancel' => app(App\Services\MovieNights\MovieNightService::class)->cancel($actor, $nightId),
            'remove' => app(App\Services\MovieNights\MovieNightShortlistService::class)->remove($actor, $nightId, $choice),
            'nominate' => app(App\Services\MovieNights\MovieNightShortlistService::class)->nominate($actor, $nightId, 553),
            'edit' => app(App\Services\MovieNights\MovieNightService::class)->update($actor, $nightId, ['title' => 'Late edit']),
        };
        echo json_encode(['status' => 200]);
    }
} catch (Illuminate\Validation\ValidationException $e) { echo json_encode(['status' => 422]); }
catch (Illuminate\Database\Eloquent\ModelNotFoundException $e) { echo json_encode(['status' => 404]); }
catch (Illuminate\Auth\Access\AuthorizationException $e) { echo json_encode(['status' => $e->status() ?? 403]); }
catch (Symfony\Component\HttpKernel\Exception\HttpException $e) { echo json_encode(['status' => $e->getStatusCode()]); }
WORKER;
        try {
            $inflight = $mode === 'finalize_during_nomination';
            $parentActor = in_array($mode, ['vote_first', 'stale_vote_selection', 'decline_first', 'stale_decline_selection'], true) ? $participant : $host;
            if (! $inflight) {
                DB::beginTransaction();
                if (! str_starts_with($mode, 'competing_')) {
                    AccountAccess::lock($parentActor, community: true);
                }
                DB::table('movie_nights')->where('id', $night->id)->lockForUpdate()->first();
            }
            $jobs = match ($mode) {
                'competing_auto' => [[$host, 0, 'finalize'], [$host, 0, 'finalize']],
                'competing_tie' => [[$host, 550, 'finalize'], [$host, 551, 'finalize']],
                'stale_vote_selection', 'stale_decline_selection' => [[$host, 551, 'finalize']],
                'finalize_before_vote' => [[$participant, $candidates[1]->id, 'vote']],
                'finalize_before_decline' => [[$participant, 0, 'decline']],
                'finalize_before_cancel' => [[$host, 0, 'cancel']],
                'finalize_before_remove' => [[$participant, $candidates[2]->id, 'remove']],
                'finalize_before_edit' => [[$host, 0, 'edit']],
                'finalize_during_nomination' => [[$participant, 553, 'nominate']],
                default => [[$host, 0, 'finalize']],
            };
            $tag = 'm56-'.bin2hex(random_bytes(6));
            foreach ($jobs as $i => [$actor, $choice, $operation]) {
                $process = new Process([PHP_BINARY, '-r', $script, (string) $actor->id, (string) $night->id,
                    (string) $choice, $operation, $tag.'-'.$i, $barrier], base_path());
                $process->setTimeout(18);
                $process->start();
                $processes[] = $process;
            }
            $deadline = microtime(true) + 6;
            if ($inflight) {
                do {
                    clearstatcache();
                    if (is_file($barrier.'.ready')) {
                        break;
                    } usleep(20000);
                } while (microtime(true) < $deadline);
                $this->assertFileExists($barrier.'.ready');
            } else {
                do {
                    DB::selectOne('SELECT pg_stat_clear_snapshot()');
                    $waiting = (int) DB::selectOne("SELECT count(*) AS total FROM pg_stat_activity WHERE application_name LIKE ? AND wait_event_type = 'Lock'", [$tag.'-%'])->total;
                    if ($waiting === count($jobs)) {
                        break;
                    }
                    usleep(20000);
                } while (microtime(true) < $deadline);
                $this->assertSame(count($jobs), $waiting, 'Workers must demonstrably wait on real row locks.');
            }
            match ($mode) {
                'vote_first', 'stale_vote_selection' => app(MovieNightVotingService::class)->cast($participant, $night->id, $candidates[0]->id),
                'decline_first', 'stale_decline_selection' => app(MovieNightTransitions::class)->respond($participant, $night->id, MovieNightRsvp::Declined),
                'cancel_first' => app(MovieNightService::class)->cancel($host, $night->id),
                'remove_first' => app(MovieNightShortlistService::class)->remove($host, $night->id, $candidates[2]->id),
                'edit_first' => app(MovieNightService::class)->update($host, $night->id, ['title' => 'Changed before final',
                    'starts_at' => $instant->addDays(2)->format('Y-m-d\\TH:i:s\\Z')]),
                'finalize_before_vote', 'finalize_before_decline', 'finalize_before_cancel', 'finalize_before_remove',
                'finalize_before_edit', 'finalize_during_nomination' => app(MovieNightTransitions::class)->finalize($host, $night->id),
                default => null,
            };
            if ($inflight) {
                file_put_contents($barrier.'.release', 'release');
            } else {
                DB::commit();
            }
            $results = [];
            foreach ($processes as $process) {
                $this->assertSame(0, $process->wait(), 'Worker must finish without unexpected failures.');
                $results[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
            }
            $expected = match ($mode) {
                'competing_auto', 'competing_tie' => [200, 409],
                'stale_vote_selection', 'stale_decline_selection' => [422],
                'cancel_first', 'finalize_before_vote', 'finalize_before_decline', 'finalize_before_cancel',
                'finalize_before_remove', 'finalize_before_edit', 'finalize_during_nomination' => [409],
                default => [200],
            };
            $statuses = array_column($results, 'status');
            sort($statuses);
            $this->assertSame($expected, $statuses);
            $after = $night->fresh();
            $totals = app(MovieNightVotingService::class)->totals($host, $night->id);
            $this->assertSame(in_array($mode, ['decline_first', 'stale_decline_selection'], true) ? 1 : 2, $totals['total_votes']);
            if (in_array($mode, ['stale_vote_selection', 'stale_decline_selection', 'cancel_first'], true)) {
                $this->assertSame($mode === 'cancel_first' ? 'cancelled' : 'scheduled', $after->status->value);
                $this->assertNull($after->finalized_tmdb_id);
                $this->assertNull($after->finalized_at);
            } else {
                $this->assertSame('finalized', $after->status->value);
                $this->assertContains($after->finalized_tmdb_id, $totals['leaders']);
                $this->assertFalse($totals['voting_open']);
                $this->assertNotNull($after->finalized_at);
                if ($mode !== 'competing_tie') {
                    $this->assertSame(550, $after->finalized_tmdb_id);
                }
                if (str_starts_with($mode, 'competing_')) {
                    $winners = array_column(array_filter($results, fn ($row) => $row['status'] === 200), 'winner');
                    $this->assertSame([$after->finalized_tmdb_id], array_values($winners));
                }
            }
            $this->assertSame($mode === 'remove_first' ? 2 : 3, $night->movies()->count());
            $this->assertSame($mode === 'edit_first' ? 'Changed before final' : 'Finalization contention', $after->title);
            $this->assertSame($mode === 'edit_first' ? $instant->addDays(2)->timestamp : $instant->addDay()->timestamp, $after->starts_at->timestamp);
            Http::assertNothingSent();
        } finally {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            file_put_contents($barrier.'.release', 'release');
            foreach ($processes as $process) {
                if ($process->isRunning()) {
                    $process->stop();
                }
            }
            foreach (['.ready', '.release'] as $suffix) {
                if (is_file($barrier.$suffix)) {
                    unlink($barrier.$suffix);
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
