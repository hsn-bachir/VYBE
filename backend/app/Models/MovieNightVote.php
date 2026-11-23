<?php

namespace App\Models;

use App\Models\Concerns\HasMovieNightUtcTimestamps;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MovieNightVote extends Model
{
    use HasMovieNightUtcTimestamps;

    protected $fillable = [];

    protected function casts(): array
    {
        return [];
    }

    public function movieNight(): BelongsTo
    {
        return $this->belongsTo(MovieNight::class, 'movie_night_id');
    }

    public function movie(): BelongsTo
    {
        return $this->belongsTo(MovieNightMovie::class, 'movie_night_movie_id');
    }

    public function voter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voting_user_id');
    }
}
