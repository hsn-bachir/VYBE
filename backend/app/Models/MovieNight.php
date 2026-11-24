<?php

namespace App\Models;

use App\Enums\MovieNightRsvp;
use App\Enums\MovieNightStatus;
use App\Models\Concerns\HasMovieNightUtcTimestamps;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MovieNight extends Model
{
    use HasMovieNightUtcTimestamps;

    protected $fillable = ['title', 'starts_at', 'timezone', 'location', 'meeting_url'];

    protected function casts(): array
    {
        return ['status' => MovieNightStatus::class, 'starts_at' => 'immutable_datetime',
            'finalized_at' => 'immutable_datetime', 'cancelled_at' => 'immutable_datetime',
            'finalized_tmdb_id' => 'integer'];
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(User::class, 'host_user_id');
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(MovieNightInvitation::class);
    }

    public function movies(): HasMany
    {
        return $this->hasMany(MovieNightMovie::class);
    }

    public function votes(): HasMany
    {
        return $this->hasMany(MovieNightVote::class);
    }

    /** Invitation membership permits minimal reads and RSVP, not private event details. */
    public function scopeForMember(Builder $query, User $user): Builder
    {
        return $query->where(fn (Builder $q) => $q->where('host_user_id', $user->id)
            ->orWhereHas('invitations', fn (Builder $i) => $i->where('invited_user_id', $user->id)));
    }

    /** Full private details belong only to the host and currently accepted participants. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->where(fn (Builder $q) => $q->where('host_user_id', $user->id)
            ->orWhereHas('invitations', fn (Builder $i) => $i->where('invited_user_id', $user->id)
                ->where('rsvp_status', MovieNightRsvp::Accepted->value)));
    }

    public function votingIsOpen(): bool
    {
        return $this->status === MovieNightStatus::Scheduled && now()->lt($this->starts_at);
    }
}
