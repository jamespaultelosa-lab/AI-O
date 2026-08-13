<?php

namespace App\Http\Controllers;

use App\Models\BrainTask;
use Illuminate\Http\Request;

class BrainTaskController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 20), 1), 50);
        $tasks = BrainTask::query()->latest()->paginate($perPage);

        return response()->json([
            'data' => $tasks->getCollection()->map(fn (BrainTask $task) => $this->taskPayload($task)),
            'meta' => [
                'current_page' => $tasks->currentPage(),
                'last_page' => $tasks->lastPage(),
                'per_page' => $tasks->perPage(),
                'total' => $tasks->total(),
            ],
        ]);
    }

    public function show(string $taskId)
    {
        $task = BrainTask::findOrFail($taskId);

        return response()->json([
            'task' => $this->taskPayload($task),
            'events' => $task->events()->latest()->get()->map(fn ($event) => [
                'id' => $event->id,
                'type' => $event->type,
                'phase' => $event->phase,
                'brain' => $event->brain,
                'summary' => $event->summary,
                'created_at' => $event->created_at?->toIso8601String(),
            ]),
            'approvals' => $task->approvals()->latest()->get()->map(fn ($approval) => [
                'id' => $approval->id,
                'requesting_brain' => $approval->requesting_brain,
                'type' => $approval->type,
                'summary' => $approval->summary,
                'status' => $approval->status,
                'expires_at' => $approval->expires_at?->toIso8601String(),
                'resolved_at' => $approval->resolved_at?->toIso8601String(),
            ]),
        ]);
    }

    private function taskPayload(BrainTask $task): array
    {
        $elapsedSeconds = $task->started_at?->diffInSeconds($task->completed_at ?? now());

        return [
            'id' => $task->id,
            'display_summary' => $task->display_summary,
            'assigned_brain' => $task->assigned_brain,
            'assigned_model' => $task->assigned_model,
            'status' => $task->status,
            'safe_phase' => $task->safe_phase,
            'queue_position' => $task->queue_position,
            'terminal_reason' => $task->terminal_reason,
            'started_at' => $task->started_at?->toIso8601String(),
            'completed_at' => $task->completed_at?->toIso8601String(),
            'elapsed_seconds' => $elapsedSeconds,
            'created_at' => $task->created_at?->toIso8601String(),
        ];
    }
}
