<?php

namespace App\Services\MovieNights;

use App\Enums\MovieNightStatus;
use App\Models\MovieNight;
use App\Models\User;
use App\Services\AccountAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class MovieNightService
{
    public function __construct(private MovieNightRules $rules) {}

    public function listing(User $actor, int $page, int $perPage, ?string $status): array
    {
        Gate::forUser($actor)->authorize('viewAny', MovieNight::class);
        $query = MovieNight::query()->visibleTo($actor)->with($this->relations($actor));
        if ($status !== null) {
            $query->where('status', $status);
        }
        $rows = $query->orderBy('starts_at')->orderBy('id')->paginate($perPage, ['*'], 'page', $page);

        return ['entries' => $rows->getCollection(), 'meta' => ['page' => $page, 'per_page' => $perPage,
            'total_pages' => (int) ceil($rows->total() / $perPage), 'total_results' => $rows->total()]];
    }

    public function visible(User $actor, int $id): MovieNight
    {
        $night = MovieNight::query()->visibleTo($actor)->whereKey($id)->firstOrFail();
        Gate::forUser($actor)->authorize('view', $night);

        return $night->load($this->relations($actor));
    }

    public function create(User $actor, array $fields): MovieNight
    {
        return DB::transaction(function () use ($actor, $fields): MovieNight {
            $actor = AccountAccess::lock($actor, community: true);
            Gate::forUser($actor)->authorize('create', MovieNight::class);
            $night = new MovieNight($this->rules->validateEventFields($fields));
            $night->host()->associate($actor);
            $night->save();

            return $night->refresh()->load($this->relations($actor));
        }, 3);
    }

    public function update(User $actor, int $id, array $fields): MovieNight
    {
        return DB::transaction(function () use ($actor, $id, $fields): MovieNight {
            $actor = AccountAccess::lock($actor, community: true);
            $night = MovieNight::query()->visibleTo($actor)->whereKey($id)->lockForUpdate()->firstOrFail();
            // Check the original start under the lock before applying any reschedule.
            $this->rules->assertOpen($night);
            Gate::forUser($actor)->authorize('update', $night);
            $night->update($this->rules->validateEventFields($fields, partial: true));

            return $night->load($this->relations($actor));
        }, 3);
    }

    public function cancel(User $actor, int $id): MovieNight
    {
        return DB::transaction(function () use ($actor, $id): MovieNight {
            $actor = AccountAccess::lock($actor, community: true);
            $night = MovieNight::query()->visibleTo($actor)->whereKey($id)->lockForUpdate()->firstOrFail();
            $this->rules->assertScheduled($night);
            Gate::forUser($actor)->authorize('cancel', $night);
            $night->forceFill(['status' => MovieNightStatus::Cancelled, 'cancelled_at' => now()])->save();

            return $night->load($this->relations($actor));
        }, 3);
    }

    private function relations(User $actor): array
    {
        return ['host:id,username,avatar_url', 'invitations' => fn ($query) => $query
            ->where('invited_user_id', $actor->id)->select(['id', 'movie_night_id', 'invited_user_id', 'rsvp_status'])];
    }
}
