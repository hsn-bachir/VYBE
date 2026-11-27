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
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class MovieNightShortlistConcurrencyTest extends TestCase
{
    public static function races(): array
    {
        return [['duplicate'], ['capacity'], ['decline'], ['cancel'], ['deadline'], ['voted_removal'], ['competing_removal']];
    }

    #[DataProvider('races')]
    public function test_postgres_shortlist_serialization_and_inflight_provider_validation(string $mode): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires isolated PostgreSQL and independent PHP processes.');
        }
        $this->assertDisposableDatabase();
        // Exact disposable Core identity; support the existing local and CI endpoints only.
        $this->assertSame('vybe_core_test', config('database.connections.pgsql.database'));
        $this->assertContains((string) config('database.connections.pgsql.port'), ['55433', '5432']);
        Artisan::call('migrate', ['--force' => true]);
        $host = User::factory()->create();
        $participant = User::factory()->create();
        $instant = CarbonImmutable::parse('2030-01-15T18:00:00Z');
        $night = new MovieNight(['title' => 'Shortlist contention', 'starts_at' => $instant->addDay(), 'timezone' => 'UTC']);
        $night->host()->associate($host);
        $night->save();
        $invitation = new MovieNightInvitation(['rsvp_status' => MovieNightRsvp::Accepted, 'responded_at' => $instant]);
        $invitation->movieNight()->associate($night);
        $invitation->invitedUser()->associate($participant);
        $invitation->save();
        $movie = null;
        if (in_array($mode, ['voted_removal', 'competing_removal'], true)) {
            $movie = new MovieNightMovie(['tmdb_id' => 550]);
            $movie->movieNight()->associate($night);
            $movie->nominatedBy()->associate($participant);
            $movie->save();
        } elseif ($mode === 'capacity') {
            foreach (range(1, 49) as $id) {
                $entry = new MovieNightMovie(['tmdb_id' => $id]);
                $entry->movieNight()->associate($night);
                $entry->nominatedBy()->associate($host);
                $entry->save();
            }
        }
        $processes = [];
        $barrier = sys_get_temp_dir().'/vybe-m54-'.bin2hex(random_bytes(10));
        $script = <<<'WORKER'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$c = config('database.connections.pgsql');
if (! $app->environment('testing') || config('database.default') !== 'pgsql'
    || ! in_array($c['host'], ['127.0.0.1', 'localhost', '::1'], true)
    || ! str_ends_with($c['database'], '_test') || ! empty($c['url'])
    || $c['database'] !== 'vybe_core_test' || ! in_array((string) $c['port'], ['55433', '5432'], true)
    || env('VYBE_DISPOSABLE_TEST_DB') !== '1') { exit(2); }
