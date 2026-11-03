<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['tmdb_id', 'body', 'contains_spoilers'])]
class Review extends Model
{
    protected function casts(): array
    {
        return ['tmdb_id' => 'integer', 'contains_spoilers' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
