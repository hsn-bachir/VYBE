# M3 API contracts — proposed only

These routes and fields do not exist yet. Existing [M2 contracts](milestone-2-contracts.md), including the exact five-field `/auth/me` user, remain the baseline. Paths below are relative to `/api/v1` unless explicitly marked internal. The browser calls Core only. Implement each contract in its own vertical slice and update this document to match tested behavior.

## Common rules

`P` means authenticated Sanctum web session, verified email, CSRF on writes, current account state checked server-side and `Cache-Control: no-store, private`; `M` adds moderator-or-admin policy; `A` adds admin policy. Restricted accounts may use read/admin endpoints according to their role, but may not write ratings, create/edit reviews or submit reports. A restricted moderator/admin cannot perform moderation/admin mutations until restored to active. Banned/deactivated users cannot use authenticated APIs, including old sessions; logout is allowed as a cleanup operation. Their public movie browsing works as a guest. Public registration never accepts roles or account state. Existing `/auth/me` remains its five-field DTO; the proposed `GET /me/access` returns `{"data":{"role":"moderator","account_status":"active"}}` to a verified P account, 200; it contains no other user's data. Recheck it after 401/403, focus/re-entry and auth change, but server policy is authoritative.

Use `Accept: application/json`, existing `data` resource envelope and M2 pagination `meta: {page, per_page, total_pages, total_results}`. Page defaults to 1, `per_page` to 20, maximum 50; page is 1–10000. Validate canonical positive IDs through 2147483647, reject unknown query/body fields, require strict JSON booleans/numbers and at least one permitted PATCH field. Strings are Unicode-edge-trimmed. Timestamps are server UTC ISO-8601. Private/admin responses and errors are no-store. Stable list order is specified per route, without snapshot guarantees during concurrent changes.

Common errors: 401 unauthenticated; 403 unverified, restricted write or insufficient role (safe `code`, no sensitive detail); 404 absent/non-owned/invisible target; 409 state/uniqueness conflict; 419 CSRF; 422 field errors; 429 with `Retry-After`; safe 500 and 503 for service failure. Failure bodies follow existing `{message, code?}` or validation `{message, errors}` conventions. Add explicit JSON rendering/no-store paths in Core's current exception configuration for all new private routes. Writes are never automatically retried by the client. Rate limits below are starting configuration, user and IP keyed where applicable; log only safe identifiers. All changes require authorization again inside the transaction.

Representative proposed errors (messages contain no SQL, token, or target information):

```json
{"message":"This account cannot perform this action.","code":"ACCOUNT_RESTRICTED"}
```

```json
{"message":"The reported content is no longer available.","code":"TARGET_UNAVAILABLE"}
```

## Admin users — M3.1

User projection for admins is `{id, username, email, email_verified_at, role, account_status, created_at, updated_at}`. Never expose password, reset tokens, session IDs, remember token, private library, bio or avatar storage paths. Responses show data only to A. Admin list/search is throttled initially 60/minute/actor and 120/minute/IP; mutations 20/minute/actor and 60/minute/IP.

| Method and path | Request / validation | Success and behavior |
| --- | --- | --- |
| `GET /admin/users` | A; `page`, `per_page`, optional `q` (3–255 chars; exact normalized email/username or username prefix), optional `role`, `account_status`. | 200 paginated user projections, `id ASC`. No unbounded browse or arbitrary contains scan. |
| `GET /admin/users/{id}` | A; no query/body. | 200 `{data: user}`; missing 404. |
| `POST /admin/users` | A; `{username,email}` only, existing normalized username/email uniqueness and bounds. Role is always `user`, status active, email unverified. | 201 `{data:{user, invitation_delivery:"sent"\|"pending"}}`. Create a non-usable random password hash, generate one-use setup token and send after commit; never expose secret. On delivery failure retain unverified account, report `pending`, and offer explicit resend. Duplicate 422; no accidental second account on retry. |
| `POST /admin/users/{id}/invitation` | A; no body, only eligible unverified invitee; throttle 3/hour/target plus admin limits. | 202 `{data:{invitation_delivery:"sent"\|"pending"}}`; invalidate older setup token before reissue, same safe 404 for absent/ineligible. |
| `PATCH /admin/users/{id}` | A; one/both `username`, `email`; existing normalization/uniqueness. No role, status, password, verification, bio or avatar fields. | 200 updated projection; email change clears verification and revokes sessions. 422 duplicate/invalid. Same values are a no-op. |
| `PUT /admin/users/{id}/role` | A; `{role:"user"\|"moderator",reason:string}`; reason 1–1000. | 200 updated projection. Cannot promote to admin or alter any admin role through API; cannot change own role. Same role is 200/no log. Serialize last-admin protections and revoke target sessions/tokens on actual change. |
| `PUT /admin/users/{id}/status` | A; `{account_status:"active"\|"restricted"\|"banned"\|"deactivated",reason:string}`; reason 1–1000. | 200 updated projection. Same state is 200/no log. Prohibit self restriction/ban/deactivation and last active admin loss (409); role change/deactivation/ban updates are atomic with audit and revocation. Restoring sets `active`. |
| `DELETE /admin/users/{id}` | A; JSON `{reason:string}` 1–1000; explicit UI confirmation. | 204 after actual hard delete, audit and Core cascades; absent 404, self/last active admin 409. No Catalog delete. Repeating after success gives 404. Retention policy approval is a deployment gate. |

