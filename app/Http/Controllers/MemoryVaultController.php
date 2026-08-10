<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

class MemoryVaultController extends Controller
{
    private string $mistakesLogPath = 'C:\\Users\\ICTDO-James\\Documents\\Fais Project\\FAIS\\FAIS Payroll Documentation\\Senior Dev Brain\\Lessons & Memory\\Mistakes Log.md';

    public function getMemories()
    {
        if (!File::exists($this->mistakesLogPath)) {
            return response()->json(['memories' => []]);
        }

        $content = File::get($this->mistakesLogPath);
        $memories = $this->parseMistakesLog($content);

        $memories = array_slice($memories, 0, 30); // Keep top 30 latest memories

        return response()->json([
            'status' => 'success',
            'memories' => $memories
        ]);
    }

    private function parseMistakesLog(string $markdown): array
    {
        $memories = [];
        $sections = preg_split('/^##\s+(MST-\d+.*)$/m', $markdown, -1, PREG_SPLIT_DELIM_CAPTURE);

        for ($i = 1; $i < count($sections); $i += 2) {
            $headerLine = trim($sections[$i]);
            $body = trim($sections[$i + 1] ?? '');

            // Header format: MST-001: Tax Summary Card Not Updating (2026-08-05)
            preg_match('/^(MST-\d+):\s*(.*?)(?:\s*\((.*?)\))?$/', $headerLine, $headerMatches);

            $id = $headerMatches[1] ?? 'MST-???';
            $title = $headerMatches[2] ?? $headerLine;
            $date = $headerMatches[3] ?? '2026-08-10';

            // Extract bullet fields
            $whatHappened = $this->extractField($body, 'What happened:');
            $rootCause    = $this->extractField($body, 'Root cause:');
            $fix          = $this->extractField($body, 'Fix Required:') ?: $this->extractField($body, 'Fix:');
            $lesson       = $this->extractField($body, 'Lesson:');

            $memories[] = [
                'id' => $id,
                'title' => $title,
                'date' => $date,
                'what_happened' => $whatHappened,
                'root_cause' => $rootCause,
                'fix' => $fix,
                'lesson' => $lesson,
                'severity' => $this->inferSeverity($id, $title, $body)
            ];
        }

        return array_reverse($memories); // Newest memories first
    }

    private function extractField(string $body, string $prefix): string
    {
        if (preg_match('/\*\*' . preg_quote($prefix, '/') . '\*\*\s*(.*)$/m', $body, $m)) {
            return trim($m[1]);
        }
        return '';
    }

    private function inferSeverity(string $id, string $title, string $body): string
    {
        $text = strtolower($title . ' ' . $body);
        if (str_contains($text, 'under-withholding') || str_contains($text, 'critical') || str_contains($text, 'train law')) {
            return 'CRITICAL';
        }
        if (str_contains($text, 'broken') || str_contains($text, 'discarded') || str_contains($text, 'high')) {
            return 'HIGH';
        }
        return 'MEDIUM';
    }
}
