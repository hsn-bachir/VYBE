<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL has signed integer types; these widths also preserve the
        // normalizer's existing unsigned MySQL ranges on both engines.
        Schema::table('movies', function (Blueprint $table): void {
            $table->unsignedInteger('runtime')->nullable()->change();
            $table->unsignedBigInteger('tmdb_vote_count')->nullable()->change();
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE movies ADD CONSTRAINT movies_runtime_range_check CHECK (runtime BETWEEN 0 AND 65535)');
            DB::statement('ALTER TABLE movies ADD CONSTRAINT movies_vote_count_range_check CHECK (tmdb_vote_count BETWEEN 0 AND 4294967295)');
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();
        $runtimeLimit = $driver === 'pgsql' ? 32767 : 65535;
        $votesLimit = $driver === 'pgsql' ? 2147483647 : 4294967295;

        if (DB::table('movies')->where('runtime', '>', $runtimeLimit)->orWhere('tmdb_vote_count', '>', $votesLimit)->exists()) {
            throw new RuntimeException('Cannot narrow movie numeric columns while values exceed the original database type.');
        }

        if ($driver !== 'sqlite') {
            DB::statement('ALTER TABLE movies DROP CONSTRAINT movies_runtime_range_check');
            DB::statement('ALTER TABLE movies DROP CONSTRAINT movies_vote_count_range_check');
        }

        Schema::table('movies', function (Blueprint $table): void {
            $table->unsignedSmallInteger('runtime')->nullable()->change();
            $table->unsignedInteger('tmdb_vote_count')->nullable()->change();
        });
    }
};
