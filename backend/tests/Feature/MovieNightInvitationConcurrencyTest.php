<?php

namespace Tests\Feature;

use App\Enums\MovieNightStatus;
use App\Models\MovieNight;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** Independent processes require committed fixtures, not RefreshDatabase's outer transaction. */
class MovieNightInvitationConcurrencyTest extends TestCase
{
    public static function races(): array
    {
        return [['service', ['201', '409']], ['constraint', ['201', '23505']], ['cancelled', ['409', '409']]];
    }

    #[DataProvider('races')]
    public function test_real_postgres_concurrent_invitation_protection(string $mode, array $expected): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires real disposable PostgreSQL and independent PHP processes.');
        }
        $this->assertDisposableDatabase();
        // Additive migrate only; never reset a database to prepare this test.
        Artisan::call('migrate', ['--force' => true]);
        $host = User::factory()->create();
        $target = User::factory()->create();
        $night = new MovieNight(['title' => 'Race test', 'starts_at' => now()->addDay(), 'timezone' => 'UTC']);
        $night->host()->associate($host);
        $night->save();
        $processes = [];
        $script = <<<'WORKER'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$connection = config('database.connections.pgsql');
if (! $app->environment('testing') || config('database.default') !== 'pgsql'
    || ! in_array($connection['host'], ['127.0.0.1', 'localhost', '::1'], true)
    || ! str_ends_with($connection['database'], '_test') || ! empty($connection['url'])
    || in_array((string) $connection['port'], ['55435', '55436'], true)
    || env('VYBE_DISPOSABLE_TEST_DB') !== '1') {
    exit(2);
}
Illuminate\Support\Facades\DB::selectOne("SELECT set_config('application_name', ?, false)", [$argv[5]]);
Illuminate\Support\Facades\DB::statement("SET lock_timeout = '8s'");
try {
    if ($argv[1] !== 'constraint') {
        app(App\Services\MovieNights\MovieNightInvitationService::class)->create(App\Models\User::findOrFail($argv[2]), (int) $argv[3], (int) $argv[4]);
    } else {
        Illuminate\Support\Facades\DB::table('movie_night_invitations')->insert(['movie_night_id' => (int) $argv[3], 'invited_user_id' => (int) $argv[4], 'rsvp_status' => 'pending']);
    }
    echo '201';
} catch (Symfony\Component\HttpKernel\Exception\HttpException $e) {
    echo $e->getStatusCode();
} catch (Illuminate\Database\QueryException $e) {
    echo $e->errorInfo[0];
}
WORKER;
        try {
            DB::beginTransaction();
            if ($mode !== 'constraint') {
                DB::table('users')->where('id', $host->id)->lockForUpdate()->first();
            } else {
                // Exclusive referenced-row lock blocks both FK checks before either insert commits.
                DB::selectOne('SELECT id FROM movie_nights WHERE id = ? FOR UPDATE', [$night->id]);
            }
            $tag = 'm52-'.bin2hex(random_bytes(6));
            foreach ([1, 2] as $worker) {
                $process = new Process([PHP_BINARY, '-r', $script, $mode, (string) $host->id, (string) $night->id, (string) $target->id, $tag.'-'.$worker], base_path());
                $process->setTimeout(15);
                $process->start();
                $processes[] = $process;
            }
            $deadline = microtime(true) + 6;
            do {
                DB::selectOne('SELECT pg_stat_clear_snapshot()');
                $waiting = DB::selectOne("SELECT count(*) AS total FROM pg_stat_activity WHERE application_name LIKE ? AND wait_event_type = 'Lock'", [$tag.'-%'])->total;
                if ((int) $waiting === 2) {
                    break;
                }
                usleep(20000);
            } while (microtime(true) < $deadline);
            $this->assertSame(2, (int) $waiting, 'Both independent workers must contend on a real PostgreSQL lock.');
            if ($mode === 'cancelled') {
                $night->forceFill(['status' => MovieNightStatus::Cancelled, 'cancelled_at' => now()])->save();
            }
            DB::commit();
            $results = [];
            foreach ($processes as $process) {
                $this->assertSame(0, $process->wait(), 'Worker must complete without an unexpected error.');
                $results[] = $process->getOutput();
            }
            sort($results);
            sort($expected);
            $this->assertSame($expected, $results);
            $this->assertSame($mode === 'cancelled' ? 0 : 1, DB::table('movie_night_invitations')->where('movie_night_id', $night->id)->count());
        } finally {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            foreach ($processes as $process) {
                if ($process->isRunning()) {
                    $process->stop();
                }
            }
            // Remove only this test's committed fixtures, respecting restrictive FKs.
            DB::table('movie_night_invitations')->where('movie_night_id', $night->id)->delete();
            $night->delete();
            DB::table('collections')->whereIn('user_id', [$host->id, $target->id])->delete();
            User::whereIn('id', [$host->id, $target->id])->delete();
        }
    }
}
