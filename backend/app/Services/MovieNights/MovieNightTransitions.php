<?php

namespace App\Services\MovieNights;

use App\Enums\MovieNightRsvp;
use App\Enums\MovieNightStatus;
use App\Exceptions\MovieNightTie;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\User;
use App\Services\AccountAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** Shared RSVP and finalization transitions used by the Movie Night HTTP adapters. */
class MovieNightTransitions
{
    public function __construct(private MovieNightRules $rules) {}

    public function respond(User $actor, int $nightId, MovieNightRsvp $response): MovieNightInvitation
    {
        return DB::transaction(function () use ($actor, $nightId, $response): MovieNightInvitation {
            $actor = AccountAccess::lock($actor, community: true);
            $night = $this->lockedMember($actor, $nightId);
            $this->rules->assertOpen($night);
            Gate::forUser($actor)->authorize('rsvp', $night);
            if ($response === MovieNightRsvp::Pending) {
                throw ValidationException::withMessages(['rsvp_status' => ['Choose accepted or declined.']]);
            }
            $invitation = $night->invitations()->where('invited_user_id', $actor->id)->lockForUpdate()->firstOrFail();
            // A lock wait must not allow a response at or beyond the exact deadline.
            $this->rules->assertOpen($night);
            if ($invitation->rsvp_status !== $response) {
                $invitation->update(['rsvp_status' => $response, 'responded_at' => now()]);
            }
            if ($response === MovieNightRsvp::Declined) {
                $night->votes()->where('voting_user_id', $actor->id)->delete();
            }

            return $invitation->refresh()->load('invitedUser:id,username,avatar_url');
        }, 3);
    }

    public function finalize(User $actor, int $nightId, ?int $chosenTmdbId = null): MovieNight
    {
        return DB::transaction(function () use ($actor, $nightId, $chosenTmdbId): MovieNight {
            $actor = AccountAccess::lock($actor, community: true);
            $night = MovieNight::query()->visibleTo($actor)->whereKey($nightId)->lockForUpdate()->firstOrFail();
            Gate::forUser($actor)->authorize('view', $night);
            $this->rules->assertScheduled($night);
            Gate::forUser($actor)->authorize('finalize', $night);
            // No deadline filter: votes cast before the start remain valid afterwards.
            // Account moderation does not retroactively erase an accepted participant's vote.
            $totals = $night->movies()->withCount(['votes' => fn ($q) => $q->validFor($night)])->orderBy('id')->get();
            $maximum = (int) $totals->max('votes_count');
            abort_if($maximum < 1, 409, 'At least one valid vote is required.');
            $leaders = $totals->where('votes_count', $maximum);
            if ($chosenTmdbId === null && $leaders->count() > 1) {
                throw new MovieNightTie($leaders->pluck('tmdb_id')->values()->all());
            }
            $winner = $chosenTmdbId === null ? $leaders->first() : $leaders->firstWhere('tmdb_id', $chosenTmdbId);
            if (! $winner) {
                throw ValidationException::withMessages(['tmdb_id' => ['Choose a highest-voted movie.']]);
            }
            $night->forceFill(['status' => MovieNightStatus::Finalized, 'finalized_tmdb_id' => $winner->tmdb_id,
                'finalized_at' => now()])->save();

            return $night;
        }, 3);
    }

    private function lockedMember(User $actor, int $id): MovieNight
    {
        return MovieNight::query()->forMember($actor)->whereKey($id)->lockForUpdate()->firstOrFail();
    }
}
