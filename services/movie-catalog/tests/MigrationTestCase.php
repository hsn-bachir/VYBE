<?php

namespace Tests;

use Illuminate\Foundation\Testing\RefreshDatabaseState;

abstract class MigrationTestCase extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->assertDisposableDatabase();
        $this->artisan('migrate:fresh', ['--force' => true]);
    }

    protected function tearDown(): void
    {
        try {
            if ($this->app) {
                $this->assertDisposableDatabase();
                $this->artisan('migrate:fresh', ['--force' => true]);
                RefreshDatabaseState::$migrated = false;
            }
        } finally {
            parent::tearDown();
        }
    }
}
