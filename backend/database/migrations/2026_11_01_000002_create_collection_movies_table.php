<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collection_movies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('collection_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('tmdb_id');
            $table->timestamps();
            $table->unique(['collection_id', 'tmdb_id']);
            $table->index(['collection_id', 'created_at', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collection_movies');
    }
};
