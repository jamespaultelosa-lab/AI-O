<?php

namespace Tests\Feature;

use App\Models\BrainTask;
use App\Services\BrainTaskStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use Tests\TestCase;

class BrainTaskLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_lifecycle_is_atomic_safe_and_ignores_late_terminal_updates(): void
    {
        $store = app(BrainTaskStore::class);
        $task = $store->create('Deploy with token=super-secret-value', 'gpt-5.6-terra', 1);

        $this->assertSame(BrainTask::QUEUED, $task->status);
        $this->assertSame('Deploy with [redacted]', $task->display_summary);
        $this->assertDatabaseHas('brain_task_events', ['brain_task_id' => $task->id, 'type' => BrainTask::QUEUED]);

        $store->assign($task, 'Senior_Dev');
        $store->start($task, 'Senior_Dev');
        $store->requireApproval($task, 'Security', 'Approval required', 'Review token=another-secret');
        $cancelled = $store->cancel($task);
        $lateCompletion = $store->complete($task, 'Senior_Dev', 'completed');

        $this->assertSame(BrainTask::CANCELLED, $cancelled->status);
        $this->assertSame(BrainTask::CANCELLED, $lateCompletion->status);
        $this->assertSame(5, $task->events()->count());
        $this->assertDatabaseMissing('brain_task_events', ['summary' => 'Review token=another-secret']);
    }

    public function test_invalid_transition_is_rejected(): void
    {
        $task = app(BrainTaskStore::class)->create('Safe display task', 'gpt-5.6-terra', 1);

        $this->expectException(LogicException::class);
        app(BrainTaskStore::class)->complete($task);
    }

    public function test_task_api_returns_only_safe_lifecycle_fields(): void
    {
        $task = app(BrainTaskStore::class)->create('Build dashboard with secret=do-not-return', 'gpt-5.6-terra', 2);

        $this->getJson('/api/brain/tasks?per_page=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonMissing(['transport_task'])
            ->assertJsonMissing(['do-not-return']);

        $this->getJson('/api/brain/tasks/'.$task->id)
            ->assertOk()
            ->assertJsonPath('task.status', BrainTask::QUEUED)
            ->assertJsonPath('events.0.type', BrainTask::QUEUED)
            ->assertJsonMissing(['do-not-return']);
    }

    public function test_engine_api_can_get_and_set_active_engine(): void
    {
        $this->getJson('/api/brain/engine')
            ->assertOk()
            ->assertJsonStructure(['engine']);

        $this->postJson('/api/brain/engine', ['engine' => 'antigravity'])
            ->assertOk()
            ->assertJson(['engine' => 'antigravity', 'status' => 'success']);

        $this->getJson('/api/brain/engine')
            ->assertOk()
            ->assertJson(['engine' => 'antigravity']);

        // Toggle back to codex
        $this->postJson('/api/brain/engine', ['engine' => 'codex'])
            ->assertOk()
            ->assertJson(['engine' => 'codex', 'status' => 'success']);
    }
}

