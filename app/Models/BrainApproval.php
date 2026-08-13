<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class BrainApproval extends Model
{
    use HasUuids;

    protected $fillable = ['brain_task_id', 'requesting_brain', 'type', 'summary', 'status', 'expires_at', 'resolver', 'decision', 'reviewer_note', 'resolved_at'];

    protected $casts = ['expires_at' => 'datetime', 'resolved_at' => 'datetime'];
}
