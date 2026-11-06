<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['tmdb_id', 'body', 'contains_spoilers'])]
class Review extends Model
{
    protected function casts(): array
    {
        return ['tmdb_id' => 'integer', 'contains_spoilers' => 'boolean', 'moderator_spoiler' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reports(): HasMany
    {
        return $this->hasMany(Report::class, 'target_id')->where('target_type', 'review');
    }
}
