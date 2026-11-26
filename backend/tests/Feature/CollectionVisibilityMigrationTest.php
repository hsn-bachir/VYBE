<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\MigrationTestCase;

class CollectionVisibilityMigrationTest extends MigrationTestCase
{
    public function test_upgrade_defaults_existing_and_new_records_to_private_and_preserves_memberships(): void
    {
        $migration = require database_path('migrations/2026_11_25_000001_add_visibility_to_collections.php');
        $migration->down();
        $user = User::factory()->create();
        $id = DB::table('collections')->insertGetId(['user_id' => $user->id, 'name' => 'Legacy', 'description' => 'Preserved']);
        DB::table('collection_movies')->insert(['collection_id' => $id, 'tmdb_id' => 550]);
        $migration->up();
        $this->assertDatabaseHas('collections', ['id' => $id, 'name' => 'Legacy', 'description' => 'Preserved', 'visibility' => 'private']);
        $this->assertDatabaseHas('collections', ['user_id' => $user->id, 'system_key' => 'favorites', 'visibility' => 'private']);
        $this->assertDatabaseHas('collection_movies', ['collection_id' => $id, 'tmdb_id' => 550]);
        $newId = DB::table('collections')->insertGetId(['user_id' => $user->id, 'name' => 'Default']);
        $this->assertDatabaseHas('collections', ['id' => $newId, 'visibility' => 'private']);
        $migration->down();
        $this->assertFalse(Schema::hasColumn('collections', 'visibility'));
        $this->assertDatabaseHas('collection_movies', ['collection_id' => $id, 'tmdb_id' => 550]);
        $migration->up();
    }

    public function test_database_rejects_invalid_visibility_independently_of_http_validation(): void
    {
        $user = User::factory()->create();
        $this->expectException(QueryException::class);
        DB::table('collections')->insert(['user_id' => $user->id, 'name' => 'Invalid', 'visibility' => 'friends']);
    }
}
