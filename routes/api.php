<?php

use App\Events\BrainMessageBroadcast;
use App\Events\BrainStatusChanged;
use App\Http\Controllers\BrainApprovalController;
use App\Http\Controllers\BrainConversationController;
use App\Http\Controllers\BrainTaskController;
use App\Http\Controllers\TaskDispatcherController;
use App\Models\BrainTask;
use App\Services\BrainApprovalStore;
use App\Services\BrainMessageStore;
use App\Services\BrainTaskStore;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/brain/dispatch', [TaskDispatcherController::class, 'dispatch']);
Route::get('/brain/history', [TaskDispatcherController::class, 'getHistory']);
Route::get('/brain/conversations', [BrainConversationController::class, 'index']);
Route::post('/brain/conversations', [BrainConversationController::class, 'store']);
Route::get('/brain/conversations/{conversation}/messages', [BrainConversationController::class, 'messages']);
Route::get('/brain/approvals', [BrainApprovalController::class, 'index']);
Route::get('/brain/approvals/{approvalId}', [BrainApprovalController::class, 'show']);
Route::post('/brain/approvals/{approvalId}', [BrainApprovalController::class, 'resolve']);
Route::get('/brain/tasks', [BrainTaskController::class, 'index']);
Route::get('/brain/tasks/{taskId}', [BrainTaskController::class, 'show']);
Route::post('/brain/tasks/{taskId}/cancel', [TaskDispatcherController::class, 'abortTask']);
Route::post('/brain/cancel', [TaskDispatcherController::class, 'abortTask']);
Route::get('/brain/memory', [TaskDispatcherController::class, 'getMemories']);

Route::post('/webhook/task-lifecycle', function (Request $request, BrainTaskStore $taskStore) {
    $validated = $request->validate([
        'task_id' => ['required', 'uuid'],
        'status' => ['required', 'in:assigned,running,approval_required,completed,failed,cancelled'],
        'phase' => ['nullable', 'string', 'max:120'],
        'brain' => ['nullable', 'string', 'max:120'],
        'reason' => ['nullable', 'string', 'max:300'],
    ]);

    $task = $taskStore->applyLifecycle(
        $validated['task_id'],
        $validated['status'],
        $validated['phase'] ?? null,
        $validated['brain'] ?? null,
        $validated['reason'] ?? null,
    );

    return response()->json(['id' => $task->id, 'status' => $task->status]);
});

Route::post('/webhook/brain-approval', function (Request $request, BrainApprovalStore $approvalStore, BrainTaskStore $taskStore, BrainMessageStore $messageStore) {
    $validated = $request->validate([
        'approval_id' => ['required', 'uuid'],
        'task_id' => ['required', 'uuid'],
        'brain' => ['required', 'string', 'max:120'],
        'type' => ['required', 'in:file_change,sandbox_access,workspace_command'],
    ]);

    $approval = $approvalStore->request($validated['approval_id'], $validated['task_id'], $validated['brain'], $validated['type']);
    $taskStore->applyLifecycle($approval->brain_task_id, 'approval_required', 'Approval required', $approval->requesting_brain, 'Waiting for a safe approval decision.');
    if ($approval->wasRecentlyCreated) {
        $message = $approval->summary.' [APPROVAL:'.$approval->id.']';
        $conversationId = $approval->task->brain_conversation_id;
        $record = $messageStore->record($approval->requesting_brain, $message, $conversationId);
        event(new BrainMessageBroadcast($approval->requesting_brain, $message, $record?->brain_conversation_id ?? $conversationId));
    }

    return response()->json(['id' => $approval->id, 'status' => $approval->status]);
});

Route::post('/webhook/brain-status', function (Request $request) {
    $request->validate([
        'brain' => 'required|string',
        'status' => 'required|string',
    ]);

    event(new BrainStatusChanged($request->brain, $request->status));

    return response()->json(['message' => 'Event broadcasted']);
});

Route::post('/webhook/brain-message', function (Request $request, BrainMessageStore $messageStore) {
    $request->validate([
        'brain' => 'required|string',
        'message' => 'required|string',
        'task_id' => 'nullable|uuid|exists:brain_tasks,id',
    ]);

    $conversationId = $request->filled('task_id')
        ? optional(BrainTask::find($request->string('task_id')))->brain_conversation_id
        : null;
    $record = $messageStore->record($request->brain, $request->message, $conversationId);
    event(new BrainMessageBroadcast($request->brain, $request->message, $record?->brain_conversation_id ?? $conversationId));

    return response()->json(['message' => 'Message broadcasted']);
});
