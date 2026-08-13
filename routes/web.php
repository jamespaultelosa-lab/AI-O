<?php

use App\Http\Controllers\BrainController;
use Illuminate\Support\Facades\Route;

Route::get('/', [BrainController::class, 'index'])->name('brains.index');

Route::post('/dispatch-task', [\App\Http\Controllers\TaskDispatcherController::class, 'dispatch']);
Route::post('/abort-task', [\App\Http\Controllers\TaskDispatcherController::class, 'abortTask']);
Route::get('/task-queue', [\App\Http\Controllers\TaskDispatcherController::class, 'getQueueStatus']);
Route::get('/history', [\App\Http\Controllers\TaskDispatcherController::class, 'getHistory']);
