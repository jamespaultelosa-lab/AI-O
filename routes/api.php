<?php

use App\Http\Controllers\TaskDispatcherController;
use Illuminate\Support\Facades\Route;

Route::post('/brain/dispatch', [TaskDispatcherController::class, 'dispatch']);
