<?php

namespace App\Policies;

use App\Enums\MovieNightRsvp;
use App\Enums\MovieNightStatus;
use App\Models\MovieNight;
use App\Models\MovieNightMovie;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class MovieNightPolicy
{
    public function create(User $user): bool
    {
        return $user->canWriteCommunity() && $user->hasVerifiedEmail() && ! $user->invitation_pending;
    }

    public function viewAny(User $user): bool
    {
        return $user->canAccessAccount() && $user->hasVerifiedEmail() && ! $user->invitation_pending;
    }

    public function view(User $user, MovieNight $night): Response
    {
        return $this->viewAny($user)
            && MovieNight::query()->visibleTo($user)->whereKey($night->id)->exists()
            ? Response::allow() : Response::denyAsNotFound();
    }

    public function viewInvitation(User $user, MovieNight $night): Response
    {
        return $this->viewAny($user)
            && MovieNight::query()->forMember($user)->whereKey($night->id)->exists()
            ? Response::allow() : Response::denyAsNotFound();
    }

    public function update(User $user, MovieNight $night): bool
    {
        return $this->host($user, $night) && $night->votingIsOpen();
    }

    public function listInvitations(User $user, MovieNight $night): bool
    {
        return $this->viewAny($user) && $user->id === $night->host_user_id;
    }

    public function invite(User $user, MovieNight $night): bool
    {
        return $this->update($user, $night);
    }

    public function cancel(User $user, MovieNight $night): bool
    {
        return $this->host($user, $night) && $night->status === MovieNightStatus::Scheduled;
    }

    public function finalize(User $user, MovieNight $night): bool
    {
        return $this->cancel($user, $night);
    }

    public function rsvp(User $user, MovieNight $night): bool
    {
        return $this->create($user) && $night->votingIsOpen() && $user->id !== $night->host_user_id
            && $night->invitations()->where('invited_user_id', $user->id)->exists();
    }

    public function nominate(User $user, MovieNight $night): bool
    {
        return $this->create($user) && $night->votingIsOpen() && $this->accepted($user, $night);
    }

    public function vote(User $user, MovieNight $night): bool
    {
        return $this->nominate($user, $night);
    }

    public function removeMovie(User $user, MovieNight $night, MovieNightMovie $movie): bool
    {
        return $movie->movie_night_id === $night->id && $this->nominate($user, $night)
            && ($user->id === $night->host_user_id || $user->id === $movie->nominated_by_user_id)
            && ! $movie->votes()->exists();
    }

    public function accepted(User $user, MovieNight $night): bool
    {
        // Host is implicitly accepted: no invitation row and no second vote.
        return $user->id === $night->host_user_id || $night->invitations()
            ->where('invited_user_id', $user->id)->where('rsvp_status', MovieNightRsvp::Accepted->value)->exists();
    }

    private function host(User $user, MovieNight $night): bool
    {
        return $this->create($user) && $user->id === $night->host_user_id;
    }
}
