# Administration statistics and Movie Insights

M7.1–M7.3 implement part of PDF item 11. Both endpoints use the existing Sanctum session, verified email, live role and status checks, and `admin-read` throttle of 60 requests per minute per actor and 120 per IP. Responses use `Cache-Control: no-store, private`. Verified active and restricted administrators can read both endpoints. Moderators can read the existing overview projection. Guests receive 401. Unverified, banned, deactivated and insufficiently privileged accounts receive 403 where authorization fails. Throttled requests receive 429.

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

The `users` and `activity` objects are administrator-only. The moderator projection contains the four moderation counts and `recent_reports`. The overview performs two domain SQL statements and makes zero Catalog calls. Active-user metrics are tracked under M7.5.

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
