<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Report extends Model
{
    protected $fillable = ['reporter_id', 'target_type', 'target_id', 'reason', 'description', 'status',
        'resolved_by', 'resolved_at', 'resolution_note', 'resolution_action'];

    protected function casts(): array
    {
        return ['resolved_at' => 'datetime'];
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_id');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function review(): BelongsTo
    {
        return $this->belongsTo(Review::class, 'target_id');
    }
}
