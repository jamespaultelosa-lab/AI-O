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
        Schema::create('brain_conversations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title', 120);
            $table->boolean('is_history')->default(false)->index();
            $table->timestamps();
        });

        Schema::table('brain_messages', function (Blueprint $table) {
            $table->uuid('brain_conversation_id')->nullable()->index()->after('id');
        });
        Schema::table('brain_tasks', function (Blueprint $table) {
            $table->uuid('brain_conversation_id')->nullable()->index()->after('id');
        });

        $historyId = (string) Str::uuid();
        DB::table('brain_conversations')->insert([
            'id' => $historyId,
            'title' => 'History',
            'is_history' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('brain_messages')->whereNull('brain_conversation_id')->update(['brain_conversation_id' => $historyId]);
        DB::table('brain_tasks')->whereNull('brain_conversation_id')->update(['brain_conversation_id' => $historyId]);
    }

    public function down(): void
    {
        Schema::table('brain_messages', function (Blueprint $table) {
            $table->dropIndex(['brain_conversation_id']);
            $table->dropColumn('brain_conversation_id');
        });
        Schema::table('brain_tasks', function (Blueprint $table) {
            $table->dropIndex(['brain_conversation_id']);
            $table->dropColumn('brain_conversation_id');
        });
        Schema::dropIfExists('brain_conversations');
    }
};
