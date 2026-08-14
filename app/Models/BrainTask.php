<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class BrainTask extends Model
{
    use HasUuids;

    public const QUEUED = 'queued';

    public const ASSIGNED = 'assigned';

    public const RUNNING = 'running';

    public const APPROVAL_REQUIRED = 'approval_required';

    public const COMPLETED = 'completed';

    public const FAILED = 'failed';

    public const CANCELLED = 'cancelled';

    public const TERMINAL_STATUSES = [self::COMPLETED, self::FAILED, self::CANCELLED];

    protected $fillable = ['brain_conversation_id', 'display_summary', 'assigned_brain', 'assigned_model', 'status', 'safe_phase', 'queue_position', 'terminal_reason', 'started_at', 'completed_at'];

    protected $casts = ['started_at' => 'datetime', 'completed_at' => 'datetime'];

    public function conversation()
    {
        return $this->belongsTo(BrainConversation::class, 'brain_conversation_id');
    }

    public function events()
    {
        return $this->hasMany(BrainTaskEvent::class);
    }

    public function approvals()
    {
        return $this->hasMany(BrainApproval::class);
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, self::TERMINAL_STATUSES, true);
    }
}
