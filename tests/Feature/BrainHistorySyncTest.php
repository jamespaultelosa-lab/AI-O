<?php

namespace Tests\Feature;

use App\Models\BrainConversation;
use App\Models\BrainMessage;
use App\Services\BrainHistorySyncService;
use App\Services\BrainMessageStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\TestCase;

class BrainHistorySyncTest extends TestCase
{
    use RefreshDatabase;

    private string $tempHistoryPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tempHistoryPath = storage_path('framework/testing/test_brain_history_' . Str::uuid() . '.json');
    }

    protected function tearDown(): void
    {
        if (File::exists($this->tempHistoryPath)) {
            File::delete($this->tempHistoryPath);
        }
        parent::tearDown();
    }

    public function test_export_creates_json_file_with_conversations_and_messages(): void
    {
        $conversation = BrainConversation::create([
            'title' => 'Feature Planning',
            'is_history' => false,
        ]);

        $store = app(BrainMessageStore::class);
        $store->record('USER', 'Let us plan the next milestone', $conversation->id);
        $store->record('Architect', 'Architecture reviewed and verified.', $conversation->id);

        $syncService = app(BrainHistorySyncService::class);
        $result = $syncService->export($this->tempHistoryPath);

        $this->assertSame('success', $result['status']);
        $this->assertTrue(File::exists($this->tempHistoryPath));

        $data = json_decode(File::get($this->tempHistoryPath), true);
        $this->assertSame(1, $data['version']);
        $this->assertGreaterThanOrEqual(2, $data['messages_count']);

        $convTitles = array_column($data['conversations'], 'title');
        $this->assertContains('Feature Planning', $convTitles);

        $messages = array_column($data['messages'], 'message');
        $this->assertContains('Let us plan the next milestone', $messages);
        $this->assertContains('Architecture reviewed and verified.', $messages);
    }

    public function test_import_loads_conversations_and_messages_from_json_file(): void
    {
        $convId = (string) Str::uuid();
        $testData = [
            'version' => 1,
            'exported_at' => now()->toIso8601String(),
            'conversations_count' => 1,
            'messages_count' => 2,
            'conversations' => [
                [
                    'id' => $convId,
                    'title' => 'Imported Workstation Chat',
                    'is_history' => false,
                    'created_at' => '2026-08-15T10:00:00+00:00',
                    'updated_at' => '2026-08-15T10:05:00+00:00',
                ]
            ],
            'messages' => [
                [
                    'id' => 101,
                    'brain_conversation_id' => $convId,
                    'brain' => 'USER',
                    'message' => 'Synced message from PC 1',
                    'created_at' => '2026-08-15T10:00:00+00:00',
                    'updated_at' => '2026-08-15T10:00:00+00:00',
                ],
                [
                    'id' => 102,
                    'brain_conversation_id' => $convId,
                    'brain' => 'Senior_Dev',
                    'message' => 'Synced reply from PC 1',
                    'created_at' => '2026-08-15T10:01:00+00:00',
                    'updated_at' => '2026-08-15T10:01:00+00:00',
                ]
            ]
        ];

        File::put($this->tempHistoryPath, json_encode($testData));

        $syncService = app(BrainHistorySyncService::class);
        $result = $syncService->import($this->tempHistoryPath);

        $this->assertSame('success', $result['status']);
        $this->assertSame(1, $result['conversations_imported']);
        $this->assertSame(2, $result['messages_imported']);

        $this->assertDatabaseHas('brain_conversations', [
            'id' => $convId,
            'title' => 'Imported Workstation Chat',
        ]);

        $this->assertDatabaseHas('brain_messages', [
            'brain_conversation_id' => $convId,
            'brain' => 'USER',
            'message' => 'Synced message from PC 1',
        ]);

        $this->assertDatabaseHas('brain_messages', [
            'brain_conversation_id' => $convId,
            'brain' => 'Senior_Dev',
            'message' => 'Synced reply from PC 1',
        ]);
    }

    public function test_import_is_idempotent_and_does_not_duplicate_records(): void
    {
        $convId = (string) Str::uuid();
        $testData = [
            'version' => 1,
            'exported_at' => now()->toIso8601String(),
            'conversations_count' => 1,
            'messages_count' => 1,
            'conversations' => [
                [
                    'id' => $convId,
                    'title' => 'Idempotency Test',
                    'is_history' => false,
                    'created_at' => '2026-08-15T10:00:00+00:00',
                    'updated_at' => '2026-08-15T10:05:00+00:00',
                ]
            ],
            'messages' => [
                [
                    'id' => 201,
                    'brain_conversation_id' => $convId,
                    'brain' => 'Security',
                    'message' => 'Security policy verified.',
                    'created_at' => '2026-08-15T10:00:00+00:00',
                    'updated_at' => '2026-08-15T10:00:00+00:00',
                ]
            ]
        ];

        File::put($this->tempHistoryPath, json_encode($testData));

        $syncService = app(BrainHistorySyncService::class);

        // First import
        $firstResult = $syncService->import($this->tempHistoryPath);
        $this->assertSame(1, $firstResult['conversations_imported']);
        $this->assertSame(1, $firstResult['messages_imported']);
        $this->assertSame(1, BrainMessage::query()->where('brain_conversation_id', $convId)->count());

        // Second import (idempotent)
        $secondResult = $syncService->import($this->tempHistoryPath);
        $this->assertSame(0, $secondResult['conversations_imported']);
        $this->assertSame(0, $secondResult['messages_imported']);
        $this->assertSame(1, BrainMessage::query()->where('brain_conversation_id', $convId)->count());
    }

    public function test_artisan_command_syncs_history(): void
    {
        $this->artisan('brain:sync-history', ['--export' => true, '--path' => $this->tempHistoryPath])
            ->assertSuccessful();

        $this->assertTrue(File::exists($this->tempHistoryPath));

        $this->artisan('brain:sync-history', ['--import' => true, '--path' => $this->tempHistoryPath])
            ->assertSuccessful();

        $this->artisan('brain:sync-history', ['--path' => $this->tempHistoryPath])
            ->assertSuccessful();
    }
}
