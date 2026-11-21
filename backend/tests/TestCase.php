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
        $connection = config("database.connections.{$driver}");
        $name = (string) ($connection['database'] ?? '');
        $host = (string) ($connection['host'] ?? '');
        if (in_array($driver, ['mysql', 'pgsql'], true)
            && app()->environment('testing')
            && str_ends_with($name, '_test')
            && in_array($host, ['127.0.0.1', 'localhost', '::1'], true)
            && empty($connection['url'])
            && env('VYBE_DISPOSABLE_TEST_DB') === '1') {
            return;
        }

        throw new \RuntimeException('Database tests require in-memory SQLite or an explicitly disposable local MySQL/PostgreSQL *_test database.');
    }
}
