<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class BrainConversation extends Model
{
    use HasUuids;

    protected $fillable = ['title', 'is_history'];

    protected $casts = ['is_history' => 'boolean'];

    public function messages()
    {
        return $this->hasMany(BrainMessage::class);
    }
}
