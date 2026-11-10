<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement("ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin'))");
            DB::statement("ALTER TABLE users ADD COLUMN account_status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'restricted', 'banned', 'deactivated'))");
        } else {
            Schema::table('users', function (Blueprint $table): void {
                $table->string('role', 16)->default('user');
                $table->string('account_status', 16)->default('active');
            });
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'moderator', 'admin'))");
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('active', 'restricted', 'banned', 'deactivated'))");
        }

        Schema::table('users', fn (Blueprint $table) => $table->index(['account_status', 'role', 'id']));
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropIndex(['account_status', 'role', 'id']));
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE users DROP CONSTRAINT users_role_check');
            DB::statement('ALTER TABLE users DROP CONSTRAINT users_account_status_check');
        }
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['role', 'account_status']);
        });
    }
};
