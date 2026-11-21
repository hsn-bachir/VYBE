<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PostgresPersistenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_nullable_firebase_uid_and_unique_nonnull_mapping(): void
    {
        $first = User::factory()->create();
        $second = User::factory()->create();
        $this->assertNull($first->firebase_uid);
        $this->assertNull($second->firebase_uid);

        $first->firebase_uid = 'fixture-uid';
        $first->save();
        $second->firebase_uid = 'fixture-uid';

        $this->expectException(UniqueConstraintViolationException::class);
        $second->save();
    }

    public function test_database_cache_session_and_queue_tables_work(): void
    {
        Cache::store('database')->put('phase3-probe', ['ok' => true], 60);
        $this->assertSame(['ok' => true], Cache::store('database')->get('phase3-probe'));

        $session = app('session')->driver('database');
        $session->start();
        $session->put('phase3', 'persisted');
        $session->save();
        $this->assertDatabaseHas('sessions', ['id' => $session->getId()]);

        Queue::connection('database')->pushRaw('{"job":"phase3-fixture"}', 'default');
        $this->assertDatabaseCount('jobs', 1);
    }
}
