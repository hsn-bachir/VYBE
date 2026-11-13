<?php

namespace App\Services\Recommendations;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class PreferenceService
{
    public function activity(User $user): array
    {
        $ratings = $user->movieRatings()->orderBy('tmdb_id')->pluck('rating', 'tmdb_id')->all();
        $watchlist = $user->watchlistEntries()->orderBy('tmdb_id')->pluck('tmdb_id')->all();
        $watched = $user->watchedMovies()->orderBy('tmdb_id')->pluck('tmdb_id')->all();
        $saved = DB::table('collection_movies')->join('collections', 'collections.id', '=', 'collection_movies.collection_id')
            ->where('collections.user_id', $user->id)->orderBy('collection_movies.tmdb_id')
            ->orderBy('collections.id')
            ->get(['collection_movies.tmdb_id', 'collections.system_key'])->all();
        $favorites = array_column(array_filter($saved, fn ($row) => $row->system_key === 'favorites'), 'tmdb_id');
        $favoriteSet = array_fill_keys($favorites, true);
        $watchlistSet = array_fill_keys($watchlist, true);
        $watchedSet = array_fill_keys($watched, true);
        $excluded = array_values(array_unique([...array_keys($ratings), ...$watchlist, ...$watched, ...array_column($saved, 'tmdb_id')]));
        sort($excluded);
        $signals = [];
        foreach ($excluded as $id) {
            $rating = $ratings[$id] ?? null;
            // Explicit negative/neutral ratings override implicit signals. Positive overlap is capped.
            $weight = $rating !== null ? [1 => -1, 2 => -.6, 3 => 0, 4 => .75, 5 => 1][$rating] : .0;
            if ($rating === null || $rating >= 4) {
                $weight = max($weight, isset($favoriteSet[$id]) ? .9 : (isset($watchlistSet[$id]) ? .2 : (isset($watchedSet[$id]) ? .05 : 0)));
            }
            if ($weight != 0) {
                $signals[$id] = $weight;
            }
        }
        uksort($signals, fn ($a, $b) => [abs($signals[$b]), $a] <=> [abs($signals[$a]), $b]);

        return ['signals' => array_slice($signals, 0, 50, true), 'watchlist' => $watchlist, 'excluded' => $excluded,
            'revision' => hash('sha256', json_encode([$ratings, $watchlist, $watched, $saved]))];
    }

    public function calculate(array $activity, array $features): array
    {
        $profile = ['genres' => [], 'actors' => [], 'writers' => [], 'directors' => [], 'loved' => [], 'watchlist' => [], 'names' => []];
        $evidence = [];
        foreach ($features as $feature) {
            $id = $feature['movie']['tmdb_id'];
            $weight = $activity['signals'][$id] ?? 0;
            if ($weight >= .75) {
                $profile['loved'][$id] = $feature['movie']['title'];
            }
            if (in_array($id, $activity['watchlist']) && $weight > 0) {
                $profile['watchlist'][$id] = $feature['movie']['title'];
            }
            foreach (['genres', 'actors', 'writers', 'directors'] as $kind) {
                // Mere viewing/interest never establishes a contributor preference.
                if ($kind !== 'genres' && abs($weight) < .6) {
                    continue;
                }
                foreach ($feature[$kind] as $person) {
                    $key = $person['id'];
                    $profile[$kind][$key] = ($profile[$kind][$key] ?? 0) + $weight;
                    $evidence[$kind][$key] = ($evidence[$kind][$key] ?? 0) + ($weight >= .6 ? 1 : 0);
                    $profile['names'][$kind][$key] = $person['name'];
                }
            }
        }
        foreach (['genres', 'actors', 'writers', 'directors'] as $kind) {
            foreach ($profile[$kind] as $id => $value) {
                // Two distinct strong titles required for a declared positive preference.
                if ($value > 0 && ($evidence[$kind][$id] ?? 0) < 2) {
                    unset($profile[$kind][$id]);
                } else {
                    $profile[$kind][$id] = max(-1, min(1, $value / 2));
                }
            }
            arsort($profile[$kind], SORT_NUMERIC);
        }

        return $profile;
    }
}
