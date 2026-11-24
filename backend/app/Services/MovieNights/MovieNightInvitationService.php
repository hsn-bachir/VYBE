<?php

namespace App\Services\MovieNights;

use App\Enums\MovieNightRsvp;
use App\Models\MovieNight;
use App\Models\MovieNightInvitation;
use App\Models\User;
use App\Services\AccountAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class MovieNightInvitationService
{
    public function __construct(private MovieNightRules $rules) {}

    public function eligible(User $actor, int $id, string $prefix, int $page, int $perPage): array
    {
        $night = $this->visible($actor, $id);
        $this->rules->assertOpen($night);
        Gate::forUser($actor)->authorize('invite', $night);
        // Escape the username underscore: it is a literal, not a LIKE wildcard.
        $pattern = str_replace('_', '\\_', $prefix).'%';
        $query = $this->eligibleUsers()->where('id', '<>', $actor->id)
            ->whereNotIn('id', $night->invitations()->select('invited_user_id'))
            ->whereRaw("username LIKE ? ESCAPE '\\'", [$pattern])->orderBy('username')->orderBy('id');

        return $this->paginate($query, $page, $perPage, ['id', 'username', 'avatar_url']);
    }

    public function create(User $actor, int $id, int $targetId): MovieNightInvitation
    {
        return DB::transaction(function () use ($actor, $id, $targetId): MovieNightInvitation {
            $actor = AccountAccess::lock($actor, community: true);
            $night = MovieNight::query()->visibleTo($actor)->whereKey($id)->lockForUpdate()->firstOrFail();
            $this->rules->assertOpen($night);
            Gate::forUser($actor)->authorize('invite', $night);
            $target = $this->eligibleUsers()->whereKey($targetId)->lockForUpdate()->first();
            if ($targetId === $actor->id || ! $target) {
                throw ValidationException::withMessages(['invited_user_id' => ['Choose an eligible user other than yourself.']]);
            }
            abort_if($night->invitations()->where('invited_user_id', $targetId)->exists(), 409, 'User is already invited.');
            abort_if($night->invitations()->count() >= 200, 409, 'Invitation limit reached.');
            // Recheck after waiting for the target account lock as well.
            $this->rules->assertOpen($night);
            $invitation = new MovieNightInvitation(['rsvp_status' => MovieNightRsvp::Pending]);
            $invitation->movieNight()->associate($night);
            $invitation->invitedUser()->associate($target);
            $invitation->save();

            return $invitation->refresh()->unsetRelation('movieNight')->load('invitedUser:id,username,avatar_url');
        }, 3);
    }

    public function received(User $actor, int $page, int $perPage): array
    {
        Gate::forUser($actor)->authorize('viewAny', MovieNight::class);
        $query = MovieNightInvitation::query()->where('invited_user_id', $actor->id)
            ->with(['invitedUser:id,username,avatar_url', 'movieNight.host:id,username,avatar_url',
                'movieNight.invitations' => fn ($q) => $q->where('invited_user_id', $actor->id)])
            ->orderBy('id');

        return $this->paginate($query, $page, $perPage);
    }

    public function listing(User $actor, int $id, int $page, int $perPage): array
    {
        $night = $this->visible($actor, $id);
        Gate::forUser($actor)->authorize('listInvitations', $night);

        return $this->paginate($night->invitations()->getQuery()->with('invitedUser:id,username,avatar_url')->orderBy('id'), $page, $perPage);
    }

    private function visible(User $actor, int $id): MovieNight
    {
        $night = MovieNight::query()->visibleTo($actor)->whereKey($id)->firstOrFail();
        Gate::forUser($actor)->authorize('view', $night);

        return $night;
    }

    private function eligibleUsers(): Builder
    {
        return User::query()->where('account_status', User::STATUS_ACTIVE)
            ->whereNotNull('email_verified_at')->where('invitation_pending', false);
    }

    private function paginate(Builder $query, int $page, int $perPage, array $columns = ['*']): array
    {
        $rows = $query->paginate($perPage, $columns, 'page', $page);

        return ['entries' => $rows->getCollection(), 'meta' => ['page' => $page, 'per_page' => $perPage,
            'total_pages' => (int) ceil($rows->total() / $perPage), 'total_results' => $rows->total()]];
    }
}