Carbon\Carbon::setTestNow(Carbon\CarbonImmutable::parse('2030-01-15T18:00:00Z'));
config(['movie_catalog.url' => 'http://catalog.test', 'movie_catalog.token' => 'test-only']);
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\DB::selectOne("SELECT set_config('application_name', ?, false)", [$argv[5]]);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '10s'");
Illuminate\Support\Facades\Http::fake(function ($request) use ($argv) {
    if (Illuminate\Support\Facades\DB::transactionLevel() !== 0) { throw new RuntimeException('Network validation inside a transaction.'); }
    if ($argv[4] === 'inflight') {
        file_put_contents($argv[6].'.ready', 'ready');
        $deadline = microtime(true) + 10;
        while (! is_file($argv[6].'.release') && microtime(true) < $deadline) { usleep(20000); clearstatcache(); }
        if (! is_file($argv[6].'.release')) { throw new RuntimeException('Provider barrier timed out.'); }
    }
    return Illuminate\Support\Facades\Http::response(['data' => ['tmdb_id' => (int) $argv[3], 'title' => 'Fixture',
        'overview' => null, 'poster_path' => null, 'backdrop_path' => null, 'release_date' => null,
        'tmdb_rating' => null, 'tmdb_vote_count' => null, 'original_title' => null, 'runtime' => null,
        'original_language' => null, 'genres' => []], 'meta' => ['stale' => false]]);
});
try {
    $actor = App\Models\User::findOrFail($argv[1]);
    $service = app(App\Services\MovieNights\MovieNightShortlistService::class);
    if ($argv[4] === 'remove') {
        $service->remove($actor, (int) $argv[2], (int) $argv[3]);
        echo '204';
    } else {
        $service->nominate($actor, (int) $argv[2], (int) $argv[3]);
        echo '201';
    }
} catch (Illuminate\Database\Eloquent\ModelNotFoundException $e) { echo '404'; }
catch (Illuminate\Auth\Access\AuthorizationException $e) { echo $e->status() ?? 403; }
catch (Symfony\Component\HttpKernel\Exception\HttpException $e) { echo $e->getStatusCode(); }
WORKER;
        try {
            $inflight = in_array($mode, ['decline', 'cancel', 'deadline'], true);
            if (! $inflight) {
                DB::beginTransaction();
                DB::table('movie_nights')->where('id', $night->id)->lockForUpdate()->first();
            }
            $workers = $inflight || $mode === 'voted_removal' ? [$participant] : [$host, $participant];
            $tag = 'm54-'.bin2hex(random_bytes(6));
            foreach ($workers as $i => $actor) {
                $operation = $movie ? 'remove' : ($inflight ? 'inflight' : 'nominate');
                $id = $movie?->id ?? ($mode === 'capacity' ? 550 + $i : 550);
                $process = new Process([PHP_BINARY, '-r', $script, (string) $actor->id, (string) $night->id,
                    (string) $id, $operation, $tag.'-'.$i, $barrier], base_path());
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
                    }
                    usleep(20000);
                } while (microtime(true) < $deadline);
                $this->assertFileExists($barrier.'.ready', 'Worker must reach Catalog validation without holding locks.');
                // These real service mutations can commit while the worker waits in fake provider I/O.
                if ($mode === 'decline') {
                    app(MovieNightTransitions::class)->respond($participant, $night->id, MovieNightRsvp::Declined);
                } elseif ($mode === 'cancel') {
                    app(MovieNightService::class)->cancel($host, $night->id);
                } else {
                    $night->update(['starts_at' => $instant]);
                }
                file_put_contents($barrier.'.release', 'release');
            } else {
                do {
                    DB::selectOne('SELECT pg_stat_clear_snapshot()');
                    $waiting = (int) DB::selectOne("SELECT count(*) AS total FROM pg_stat_activity WHERE application_name LIKE ? AND wait_event_type = 'Lock'", [$tag.'-%'])->total;
                    if ($waiting === count($workers)) {
                        break;
                    }
                    usleep(20000);
                } while (microtime(true) < $deadline);
                $this->assertSame(count($workers), $waiting, 'All workers must demonstrably contend on the event lock.');
                if ($mode === 'voted_removal') {
                    $vote = new MovieNightVote;
                    $vote->movieNight()->associate($night);
                    $vote->movie()->associate($movie);
                    $vote->voter()->associate($host);
                    $vote->save();
                }
                DB::commit();
            }
            $results = [];
            foreach ($processes as $process) {
                $this->assertSame(0, $process->wait(), 'Worker must finish without unexpected failures.');
                $results[] = $process->getOutput();
            }
            sort($results);
            $expected = match ($mode) {
                'duplicate', 'capacity' => ['201', '409'], 'decline' => ['404'], 'cancel', 'deadline', 'voted_removal' => ['409'],
                'competing_removal' => ['204', '404'],
            };
            $this->assertSame($expected, $results);
            $this->assertSame(match ($mode) {
                'capacity' => 50, 'duplicate', 'voted_removal' => 1, default => 0
            }, $night->movies()->count());
            if ($mode === 'voted_removal') {
                $this->assertSame(1, $night->votes()->count());
            }
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
