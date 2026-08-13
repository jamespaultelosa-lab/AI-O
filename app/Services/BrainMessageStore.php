<?php

namespace App\Services;

use App\Models\BrainMessage;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class BrainMessageStore
{
    public function record(string $brain, string $message): void
    {
        try {
            BrainMessage::create([
                'brain' => $brain,
                'message' => $message,
            ]);
        } catch (QueryException) {
            $records = $this->fallbackRecords();
            $now = now()->toIso8601String();
            $records[] = [
                'id' => (string) Str::uuid(),
                'brain' => $brain,
                'message' => $message,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            File::put($this->fallbackPath(), json_encode($records, JSON_PRETTY_PRINT), true);
        }
    }

    public function recent(int $limit = 30): array
    {
        try {
            return BrainMessage::latest()
                ->take($limit)
                ->get()
                ->reverse()
                ->values()
                ->map(fn (BrainMessage $message) => $message->toArray())
                ->all();
        } catch (QueryException) {
            return array_slice($this->fallbackRecords(), -$limit);
        }
    }

    private function fallbackPath(): string
    {
        return storage_path('app/brain_messages_fallback.json');
    }

    private function fallbackRecords(): array
    {
        $path = $this->fallbackPath();
        if (! File::exists($path)) {
            return [];
        }

        $records = json_decode(File::get($path), true);

        return is_array($records) ? $records : [];
    }
}
