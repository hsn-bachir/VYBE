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
            // SQLite cannot add a CHECK using ALTER TABLE; declare it with the table.
            DB::statement('CREATE TABLE movie_ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                tmdb_id INTEGER NOT NULL CHECK (tmdb_id BETWEEN 1 AND 2147483647),
                rating INTEGER NOT NULL CHECK (typeof(rating) = \'integer\' AND rating BETWEEN 1 AND 5),
                created_at DATETIME NULL, updated_at DATETIME NULL
            )');
            Schema::table('movie_ratings', function (Blueprint $table): void {
                $table->unique(['user_id', 'tmdb_id']);
                $table->index(['tmdb_id', 'rating']);
            });
        } else {
            Schema::create('movie_ratings', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('tmdb_id');
                $table->unsignedTinyInteger('rating');
                $table->timestamps();
                $table->unique(['user_id', 'tmdb_id']);
                $table->index(['tmdb_id', 'rating']);
            });
            DB::statement('ALTER TABLE movie_ratings ADD CONSTRAINT movie_ratings_rating_check CHECK (rating BETWEEN 1 AND 5)');
            DB::statement('ALTER TABLE movie_ratings ADD CONSTRAINT movie_ratings_tmdb_check CHECK (tmdb_id BETWEEN 1 AND 2147483647)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('movie_ratings');
    }
};
