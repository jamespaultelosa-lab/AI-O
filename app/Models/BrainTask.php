<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class BrainTask extends Model
{
    use HasUuids;

    protected $fillable = ['display_summary', 'assigned_brain', 'assigned_model', 'status', 'safe_phase', 'queue_position', 'terminal_reason', 'started_at', 'completed_at'];

    protected $casts = ['started_at' => 'datetime', 'completed_at' => 'datetime'];
}
