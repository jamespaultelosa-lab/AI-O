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
        
        $heavyKeywords = ['build', 'architecture', 'database', 'refactor', 'system', 'audit', 'redesign'];
        $mediumKeywords = ['fix', 'add', 'create', 'update', 'implement', 'feature', 'change', 'plan'];
        
        $heavyScore = 0;
        $mediumScore = 0;
        
        foreach ($heavyKeywords as $keyword) {
            if (str_contains($taskText, $keyword)) {
                $heavyScore++;
            }
        }
        
        foreach ($mediumKeywords as $keyword) {
            if (str_contains($taskText, $keyword)) {
                $mediumScore++;
            }
        }
        
        // Heavy difficulty task
        if ($wordCount > 60 || $heavyScore >= 2) {
            return 'opus';
        }
        
        // Medium difficulty task
        if ($wordCount > 20 || $heavyScore > 0 || $mediumScore >= 2) {
            return 'gemini 3.1 pro(high)';
        }
        
        // Default light task
        return 'gemini 3.6 flash(high)';
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

        $images = [];
        $rawImages = $request->input('images', []);

        if (is_array($rawImages) && count($rawImages) > 0) {
            $storageDir = storage_path('app/public/brain_attachments');
            if (!file_exists($storageDir)) {
                mkdir($storageDir, 0755, true);
            }

            foreach ($rawImages as $rawImg) {
                if (is_string($rawImg) && preg_match('/^data:image\/(\w+);base64,/', $rawImg, $type)) {
                    $data = substr($rawImg, strpos($rawImg, ',') + 1);
                    $data = base64_decode($data);
                    $ext = strtolower($type[1]);
                    if (!in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'])) {
                        $ext = 'png';
                    }
                    $filename = 'attach_' . uniqid() . '_' . time() . '.' . $ext;
                    $filePath = $storageDir . '/' . $filename;
                    file_put_contents($filePath, $data);
                    $images[] = asset('storage/brain_attachments/' . $filename);
                } elseif (is_string($rawImg) && (str_starts_with($rawImg, 'http') || str_starts_with($rawImg, '/storage/'))) {
                    $images[] = $rawImg;
                }
            }
        }

        $taskMessageWithImages = $task;
        if (count($images) > 0) {
            $taskMessageWithImages .= ' [IMAGES: ' . implode(' :: ', $images) . ']';
        }

        $newTaskPayload = [
            'task' => $taskMessageWithImages,
            'raw_task' => $task,
            'images' => $images,
            'assigned_model' => $assignedModel,
            'timestamp' => now()->toIso8601String()
        ];

        // 1. Manage task queue file (.agents/task_queue.json)
        $queueFile = base_path('.agents/task_queue.json');
        $queue = [];
        if (file_exists($queueFile)) {
            $content = file_get_contents($queueFile);
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                $queue = $decoded;
            }
        }

        $queue[] = $newTaskPayload;
        file_put_contents($queueFile, json_encode($queue, JSON_PRETTY_PRINT));

        // 2. Also write to pending_task.json for instant pickup if queue was empty
        $pendingFile = base_path('.agents/pending_task.json');
        if (!file_exists($pendingFile) || count($queue) === 1) {
            file_put_contents($pendingFile, json_encode($newTaskPayload, JSON_PRETTY_PRINT));
        }

        // Save USER message to database
        BrainMessage::create([
            'brain' => 'USER',
            'message' => $taskMessageWithImages
        ]);

        $queueCount = count($queue);
        $queueNote = $queueCount > 1 ? " (Queued as #$queueCount)" : "";

        // Broadcast acknowledgment
        $systemMsg = "**Task Received: \"$task\" [Routed to: $assignedModel]$queueNote**";
        BrainMessage::create([
            'brain' => 'SYSTEM',
            'message' => $systemMsg
        ]);
        event(new BrainMessageBroadcast('SYSTEM', $systemMsg));

        return response()->json([
            'status' => 'success',
            'message' => 'Task dispatched successfully',
            'task' => $task,
            'assigned_model' => $assignedModel,
            'queue_position' => $queueCount
        ]);
    }

    public function abortTask(Request $request)
    {
        // 1. Empty the task queue file
        $queueFile = base_path('.agents/task_queue.json');
        file_put_contents($queueFile, json_encode([]));

        // 2. Remove pending task file and speaking lock
        $pendingFile = base_path('.agents/pending_task.json');
        if (file_exists($pendingFile)) {
            @unlink($pendingFile);
        }

        $lockFile = base_path('.agents/speaking.lock');
        if (file_exists($lockFile)) {
            @unlink($lockFile);
        }

        // 3. Reset DB statuses and broadcast idle state for all personas
        $brains = ['Architect', 'Senior_Dev', 'Junior_Dev', 'Security'];
        foreach ($brains as $b) {
            \App\Models\BrainStatus::updateOrCreate(
                ['name' => $b],
                ['status' => 'idle', 'current_task' => null]
            );
            event(new \App\Events\BrainStatusBroadcast($b, 'idle', null));
        }

        // 4. Log and broadcast cancellation notification
        $abortMsg = "[Senior_Dev]: Task execution interrupted and queue cleared by user.";
        BrainMessage::create([
            'brain' => 'Senior_Dev',
            'message' => $abortMsg
        ]);
        event(new BrainMessageBroadcast('Senior_Dev', $abortMsg));

        return response()->json([
            'status' => 'success',
            'message' => 'Task queue cleared and execution aborted successfully'
        ]);
    }

    public function getQueueStatus()
    {
        $queueFile = base_path('.agents/task_queue.json');
        $queue = [];
        if (file_exists($queueFile)) {
            $content = file_get_contents($queueFile);
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                $queue = $decoded;
            }
        }
        return response()->json([
            'queue' => $queue,
            'count' => count($queue)
        ]);
    }

    public function getHistory()
    {
        $messages = BrainMessage::latest()
            ->take(30)
            ->get()
            ->reverse()
            ->values();
        return response()->json($messages);
    }
}
