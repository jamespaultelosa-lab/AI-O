<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BrainTaskEvent extends Model
{
    protected $fillable = ['brain_task_id', 'type', 'phase', 'brain', 'summary'];
}
