<?php

namespace App\Services\MovieNights;

use App\Models\MovieNight;
use App\Models\MovieNightVote;
use App\Models\User;
use App\Services\AccountAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class MovieNightVotingService
{
    public function __construct(private MovieNightRules $rules) {}

    public function cast(User $actor, int $id, int $candidateId): MovieNightVote
    {
        return DB::transaction(function () use ($actor, $id, $candidateId): MovieNightVote {
            $actor = AccountAccess::lock($actor, community: true);
            $night = MovieNight::query()->visibleTo($actor)->whereKey($id)->lockForUpdate()->firstOrFail();
            Gate::forUser($actor)->authorize('view', $night);
            $this->rules->assertOpen($night);
            Gate::forUser($actor)->authorize('vote', $night);
            $candidate = $night->movies()->whereKey($candidateId)->lockForUpdate()->firstOrFail();
            $vote = $night->votes()->where('voting_user_id', $actor->id)->lockForUpdate()->first();
            // Time may have passed while waiting for either the candidate or existing vote row.
            $this->rules->assertOpen($night);
            if (! $vote) {
                $vote = new MovieNightVote;
                $vote->movieNight()->associate($night);
                $vote->voter()->associate($actor);
            }
            if (! $vote->exists || $vote->movie_night_movie_id !== $candidate->id) {
                $vote->movie()->associate($candidate);
                $vote->save();
            }

            return $vote->refresh();
        }, 3);
    }

    public function totals(User $actor, int $id): array
    {
        return DB::transaction(function () use ($actor, $id): array {
            $actor = AccountAccess::lock($actor);
            // A shared parent lock keeps the event state, candidate set and totals coherent
            // with every compliant Movie Night mutation, while allowing concurrent readers.
            $night = MovieNight::query()->visibleTo($actor)->whereKey($id)->sharedLock()->firstOrFail();
            Gate::forUser($actor)->authorize('view', $night);
            $candidates = $night->movies()->withCount(['votes' => fn ($q) => $q->validFor($night)])
                ->withExists(['votes as is_my_vote' => fn ($q) => $q->validFor($night)->where('voting_user_id', $actor->id)])
                ->orderBy('id')->get(['id', 'movie_night_id', 'tmdb_id']);
            $maximum = (int) $candidates->max('votes_count');

            return ['totals' => $candidates->map(fn ($candidate) => ['tmdb_id' => $candidate->tmdb_id,
                'movie_night_movie_id' => $candidate->id, 'votes' => (int) $candidate->votes_count])->all(),
                'my_vote' => $candidates->firstWhere('is_my_vote', true)?->id,
                'total_votes' => (int) $candidates->sum('votes_count'),
                'leaders' => $maximum > 0 ? $candidates->where('votes_count', $maximum)->pluck('tmdb_id')->all() : [],
                'voting_open' => $night->votingIsOpen()];
        }, 3);
    }
}
