<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('movies', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('tmdb_id')->unique();
            $table->string('title', 255);
            $table->string('original_title', 255)->nullable();
            $table->text('overview')->nullable();
            $table->string('poster_path', 255)->nullable();
            $table->string('backdrop_path', 255)->nullable();
            $table->date('release_date')->nullable();
            $table->unsignedSmallInteger('runtime')->nullable();
            $table->string('original_language', 10)->nullable();
            $table->json('genres')->nullable();
            $table->decimal('tmdb_rating', 4, 2)->nullable();
            $table->unsignedInteger('tmdb_vote_count')->nullable();
            $table->timestamp('metadata_fetched_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('movies');
    }
};
