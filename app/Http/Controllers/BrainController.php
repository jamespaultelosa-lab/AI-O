<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Services\ObsidianVaultService;

class BrainController extends Controller
{
    public function index(ObsidianVaultService $vaultService)
    {
        $brains = $vaultService->getAllBrains();
        
        return Inertia::render('Brains/JarvisUI', [
            'brains' => $brains
        ]);
    }
}
