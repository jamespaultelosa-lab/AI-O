<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Events\BrainMessageBroadcast;

class TaskDispatcherController extends Controller
{
    public function dispatch(Request $request)
    {
        $request->validate([
            'task' => 'required|string'
        ]);

        $task = $request->input('task');

        // Log the task
        Log::info("Task dispatched from F.A.I.S. Command Center: " . $task);

        // Write task to pending file for IDE agent to pick up
        $pendingFile = base_path('../fais-brains/.agents/pending_task.json');
        file_put_contents($pendingFile, json_encode([
            'task' => $task,
            'timestamp' => now()->toIso8601String()
        ]));

        // Broadcast acknowledgment
        event(new BrainMessageBroadcast('SYSTEM', "Task Received: \"$task\". Forwarding to AI agent..."));

        return response()->json([
            'status' => 'success',
            'message' => 'Task dispatched successfully',
            'task' => $task
        ]);
    }
}
