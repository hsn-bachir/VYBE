<?php

namespace App\Services\MovieNights;

use App\Integrations\MovieCatalog\MovieCatalogClient;
use App\Models\MovieNight;
use App\Models\MovieNightMovie;
use App\Models\User;
use App\Services\AccountAccess;
use App\Services\LibraryMetadata;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class MovieNightShortlistService
{
    public function __construct(private MovieNightRules $rules, private MovieCatalogClient $catalog, private LibraryMetadata $metadata) {}

    public function listing(User $actor, int $id, int $page, int $perPage): array
    {
        $night = $this->visible($actor, $id);
        $rows = $night->movies()->with('nominatedBy:id,username,avatar_url')->orderBy('id')->paginate($perPage, ['*'], 'page', $page);
        $result = $this->metadata->enrich($rows);
        // Do not disclose a private shortlist if RSVP/account eligibility changed during enrichment.
        $this->visible($actor->fresh() ?? abort(401), $id);

        return $result;
    }

    public function nominate(User $actor, int $id, int $tmdbId): MovieNightMovie
    {
        $actor = $actor->fresh() ?? abort(401);
        $night = $this->visible($actor, $id);
        $this->rules->assertOpen($night);
        Gate::forUser($actor)->authorize('nominate', $night);
        // Detail validation can hydrate a genuine movie; a batch-cache miss cannot prove invalidity.
        // All network work is outside the mutation transaction and its account/event locks.
        $validated = $this->catalog->details($tmdbId)['data'];
        $summary = array_intersect_key($validated, array_flip(['tmdb_id', 'title', 'overview', 'poster_path', 'backdrop_path',
            'release_date', 'tmdb_rating', 'tmdb_vote_count']));

        return DB::transaction(function () use ($actor, $id, $tmdbId, $summary): MovieNightMovie {
            $actor = AccountAccess::lock($actor, community: true);
            $night = $this->lockedVisible($actor, $id);
            $this->rules->assertOpen($night);
            Gate::forUser($actor)->authorize('nominate', $night);
            abort_if($night->movies()->where('tmdb_id', $tmdbId)->exists(), 409, 'Movie is already shortlisted.');
            abort_if($night->movies()->count() >= 50, 409, 'Shortlist limit reached.');
            $movie = new MovieNightMovie(['tmdb_id' => $tmdbId]);
            $movie->movieNight()->associate($night);
            $movie->nominatedBy()->associate($actor);
            $movie->save();

            return $movie->refresh()->load('nominatedBy:id,username,avatar_url')->setAttribute('movie', $summary);
        }, 3);
    }

    public function remove(User $actor, int $id, int $movieId): void
    {
        DB::transaction(function () use ($actor, $id, $movieId): void {
            $actor = AccountAccess::lock($actor, community: true);
            $night = $this->lockedVisible($actor, $id);
            $movie = $night->movies()->whereKey($movieId)->lockForUpdate()->firstOrFail();
            $this->rules->assertRemovable($night, $movie);
            Gate::forUser($actor)->authorize('removeMovie', [$night, $movie]);
            $movie->delete();
        }, 3);
    }

    private function visible(User $actor, int $id): MovieNight
    {
        $night = MovieNight::query()->visibleTo($actor)->whereKey($id)->firstOrFail();
        Gate::forUser($actor)->authorize('view', $night);

        return $night;
    }

    private function lockedVisible(User $actor, int $id): MovieNight
    {
        $night = MovieNight::query()->visibleTo($actor)->whereKey($id)->lockForUpdate()->firstOrFail();
        Gate::forUser($actor)->authorize('view', $night);

        return $night;
    }
}