Example admin response (synthetic values):

```json
{"data":{"id":17,"username":"movie_fan","email":"fan@example.test","email_verified_at":null,"role":"user","account_status":"active","created_at":"2026-11-03T12:00:00.000000Z","updated_at":"2026-11-03T12:00:00.000000Z"}}
```

Invitation acceptance is a new M3.1 authentication flow, not currently implemented: `POST /auth/invitations/accept` (guest, CSRF-protected web stack; 5/minute/IP and 5/hour/token digest) accepts `{email,token,password,password_confirmation}`; existing registration password rules apply. Token is generated with secure randomness, stored as a hash in existing `password_reset_tokens`, expires after 60 minutes, single use, bound to normalized email and an unverified account with `invitation_pending=true`. Lock and consume token atomically, set hashed password and `email_verified_at`, clear `invitation_pending`, rotate any session, return 204; invalid/expired/used token 422 with a generic message. Email proves address control; no API can set verification directly. Do not log token or password. Reissuing or changing the email invalidates older tokens, and acceptance checks the current email and marker under lock.

## Reports and review moderation — M3.2

Moderator report representation is `{id,target_type:"review",target_id,reason,description,status,resolved_by,resolved_at,resolution_note,resolution_action,created_at,updated_at}`. Queue/detail additionally expose a minimal reporter `{id,username}` or null and a `target_available` flag plus review projection only if still present. These private DTOs never expose reporter email. The reporter's create/duplicate response includes only `{id,target_type,target_id,reason,description,status,created_at,updated_at}`; it omits moderator identity, notes and decisions, even when returning an already-closed report.

| Method and path | Request / validation | Success and behavior |
| --- | --- | --- |
| `POST /movies/{tmdb_id}/reviews/{review_id}/reports` | Active P; `{reason,description?}`; reasons `harassment`, `hate`, `spam`, `spoiler`, `other`; description null or ≤1000; target must be visible, match movie and not be own review. | 201 report; duplicate same reporter/target 200 original report unchanged; invisible/missing/wrong movie 404; own review 422. Unique constraint handles races. Start at 5/hour/user and 20/hour/IP; never auto-moderate. |
| `GET /admin/reports` | M; `page`, `per_page`, optional `status` (default pending), `target_type=review`. | 200 paginated queue, `created_at ASC, id ASC`. |
| `GET /admin/reports/{id}` | M; no body. | 200 detail; 404 missing. Deleted target returns `target_available:false`, no deleted body. |
| `POST /admin/reports/{id}/resolve` | Active M; `{action:"hide"\|"mark_spoiler",reason:string}` (1–1000). | 200 resolved report; atomically lock report/review, perform desired action and write audit. Already resolved with same action returns 200/no second action; closed with incompatible transition 409. Missing target gives 409 `TARGET_UNAVAILABLE`, allowing dismissal. |
| `POST /admin/reports/{id}/dismiss` | Active M; `{reason:string}` 1–1000. | 200 dismissed report; same repeat 200/no duplicate log; resolved report 409. Deleted target can be dismissed. |
| `GET /admin/reviews` | M; `page`, `per_page`, optional `visibility`, `tmdb_id`, `q` omitted initially. | 200 paginated moderator projection; `created_at DESC, id DESC`. Includes hidden rows, author public identity and effective/author/moderator spoiler flags; no email. |
| `PUT /admin/reviews/{id}/visibility` | Active M; `{visibility:"visible"\|"hidden",reason:string}` 1–1000. | 200 moderator projection; lock/update/log atomically. Same state 200/no log. Missing 404. |
| `PUT /admin/reviews/{id}/spoiler` | Active M; `{moderator_spoiler:boolean,reason:string}` 1–1000. | 200 moderator projection; false clears only moderator flag. Same state 200/no log; missing 404. |
| `GET /admin/actions` | M; `page`, `per_page`, optional `target_type`, `target_id`; admin and moderator actors see action metadata only, never sensitive payloads. | 200 paginated action DTO, `created_at DESC, id DESC`; admin user-management details remain admin-only (moderators see only review/report actions). |

