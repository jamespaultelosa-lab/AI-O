<?php

namespace App\Services;

use App\Models\BrainConversation;
use App\Models\BrainMessage;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class BrainHistorySyncService
{
    public function defaultPath(): string
    {
        return database_path('brain_history.json');
    }

    /**
     * Export all conversations and messages to the version-controlled JSON file.
     */
    public function export(?string $path = null): array
    {
        $targetPath = $path ?? $this->defaultPath();

        try {
            $conversations = BrainConversation::query()
                ->orderBy('created_at')
                ->get()
                ->map(fn (BrainConversation $c) => [
                    'id' => $c->id,
                    'title' => $c->title,
                    'is_history' => (bool) $c->is_history,
                    'created_at' => $c->created_at?->toIso8601String(),
                    'updated_at' => $c->updated_at?->toIso8601String(),
                ])
                ->values()
                ->all();

            $messages = BrainMessage::query()
                ->orderBy('created_at')
                ->orderBy('id')
                ->get()
                ->map(fn (BrainMessage $m) => [
                    'id' => $m->id,
                    'brain_conversation_id' => $m->brain_conversation_id,
                    'brain' => $m->brain,
                    'message' => $m->message,
                    'created_at' => $m->created_at?->toIso8601String(),
                    'updated_at' => $m->updated_at?->toIso8601String(),
                ])
                ->values()
                ->all();

            $payload = [
                'version' => 1,
                'exported_at' => Carbon::now()->toIso8601String(),
                'conversations_count' => count($conversations),
                'messages_count' => count($messages),
                'conversations' => $conversations,
                'messages' => $messages,
            ];

            $directory = dirname($targetPath);
            if (! File::isDirectory($directory)) {
                File::makeDirectory($directory, 0755, true);
            }

            File::put(
                $targetPath,
                json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            );

            return [
                'status' => 'success',
                'path' => $targetPath,
                'conversations_count' => count($conversations),
                'messages_count' => count($messages),
            ];
        } catch (QueryException $e) {
            return [
                'status' => 'error',
                'error' => $e->getMessage(),
                'conversations_count' => 0,
                'messages_count' => 0,
            ];
        }
    }

    /**
     * Import conversations and messages from the JSON file into the database idempotently.
     */
    public function import(?string $path = null): array
    {
        $targetPath = $path ?? $this->defaultPath();

        if (! File::exists($targetPath)) {
            return [
                'status' => 'skipped',
                'reason' => 'File not found',
                'conversations_imported' => 0,
                'messages_imported' => 0,
            ];
        }

        $content = File::get($targetPath);
        $data = json_decode($content, true);

        if (! is_array($data) || ! isset($data['conversations']) || ! isset($data['messages'])) {
            return [
                'status' => 'error',
                'reason' => 'Invalid JSON structure',
                'conversations_imported' => 0,
                'messages_imported' => 0,
            ];
        }

        $conversationsImported = 0;
        $messagesImported = 0;

        try {
            DB::transaction(function () use ($data, &$conversationsImported, &$messagesImported) {
                // 1. Import conversations
                foreach ($data['conversations'] as $cData) {
                    $convId = $cData['id'] ?? null;
                    if (! $convId) {
                        continue;
                    }

                    $conv = BrainConversation::query()->find($convId);
                    $createdAt = isset($cData['created_at']) ? Carbon::parse($cData['created_at']) : Carbon::now();
                    $updatedAt = isset($cData['updated_at']) ? Carbon::parse($cData['updated_at']) : Carbon::now();

                    if (! $conv) {
                        $newConv = new BrainConversation();
                        $newConv->id = $convId;
                        $newConv->title = $cData['title'] ?? 'History';
                        $newConv->is_history = (bool) ($cData['is_history'] ?? false);
                        $newConv->created_at = $createdAt;
                        $newConv->updated_at = $updatedAt;
                        $newConv->save();
                        $conversationsImported++;
                    } else {
                        $conv->title = $cData['title'] ?? $conv->title;
                        $conv->is_history = (bool) ($cData['is_history'] ?? $conv->is_history);
                        $conv->updated_at = $updatedAt;
                        $conv->save();
                    }
                }

                // 2. Import messages
                foreach ($data['messages'] as $mData) {
                    $conversationId = $mData['brain_conversation_id'] ?? null;
                    $brain = $mData['brain'] ?? null;
                    $messageText = $mData['message'] ?? null;
                    $createdAt = isset($mData['created_at']) ? Carbon::parse($mData['created_at']) : Carbon::now();
                    $updatedAt = isset($mData['updated_at']) ? Carbon::parse($mData['updated_at']) : Carbon::now();

                    if (! $brain || $messageText === null) {
                        continue;
                    }

                    // Check if message already exists by conversation, brain, message text and created_at
                    $exists = BrainMessage::query()
                        ->where('brain_conversation_id', $conversationId)
                        ->where('brain', $brain)
                        ->where('message', $messageText)
                        ->where('created_at', $createdAt->toDateTimeString())
                        ->exists();

                    if (! $exists) {
                        $msg = new BrainMessage();
                        $msg->brain_conversation_id = $conversationId;
                        $msg->brain = $brain;
                        $msg->message = $messageText;
                        $msg->created_at = $createdAt;
                        $msg->updated_at = $updatedAt;
                        $msg->save();
                        $messagesImported++;
                    }
                }
            });

            return [
                'status' => 'success',
                'conversations_imported' => $conversationsImported,
                'messages_imported' => $messagesImported,
            ];
        } catch (QueryException $e) {
            return [
                'status' => 'error',
                'error' => $e->getMessage(),
                'conversations_imported' => 0,
                'messages_imported' => 0,
            ];
        }
    }

    /**
     * Bidirectional sync: import any new records from JSON file, then export total DB state.
     */
    public function sync(?string $path = null): array
    {
        $targetPath = $path ?? $this->defaultPath();
        $importResult = $this->import($targetPath);
        $exportResult = $this->export($targetPath);

        return [
            'status' => 'success',
            'import' => $importResult,
            'export' => $exportResult,
        ];
    }

    /**
     * Check if the JSON file contains conversations/messages that should be loaded into SQLite.
     */
    public function shouldAutoImport(?string $path = null): bool
    {
        $targetPath = $path ?? $this->defaultPath();
        if (! File::exists($targetPath)) {
            return false;
        }

        try {
            $dbMessageCount = BrainMessage::query()->count();
            if ($dbMessageCount === 0) {
                return true;
            }

            $content = File::get($targetPath);
            $data = json_decode($content, true);
            $fileMessageCount = $data['messages_count'] ?? (is_array($data['messages'] ?? null) ? count($data['messages']) : 0);

            return $fileMessageCount > $dbMessageCount;
        } catch (QueryException) {
            return false;
        }
    }
}
