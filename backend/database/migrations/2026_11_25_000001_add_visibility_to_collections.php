<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table): void {
            $table->enum('visibility', ['private', 'public'])->default('private');
            $table->index(['user_id', 'visibility', 'created_at', 'id'], 'collections_author_visibility_order');
        });
    }

    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table): void {
            $table->dropIndex('collections_author_visibility_order');
            $table->dropColumn('visibility');
        });
    }
};