Example report creation and result:

```json
{"reason":"spoiler","description":"The ending is revealed."}
```

```json
{"data":{"id":8,"target_type":"review","target_id":9,"reason":"spoiler","description":"The ending is revealed.","status":"pending","created_at":"2026-11-03T12:00:00.000000Z","updated_at":"2026-11-03T12:00:00.000000Z"}}
```

Existing public review list filters `visibility=visible` in the DB before count/pagination. Existing public and owner `contains_spoilers` is the effective OR; add `author_contains_spoilers`, `moderator_spoiler` and `visibility` only to the owner's resource so the editor can preserve its own selection and explain enforcement. Public DTO remains compatible and never exposes hidden review bodies. The author may edit a hidden review, which stays hidden; the moderator flag survives all edits. Owner DELETE still works, including for restricted users. A normal author cannot address the moderator routes or write moderator fields. Spoiler UI concealment is a reading preference: existing public JSON still includes visible spoiler text, as in M2.

## Recommendations — M3.3

`GET /me/recommendations` requires P, accepts no parameters, returns up to 12 movie summaries with a supported explanation and `meta` including `mode` (`personalized` or `popular`), `stale` boolean and `generated_at`. It is a bounded set, no pagination; 200 empty is valid when discovery is genuinely empty. A popular fallback has `explanation:null` and `mode:popular`. Invalid auth/state gives common errors; unavailable Catalog with no revision-matching cache yields 503, never a fake personalized empty result. Throttle initial 20/minute/user and 60/minute/IP. Sample fixture:

```json
{"data":[{"movie":{"tmdb_id":550,"title":"Fixture film","poster_path":null,"backdrop_path":null,"overview":null,"release_date":null,"tmdb_rating":7.5,"tmdb_vote_count":500},"explanation":"Because you enjoy science fiction"}],"meta":{"mode":"personalized","stale":false,"generated_at":"2026-11-03T12:00:00.000000Z"}}
```

Proposed Catalog-only `POST /api/internal/v1/movies/recommendation-candidates` requires the existing `X-VYBE-Service-Token` and JSON `{genre_ids:[878],seed_tmdb_ids:[550],limit:60}`. Require 1–3 distinct positive genre IDs, 0–5 distinct positive seed IDs, strict integer `limit` 1–60, reject unsupported fields; 422 invalid input, 403 bad token, safe 503 upstream/cache failure. 200 `{data:[{movie:<existing eight-field summary>,genre_ids:[878],director_ids:[],writer_ids:[],cast_ids:[]}],meta:{stale:false}}`; at most `limit`, deduplicated IDs, provider order, bounded arrays (genres 20, directors 4, writers 4, cast 12), no user ID or weights. Empty lists mean unavailable or no known credits and cannot support a positive explanation. Genre IDs are normalized from bounded list/discovery results; contributor IDs are cache-only. Catalog performs bounded provider calls with existing timeout, retry/cooldown and token controls; no per-candidate hydration. This is a read operation with no mutation of user data. Core validates entire envelope, safe paths, limits, unique IDs and IDs' ranges; rejects malformed responses as safe 503. Extend Catalog/client tests and deploy Catalog first. Existing summary, detail and experience contracts remain unchanged unless an explicitly documented additive change is required.

Core may perform up to five existing seed detail and three seed experience requests, one candidate call, and one existing batch summary request per computation; no per-candidate calls. Only Catalog contacts TMDB. See [architecture](../architecture/milestone-3.md) for deterministic scoring, full-library exclusions, cache revision, stale behavior and explanation rules.
