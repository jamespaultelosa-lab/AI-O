<?php

use App\Http\Controllers\BrainController;
use Illuminate\Support\Facades\Route;

Route::get('/', [BrainController::class, 'index'])->name('brains.index');

Route::post('/dispatch-task', [\App\Http\Controllers\TaskDispatcherController::class, 'dispatch']);
Route::post('/abort-task', [\App\Http\Controllers\TaskDispatcherController::class, 'abortTask']);
Route::get('/task-queue', [\App\Http\Controllers\TaskDispatcherController::class, 'getQueueStatus']);
Route::get('/history', [\App\Http\Controllers\TaskDispatcherController::class, 'getHistory']);
Route::get('/api/brain/engine', [\App\Http\Controllers\TaskDispatcherController::class, 'getEngine']);
Route::post('/api/brain/engine', [\App\Http\Controllers\TaskDispatcherController::class, 'setEngine']);
Route::get('/api/brain/memory', [\App\Http\Controllers\TaskDispatcherController::class, 'getMemories']);

Route::get('/dashboard', function () {
    return \Inertia\Inertia::render('Dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [\App\Http\Controllers\ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [\App\Http\Controllers\ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [\App\Http\Controllers\ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';



