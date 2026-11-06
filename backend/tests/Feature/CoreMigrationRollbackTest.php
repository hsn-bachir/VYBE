<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\Schema;
use Tests\MigrationTestCase;

class CoreMigrationRollbackTest extends MigrationTestCase
{
    public function test_access_migration_preserves_existing_users_and_rolls_back(): void
    {
        $user = User::factory()->create();
        $migration = require database_path('migrations/2026_11_03_000004_add_access_fields_to_users_table.php');
        $migration->down();
        $this->assertFalse(Schema::hasColumn('users', 'role'));
        $this->assertFalse(Schema::hasColumn('users', 'account_status'));
        $migration->up();
        $this->assertDatabaseHas('users', ['id' => $user->id, 'role' => 'user', 'account_status' => 'active']);
    }

    public function test_audit_migration_rolls_back_and_recreates_with_actor_fk(): void
    {
        $migration = require database_path('migrations/2026_11_03_000005_create_administrative_actions_table.php');
        $this->assertTrue(Schema::hasTable('administrative_actions'));
        $migration->down();
        $this->assertFalse(Schema::hasTable('administrative_actions'));
        $migration->up();
        $this->assertTrue(Schema::hasColumns('administrative_actions', ['actor_id', 'action', 'target_type', 'target_id', 'details', 'created_at']));
    }

    public function test_invitation_migration_rolls_back_and_recreates_without_damaging_users(): void
    {
        $user = User::factory()->create();
        $migration = require database_path('migrations/2026_11_04_000001_create_account_invitations_table.php');
        $this->assertTrue(Schema::hasTable('account_invitations'));
        $migration->down();
        $this->assertFalse(Schema::hasTable('account_invitations'));
        $this->assertFalse(Schema::hasColumn('users', 'invitation_pending'));
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $migration->up();
        $this->assertTrue(Schema::hasColumn('users', 'invitation_pending'));
    }

    public function test_session_version_migration_rolls_back_without_deleting_users(): void
    {
        $user = User::factory()->create();
        $migration = require database_path('migrations/2026_11_05_000001_add_password_session_version_to_users_table.php');
        $this->assertTrue(Schema::hasColumn('users', 'password_session_version'));
        $migration->down();
        $this->assertFalse(Schema::hasColumn('users', 'password_session_version'));
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $migration->up();
        $this->assertTrue(Schema::hasColumn('users', 'password_session_version'));
    }

    public function test_review_moderation_migration_rolls_back_and_preserves_reviews(): void
    {
        $user = User::factory()->create();
        $review = $user->reviews()->create(['tmdb_id' => 550, 'body' => 'Original review']);
        $migration = require database_path('migrations/2026_11_06_000001_add_review_moderation_and_reports.php');
        $this->assertTrue(Schema::hasTable('reports'));
        $this->assertTrue(Schema::hasColumns('reviews', ['visibility', 'moderator_spoiler']));
        $migration->down();
        $this->assertFalse(Schema::hasTable('reports'));
        $this->assertFalse(Schema::hasColumn('reviews', 'visibility'));
        $this->assertDatabaseHas('reviews', ['id' => $review->id, 'body' => 'Original review']);
        $migration->up();
        $this->assertDatabaseHas('reviews', ['id' => $review->id, 'visibility' => 'visible']);
    }
}
