<?php

namespace App\Models;

use App\Enums\MovieNightRsvp;
use App\Models\Concerns\HasMovieNightUtcTimestamps;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MovieNightInvitation extends Model
{
    use HasMovieNightUtcTimestamps;

    protected $fillable = ['rsvp_status', 'responded_at'];

    protected function casts(): array
    {
        return ['rsvp_status' => MovieNightRsvp::class, 'responded_at' => 'immutable_datetime'];
    }

    public function movieNight(): BelongsTo
    {
        return $this->belongsTo(MovieNight::class, 'movie_night_id');
    }

    public function invitedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_user_id');
    }
}
