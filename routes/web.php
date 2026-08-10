<?php

use App\Http\Controllers\BrainController;
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;
use App\Events\BrainStatusChanged;
use App\Events\BrainMessageBroadcast;

Route::get('/', [BrainController::class, 'index'])->name('brains.index');

Route::get('/api/brain/memory', [\App\Http\Controllers\MemoryVaultController::class, 'getMemories']);
Route::get('/api/brain/architecture', [\App\Http\Controllers\ArchitectureMapController::class, 'getArchitecture']);

Route::post('/webhook/brain-status', function (Request $request) {
    $request->validate([
        'brain' => 'required|string',
        'status' => 'required|string'
    ]);

    // Fire the broadcast event
    event(new BrainStatusChanged($request->brain, $request->status));

    return response()->json(['message' => 'Event broadcasted']);
});

Route::post('/webhook/brain-message', function (Request $request) {
    $request->validate([
        'brain' => 'required|string',
        'message' => 'required|string'
    ]);

    \App\Models\BrainMessage::create([
        'brain' => $request->brain,
        'message' => $request->message
    ]);

    event(new BrainMessageBroadcast($request->brain, $request->message));

    return response()->json(['message' => 'Message broadcasted']);
});
