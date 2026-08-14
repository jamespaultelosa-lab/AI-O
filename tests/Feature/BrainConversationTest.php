<?php

namespace Tests\Feature;

use App\Events\BrainMessageBroadcast;
use App\Models\BrainConversation;
use App\Models\BrainTask;
use App\Services\BrainMessageStore;
use App\Services\BrainTaskStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

class BrainConversationTest extends TestCase
{
    use RefreshDatabase;

    public function test_conversations_can_be_created_and_listed_with_history_and_message_counts(): void
    {
        $history = BrainConversation::query()->where('is_history', true)->firstOrFail();

        $response = $this->postJson('/api/brain/conversations', ['title' => '  Release planning  '])
            ->assertCreated()
            ->assertJsonPath('title', 'Release planning')
            ->assertJsonPath('is_history', false);

        $conversationId = $response->json('id');
        app(BrainMessageStore::class)->record('USER', 'Start the release checklist', $conversationId);

        $this->getJson('/api/brain/conversations')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $history->id,
                'title' => 'History',
                'is_history' => true,
                'messages_count' => 0,
            ])
            ->assertJsonFragment([
                'id' => $conversationId,
                'title' => 'Release planning',
                'is_history' => false,
                'messages_count' => 1,
            ]);
    }

    public function test_message_history_is_isolated_by_conversation_and_invalid_ids_return_not_found(): void
    {
        $first = BrainConversation::create(['title' => 'First']);
        $second = BrainConversation::create(['title' => 'Second']);
        $store = app(BrainMessageStore::class);
        $store->record('USER', 'First-only message', $first->id);
        $store->record('Architect', 'Second-only message', $second->id);

        $this->getJson("/api/brain/conversations/{$first->id}/messages")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.message', 'First-only message')
            ->assertJsonMissing(['message' => 'Second-only message']);

        $this->getJson("/api/brain/conversations/{$second->id}/messages")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.message', 'Second-only message')
            ->assertJsonMissing(['message' => 'First-only message']);

        $this->getJson('/api/brain/conversations/'.Str::uuid().'/messages')->assertNotFound();
        $this->getJson('/api/brain/conversations/not-a-uuid/messages')->assertNotFound();
    }

    public function test_first_user_message_titles_a_new_chat_without_renaming_history(): void
    {
        $conversation = BrainConversation::create(['title' => 'New chat']);
        $history = BrainConversation::query()->where('is_history', true)->firstOrFail();
        $store = app(BrainMessageStore::class);

        $store->record('USER', '  Design the approvals dashboard  ', $conversation->id);
        $store->record('USER', 'Do not use this as the history title', $history->id);

        $this->assertSame('Design the approvals dashboard', $conversation->fresh()->title);
        $this->assertSame('History', $history->fresh()->title);
    }

    public function test_legacy_messages_and_tasks_are_migrated_into_history(): void
    {
        $migration = require database_path('migrations/2026_08_14_000000_add_brain_conversations.php');
        $migration->down();

        $taskId = (string) Str::uuid();
        DB::table('brain_messages')->insert([
            'brain' => 'USER',
            'message' => 'Legacy message',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('brain_tasks')->insert([
            'id' => $taskId,
            'display_summary' => 'Legacy task',
            'status' => BrainTask::QUEUED,
            'safe_phase' => 'Queued',
            'queue_position' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $migration->up();

        $historyId = DB::table('brain_conversations')->where('is_history', true)->value('id');
        $this->assertNotNull($historyId);
        $this->assertDatabaseHas('brain_messages', [
            'message' => 'Legacy message',
            'brain_conversation_id' => $historyId,
        ]);
        $this->assertDatabaseHas('brain_tasks', [
            'id' => $taskId,
            'brain_conversation_id' => $historyId,
        ]);
    }

    public function test_task_webhook_messages_keep_the_task_conversation_link(): void
    {
        Event::fake();
        $conversation = BrainConversation::create(['title' => 'Linked task']);
        $task = app(BrainTaskStore::class)->create('Build conversation navigation', 'gpt-5.6-terra', 1, $conversation->id);

        $this->assertSame($conversation->id, $task->conversation->id);

        $this->postJson('/api/webhook/brain-message', [
            'task_id' => $task->id,
            'brain' => 'Junior_Dev',
            'message' => 'Conversation UI complete.',
        ])->assertOk();

        $this->assertDatabaseHas('brain_messages', [
            'brain' => 'Junior_Dev',
            'message' => 'Conversation UI complete.',
            'brain_conversation_id' => $conversation->id,
        ]);
        Event::assertDispatched(BrainMessageBroadcast::class, fn (BrainMessageBroadcast $event): bool => $event->conversationId === $conversation->id);

        $this->postJson('/api/webhook/brain-message', [
            'task_id' => (string) Str::uuid(),
            'brain' => 'Junior_Dev',
            'message' => 'Orphaned message',
        ])->assertUnprocessable();
        $this->assertDatabaseMissing('brain_messages', ['message' => 'Orphaned message']);
    }

    public function test_task_cancellation_message_stays_in_the_task_conversation(): void
    {
        Event::fake();
        $conversation = BrainConversation::create(['title' => 'Cancellation scope']);
        $task = app(BrainTaskStore::class)->create('Cancel this task', 'gpt-5.6-terra', 1, $conversation->id);

        $this->postJson("/api/brain/tasks/{$task->id}/cancel")->assertOk();

        $this->assertDatabaseHas('brain_messages', [
            'brain' => 'Senior_Dev',
            'message' => '[Senior_Dev]: Task cancellation recorded.',
            'brain_conversation_id' => $conversation->id,
        ]);
        Event::assertDispatched(BrainMessageBroadcast::class, fn (BrainMessageBroadcast $event): bool => $event->conversationId === $conversation->id);
    }
}
