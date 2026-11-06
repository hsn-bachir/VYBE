<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('watched_movies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('tmdb_id');
            $table->timestamp('watched_at');
            $table->timestamps();
            $table->unique(['user_id', 'tmdb_id']);
            $table->index(['user_id', 'watched_at', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('watched_movies');
    }
};
