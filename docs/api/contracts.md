# Milestone 1 API contracts (proposed)

**Status:** Proposed response details for team approval; routes are **not implemented** in the audited scaffold. After approval, treat this as the shared frontend/backend contract. Keep examples aligned with tests when implemented.

## Conventions

Base URL during development: `http://localhost:8000/api/v1`. API responses are JSON, with header `Accept: application/json`. Browser app runs at `http://localhost:5173` and sends cookies using Axios `withCredentials: true` + `withXSRFToken: true`. No TMDB token in client requests.

- IDs: VYBE user IDs are internal integers; movie detail path IDs are **TMDB movie IDs** (positive integers).
- Dates: ISO `YYYY-MM-DD` or ISO 8601 timestamps.
- Successful single entity: `{ "data": { ... } }`.
- Paginated list: `{ "data": [...], "meta": { "page": 1, "total_pages": 10, "total_results": 200 } }` with only fields actually known from TMDB.
- Validation errors: Laravel-compatible `{ "message": "...", "errors": { "field": ["..."] } }` with `422`.
- Other errors (proposed normalized envelope): `{ "message": "...", "code": "UPSTREAM_UNAVAILABLE" }` with accurate status code. Never return exception traces or provider secrets.
- Decide explicitly whether stale data uses a response header (`X-Data-Stale: true`) or a stable `meta.stale` field. Proposed below: `meta.stale` for detail responses; document before frontend relies on it.

## Session authentication

**CSRF bootstrap (framework route):** `GET /sanctum/csrf-cookie` (outside `/api/v1`). Calls before login/register/logout and credentialed write operations; usually 204/200 with XSRF cookie depending on framework behavior. The user-facing SPA does not need to read the CSRF response body.

| Method | Route | Auth | Expected success | Common failures |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Guest | `201` user resource + authenticated session (proposed) | `422`, `419`, `429` |
| POST | `/api/v1/auth/login` | Guest | `200` user resource + authenticated session | `422` bad input, `401` invalid credentials, `419`, `429` |
| POST | `/api/v1/auth/logout` | Session | `204` no content | `401`, `419` |
| GET | `/api/v1/auth/me` | Session | `200` user resource | `401` |

**Register request**

```json
{ "name": "Movie Fan", "email": "fan@example.com", "password": "long-password-here", "password_confirmation": "long-password-here" }
```

Proposed validation: name required string max 100; email required valid max 255 unique (normalize case consistently); password required confirmed with an approved minimum-strength policy. Do not accept a `null` password in public registration.

**Login request**

```json
{ "email": "fan@example.com", "password": "long-password-here" }
```

Do not disclose whether the email exists or the account has a nullable password. Throttle repeated attempts. On login regenerate session ID; on logout invalidate session and regenerate CSRF token.

**User resource**

```json
{
  "data": {
    "id": 17,
    "name": "Movie Fan",
    "email": "fan@example.com",
    "avatar_url": null,
    "email_verified_at": null
  }
}
```

Never include `password`, `remember_token`, sensitive timestamps or personal OAuth tokens.

## Movie discovery

All three endpoints are **public in Milestone 1** (approved proposed policy). Apply sensible rate limits on search/provider-consuming routes. `GET` endpoints do not require CSRF bootstrap.

| Method | Route | Query / path validation | Return |
| --- | --- | --- | --- |
| GET | `/api/v1/movies/popular` | `page` integer 1..TMDB supported maximum, default 1 | `200` ordered summaries |
| GET | `/api/v1/movies/search` | `query` trimmed nonempty, bounded length; `page` positive | `200` ordered summaries |
| GET | `/api/v1/movies/{tmdb_id}` | `tmdb_id` positive integer | `200` hydrated detail |

### Popular response (shape proposal)

```json
{
  "data": [
    {
      "tmdb_id": 550,
      "title": "Example movie title",
      "poster_path": "/example.jpg",
      "backdrop_path": null,
      "overview": "Example summary",
      "release_date": "1999-10-15",
      "tmdb_rating": 8.4,
      "tmdb_vote_count": 1000
    }
  ],
  "meta": { "page": 1, "total_pages": 500, "total_results": 10000 }
}
```

Example values above are **illustrative contract placeholders**, not verified TMDB records or frontend seed data. Preserve order exactly as returned by TMDB (or its short-lived cached ranked list). Do not sort by local rating/creation time.

### Search

`GET /api/v1/movies/search?query=inception&page=1`. Return `200` with empty `data` for no matches; `422` when `query` is missing/blank/invalid. Cache key must include normalized query, page, and any locale options; avoid logging sensitive search text unnecessarily. Debounced frontend requests are optional UX, not security enforcement.

### Detail response (shape proposal)

```json
{
  "data": {
    "tmdb_id": 550,
    "title": "Example movie title",
    "original_title": "Example movie title",
    "overview": "Example synopsis",
    "poster_path": "/example.jpg",
    "backdrop_path": null,
    "release_date": "1999-10-15",
    "runtime": 139,
    "original_language": "en",
    "genres": [{ "id": 18, "name": "Drama" }],
    "tmdb_rating": 8.4,
    "tmdb_vote_count": 1000
  },
  "meta": { "stale": false }
}
```

Do **not** expose `metadata_fetched_at` in public response by default; `meta.stale` is enough for client indication. Internal DB movie `id` is optional for client DTO and should not be confused with `tmdb_id`.

## Caching and upstream failure semantics

- Movie full-detail TTL proposed: **7 days**, configurable in backend settings.
- Popular and search ranking TTL proposed: **15 minutes**, independently configurable.
- A list summary may be persisted, but `metadata_fetched_at` is updated only when full detail is hydrated.
- On detail failure, return stale persisted data with `meta.stale: true` if available. No locally cached movie -> `503` upstream unavailable (or `502` if gateway failure; decide during implementation).
- Upstream genuine movie not found maps to `404`. A provider outage must not be misreported as an unknown movie.
- On popular/search failure, return existing stale ranking **only if approved and stored in a usable format**; otherwise `503`. Never invent rankings by querying local movies.
- 429 from TMDB requires bounded retry/backoff and upstream-rate-limit observability; user-facing throttling remains separate.

## Provider images and attribution

Store TMDB-relative poster/backdrop paths; frontend composes an **approved image base/size** (or backend exposes a safe resolved URL). Never assume a path exists. Implement About/Credits TMDB notice and approved logo per [TMDB FAQ](https://developer.themoviedb.org/docs/faq).

## Test contract acceptance

Contract tests must cover status codes, validation, auth cookies/CSRF, stable fields/types, ordered pagination, 404 vs 503, stale indicators, and provider shape variations. Avoid live network in automated tests.
