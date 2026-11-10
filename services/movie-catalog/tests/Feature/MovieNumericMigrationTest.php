<?php

namespace Tests\Feature;

use App\Models\Movie;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\MigrationTestCase;

class MovieNumericMigrationTest extends MigrationTestCase
{
    public function test_runtime_above_domain_is_rejected_by_mysql_and_postgres(): void
    {
        if (config('database.default') === 'sqlite') {
            $this->markTestSkipped('SQLite migration cannot add this named CHECK constraint.');
        }

        $this->expectException(QueryException::class);
        DB::table('movies')->insert(['tmdb_id' => 550, 'title' => 'Fixture', 'runtime' => 65536]);
    }

    public function test_vote_count_above_domain_is_rejected_by_mysql_and_postgres(): void
    {
        if (config('database.default') === 'sqlite') {
            $this->markTestSkipped('SQLite migration cannot add this named CHECK constraint.');
        }

        $this->expectException(QueryException::class);
        DB::table('movies')->insert(['tmdb_id' => 550, 'title' => 'Fixture', 'tmdb_vote_count' => 4294967296]);
    }

    public function test_widening_migration_rolls_back_when_existing_values_fit(): void
    {
        $movie = Movie::create(['tmdb_id' => 550, 'title' => 'Fixture', 'runtime' => 120, 'tmdb_vote_count' => 500]);
        $migration = require database_path('migrations/2026_11_10_000001_expand_movie_numeric_columns.php');

        $migration->down();
        $this->assertTrue(Schema::hasColumns('movies', ['runtime', 'tmdb_vote_count']));
        $this->assertDatabaseHas('movies', ['id' => $movie->id, 'runtime' => 120, 'tmdb_vote_count' => 500]);
        $migration->up();
        $this->assertDatabaseHas('movies', ['id' => $movie->id, 'runtime' => 120, 'tmdb_vote_count' => 500]);
    }

    public function test_widening_migration_refuses_a_lossy_rollback(): void
    {
        $driver = config('database.default');
        if ($driver === 'sqlite') {
            $this->markTestSkipped('SQLite integer affinity has no old signed or unsigned width to narrow.');
        }

        Movie::create(['tmdb_id' => 550, 'title' => 'Fixture', 'runtime' => 65535, 'tmdb_vote_count' => 4294967295]);
        $migration = require database_path('migrations/2026_11_10_000001_expand_movie_numeric_columns.php');

        if ($driver === 'mysql') {
            // The original unsigned MySQL types can store these exact maxima.
            $migration->down();
            $this->assertDatabaseHas('movies', ['tmdb_id' => 550, 'runtime' => 65535, 'tmdb_vote_count' => 4294967295]);
            $migration->up();

            return;
        }

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Cannot narrow movie numeric columns');
        $migration->down();
    }
}
