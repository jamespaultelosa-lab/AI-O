<?php

namespace App\Services;

use App\Models\BrainTask;
use App\Models\BrainTaskEvent;

class BrainTaskStore
{
    public function create(string $summary, string $model, int $queuePosition): BrainTask
    {
        $task = BrainTask::create(['display_summary' => str($summary)->squish()->limit(240), 'assigned_model' => $model, 'status' => 'queued', 'safe_phase' => 'Queued', 'queue_position' => $queuePosition]);
        $this->event($task, 'queued', 'Queued', null, 'Waiting for an available brain.');
        return $task;
    }

    public function event(BrainTask $task, string $type, ?string $phase = null, ?string $brain = null, ?string $summary = null): void
    {
        $task->update(['status' => $type, 'safe_phase' => $phase, 'assigned_brain' => $brain ?? $task->assigned_brain, 'started_at' => $type === 'running' ? now() : $task->started_at, 'completed_at' => in_array($type, ['completed', 'failed', 'cancelled'], true) ? now() : $task->completed_at]);
        BrainTaskEvent::create(['brain_task_id' => $task->id, 'type' => $type, 'phase' => $phase, 'brain' => $brain, 'summary' => $summary]);
    }
}
