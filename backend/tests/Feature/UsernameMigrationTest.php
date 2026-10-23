<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class UsernameMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_users_receive_deterministic_unique_usernames(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_username_unique');
            $table->dropColumn('username');
            $table->string('name', 100);
        });
        DB::table('users')->insert([
            ['name' => 'Movie Fan', 'email' => 'one@example.com'],
            ['name' => 'Movie Fan', 'email' => 'two@example.com'],
            ['name' => 'Admin', 'email' => 'three@example.com'],
        ]);
        $migration = require database_path('migrations/2026_10_23_000002_replace_name_with_username.php');
        $migration->up();
        $secondId = DB::table('users')->where('email', 'two@example.com')->value('id');
        $this->assertDatabaseHas('users', ['email' => 'one@example.com', 'username' => 'movie_fan']);
        $this->assertDatabaseHas('users', ['email' => 'two@example.com', 'username' => 'movie_fan_'.$secondId]);
        $this->assertDatabaseHas('users', ['email' => 'three@example.com', 'username' => 'user']);
        $this->assertFalse(Schema::hasColumn('users', 'name'));
    }
}
