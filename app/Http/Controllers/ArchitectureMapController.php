<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

class ArchitectureMapController extends Controller
{
    private string $mapPath = 'C:\\Projects\\AI-O\\.agents\\architecture_map.json';

    public function getArchitecture()
    {
        if (!File::exists($this->mapPath)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Architecture map file not found.'
            ], 404);
        }

        $jsonContent = File::get($this->mapPath);
        $data = json_decode($jsonContent, true);

        return response()->json([
            'status' => 'success',
            'data' => $data
        ]);
    }
}
