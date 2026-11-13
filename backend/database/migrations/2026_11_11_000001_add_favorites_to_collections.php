<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table): void {
            $table->string('system_key', 32)->nullable()->after('description');
            $table->unique(['user_id', 'system_key']);
        });

        DB::table('users')->select('id')->orderBy('id')->chunkById(500, function ($users): void {
            foreach ($users as $user) {
                $existing = DB::table('collections')->where('user_id', $user->id)
                    ->whereRaw("LOWER(TRIM(name)) = 'favorites'")->orderBy('id')->first();
                if ($existing) {
                    DB::table('collections')->where('id', $existing->id)->update(['name' => 'Favorites', 'system_key' => 'favorites']);
                    // Keep every legacy membership while avoiding several cards
                    // with the same reserved Favorites name.
                    $duplicates = DB::table('collections')->where('user_id', $user->id)
                        ->where('id', '!=', $existing->id)->whereRaw("LOWER(TRIM(name)) = 'favorites'")->pluck('id');
                    foreach ($duplicates as $id) {
                        DB::table('collections')->where('id', $id)->update(['name' => 'Favorites (legacy '.$id.')']);
                    }
                } else {
                    DB::table('collections')->insertOrIgnore(['user_id' => $user->id, 'name' => 'Favorites',
                        'system_key' => 'favorites', 'created_at' => now(), 'updated_at' => now()]);
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table): void {
            $table->dropUnique(['user_id', 'system_key']);
            $table->dropColumn('system_key');
        });
    }
};
