<?php

namespace App\Models;

use App\Enums\MovieNightRsvp;
use App\Models\Concerns\HasMovieNightUtcTimestamps;
use Illuminate\Database\Eloquent\Builder;
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

    /** Same authoritative cohort for totals and internal finalization; moderation is not retroactive. */
    public function scopeValidFor(Builder $query, MovieNight $night): Builder
    {
        return $query->where('movie_night_id', $night->id)
            ->where(fn (Builder $q) => $q->where('voting_user_id', $night->host_user_id)
                ->orWhereIn('voting_user_id', $night->invitations()->select('invited_user_id')
                    ->where('rsvp_status', MovieNightRsvp::Accepted->value)));
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
