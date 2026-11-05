<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('administrative_actions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 48);
            $table->string('target_type', 24);
            $table->unsignedBigInteger('target_id');
            $table->string('reason', 1000)->nullable();
            $table->json('details')->nullable();
            $table->timestamp('created_at');
            $table->index(['target_type', 'target_id', 'created_at', 'id']);
            $table->index(['actor_id', 'created_at', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('administrative_actions');
    }
};
