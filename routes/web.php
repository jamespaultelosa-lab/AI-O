<?php

use App\Http\Controllers\BrainController;
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;
use App\Events\BrainStatusChanged;
use App\Events\BrainMessageBroadcast;

Route::get('/', [BrainController::class, 'index'])->name('brains.index');

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

    event(new BrainMessageBroadcast($request->brain, $request->message));

    return response()->json(['message' => 'Message broadcasted']);
});
