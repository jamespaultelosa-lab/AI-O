<?php

namespace App\Http\Controllers;

use App\Models\BrainConversation;
use App\Services\BrainHistorySyncService;
use App\Services\BrainMessageStore;
use Illuminate\Http\Request;

class BrainConversationController extends Controller
{
    public function __construct(private ?BrainHistorySyncService $syncService = null)
    {
        $this->syncService ??= app(BrainHistorySyncService::class);
    }

    public function index(BrainMessageStore $messageStore)
    {
        if ($this->syncService?->shouldAutoImport()) {
            $this->syncService->import();
        }

        $messageStore->historyConversation();

        return response()->json(BrainConversation::query()
            ->select(['id', 'title', 'is_history', 'created_at', 'updated_at'])
            ->withCount('messages')
            ->latest('updated_at')
            ->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate(['title' => ['nullable', 'string', 'max:120']]);
        $conversation = BrainConversation::create([
            'title' => trim($validated['title'] ?? '') ?: 'New chat',
        ])->refresh();

        $this->syncService?->export();

        return response()->json($conversation, 201);
    }

    public function messages(BrainConversation $conversation, BrainMessageStore $messageStore)
    {
        return response()->json($messageStore->recent($conversation->id, 100));
    }
}
