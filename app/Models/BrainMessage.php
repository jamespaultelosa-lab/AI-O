<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BrainMessage extends Model
{
    protected $fillable = ['brain', 'message', 'brain_conversation_id'];

    public function conversation()
    {
        return $this->belongsTo(BrainConversation::class, 'brain_conversation_id');
    }
}
