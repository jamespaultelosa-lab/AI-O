<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class BrainApproval extends Model
{
    use HasUuids;

    public const PENDING = 'pending';
    public const ACCEPTED = 'accepted';
    public const DECLINED = 'declined';
    public const EXPIRED = 'expired';
    public const SUPERSEDED = 'superseded';
    public const FINAL_STATUSES = [self::ACCEPTED, self::DECLINED, self::EXPIRED, self::SUPERSEDED];

    protected $fillable = ['brain_task_id', 'requesting_brain', 'type', 'summary', 'status', 'expires_at', 'resolver', 'decision', 'reviewer_note', 'resolved_at'];

    protected $casts = ['expires_at' => 'datetime', 'resolved_at' => 'datetime'];

    public function task()
    {
        return $this->belongsTo(BrainTask::class, 'brain_task_id');
    }

    public function isFinal(): bool
    {
        return in_array($this->status, self::FINAL_STATUSES, true);
    }
}
