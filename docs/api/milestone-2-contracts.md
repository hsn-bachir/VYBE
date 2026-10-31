# M2 public API contracts — PLANNED, NOT IMPLEMENTED

All paths below start at `/api/v1`. These are implementation proposals for M2.1–M2.5, not routes delivered in M2.0. Existing [M1 contracts](contracts.md) and auth UserResource stay compatible. Examples are synthetic contract fixtures, not TMDB results.

## Shared rules (apply to every endpoint)

`P` means Sanctum session + verified email + current-owner scope, including private GETs. `G` means guest-readable, no session/verification. All writes require CSRF and P. No client-supplied owner IDs. Private responses use `Cache-Control: no-store, private`. Public reviews expose only `{id, username, avatar_url}` for the author, never email or auth fields.

Private failures: 401 `{"message":"Unauthenticated."}`; 403 `{"message":"Your email address is not verified."}`; 419 CSRF/session mismatch; 429 throttling with Retry-After. Non-owned collections/reviews return 404 `{"message":"Not found."}`, exactly like absent resources. Validation uses 422 `{"message":"The request is invalid.","errors":{"field":["Field explanation."]}}` (Laravel's summary wording may vary). Conflict uses 409 `{"message":"A review already exists for this movie.","code":"REVIEW_EXISTS"}`. Server errors are sanitized; no raw DB/provider errors. No normal 409 for idempotent membership/rating operations. No user-level 403 for ownership, to avoid enumeration.

IDs in bodies are JSON integers 1–2147483647; route/query IDs are canonical decimal strings (no signs, leading zeros, decimals). Invalid IDs return 422; a valid absent collection/review ID returns 404. Proposed movie-reference policy accepts well-formed IDs without live existence checks; no Catalog 404 is manufactured from a cache miss. Public ratings/review lists for valid but unrecorded movie IDs return empty results. This policy requires review before M2.1.

Only documented fields are mutable. Reject unsupported body keys with 422, including `user_id`, timestamps, emails/passwords in profile writes, and privacy flags. Empty PATCH is 422. GETs have no body; DELETEs have no body/query. Query parameters not listed are ignored, following current movie endpoints. Proposed write limits and session behavior are in [security architecture](../architecture/milestone-2.md).

### Pagination and response examples

All new collection/list endpoints accept `page` integer 1–10000, `per_page` integer 1–50 (default 20). Return existing-style `data` + `meta`, using `page`, `per_page`, `total_pages`, `total_results`; total_pages is 0 when empty. Out-of-range existing pages return empty data with true totals. Pagination is offset-based, not a stable snapshot during concurrent edits. No list is unbounded. A scalar GET returns `{data: object|null}`. Timestamps are UTC ISO-8601 (same convention as `email_verified_at`); legacy null timestamps stay null. 204 has no JSON body.

Library listing example (watchlist, watched, collection movies):

```json
{"data":[{"tmdb_id":550,"created_at":"2026-10-30T12:00:00.000000Z","movie":{"tmdb_id":550,"title":"Fixture movie","poster_path":null,"backdrop_path":null,"overview":null,"release_date":null,"tmdb_rating":8.4,"tmdb_vote_count":1000},"metadata_status":"available"},{"tmdb_id":551,"created_at":"2026-10-29T12:00:00.000000Z","movie":null,"metadata_status":"missing"}],"meta":{"page":1,"per_page":20,"total_pages":1,"total_results":2,"metadata_unavailable":false}}
```

Watched rows additionally include `watched_at`. Catalog failure preserves all rows with `metadata_status: "unavailable"`, `movie: null`, and `meta.metadata_unavailable: true`. Stored summaries can be stale; `available` promises presence only. Total counts always count Core records. Writes return relationship objects without fetching metadata. All examples below reuse these defined shapes; they are normative references, not omitted endpoint behavior.

## M2.1 Watchlist and Watched

| Method/path | Access; query/body | Success example | Behavior / consumer / additional errors |
| --- | --- | --- | --- |
| GET `/me/watchlist` | P; pagination | 200 library listing above | Created DESC, id DESC; Library watchlist. Read-only; 422 invalid query. |
| POST `/me/watchlist` | P; `{"tmdb_id":550}` | 201 `{"data":{"tmdb_id":550,"created_at":"2026-10-30T12:00:00.000000Z"}}` | Same body → 200 existing row, unchanged timestamps; Details action. 422 invalid body. |
| DELETE `/me/watchlist/{tmdb_id}` | P; none | 204 empty | Absent owned membership also 204; no other owner lookup; Details/Library removal. 422 invalid ID. |
| GET `/me/watched` | P; pagination | 200 library listing with `watched_at` per row | Watched_at DESC, id DESC; Library watched. 422 invalid query. |
| POST `/me/watched` | P; `{"tmdb_id":550}` | 201 `{"data":{"tmdb_id":550,"watched_at":"2026-10-30T12:00:00.000000Z","created_at":"2026-10-30T12:00:00.000000Z"}}` | Duplicate → 200 unchanged; server first-mark time, no automatic watchlist/collection removal. Details. 422 invalid body. |
| DELETE `/me/watched/{tmdb_id}` | P; none | 204 empty | Idempotent, absent → 204; Details/Library. 422 invalid ID. |
| GET `/me/movies/{tmdb_id}/library-state` | P; none | 200 `{"data":{"tmdb_id":550,"in_watchlist":true,"watched_at":null}}` | Bounded two indexed membership lookups; Details action state without downloading lists. No metadata lookup. 422 invalid ID. |

POST add-if-absent operations are effect-idempotent; retries do not update times. Separate unique keys allow coexistence in both lists. All private shared errors apply; no missing-membership 404/409.

## M2.2 Collections

Collection object example: `{"id":7,"name":"Favorites","description":null,"movie_count":0,"created_at":"2026-10-30T12:00:00.000000Z","updated_at":"2026-10-30T12:00:00.000000Z"}`. Name trims edges, required 1–100 characters; nullable description max 2000. Owner-local case/accent-insensitive name uniqueness; duplicates and rename conflicts return 422 `errors.name`. Empty collection is a normal object with movie_count 0.

| Method/path | Access; query/body | Success example | Behavior / consumer / additional errors |
| --- | --- | --- | --- |
| GET `/me/collections` | P; pagination; optional `contains_tmdb_id=550` | 200 `{"data":[{"id":7,"name":"Favorites","description":null,"movie_count":0,"created_at":"2026-10-30T12:00:00.000000Z","updated_at":"2026-10-30T12:00:00.000000Z","contains_movie":false}],"meta":{"page":1,"per_page":20,"total_pages":1,"total_results":1}}` | Lists all owner's collections, newest first. Optional ID adds contains_movie to each row; does **not** filter to matching collections. Use indexed EXISTS + withCount, no N+1. Library and Save modal. 422 invalid query. |
| POST `/me/collections` | P; `{"name":"Favorites","description":null}` | 201 `{"data": collection object above}` | Not idempotent: repeated name returns 422; Create modal. |
| GET `/me/collections/{id}` | P; none | 200 `{"data": collection object above}` | Summary only; separate paginated movie list; collection page. 404 absent/non-owned, 422 malformed ID. |
| PATCH `/me/collections/{id}` | P; `{"name":"Weekend","description":"Films to revisit"}` (one or both fields) | 200 `{"data":{"id":7,"name":"Weekend","description":"Films to revisit","movie_count":0,"created_at":"2026-10-30T12:00:00.000000Z","updated_at":"2026-10-30T13:00:00.000000Z"}}` | Last committed edit wins; repeating identical values makes no business change; editor. 404 or 422. |
| DELETE `/me/collections/{id}` | P; none | 204 empty | Cascade memberships only. Subsequent DELETE 404 (effect idempotent); Library. 404/422. |
| GET `/me/collections/{id}/movies` | P; pagination | 200 library listing | Membership created DESC, id DESC; collection detail. 404/422. |
| POST `/me/collections/{id}/movies` | P; `{"tmdb_id":550}` | 201 `{"data":{"collection_id":7,"tmdb_id":550,"created_at":"2026-10-30T12:00:00.000000Z"}}` | Duplicate → 200 same relationship, timestamps unchanged; modal. 404 collection, 422 input. |
| DELETE `/me/collections/{id}/movies/{tmdb_id}` | P; none | 204 empty | Owned collection required, missing membership → 204. 404 collection, 422 malformed IDs. Modal/detail. |

Save modal fetches `/me/collections?contains_tmdb_id=...` page by page; do not request each collection separately for membership or load unbounded IDs. Each selection sends only its add/remove operation. Track per-item pending/error state; a failure must not claim all choices saved. No bulk replace endpoint or global transaction across modal selections. Concurrent collection deletion is protected by the local FK/transaction and maps to 404. Deletion never changes watched/watchlist/ratings/reviews.

## M2.3 Ratings

No dependency on a review. Rating JSON integer 1–5, no half stars. Statistics are VYBE-only, distinct from `tmdb_rating` (0–10).

| Method/path | Access; query/body | Success example | Behavior / consumer / additional errors |
| --- | --- | --- | --- |
| GET `/movies/{tmdb_id}/ratings` | G; none | 200 `{"data":{"tmdb_id":550,"average_rating":4.5,"total_ratings":2,"distribution":{"1":0,"2":0,"3":0,"4":1,"5":1}}}` | Details histogram; read-only, 422 invalid ID. Empty → average_rating null, total 0, all five buckets 0. Average rounded to two decimals. |
| GET `/me/ratings/{tmdb_id}` | P; none | 200 `{"data":{"tmdb_id":550,"rating":5,"updated_at":"2026-10-30T12:00:00.000000Z"}}` | No rating → `{"data":null}`; Details personal stars. 422 invalid ID. |
| PUT `/me/ratings/{tmdb_id}` | P; `{"rating":4}` | 200 `{"data":{"tmdb_id":550,"rating":4,"updated_at":"2026-10-30T13:00:00.000000Z"}}` | Atomic create/replace; 200 for both, avoids racy insert-status checks. Repeating same rating has same business effect; updated_at may advance. 422. |
| DELETE `/me/ratings/{tmdb_id}` | P; none | 204 empty | Missing rating also 204; independent of reviews/watched. 422. |

Compute all buckets in one grouped DB query and derive count/average from the same result. No persistent aggregate or cache initially. Concurrent PUTs use last committed value. Private shared errors apply; no duplicate conflict/404 for this singleton.

## M2.4 Reviews

Review shape (public and owner's write response):

```json
{"id":9,"tmdb_id":550,"author":{"id":17,"username":"movie_fan","avatar_url":null},"body":"A memorable final scene.","contains_spoilers":true,"created_at":"2026-10-30T12:00:00.000000Z","updated_at":"2026-10-30T12:00:00.000000Z"}
```

| Method/path | Access; query/body | Success example | Behavior / consumer / additional errors |
| --- | --- | --- | --- |
| GET `/movies/{tmdb_id}/reviews` | G; pagination | 200 `{"data": [review object above], "meta":{"page":1,"per_page":20,"total_pages":1,"total_results":1}}` | Public Details list; created_at DESC, id DESC; never reordered on edit. No records → empty envelope. 422. |
| GET `/me/reviews/{tmdb_id}` | P; none | 200 `{"data": review object above}` | Absent → data null; Details composer edit state without scanning public pages. 422. |
| POST `/movies/{tmdb_id}/reviews` | P; `{"body":"A memorable final scene.","contains_spoilers":true}` | 201 `{"data": review object above}` | One per user/movie; duplicate (including races) → 409 REVIEW_EXISTS, never silently replace. 422. |
| PATCH `/movies/{tmdb_id}/reviews/{review_id}` | P; `{"body":"Updated thoughts.","contains_spoilers":false}` (one or both fields) | 200 `{"data": review object with updated body/flag/updated_at}` | Owner and movie must match; last committed edit wins. 404 absent/non-owned/wrong movie; 422 invalid fields/IDs. |
| DELETE `/movies/{tmdb_id}/reviews/{review_id}` | P; none | 204 empty | Same ownership/movie checks; subsequent delete 404, no rating deletion. 404/422. |

Trim body, require 1–5000 characters after trimming. `contains_spoilers` optional on create (default false), strict JSON boolean when supplied; omitted on PATCH preserves value. Render plain text with escaped output, never HTML/Markdown execution. Spoiler text is delivered publicly but hidden in UI until explicit reveal; edits/new review IDs reset reveal state. No author email, public profile route, replies, likes, reporting or moderation state.

## M2.5 Profile

Keep `/auth/me` and its exact five-field UserResource. Profile wraps that same resource rather than redefining identity:

```json
{"data":{"user":{"id":17,"username":"movie_fan","email":"fan@example.com","avatar_url":null,"email_verified_at":"2026-10-30T11:00:00.000000Z"},"bio":null,"member_since":"2026-10-30T10:00:00.000000Z","statistics":{"watched_count":0,"watchlist_count":0,"review_count":0}}}
```

| Method/path | Access; query/body | Success example | Behavior / consumer / additional errors |
| --- | --- | --- | --- |
| GET `/me/profile` | P; none | 200 profile envelope above | Profile page; includes indexed counts, no separate stats request required. Read-only. |
| PATCH `/me/profile` | P; `{"username":"movie_fan2","bio":"Cinema enthusiast"}` (one or both) | 200 profile envelope with new username/bio | Existing lowercase username validation/reserved words/unique constraint; bio nullable max 500, blank → null. Idempotent business values; 422 duplicate username/invalid or forbidden fields. |
| POST `/me/profile/avatar` | P; multipart `avatar` file | 200 profile envelope with server-managed avatar_url | Proposed upload contract; PNG/JPEG/WebP only, max 2 MiB, max 2048×2048, min 1×1; 422 invalid upload, 413 infrastructure body limit. Replacement is not idempotent at storage level. |
| DELETE `/me/profile/avatar` | P; none | 200 profile envelope with avatar_url null | Idempotent, absent already → 200 same profile. |

Avatar proposal: Core's configured Laravel local public disk, random server filename, decoded/re-encoded raster (strip metadata), MIME/content and dimensions validation, no SVG or arbitrary URL input/fetch. Replace URL only after successful storage; clean up only owned previous files, never arbitrary legacy URLs. Serve from fixed configured origin with content-type/nosniff; production persistence/backups and available GD/Imagick support must be reviewed in M2.5. No media service or storage dependency is introduced in M2.0. Public review author avatars must use the same safe managed URL policy.

## Required slice verification

Exercise guest/unverified/owner/non-owner sessions, actual CSRF (including requests without Origin), 401/403/404/409/419/422/429, bounded lists, SQL uniqueness races, cascades, rating independence, spoiler rendering, safe author projections, Catalog partial/outage states and query counts. Use provider HTTP fakes. Exact UI plans and query invalidation live in [frontend contracts](../architecture/milestone-2-frontend.md).
