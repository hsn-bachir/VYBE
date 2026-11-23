# Administration statistics and Movie Insights

M7.1–M7.5 implement part of PDF item 11. These endpoints use the existing Sanctum session, verified email, live role and status checks, and `admin-read` throttle of 60 requests per minute per actor and 120 per IP. Responses use `Cache-Control: no-store, private`. Verified active and restricted administrators can read all four endpoints. Moderators can read the existing overview projection. Guests receive 401. Unverified, banned, deactivated and insufficiently privileged accounts receive 403 where authorization fails. Throttled requests receive 429.

## `GET /api/v1/admin/overview`

The existing `data` envelope and moderation fields remain compatible. All counts describe records currently stored or their current state. The endpoint has no reporting-period filter.

| Field | Definition |
| --- | --- |
| `users.total` | All persisted Core user accounts, using the existing overview count. This includes all roles and account statuses and admin-provisioned accounts with a pending invitation. |
| `users.restricted`, `users.banned`, `users.deactivated` | Persisted accounts with the corresponding current status. |
| `activity.total_reviews` | All stored reviews, including hidden reviews. A deleted review drops out of the count. |
| `activity.total_ratings` | All individual 1–5 star ratings currently in `movie_ratings`. |
| `activity.total_watched_entries` | All current user/movie rows in `watched_movies`. A member can contribute one entry for each distinct movie. |
| `pending_reports` | Reports whose status is `pending`. |
| `handled_reports` | Reports whose status is `resolved` or `dismissed`. |
| `hidden_reviews`, `enforced_spoilers` | Reviews currently hidden and reviews with a moderator-enforced spoiler flag, respectively. |
| `recent_reports` | At most five reports ordered by `created_at` descending, then `id` descending. Existing per-report fields are `id`, `review_id`, `reason`, `status` and `created_at`. |

The `users` and `activity` objects are administrator-only. The moderator projection contains the four moderation counts and `recent_reports`. The overview performs two domain SQL statements and makes zero Catalog calls. The Activity Analytics endpoint reports contributors for a specific period.

## `GET /api/v1/admin/movie-insights`

This read has a fixed limit and no filter or pagination parameters. Array order gives the rank, starting at one. Each list contains at most ten rows.

```json
{
  "data": {
    "most_watched": [
      {"tmdb_id": 550, "watched_users": 42, "movie": {"title": "Example movie", "poster_path": "/poster.jpg", "release_date": "2024-01-02"}}
    ],
    "highest_rated": [
      {"tmdb_id": 551, "rating_count": 17, "average_rating": 4.65, "movie": null}
    ]
  },
  "meta": {"metadata_unavailable": false}
}
```

- **Most watched.** Core groups `watched_movies` by `tmdb_id`, orders by `COUNT(DISTINCT user_id)` descending and breaks ties by `tmdb_id` ascending.
- **Highest rated.** Core groups `movie_ratings` by `tmdb_id`. Its Bayesian score is `(v × R + 5 × C) / (v + 5)`, where `v` is the movie's rating count, `R` its average rating and `C` the average of every stored VYBE rating. Five prior ratings apply modest shrinkage for small samples while keeping every rated movie eligible. Core sorts by the confidence-adjusted score descending, then `rating_count` descending and `tmdb_id` ascending. SQL multiplies the adjusted score by the positive community rating count to avoid rounding the prior before sorting. The response returns the raw movie average rounded to two decimals and the actual count. Both use VYBE ratings on the 1–5 scale.
- **Metadata.** Core sends at most 20 deduplicated TMDB IDs to the existing [Catalog summaries endpoint](catalog-batch-summaries.md), in a single request. Catalog receives IDs only. Core projects `title`, `poster_path` and `release_date`. The poster path and ISO `YYYY-MM-DD` date can be null. Rankings use Core activity exclusively.
- **Partial results.** A Catalog cache miss produces `movie: null` for the affected row with `metadata_unavailable: false`. A Catalog failure returns HTTP 200 with both Core rankings, null movie objects and `metadata_unavailable: true`. If Core has no activity for either list, it returns two empty arrays and makes zero Catalog requests.

The rankings projection is limited to movie references, display metadata and aggregate VYBE statistics.

## `GET /api/v1/admin/genre-insights`

Core ranks its currently watched movies by stored watched-entry count descending and TMDB ID ascending. Each user/movie pair has one row. Only the first **50 movies** are eligible for genre enrichment. Each watched entry contributes once to every distinct genre associated with its movie. The same entry can contribute across several genres. The bars compare counts with the leading genre's count.

```json
{
  "data": [{"genre_id": 18, "name": "Drama", "watched_entries": 60}],
  "meta": {
    "cohort_limit": 50,
    "total_watched_movies": 72,
    "total_watched_entries": 268,
    "cohort_movies": 50,
    "cohort_watched_entries": 223,
    "covered_movies": 43,
    "covered_watched_entries": 186,
    "metadata_unavailable": false
  }
}
```

The array contains up to ten genres in watched-entry count order, descending, with ties sorted by ascending genre ID. Genre IDs are the identity used for deduplication. When cached names for the same genre disagree, Core uses the lexically first name among the available associations. `total_*` fields describe all stored watched activity, `cohort_*` fields describe the bounded group, and `covered_*` fields describe cohort movies and watched entries with known Catalog metadata. Explicitly cached empty genre lists count as known and contribute zero genre counts.

Core uses one SQL query for the cohort and global denominators and makes one [cache-only Catalog genre request](catalog-batch-summaries.md#catalog-batch-genre-lookup) for a nonempty cohort. Individual misses retain the available genre rankings and report reduced coverage. A Catalog or contract failure returns HTTP 200 with the cohort figures, zero coverage, an empty ranking and `metadata_unavailable: true`. An empty cohort makes no Catalog request. Coverage reflects persisted detail metadata. Movies with summary-only metadata can be missing, and the cohort can exclude the long tail of watched movies.

## `GET /api/v1/admin/activity-analytics?range=30`

`range` accepts `7`, `30` or `90` and defaults to `30`. Invalid ranges and unknown query fields return 422. The API uses the current UTC calendar day and the previous N−1 days. The SQL range starts at midnight UTC on `start_date`, inclusive, and ends at midnight UTC after `end_date`, exclusive. `start_date` and `end_date` are both inclusive as date labels. The `days` array always contains exactly `range_days` dates in ascending order, including explicit zeros.

| Field inside `data` | Definition |
| --- | --- |
| `range_days`, `timezone` | Selected range as an integer and the string `UTC`. |
| `start_date`, `end_date` | Inclusive ISO calendar dates `YYYY-MM-DD`. |
| `days` | Daily rows with `date`, `registrations`, `reviews`, `ratings` and `watched_entries`. |
| `totals` | Sum of each of the four daily count fields over the returned dates. |
| `active_contributors` | Distinct Core accounts that created at least one retained review, rating record or watched entry in the range. An account contributes once across the three types and all dates. |

Daily counts use `created_at` on the currently retained rows in `users`, `reviews`, `movie_ratings` and `watched_movies`. Registrations count Core account rows, including accounts provisioned by an administrator. Hidden retained reviews count. An update to a rating keeps its original creation date. Deleted records drop out of the series. These metrics describe retained record creation and contribution activity. The query returns aggregates from one Core SQL snapshot and uses no Catalog request or individual account identifiers in the response.
