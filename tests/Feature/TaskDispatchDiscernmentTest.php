<?php

namespace Tests\Feature;

use App\Events\BrainMessageBroadcast;
use App\Http\Controllers\TaskDispatcherController;
use App\Models\BrainMessage;
use App\Services\TaskIntentDiscernment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Validation\ValidationException;
use ReflectionClass;
use Tests\TestCase;

class TaskDispatchDiscernmentTest extends TestCase
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
        $this->testBasePath = sys_get_temp_dir().DIRECTORY_SEPARATOR.'fais-dispatch-'.uniqid();
        mkdir($this->testBasePath.DIRECTORY_SEPARATOR.'.agents', 0755, true);
        mkdir($this->testBasePath.DIRECTORY_SEPARATOR.'storage'.DIRECTORY_SEPARATOR.'app'.DIRECTORY_SEPARATOR.'public', 0755, true);
        $this->app->setBasePath($this->testBasePath);

        $this->queueFile = $this->testBasePath.DIRECTORY_SEPARATOR.'.agents'.DIRECTORY_SEPARATOR.'task_queue.json';
        $this->pendingFile = $this->testBasePath.DIRECTORY_SEPARATOR.'.agents'.DIRECTORY_SEPARATOR.'pending_task.json';
        file_put_contents($this->queueFile, json_encode([]));
        @unlink($this->pendingFile);
    }

    protected function tearDown(): void
    {
        file_put_contents($this->queueFile, json_encode([]));
        @unlink($this->pendingFile);
        $this->app->setBasePath($this->originalBasePath);
        File::deleteDirectory($this->testBasePath);
        parent::tearDown();
    }

    public function test_hello_uses_casual_response_without_ipc_side_effects(): void
    {
        Event::fake();

        $response = $this->postJson('/api/brain/dispatch', ['task' => 'hello']);

        $response->assertOk()->assertJson([
            'status' => 'success',
            'mode' => 'casual',
            'task' => 'hello',
            'queue_position' => 0,
        ]);
        $this->assertSame([], json_decode(file_get_contents($this->queueFile), true));
        $this->assertFileDoesNotExist($this->pendingFile);
        $this->assertDatabaseHas('brain_messages', ['brain' => 'USER', 'message' => 'hello']);
        $this->assertDatabaseHas('brain_messages', [
            'brain' => 'Architect',
            'message' => 'Hello! How can I help?',
        ]);
        Event::assertDispatched(BrainMessageBroadcast::class, function ($event): bool {
            return $event->brainName === 'Architect' && $event->message === 'Hello! How can I help?';
        });
    }

    public function test_classifier_normalizes_greeting_but_defaults_unknown_text_to_actionable(): void
    {
        $classifier = app(TaskIntentDiscernment::class);

        $this->assertSame(TaskIntentDiscernment::CASUAL, $classifier->decide("  HELLO! \n"));
        $this->assertSame(TaskIntentDiscernment::ACTIONABLE, $classifier->decide('make a new button'));
        $this->assertSame(TaskIntentDiscernment::ACTIONABLE, $classifier->decide('hello, can you make a new button?'));
    }

    public function test_client_routing_fields_cannot_select_casual_mode(): void
    {
        Event::fake();

        $response = $this->postJson('/api/brain/dispatch', [
            'task' => 'make a new button',
            'mode' => 'casual',
            'intent' => 'casual',
        ]);

        $response->assertOk()->assertJsonPath('mode', 'actionable');
        $this->assertCount(1, json_decode(file_get_contents($this->queueFile), true));
    }

    public function test_empty_task_is_rejected_even_with_an_attachment(): void
    {
        $response = $this->postJson('/api/brain/dispatch', [
            'task' => '',
            'images' => [$this->dataUrlForBytes(1)],
        ]);

        $response->assertUnprocessable();
        $this->assertSame([], json_decode(file_get_contents($this->queueFile), true));
        $this->assertFileDoesNotExist($this->pendingFile);
        $this->assertSame(0, BrainMessage::count());
    }

    public function test_task_text_length_boundary_is_enforced_before_side_effects(): void
    {
        foreach ([9999, 10000] as $length) {
            $response = $this->postJson('/api/brain/dispatch', ['task' => str_repeat('a', $length)]);
            $response->assertOk();
            file_put_contents($this->queueFile, json_encode([]));
            @unlink($this->pendingFile);
            BrainMessage::query()->delete();
        }

        $response = $this->postJson('/api/brain/dispatch', ['task' => str_repeat('a', 10001)]);

        $response->assertUnprocessable();
        $this->assertSame([], json_decode(file_get_contents($this->queueFile), true));
        $this->assertFileDoesNotExist($this->pendingFile);
        $this->assertSame(0, BrainMessage::count());
    }

    public function test_attachment_count_and_decoded_size_boundaries_are_enforced(): void
    {
        $exactlyFiveMiB = $this->dataUrlForBytes(5 * 1024 * 1024);
        $exactlyTwentyMiB = array_fill(0, 4, $exactlyFiveMiB);

        $this->invokeImageValidation($exactlyTwentyMiB);

        $this->postJson('/api/brain/dispatch', [
            'task' => 'attach the files',
            'images' => [$this->dataUrlForBytes(1)],
        ])->assertOk();
        $this->assertCount(1, json_decode(file_get_contents($this->queueFile), true));

        file_put_contents($this->queueFile, json_encode([]));
        @unlink($this->pendingFile);
        BrainMessage::query()->delete();

        $this->postJson('/api/brain/dispatch', [
            'task' => 'too many files',
            'images' => array_fill(0, 6, $this->dataUrlForBytes(1)),
        ])->assertUnprocessable();
        $this->assertThrowsValidation([$this->dataUrlForBytes(5 * 1024 * 1024 + 1)], 'per-image limit');
        $this->assertThrowsValidation(array_merge($exactlyTwentyMiB, [$this->dataUrlForBytes(1)]), 'aggregate limit');

        $this->assertSame([], json_decode(file_get_contents($this->queueFile), true));
        $this->assertFileDoesNotExist($this->pendingFile);
        $this->assertSame(0, BrainMessage::count());
    }

    private function dataUrlForBytes(int $bytes): string
    {
        return 'data:image/png;base64,'.base64_encode(str_repeat('x', $bytes));
    }

    /**
     * Exercise the same preflight method without duplicating a 28 MiB JSON request body.
     *
     * @param  mixed  $images
     */
    private function invokeImageValidation($images): void
    {
        $reflection = new ReflectionClass(TaskDispatcherController::class);
        $method = $reflection->getMethod('validateImageInputs');
        $method->invoke(app(TaskDispatcherController::class), $images);
    }

    /**
     * @param  mixed  $images
     */
    private function assertThrowsValidation($images, string $label): void
    {
        try {
            $this->invokeImageValidation($images);
            $this->fail("Expected image validation to reject the input for $label.");
        } catch (ValidationException) {
            $this->assertTrue(true);
        }
    }
}
