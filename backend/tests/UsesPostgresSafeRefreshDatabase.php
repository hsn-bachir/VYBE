<?php

namespace Tests;

use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * PostgreSQL leaves a transaction aborted after an expected unique-key error.
 * These race tests need autocommit, like application requests, while other
 * database engines can keep the faster transaction-based isolation.
 */
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
                // Some HTTP tests temporarily impersonate a local environment.
                $this->app->instance('env', 'testing');
                $this->assertDisposableDatabase();
                $this->truncatePostgresTables();
            }
        } finally {
            parent::tearDown();
        }
    }
}
