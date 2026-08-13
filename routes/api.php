<?php

use App\Http\Controllers\TaskDispatcherController;
use App\Events\BrainMessageBroadcast;
use App\Events\BrainStatusChanged;
use App\Services\BrainMessageStore;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/brain/dispatch', [TaskDispatcherController::class, 'dispatch']);
Route::get('/brain/history', [TaskDispatcherController::class, 'getHistory']);
Route::post('/brain/approvals/{approvalId}', [TaskDispatcherController::class, 'resolveApproval']);

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
    ]);

    $messageStore->record($request->brain, $request->message);
    event(new BrainMessageBroadcast($request->brain, $request->message));

    return response()->json(['message' => 'Message broadcasted']);
});
