<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BrainMemoryBroadcast implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $memory;

    public function __construct(array $memory)
    {
        $this->memory = $memory;
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('brains.memory'),
        ];
    }
}
