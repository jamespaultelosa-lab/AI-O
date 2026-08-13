<?php

namespace Tests\Feature;

use App\Events\BrainMessageBroadcast;
use App\Models\BrainMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class TaskPromptTransportTest extends TestCase
{
    use RefreshDatabase;

    private string $queueFile;

    private string $pendingFile;

    private string $testBasePath;

    private string $originalBasePath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalBasePath = base_path();
        $this->testBasePath = sys_get_temp_dir().DIRECTORY_SEPARATOR.'fais-prompt-transport-'.uniqid();
        mkdir($this->testBasePath.DIRECTORY_SEPARATOR.'storage'.DIRECTORY_SEPARATOR.'app'.DIRECTORY_SEPARATOR.'public', 0755, true);
        mkdir($this->testBasePath.DIRECTORY_SEPARATOR.'storage'.DIRECTORY_SEPARATOR.'app'.DIRECTORY_SEPARATOR.'agent_ipc', 0755, true);
        $this->app->setBasePath($this->testBasePath);

        $this->queueFile = $this->testBasePath.DIRECTORY_SEPARATOR.'storage'.DIRECTORY_SEPARATOR.'app'.DIRECTORY_SEPARATOR.'agent_ipc'.DIRECTORY_SEPARATOR.'task_queue.json';
        $this->pendingFile = $this->testBasePath.DIRECTORY_SEPARATOR.'storage'.DIRECTORY_SEPARATOR.'app'.DIRECTORY_SEPARATOR.'agent_ipc'.DIRECTORY_SEPARATOR.'pending_task.json';
        file_put_contents($this->queueFile, json_encode([]));
    }

    protected function tearDown(): void
    {
        $this->app->setBasePath($this->originalBasePath);
        File::deleteDirectory($this->testBasePath);
        parent::tearDown();
    }

    public function test_display_text_is_persisted_and_acknowledged_while_only_transport_text_enters_ipc(): void
    {
        Event::fake();
        $displayTask = 'Please perform the unique original-only phrase before updating the dashboard.';
        $transportTask = 'perform unique phrase; update dashboard.';

        $response = $this->postJson('/api/brain/dispatch', [
            'display_task' => $displayTask,
            'task' => $transportTask,
        ]);

        $response->assertOk()->assertJsonPath('task', $displayTask);
        $this->assertDatabaseHas('brain_messages', ['brain' => 'USER', 'message' => $displayTask]);
        $this->assertDatabaseHas('brain_messages', ['brain' => 'SYSTEM']);
        $this->assertStringContainsString($displayTask, BrainMessage::query()->where('brain', 'SYSTEM')->value('message'));

        $payload = json_decode(file_get_contents($this->queueFile), true)[0];
        $this->assertSame(['display_task', 'transport_task', 'images', 'assigned_model', 'timestamp'], array_keys($payload));
        $this->assertSame($displayTask, $payload['display_task']);
        $this->assertSame($transportTask, $payload['transport_task']);
        $this->assertStringNotContainsString('original-only', $payload['transport_task']);
        $this->assertSame($payload, json_decode(file_get_contents($this->pendingFile), true));
    }

    public function test_attachments_remain_execution_metadata_and_are_not_appended_to_display_history(): void
    {
        Event::fake();
        $displayTask = 'Inspect this screenshot.';

        $this->postJson('/api/brain/dispatch', [
            'display_task' => $displayTask,
            'task' => 'inspect screenshot.',
            'images' => ['https://example.test/screenshot.png'],
        ])->assertOk();

        $payload = json_decode(file_get_contents($this->queueFile), true)[0];
        $this->assertSame($displayTask, BrainMessage::query()->where('brain', 'USER')->value('message'));
        $this->assertStringNotContainsString('[IMAGES:', BrainMessage::query()->where('brain', 'USER')->value('message'));
        $this->assertSame(['https://example.test/screenshot.png'], $payload['images']);
    }

    public function test_missing_either_representation_has_no_persistence_ipc_or_broadcast_side_effects(): void
    {
        Event::fake();

        foreach ([
            ['task' => 'compact only'],
            ['display_task' => 'display only'],
            ['display_task' => '', 'task' => 'compact'],
            ['display_task' => 'display', 'task' => ''],
        ] as $payload) {
            $this->postJson('/api/brain/dispatch', $payload)->assertUnprocessable();
        }

        $this->assertSame([], json_decode(file_get_contents($this->queueFile), true));
        $this->assertFileDoesNotExist($this->pendingFile);
        $this->assertSame(0, BrainMessage::count());
        Event::assertNothingDispatched();
    }
}
