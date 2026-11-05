<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reviews', function (Blueprint $table): void {
            $table->string('visibility', 16)->default('visible');
            $table->boolean('moderator_spoiler')->default(false);
            $table->index(['tmdb_id', 'visibility', 'created_at', 'id']);
            $table->index(['visibility', 'created_at', 'id']);
        });
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE reviews ADD CONSTRAINT reviews_visibility_check CHECK (visibility IN ('visible', 'hidden'))");
        }

        Schema::create('reports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('reporter_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('target_type', 24);
            $table->unsignedBigInteger('target_id');
            $table->string('reason', 24);
            $table->string('description', 1000)->nullable();
            $table->string('status', 16)->default('pending');
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->string('resolution_note', 1000)->nullable();
            $table->string('resolution_action', 24)->nullable();
            $table->timestamps();
            $table->unique(['reporter_id', 'target_type', 'target_id']);
            $table->index(['status', 'created_at', 'id']);
            $table->index(['target_type', 'target_id', 'created_at', 'id']);
        });
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE reports ADD CONSTRAINT reports_target_type_check CHECK (target_type = 'review')");
            DB::statement("ALTER TABLE reports ADD CONSTRAINT reports_reason_check CHECK (reason IN ('harassment', 'hate', 'spam', 'spoiler', 'other'))");
            DB::statement("ALTER TABLE reports ADD CONSTRAINT reports_status_check CHECK (status IN ('pending', 'resolved', 'dismissed'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('reports');
        Schema::table('reviews', function (Blueprint $table): void {
            $table->dropIndex(['visibility', 'created_at', 'id']);
            $table->dropIndex(['tmdb_id', 'visibility', 'created_at', 'id']);
        });
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE reviews DROP CHECK reviews_visibility_check');
        }
        Schema::table('reviews', fn (Blueprint $table) => $table->dropColumn(['visibility', 'moderator_spoiler']));
    }
};
