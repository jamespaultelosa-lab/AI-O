<?php

namespace App\Http\Controllers;

use App\Models\BrainTask;

class BrainTaskController extends Controller
{
    public function index()
    {
        return BrainTask::latest()->take(50)->get();
    }

    public function show(string $taskId)
    {
        $task = BrainTask::findOrFail($taskId);

        return response()->json([
            'task' => $task,
            'events' => $task->hasMany(\App\Models\BrainTaskEvent::class, 'brain_task_id')->latest()->get(),
            'approvals' => $task->hasMany(\App\Models\BrainApproval::class, 'brain_task_id')->latest()->get(),
        ]);
    }
}
