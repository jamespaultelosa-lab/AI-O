<?php

namespace App\Http\Controllers;

use App\Models\BrainConversation;
use App\Services\BrainMessageStore;
use Illuminate\Http\Request;

class BrainConversationController extends Controller
{
    public function index(BrainMessageStore $messageStore)
    {
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

        return response()->json($conversation, 201);
    }

    public function messages(BrainConversation $conversation, BrainMessageStore $messageStore)
    {
        return response()->json($messageStore->recent($conversation->id, 100));
    }
}
