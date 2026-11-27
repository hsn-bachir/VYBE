<?php

namespace App\Models;

use App\Models\Concerns\HasMovieNightUtcTimestamps;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MovieNightMovie extends Model
{
    use HasMovieNightUtcTimestamps;

    protected $fillable = ['tmdb_id'];

    protected function casts(): array
    {
        return ['tmdb_id' => 'integer'];
    }

    public function movieNight(): BelongsTo
    {
        return $this->belongsTo(MovieNight::class, 'movie_night_id');
    }

    public function nominatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'nominated_by_user_id');
    }

    public function votes(): HasMany
    {
        return $this->hasMany(MovieNightVote::class, 'movie_night_movie_id');
    }
}
