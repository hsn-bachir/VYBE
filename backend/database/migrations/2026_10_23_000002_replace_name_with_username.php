<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->string('username', 30)->nullable());

        $taken = [];
        DB::table('users')->select('id', 'name')->orderBy('id')->chunkById(100, function ($users) use (&$taken): void {
            foreach ($users as $user) {
                $base = trim((string) preg_replace('/[^a-z0-9_]+/', '_', Str::lower(Str::ascii($user->name))), '_');
                $base = substr($base, 0, 30);
                if (strlen($base) < 3 || in_array($base, ['admin', 'support', 'system', 'root', 'vybe'], true)) {
                    $base = 'user';
                }
                $candidate = $base;
                if (isset($taken[$candidate])) {
                    $suffix = '_'.$user->id;
                    $candidate = substr($base, 0, 30 - strlen($suffix)).$suffix;
                }
                while (isset($taken[$candidate])) {
                    $candidate = 'user_'.$user->id.'_'.count($taken);
                }
                $taken[$candidate] = true;
                DB::table('users')->where('id', $user->id)->update(['username' => $candidate]);
            }
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 30)->nullable(false)->change();
            $table->unique('username');
            $table->dropColumn('name');
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Original display names cannot be reconstructed from usernames; restore from a backup instead.');
    }
};
