<?php

namespace Tests;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUpTraits()
    {
        $traits = class_uses_recursive(static::class);
        if (array_intersect([RefreshDatabase::class, DatabaseTransactions::class, DatabaseTruncation::class], $traits)) {
            $this->assertDisposableDatabase();
        }

        return parent::setUpTraits();
    }

    protected function assertDisposableDatabase(): void
    {
        $driver = config('database.default');
        if ($driver === 'sqlite' && config('database.connections.sqlite.database') === ':memory:') {
            return;
        }
        $name = (string) config("database.connections.{$driver}.database");
        if ($driver === 'mysql' && app()->environment('testing') && str_ends_with($name, '_test') && env('VYBE_DISPOSABLE_TEST_DB') === '1') {
            return;
        }

        throw new \RuntimeException('Database tests require in-memory SQLite or an explicitly disposable MySQL *_test database.');
    }
}
