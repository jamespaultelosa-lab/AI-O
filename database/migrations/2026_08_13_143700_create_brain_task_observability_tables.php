<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('brain_tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('display_summary', 240);
            $table->string('assigned_brain')->nullable();
            $table->string('assigned_model')->nullable();
            $table->string('status')->index();
            $table->string('safe_phase')->nullable();
            $table->unsignedInteger('queue_position')->nullable();
            $table->text('terminal_reason')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('brain_task_events', function (Blueprint $table) {
            $table->id();
            $table->uuid('brain_task_id')->index();
            $table->string('type');
            $table->string('phase')->nullable();
            $table->string('brain')->nullable();
            $table->string('summary', 300)->nullable();
            $table->timestamps();
        });

        Schema::create('brain_approvals', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('brain_task_id')->index();
            $table->string('requesting_brain');
            $table->string('type');
            $table->string('summary', 300);
            $table->string('status')->index();
            $table->timestamp('expires_at')->nullable();
            $table->string('resolver')->nullable();
            $table->string('decision')->nullable();
            $table->string('reviewer_note', 500)->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('brain_approvals');
        Schema::dropIfExists('brain_task_events');
        Schema::dropIfExists('brain_tasks');
    }
};
