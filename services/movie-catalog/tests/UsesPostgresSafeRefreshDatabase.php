<?php

namespace Tests;

use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Foundation\Testing\RefreshDatabase;

/** Allow expected uniqueness/lock failures to roll back their own PG statement. */
trait UsesPostgresSafeRefreshDatabase
{
    use DatabaseTruncation, RefreshDatabase {
        DatabaseTruncation::truncateDatabaseTables as private truncatePostgresTables;
        RefreshDatabase::refreshDatabase as private refreshWithTransactions;
    }

    public function refreshDatabase(): void
    {
        if (config('database.default') !== 'pgsql') {
            $this->refreshWithTransactions();
        }
    }

    protected function truncateDatabaseTables(): void
    {
        if (config('database.default') === 'pgsql') {
            $this->truncatePostgresTables();
        }
    }

    protected function tearDown(): void
    {
        try {
            if ($this->app && config('database.default') === 'pgsql') {
                $this->app->instance('env', 'testing');
                $this->assertDisposableDatabase();
                $this->truncatePostgresTables();
            }
        } finally {
            parent::tearDown();
        }
    }
}
