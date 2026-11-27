<?php

namespace Tests\Support;

use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use PDOException;
use PHPUnit\Framework\Assert;

/** Connection-local fault injection without MySQL DDL's implicit commits. */
final class MySqlWriteFailure
{
    private bool $armed = true;

    private int $hits = 0;

    private bool $signalled = false;

    private array $bindings = [];

    public function __construct(private Connection $connection, string $operation, string $table)
    {
        Assert::assertSame('mysql', $connection->getDriverName());
        $connection->beforeExecuting(function (string $query, array $bindings) use ($operation, $table): void {
            $sql = strtolower(str_replace('`', '', $query));
            if (! $this->armed || ! str_starts_with($sql, $operation.' '.$table.' ')) {
                return;
            }

            $this->hits++;
            $this->bindings = $bindings;
            Assert::assertGreaterThan(1, $this->connection->transactionLevel(), 'Failure must occur inside the service transaction.');
            Assert::assertTrue($this->connection->getPdo()->inTransaction());
            try {
                // Raw execution avoids both prepared-SIGNAL restrictions and hook recursion.
                $this->connection->getPdo()->exec("SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'private test diagnostic'");
            } catch (PDOException $exception) {
                Assert::assertSame('45000', $exception->errorInfo[0]);
                $this->signalled = true;
                throw new QueryException($this->connection->getName(), $query, $bindings, $exception);
            }
            Assert::fail('MySQL did not raise the injected write failure.');
        });
    }

    public function assertTriggered(array $expectedBindings): void
    {
        Assert::assertSame(1, $this->hits);
        Assert::assertTrue($this->signalled, 'MySQL must have raised SQLSTATE 45000 at the intended write.');
        foreach ($expectedBindings as $binding) {
            Assert::assertContains($binding, $this->bindings);
        }
        Assert::assertSame(1, $this->connection->transactionLevel(), 'The service transaction must have rolled back.');
        Assert::assertTrue($this->connection->getPdo()->inTransaction(), 'The outer test transaction must remain active.');
    }

    public function disarm(): void
    {
        $this->armed = false;
    }

    public function assertDisarmed(): void
    {
        Assert::assertFalse($this->armed);
        Assert::assertSame(1, $this->hits, 'The successful retry must not trigger another failure.');
        Assert::assertSame(1, $this->connection->transactionLevel());
        Assert::assertTrue($this->connection->getPdo()->inTransaction());
    }
}
