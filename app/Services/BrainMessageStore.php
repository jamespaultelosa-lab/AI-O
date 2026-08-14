<?php

namespace App\Services;

use App\Models\BrainConversation;
use App\Models\BrainMessage;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class BrainMessageStore
{
    public function record(string $brain, string $message, ?string $conversationId = null): ?BrainMessage
    {
        try {
            $conversationId ??= $this->historyConversation()->id;
            $record = BrainMessage::create([
                'brain' => $brain,
                'message' => $message,
                'brain_conversation_id' => $conversationId,
            ]);
            $conversation = $record->conversation;
            if ($conversation && $brain === 'USER' && ! $conversation->is_history && $conversation->title === 'New chat') {
                $conversation->update(['title' => (string) str($message)->squish()->limit(120, '')]);
            } else {
                $conversation?->touch();
            }

            return $record;
        } catch (QueryException) {
            $records = $this->fallbackRecords();
            $now = now()->toIso8601String();
            $records[] = [
                'id' => (string) Str::uuid(),
                'brain' => $brain,
                'message' => $message,
                'brain_conversation_id' => $conversationId,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            File::put($this->fallbackPath(), json_encode($records, JSON_PRETTY_PRINT), true);

            return null;
        }
    }

    public function recent(?string $conversationId = null, int $limit = 50): array
    {
        $conversationId ??= $this->historyConversation()->id;
        try {
            return BrainMessage::latest()
                ->where('brain_conversation_id', $conversationId)
                ->take($limit)
                ->get()
                ->reverse()
                ->values()
                ->map(fn (BrainMessage $message) => $message->toArray())
                ->all();
        } catch (QueryException) {
            return array_values(array_slice(array_filter(
                $this->fallbackRecords(),
                fn (array $record): bool => ($record['brain_conversation_id'] ?? null) === $conversationId,
            ), -$limit));
        }
    }

    public function historyConversation(): BrainConversation
    {
        return BrainConversation::firstOrCreate(['is_history' => true], ['title' => 'History']);
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
