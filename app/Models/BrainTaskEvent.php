<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BrainTaskEvent extends Model
{
    /** Events are written exclusively through BrainTaskStore. */
    protected $fillable = ['brain_task_id', 'type', 'phase', 'brain', 'summary'];

    public function task()
    {
        return $this->belongsTo(BrainTask::class, 'brain_task_id');
    }
}
