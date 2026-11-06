<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WatchedMovie extends Model
{
    protected $fillable = ['tmdb_id', 'watched_at'];

    protected function casts(): array
    {
        return ['tmdb_id' => 'integer', 'watched_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
