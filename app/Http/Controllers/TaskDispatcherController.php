<?php

namespace App\Http\Controllers;

use App\Events\BrainMessageBroadcast;
use App\Models\BrainTask;
use App\Services\BrainMessageStore;
use App\Services\BrainTaskStore;
use App\Services\TaskIntentDiscernment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class TaskDispatcherController extends Controller
{
    public const DISPLAY_TASK_MAX_LENGTH = 10000;

    public const TRANSPORT_TASK_MAX_LENGTH = 10000;

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
            return 'gpt-5.6-sol (high)';
        }

        // Medium difficulty task
        if ($wordCount > 20 || $heavyScore > 0 || $mediumScore >= 2) {
            return 'gpt-5.6-terra (medium)';
        }

        // Default light task
        return 'gpt-5.6-terra (low)';
    }

    public function dispatch(Request $request, TaskIntentDiscernment $intentDiscernment, BrainMessageStore $messageStore, BrainTaskStore $taskStore)
    {
        $validated = $request->validate([
            // Older API clients send one `task` field. Keep that contract while
            // allowing newer clients to provide a display-safe task separately.
            'display_task' => ['nullable', 'string', 'min:1', 'max:'.self::DISPLAY_TASK_MAX_LENGTH],
            'task' => ['required', 'string', 'min:1', 'max:'.self::TRANSPORT_TASK_MAX_LENGTH],
            'images' => ['sometimes', 'array', 'max:'.self::MAX_IMAGES],
            'conversation_id' => ['nullable', 'uuid', 'exists:brain_conversations,id'],
        ]);

        $transportTask = $validated['task'];
        $displayTask = $validated['display_task'] ?? $transportTask;
        $rawImages = $validated['images'] ?? [];
        $conversationId = $validated['conversation_id'] ?? $messageStore->historyConversation()->id;
        $this->validateImageInputs($rawImages);

        $intent = $intentDiscernment->decide($displayTask);
        $isGroupAddress = preg_match('/\b(guys|everyone|team|bois|brains|all)\b/ui', $displayTask) === 1;
        if ($intent === TaskIntentDiscernment::CASUAL && ! $isGroupAddress && count($rawImages) === 0) {
            $messageStore->record('USER', $displayTask, $conversationId);

            $casualResponse = 'Hello! How can I help?';
            $responseMessage = $messageStore->record('Architect', $casualResponse, $conversationId);
            event(new BrainMessageBroadcast('Architect', $casualResponse, $responseMessage?->brain_conversation_id ?? $conversationId));

            return response()->json([
                'status' => 'success',
                'mode' => TaskIntentDiscernment::CASUAL,
                'task' => $displayTask,
                'queue_position' => 0,
            ]);
        }

        if (trim(strtolower($displayTask)) === '/evolve-skills') {
            $messageStore->record('USER', $displayTask, $conversationId);
            $responseMessage = $messageStore->record('Senior_Dev', 'Initiating FAIS Brains Manual Evolution sequence...', $conversationId);
            event(new BrainMessageBroadcast('Senior_Dev', 'Initiating FAIS Brains Manual Evolution sequence...', $responseMessage?->brain_conversation_id ?? $conversationId));

            // Launch the script in the background
            $scriptPath = base_path('.agents/evolve_skills.cjs');
            if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                pclose(popen("start /B node {$scriptPath} > NUL 2>&1", "r"));
            } else {
                exec("node {$scriptPath} > /dev/null 2>&1 &");
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Evolution sequence started',
                'mode' => TaskIntentDiscernment::CASUAL,
                'task' => $displayTask,
                'queue_position' => 0,
            ]);
        }

        $assignedModel = $this->analyzeTaskComplexity($displayTask);

        // Log the task
        Log::info('Task dispatched from F.A.I.S. Command Center: '.$displayTask.' [Model: '.$assignedModel.']');

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

        $queuePosition = count($queue) + 1;
        $brainTask = $taskStore->create($displayTask, $assignedModel, $queuePosition, $conversationId);
        $newTaskPayload = [
            'task_id' => $brainTask->id,
            'conversation_id' => $conversationId,
            'display_task' => $displayTask,
            'transport_task' => $transportTask,
            'images' => $images,
            'assigned_model' => $assignedModel,
            'timestamp' => now()->toIso8601String(),
        ];
        $queue[] = $newTaskPayload;
        file_put_contents($queueFile, json_encode($queue, JSON_PRETTY_PRINT));

        // Also write a pending payload for instant pickup when the queue was empty.
        $pendingFile = $this->agentIpcPath('pending_task.json');
        if (! file_exists($pendingFile) || count($queue) === 1) {
            file_put_contents($pendingFile, json_encode($newTaskPayload, JSON_PRETTY_PRINT));
        }

        // Save USER message to database
        $messageStore->record('USER', $displayTask, $conversationId);

        $queueCount = count($queue);

        // The watcher publishes safe, phase-level activity updates as it works.
        // Do not echo the submitted task in a SYSTEM message: it can be sensitive
        // and it does not tell the user which phase is currently running.

        return response()->json([
            'status' => 'success',
            'message' => 'Task dispatched successfully',
            'mode' => TaskIntentDiscernment::ACTIONABLE,
            'task' => $displayTask,
            'assigned_model' => $assignedModel,
            'task_id' => $brainTask->id,
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

    public function abortTask(Request $request, BrainMessageStore $messageStore, BrainTaskStore $taskStore, ?string $taskId = null)
    {
        $requestedTaskId = $taskId ?? $request->input('task_id');
        if ($requestedTaskId !== null && ! is_string($requestedTaskId)) {
            throw ValidationException::withMessages(['task_id' => 'Invalid task ID.']);
        }

        $tasks = $requestedTaskId !== null
            ? BrainTask::query()->whereKey($requestedTaskId)->get()
            : BrainTask::query()->whereIn('status', [
                BrainTask::QUEUED,
                BrainTask::ASSIGNED,
                BrainTask::RUNNING,
                BrainTask::APPROVAL_REQUIRED,
            ])->get();
        if ($requestedTaskId !== null && $tasks->isEmpty()) {
            abort(404);
        }

        $activeTaskIds = $tasks->filter(fn ($task) => in_array($task->status, [BrainTask::ASSIGNED, BrainTask::RUNNING, BrainTask::APPROVAL_REQUIRED], true))->pluck('id')->all();
        foreach ($tasks as $task) {
            $taskStore->cancel($task);
        }

        // Remove only cancelled entries. A task-specific cancellation must not
        // discard unrelated queued work.
        $queueFile = $this->agentIpcPath('task_queue.json');
        $queue = file_exists($queueFile) ? json_decode(file_get_contents($queueFile), true) : [];
        $queue = is_array($queue) ? $queue : [];
        $cancelledIds = $tasks->pluck('id')->all();
        $queue = array_values(array_filter($queue, fn ($payload) => ! is_array($payload) || ! in_array($payload['task_id'] ?? null, $cancelledIds, true)));
        file_put_contents($queueFile, json_encode($queue, JSON_PRETTY_PRINT), LOCK_EX);

        // Only an active task needs an interruption signal.
        if ($requestedTaskId === null || $activeTaskIds !== []) {
            $abortFile = $this->agentIpcPath('abort_task.json');
            file_put_contents($abortFile, json_encode(['task_ids' => $activeTaskIds, 'timestamp' => now()->toIso8601String()]), LOCK_EX);
        }

        // Remove the pending payload only when it belongs to a cancelled task.
        $pendingFile = $this->agentIpcPath('pending_task.json');
        $pending = file_exists($pendingFile) ? json_decode(file_get_contents($pendingFile), true) : null;
        if (is_array($pending) && in_array($pending['task_id'] ?? null, $cancelledIds, true)) {
            @unlink($pendingFile);
        }

        $lockFile = $this->agentIpcPath('speaking.lock');
        if (($requestedTaskId === null || $activeTaskIds !== []) && file_exists($lockFile)) {
            @unlink($lockFile);
        }

        // Log only a safe cancellation outcome, never task transport text. A
        // cancellation may cover tasks from more than one chat, so publish one
        // scoped message per affected conversation instead of leaking it into
        // the default history stream.
        $abortMsg = '[Senior_Dev]: Task cancellation recorded.';
        $tasks->pluck('brain_conversation_id')->filter()->unique()->each(function (string $conversationId) use ($messageStore, $abortMsg): void {
            $record = $messageStore->record('Senior_Dev', $abortMsg, $conversationId);
            event(new BrainMessageBroadcast('Senior_Dev', $abortMsg, $record?->brain_conversation_id ?? $conversationId));
        });

        return response()->json([
            'status' => 'success',
            'message' => 'Task cancellation recorded successfully',
            'cancelled_task_ids' => $cancelledIds,
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

    public function getEngine(): \Illuminate\Http\JsonResponse
    {
        $stateFile = $this->agentIpcPath('agent_state.json');
        $engine = 'codex';
        if (file_exists($stateFile)) {
            $data = json_decode(file_get_contents($stateFile), true);
            if (isset($data['active_engine'])) {
                $engine = $data['active_engine'];
            }
        }
        return response()->json(['engine' => $engine]);
    }

    public function setEngine(Request $request): \Illuminate\Http\JsonResponse
    {
        $validated = $request->validate([
            'engine' => 'required|string|in:codex,antigravity',
        ]);

        $stateFile = $this->agentIpcPath('agent_state.json');
        $state = [];
        if (file_exists($stateFile)) {
            $state = json_decode(file_get_contents($stateFile), true) ?: [];
        }
        $state['active_engine'] = $validated['engine'];
        $state['updated_at'] = now()->toISOString();
        file_put_contents($stateFile, json_encode($state, JSON_PRETTY_PRINT));

        return response()->json(['engine' => $validated['engine'], 'status' => 'success']);
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

