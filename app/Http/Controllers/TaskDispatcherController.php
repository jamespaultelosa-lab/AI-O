<?php

namespace App\Http\Controllers;

use App\Events\BrainMessageBroadcast;
use App\Events\BrainStatusBroadcast;
use App\Models\BrainStatus;
use App\Services\BrainMessageStore;
use App\Services\TaskIntentDiscernment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class TaskDispatcherController extends Controller
{
    public const TASK_TEXT_MAX_LENGTH = 10000;

    private const MAX_IMAGES = 5;

    private const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

    private const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

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

    public function dispatch(Request $request, TaskIntentDiscernment $intentDiscernment, BrainMessageStore $messageStore)
    {
        $request->validate([
            'task' => ['required', 'string', 'max:'.self::TASK_TEXT_MAX_LENGTH],
            'images' => ['sometimes', 'array', 'max:'.self::MAX_IMAGES],
        ]);

        $task = $request->input('task');
        $rawImages = $request->input('images', []);
        $this->validateImageInputs($rawImages);

        $intent = $intentDiscernment->decide($task);
        if ($intent === TaskIntentDiscernment::CASUAL && count($rawImages) === 0) {
            $messageStore->record('USER', $task);

            $casualResponse = 'Hello! How can I help?';
            $messageStore->record('Architect', $casualResponse);
            event(new BrainMessageBroadcast('Architect', $casualResponse));

            return response()->json([
                'status' => 'success',
                'mode' => TaskIntentDiscernment::CASUAL,
                'task' => $task,
                'queue_position' => 0,
            ]);
        }

        $assignedModel = $this->analyzeTaskComplexity($task);

        // Log the task
        Log::info('Task dispatched from F.A.I.S. Command Center: '.$task.' [Model: '.$assignedModel.']');

        $images = [];
        if (is_array($rawImages) && count($rawImages) > 0) {
            $storageDir = storage_path('app/public/brain_attachments');
            if (! file_exists($storageDir)) {
                mkdir($storageDir, 0755, true);
            }

            foreach ($rawImages as $rawImg) {
                if (is_string($rawImg) && preg_match('/^data:image\/(\w+);base64,/', $rawImg, $type)) {
                    $data = substr($rawImg, strpos($rawImg, ',') + 1);
                    $data = base64_decode($data, true);
                    $ext = strtolower($type[1]);
                    if (! in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'])) {
                        $ext = 'png';
                    }
                    $filename = 'attach_'.uniqid().'_'.time().'.'.$ext;
                    $filePath = $storageDir.'/'.$filename;
                    file_put_contents($filePath, $data);
                    $images[] = asset('storage/brain_attachments/'.$filename);
                } elseif (is_string($rawImg) && (str_starts_with($rawImg, 'http') || str_starts_with($rawImg, '/storage/'))) {
                    $images[] = $rawImg;
                }
            }
        }

        $taskMessageWithImages = $task;
        if (count($images) > 0) {
            $taskMessageWithImages .= ' [IMAGES: '.implode(' :: ', $images).']';
        }

        $newTaskPayload = [
            'task' => $taskMessageWithImages,
            'raw_task' => $task,
            'images' => $images,
            'assigned_model' => $assignedModel,
            'timestamp' => now()->toIso8601String(),
        ];

        // Keep browser-to-watcher IPC in Laravel's writable storage area.
        $queueFile = $this->agentIpcPath('task_queue.json');
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

        // Also write a pending payload for instant pickup when the queue was empty.
        $pendingFile = $this->agentIpcPath('pending_task.json');
        if (! file_exists($pendingFile) || count($queue) === 1) {
            file_put_contents($pendingFile, json_encode($newTaskPayload, JSON_PRETTY_PRINT));
        }

        // Save USER message to database
        $messageStore->record('USER', $taskMessageWithImages);

        $queueCount = count($queue);
        $queueNote = $queueCount > 1 ? " (Queued as #$queueCount)" : '';

        // Broadcast acknowledgment
        $systemMsg = "**Task Received: \"$task\" [Routed to: $assignedModel]$queueNote**";
        $messageStore->record('SYSTEM', $systemMsg);
        event(new BrainMessageBroadcast('SYSTEM', $systemMsg));

        return response()->json([
            'status' => 'success',
            'message' => 'Task dispatched successfully',
            'mode' => TaskIntentDiscernment::ACTIONABLE,
            'task' => $task,
            'assigned_model' => $assignedModel,
            'queue_position' => $queueCount,
        ]);
    }

    /**
     * Validate every attachment before creating directories, files, messages, or IPC payloads.
     *
     * @param  mixed  $rawImages
     */
    private function validateImageInputs($rawImages): void
    {
        if (! is_array($rawImages)) {
            return;
        }

        $totalDecodedBytes = 0;
        foreach ($rawImages as $index => $rawImage) {
            if (! is_string($rawImage)) {
                throw ValidationException::withMessages([
                    "images.$index" => 'Each image must be a string.',
                ]);
            }

            if (preg_match('/^data:image\/([a-z0-9.+-]+);base64,(.*)$/is', $rawImage, $matches) === 1) {
                $encoded = $matches[2];
                $maximumEncodedLength = (int) ceil(self::MAX_IMAGE_BYTES / 3) * 4 + 4;
                if (strlen($encoded) > $maximumEncodedLength) {
                    throw ValidationException::withMessages([
                        "images.$index" => 'Each decoded image must be 5 MiB or smaller.',
                    ]);
                }

                $padding = str_ends_with($encoded, '==') ? 2 : (str_ends_with($encoded, '=') ? 1 : 0);
                $estimatedDecodedBytes = intdiv(strlen($encoded) * 3, 4) - $padding;
                if ($estimatedDecodedBytes > self::MAX_IMAGE_BYTES) {
                    throw ValidationException::withMessages([
                        "images.$index" => 'Each decoded image must be 5 MiB or smaller.',
                    ]);
                }

                $decoded = base64_decode($encoded, true);
                if ($decoded === false) {
                    throw ValidationException::withMessages([
                        "images.$index" => 'Each image must contain valid base64 data.',
                    ]);
                }

                $decodedBytes = strlen($decoded);
                if ($decodedBytes > self::MAX_IMAGE_BYTES) {
                    throw ValidationException::withMessages([
                        "images.$index" => 'Each decoded image must be 5 MiB or smaller.',
                    ]);
                }

                $totalDecodedBytes += $decodedBytes;
                if ($totalDecodedBytes > self::MAX_TOTAL_IMAGE_BYTES) {
                    throw ValidationException::withMessages([
                        'images' => 'Decoded image data must total 20 MiB or less.',
                    ]);
                }
            } elseif (! str_starts_with($rawImage, 'http') && ! str_starts_with($rawImage, '/storage/')) {
                throw ValidationException::withMessages([
                    "images.$index" => 'Each image must be a data URL or an existing storage URL.',
                ]);
            }
        }
    }

    public function abortTask(Request $request, BrainMessageStore $messageStore)
    {
        // 1. Empty the task queue file
        $queueFile = $this->agentIpcPath('task_queue.json');
        file_put_contents($queueFile, json_encode([]));

        // 2. Remove pending task file and speaking lock
        $pendingFile = $this->agentIpcPath('pending_task.json');
        if (file_exists($pendingFile)) {
            @unlink($pendingFile);
        }

        $lockFile = $this->agentIpcPath('speaking.lock');
        if (file_exists($lockFile)) {
            @unlink($lockFile);
        }

        // 3. Reset DB statuses and broadcast idle state for all personas
        $brains = ['Architect', 'Senior_Dev', 'Junior_Dev', 'Security'];
        foreach ($brains as $b) {
            BrainStatus::updateOrCreate(
                ['name' => $b],
                ['status' => 'idle', 'current_task' => null]
            );
            event(new BrainStatusBroadcast($b, 'idle', null));
        }

        // 4. Log and broadcast cancellation notification
        $abortMsg = '[Senior_Dev]: Task execution interrupted and queue cleared by user.';
        $messageStore->record('Senior_Dev', $abortMsg);
        event(new BrainMessageBroadcast('Senior_Dev', $abortMsg));

        return response()->json([
            'status' => 'success',
            'message' => 'Task queue cleared and execution aborted successfully',
        ]);
    }

    public function getQueueStatus()
    {
        $queueFile = $this->agentIpcPath('task_queue.json');
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
            'count' => count($queue),
        ]);
    }

    public function getHistory(BrainMessageStore $messageStore)
    {
        return response()->json($messageStore->recent());
    }

    private function agentIpcPath(string $filename): string
    {
        $directory = storage_path('app/agent_ipc');
        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        return $directory.DIRECTORY_SEPARATOR.$filename;
    }
}
