<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('movie_nights', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('host_user_id')->constrained('users')->restrictOnDelete();
            $table->string('title', 150);
            $table->timestampTz('starts_at');
            $table->string('timezone', 64);
            $table->string('location', 500)->nullable();
            $table->string('meeting_url', 2048)->nullable();
            $table->enum('status', ['scheduled', 'finalized', 'cancelled'])->default('scheduled');
            $table->unsignedInteger('finalized_tmdb_id')->nullable();
            $table->timestampTz('finalized_at')->nullable();
            $table->timestampTz('cancelled_at')->nullable();
            $table->timestampsTz();
            $table->index(['host_user_id', 'starts_at', 'id']);
        });
        Schema::create('movie_night_invitations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('movie_night_id')->constrained()->restrictOnDelete();
            $table->foreignId('invited_user_id')->constrained('users')->restrictOnDelete();
            $table->enum('rsvp_status', ['pending', 'accepted', 'declined'])->default('pending');
            $table->timestampTz('responded_at')->nullable();
            $table->timestampsTz();
            $table->unique(['movie_night_id', 'invited_user_id'], 'mn_invitation_unique');
            $table->index(['invited_user_id', 'movie_night_id'], 'mn_invitee_events');
        });
        Schema::create('movie_night_movies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('movie_night_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('tmdb_id');
            $table->foreignId('nominated_by_user_id')->constrained('users')->restrictOnDelete();
            $table->timestampsTz();
            $table->unique(['movie_night_id', 'tmdb_id'], 'mn_movie_unique');
            // Referenced by the composite vote FK, even though id alone is unique.
            $table->unique(['movie_night_id', 'id'], 'mn_movie_event_id_unique');
            $table->index('nominated_by_user_id');
        });
        Schema::create('movie_night_votes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('movie_night_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('movie_night_movie_id');
            $table->foreignId('voting_user_id')->constrained('users')->restrictOnDelete();
            $table->timestampsTz();
            $table->unique(['movie_night_id', 'voting_user_id'], 'mn_vote_unique');
            $table->foreign(['movie_night_id', 'movie_night_movie_id'], 'mn_vote_same_event_fk')
                ->references(['movie_night_id', 'id'])->on('movie_night_movies')->restrictOnDelete();
            $table->index(['movie_night_id', 'movie_night_movie_id'], 'mn_vote_totals');
            $table->index('voting_user_id');
        });
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE movie_night_movies ADD CONSTRAINT mn_tmdb_range CHECK (tmdb_id BETWEEN 1 AND 2147483647)');
            DB::statement("ALTER TABLE movie_nights ADD CONSTRAINT mn_state_check CHECK (
                (status = 'scheduled' AND finalized_tmdb_id IS NULL AND finalized_at IS NULL AND cancelled_at IS NULL)
                OR (status = 'finalized' AND finalized_tmdb_id BETWEEN 1 AND 2147483647 AND finalized_tmdb_id IS NOT NULL AND finalized_at IS NOT NULL AND cancelled_at IS NULL)
                OR (status = 'cancelled' AND finalized_tmdb_id IS NULL AND finalized_at IS NULL AND cancelled_at IS NOT NULL))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('movie_night_votes');
        Schema::dropIfExists('movie_night_movies');
        Schema::dropIfExists('movie_night_invitations');
        Schema::dropIfExists('movie_nights');
    }
};
