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
use App\Services\MovieNights\MovieNightTransitions;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** Separate connections require committed fixtures, outside RefreshDatabase transactions. */
class MovieNightRsvpConcurrencyTest extends TestCase
{
    public static function races(): array
    {
        return [['competing'], ['identical'], ['cancelled'], ['finalized'], ['rescheduled_to_deadline'], ['invitation_lock_deadline']];
    }

    #[DataProvider('races')]
    public function test_postgres_rsvp_serialization_and_fresh_state_after_lock_waits(string $mode): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires disposable PostgreSQL and independent PHP processes.');
        }
        $this->assertDisposableDatabase();
        // Exact disposable Core identity; support the existing local and CI endpoints only.
        $this->assertSame('vybe_core_test', config('database.connections.pgsql.database'));
        $this->assertContains((string) config('database.connections.pgsql.port'), ['55433', '5432']);
        Artisan::call('migrate', ['--force' => true]);
        $host = User::factory()->create();
        $invitee = User::factory()->create();
        $instant = CarbonImmutable::parse('2030-01-15T18:00:00Z');
        $night = new MovieNight(['title' => 'RSVP contention', 'starts_at' => $instant->addDay(), 'timezone' => 'UTC']);
        $night->host()->associate($host);
        $night->save();
        $invitation = new MovieNightInvitation(['rsvp_status' => MovieNightRsvp::Accepted, 'responded_at' => $instant->subHour()]);
        $invitation->movieNight()->associate($night);
        $invitation->invitedUser()->associate($invitee);
        $invitation->save();
        $movie = new MovieNightMovie(['tmdb_id' => 550]);
        $movie->movieNight()->associate($night);
        $movie->nominatedBy()->associate($host);
        $movie->save();
        $vote = new MovieNightVote;
        $vote->movieNight()->associate($night);
        $vote->movie()->associate($movie);
        $vote->voter()->associate($invitee);
        $vote->save();
        $before = $invitation->fresh();
        $processes = [];
        $script = <<<'WORKER'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$c = config('database.connections.pgsql');
if (! $app->environment('testing') || config('database.default') !== 'pgsql'
    || ! in_array($c['host'], ['127.0.0.1', 'localhost', '::1'], true)
    || ! str_ends_with($c['database'], '_test') || ! empty($c['url'])
    || $c['database'] !== 'vybe_core_test' || ! in_array((string) $c['port'], ['55433', '5432'], true)
    || env('VYBE_DISPOSABLE_TEST_DB') !== '1') {
    exit(2);
}
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\DB::selectOne("SELECT set_config('application_name', ?, false)", [$argv[4]]);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '10s'");
if ($argv[5] !== 'live') {
    Carbon\Carbon::setTestNow(Carbon\CarbonImmutable::parse($argv[5]));
}
try {
    $row = app(App\Services\MovieNights\MovieNightTransitions::class)->respond(
        App\Models\User::findOrFail($argv[1]), (int) $argv[2], App\Enums\MovieNightRsvp::from($argv[3]));
    echo json_encode(['code' => 200, 'status' => $row->rsvp_status->value, 'responded_at' => $row->responded_at->toISOString()]);
} catch (Symfony\Component\HttpKernel\Exception\HttpException $e) {
    echo json_encode(['code' => $e->getStatusCode()]);
}
WORKER;
        try {
            if ($mode === 'invitation_lock_deadline') {
                $night->update(['starts_at' => CarbonImmutable::now()->addSeconds(3)->startOfSecond()]);
            }
            DB::beginTransaction();
            if (in_array($mode, ['cancelled', 'finalized'], true)) {
                AccountAccess::lock($host, community: true);
            }
            if (in_array($mode, ['competing', 'identical'], true)) {
                DB::table('users')->where('id', $invitee->id)->lockForUpdate()->first();
            } elseif ($mode === 'invitation_lock_deadline') {
                DB::table('movie_night_invitations')->where('id', $invitation->id)->lockForUpdate()->first();
            } else {
                DB::table('movie_nights')->where('id', $night->id)->lockForUpdate()->first();
            }
            $tag = 'm53-'.bin2hex(random_bytes(6));
            $responses = $mode === 'competing' ? ['accepted', 'declined'] : ['accepted'];
            if ($mode === 'identical') {
                $responses[] = 'accepted';
            }
            foreach ($responses as $i => $response) {
                $process = new Process([PHP_BINARY, '-r', $script, (string) $invitee->id, (string) $night->id,
                    $response, $tag.'-'.$i, $mode === 'invitation_lock_deadline' ? 'live' : $instant->toISOString()], base_path());
                $process->setTimeout(18);
                $process->start();
                $processes[] = $process;
            }
            $deadline = microtime(true) + 6;
            do {
                DB::selectOne('SELECT pg_stat_clear_snapshot()');
                $waiting = (int) DB::selectOne("SELECT count(*) AS total FROM pg_stat_activity WHERE application_name LIKE ? AND wait_event_type = 'Lock'", [$tag.'-%'])->total;
                if ($waiting === count($responses)) {
                    break;
                }
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertSame(count($responses), $waiting, 'Workers must demonstrably wait on real PostgreSQL row locks.');
            if ($mode === 'cancelled') {
                app(MovieNightService::class)->cancel($host, $night->id);
            } elseif ($mode === 'finalized') {
                app(MovieNightTransitions::class)->finalize($host, $night->id);
            } elseif ($mode === 'rescheduled_to_deadline') {
                $night->update(['starts_at' => $instant]);
            } elseif ($mode === 'invitation_lock_deadline') {
                // Let the absolute start pass while the worker holds actor/event locks and waits for its invitation.
                while (CarbonImmutable::now()->lt($night->starts_at)) {
                    usleep(20000);
                }
            }
            DB::commit();
            $results = [];
            foreach ($processes as $process) {
                $this->assertSame(0, $process->wait(), 'Worker must complete without unexpected errors.');
                $results[] = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
            }
            $after = $invitation->fresh();
            $open = in_array($mode, ['competing', 'identical'], true);
            $this->assertSame(array_fill(0, count($responses), $open ? 200 : 409), array_column($results, 'code'));
            if ($mode === 'competing') {
                $this->assertSame(['accepted', 'declined'], array_column($results, 'status'));
                $this->assertContains($after->rsvp_status->value, ['accepted', 'declined']);
                $this->assertSame($instant->toISOString(), $after->responded_at->toISOString());
                $this->assertDatabaseMissing('movie_night_votes', ['id' => $vote->id]);
            } else {
                $this->assertSame(MovieNightRsvp::Accepted, $after->rsvp_status);
                $this->assertTrue($before->responded_at->eq($after->responded_at));
                $this->assertTrue($before->updated_at->eq($after->updated_at));
                $this->assertDatabaseHas('movie_night_votes', ['id' => $vote->id]);
            }
            $this->assertSame(1, $night->invitations()->count());
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
            DB::table('collections')->whereIn('user_id', [$host->id, $invitee->id])->delete();
            User::whereIn('id', [$host->id, $invitee->id])->delete();
        }
    }
}
