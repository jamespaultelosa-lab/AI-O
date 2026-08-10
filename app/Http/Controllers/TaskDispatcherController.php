<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Events\BrainMessageBroadcast;
use App\Models\BrainMessage;

class TaskDispatcherController extends Controller
{
    private function analyzeTaskComplexity(string $taskText): string
    {
        $taskText = strtolower($taskText);
        $wordCount = str_word_count($taskText);
        
        $heavyKeywords = ['build', 'architecture', 'plan', 'database', 'refactor', 'implement', 'audit'];
        $lightKeywords = ['color', 'typo', 'css', 'text', 'fix', 'tweak', 'ui'];
        
        $heavyScore = 0;
        $lightScore = 0;
        
        foreach ($heavyKeywords as $keyword) {
            if (str_contains($taskText, $keyword)) {
                $heavyScore++;
            }
        }
        
        foreach ($lightKeywords as $keyword) {
            if (str_contains($taskText, $keyword)) {
                $lightScore++;
            }
        }
        
        if ($wordCount > 50 || $heavyScore > $lightScore) {
            return 'opus';
        }
        
        return 'gemini 3.1 pro(high)';
    }

    public function dispatch(Request $request)
    {
        $request->validate([
            'task' => 'required|string'
        ]);

        $task = $request->input('task');
        $assignedModel = $this->analyzeTaskComplexity($task);

        // Log the task
        Log::info("Task dispatched from F.A.I.S. Command Center: " . $task . " [Model: " . $assignedModel . "]");

        // Write task to pending file for IDE agent to pick up
        $pendingFile = base_path('.agents/pending_task.json');
        file_put_contents($pendingFile, json_encode([
            'task' => $task,
            'assigned_model' => $assignedModel,
            'timestamp' => now()->toIso8601String()
        ]));

        // Save USER message to database
        BrainMessage::create([
            'brain' => 'USER',
            'message' => $task
        ]);

        // Broadcast acknowledgment
        $systemMsg = "Task Received: \"$task\" [Routed to: $assignedModel]";
        BrainMessage::create([
            'brain' => 'SYSTEM',
            'message' => $systemMsg
        ]);
        event(new BrainMessageBroadcast('SYSTEM', $systemMsg));

        return response()->json([
            'status' => 'success',
            'message' => 'Task dispatched successfully',
            'task' => $task,
            'assigned_model' => $assignedModel
        ]);
    }

    public function getHistory()
    {
        $messages = BrainMessage::where('created_at', '>=', now()->subDays(3))
            ->latest()
            ->take(500)
            ->get()
            ->reverse()
            ->values();
        return response()->json($messages);
    }
}
