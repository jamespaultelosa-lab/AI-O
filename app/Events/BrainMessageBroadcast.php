<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BrainMessageBroadcast implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public string $brainName;

    public string $message;

    public string $timestamp;

    public ?string $conversationId;

    /**
     * Create a new event instance.
     */
    public function __construct(string $brainName, string $message, ?string $conversationId = null)
    {
        $this->brainName = $brainName;
        $this->message = $message;
        $this->timestamp = now()->toIso8601String();
        $this->conversationId = $conversationId;
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new Channel('brains.messages'),
        ];
    }
}
