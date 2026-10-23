<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Fail before DDL rather than truncate names or merge existing identities.
        $length = DB::getDriverName() === 'sqlite' ? 'LENGTH' : 'CHAR_LENGTH';
        if (DB::table('users')->whereRaw($length.'(name) > 100')->exists()
            || DB::table('users')->selectRaw('LOWER(TRIM(email)) AS normalized')->groupByRaw('LOWER(TRIM(email))')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Resolve long user names or duplicate normalized emails before migrating.');
        }

        Schema::table('users', function (Blueprint $table) {
            $table->string('name', 100)->change();
            $table->string('password')->nullable()->change();
            $table->string('avatar_url', 2048)->nullable();
        });
        DB::table('users')->update(['email' => DB::raw('LOWER(TRIM(email))')]);
    }

    public function down(): void
    {
        // OAuth-only accounts cannot safely be converted into password accounts.
        if (DB::table('users')->whereNull('password')->exists()) {
            throw new RuntimeException('Cannot roll back while nullable-password accounts exist.');
        }
        Schema::table('users', function (Blueprint $table) {
            $table->string('name', 255)->change();
            $table->string('password')->nullable(false)->change();
            $table->dropColumn('avatar_url');
        });
    }
};
