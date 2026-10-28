# VYBE Milestone 1 — browser-facing and internal API contracts

**Status:** Core auth, public Core movies and internal Catalog endpoints are implemented and tested. Core and Catalog preserve the same normalized movie DTOs.

## A. Public Core API — `http://localhost:8000/api/v1`

Browser: `http://localhost:5173`; `Accept: application/json`, Axios `withCredentials: true`, `withXSRFToken: true`. **Sanctum CSRF bootstrap**: `GET http://localhost:8000/sanctum/csrf-cookie`, outside `/api/v1`. Login cookies are browser/Core-only; never forwarded to Catalog.

### Auth

Implemented in Core and React. Registration passwords require 12–255 characters, at least one letter and one number, and matching confirmation. Usernames are lowercased and validated; emails are trimmed and lowercased consistently. Login accepts existing shorter passwords (maximum 255). Invalid credentials return `401 {"message":"Invalid email or password."}` for unknown, incorrect-password and null-password accounts alike. Successful auth responses have `Cache-Control: no-store, private`.

Auth writes require session CSRF protection even without an Origin header. Call `/sanctum/csrf-cookie` before each auth write. Login is limited to 5 requests/minute per normalized email/IP and 30/minute per IP; registration to 5/minute per IP. Throttled responses include `Retry-After`. A 419 requires a fresh CSRF bootstrap and explicit resubmission, not automatic write replay.

| Verb | Route | Session needed | Success |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | `201 {data: User}` and session |
| POST | `/auth/login` | No | `200 {data: User}` and session |
| POST | `/auth/logout` | Yes | `204` no body |
| GET | `/auth/me` | Yes | `200 {data: User}` |
| GET | `/auth/email/verification-status` | Yes | `200 {data: User}` |
| POST | `/auth/email/verification-notification` | Yes + CSRF | `200 {message: "Verification link sent."}` or `200 {message: "Email already verified."}` |

`/auth/me`, logout, verification status and resend remain available to signed-in unverified users. Private Core features added later must apply `auth:sanctum` and `verified`; unverified requests receive 403. Public movie GET routes do not require authentication or verification. Registration and login return actual `email_verified_at` so the SPA can send unverified users to `/verify-email`.

Laravel's email notification links to `GET /email/verify/{id}/{hash}?expires=...&signature=...` at the Core origin. The link expires after `EMAIL_VERIFICATION_EXPIRE_MINUTES` (default 60). It requires the signed URL and the same authenticated account. Success redirects to `/verify-email/success` on `FRONTEND_URL`; expired/invalid/account mismatch redirects to `/verify-email/error?reason=expired|invalid|account`. A valid link without a session redirects to `/login?verification=sign-in`. No user-supplied redirect URL is accepted. Resend is limited to three requests per minute per user and returns 429 thereafter.

Register body: `{ "username":"movie_fan", "email":"fan@example.com", "password":"Cinema-lover123", "password_confirmation":"Cinema-lover123" }`. Validate username 3..30, email <=255 and unique, password required/confirmed. Login body `{ "email":"...", "password":"..." }`; return identical generic failure for unknown or null-password accounts. Never send password, hash, remember token or service credentials in API responses.

**User DTO:**

```json
{"data":{"id":17,"username":"movie_fan","email":"fan@example.com","avatar_url":null,"email_verified_at":null}}
```

### Movie discovery (public GET; no user session required)

Implemented by Core's `MovieController` and `MovieCatalogClient`. Pages accept integers 1–500 (default 1); search trims/collapses whitespace and accepts 1–200 characters; IDs accept canonical positive int32 values. These routes have no authentication or email-verification middleware. The SPA retains its established verification flow for signed-in unverified users.

Core validates Catalog envelopes and returns only the documented DTO fields and pagination/stale metadata. No arbitrary Catalog response headers or diagnostic text are proxied. Core's default 12-second request timeout accommodates Catalog provider retries; Core itself does not retry. Configure `MOVIE_CATALOG_URL`, `MOVIE_CATALOG_TOKEN`, `MOVIE_CATALOG_CONNECT_TIMEOUT_SECONDS=2`, `MOVIE_CATALOG_TIMEOUT_SECONDS=12` on the server only. Internal auth failures, unknown 404s, provider throttling, connection failures and malformed responses become `503 UPSTREAM_UNAVAILABLE`; genuine Catalog movie 404 and recognized field validation errors retain 404/422.

| Route | Validation | Behavior |
| --- | --- | --- |
| `/movies/popular?page=1` | page positive, max TMDB supported page | Core forwards to Catalog; returns ordered summaries |
| `/movies/search?query=...&page=1` | trimmed nonblank query, length <= 200, valid page | Core forwards, preserves rank |
| `/movies/{tmdb_id}` | positive integer TMDB ID | Core returns normalized detail |

List shape:

```json
{"data":[{"tmdb_id":550,"title":"Example title","poster_path":null,"backdrop_path":null,"overview":null,"release_date":null,"tmdb_rating":8.4,"tmdb_vote_count":1000}],"meta":{"page":1,"total_pages":1,"total_results":1}}
```

Detail shape:

```json
{"data":{"tmdb_id":550,"title":"Example title","original_title":"Example title","overview":null,"poster_path":null,"backdrop_path":null,"release_date":null,"runtime":null,"original_language":"en","genres":[],"tmdb_rating":8.4,"tmdb_vote_count":1000},"meta":{"stale":false}}
```

Example movie values illustrate the **contract only**, not actual TMDB results or mock UI data. `tmdb_id` is not the local movie PK. Frontend builds image URLs using approved TMDB image sizing and shows the official attribution in About/Credits.

## B. Internal Movie Catalog API — `http://localhost:8001/api/internal/v1`

Called by **Core or another authorized backend** over HTTP. Each internal business request must contain `X-VYBE-Service-Token: <secret>`, verified with constant-time comparison. No session cookies, CSRF bootstrap or user JWT. Protect network reachability in real deployments. The shared token authenticates services collectively; per-client scopes are not implemented.

| Verb | Internal route | Catalog behavior |
| --- | --- | --- |
| GET | `/movies/popular?page=1` | Provider-ordered popular list, independent short cache |
| GET | `/movies/search?query=...&page=1` | Provider-ordered search, independent short cache |
| GET | `/movies/{tmdb_id}` | Metadata cache and detail hydration |
| GET | `/health` | Token-protected liveness probe; no DB/TMDB readiness guarantee |

The Catalog returns the same normalized movie DTO shapes as Core; Core validates/map errors, but should not blindly relay arbitrary internal response headers. The separate health probe is **not** an application feature. Laravel's `/up` can provide bare liveness and should expose no secrets.

## Error contract

Internal Catalog validation: `page` defaults to 1, integer 1–500; search query required, whitespace trimmed/collapsed, case preserved, length at most 200; `tmdb_id` canonical positive integer 1–2147483647. Invalid identifiers return 422 through request validation. Only `en-US` is supported; additional filters/languages are ignored rather than forwarded. Search excludes adult results. List `total_pages` is capped at 500; `total_results` is the provider total. A valid empty search returns `{"data":[],"meta":{"page":1,"total_pages":0,"total_results":0}}`.

The list/detail examples above are also the exact internal envelopes. Ratings are JSON numbers (rounded to two decimal places), vote counts are integers, dates are `YYYY-MM-DD` or null, image paths are safe relative paths or null. Local primary keys, timestamps and provider-only fields are omitted.

| Condition | Status | Shape |
| --- | --- | --- |
| Invalid input | 422 | `{ "message":"...", "errors":{"query":["..."]} }` |
| Invalid login / session | 401 | `{ "message":"Unauthenticated." }` (or approved equivalent) |
| Catalog bad/missing service token | 403 | `{ "message":"Forbidden.", "code":"FORBIDDEN" }` |
| Catalog token configuration absent | 503 | `{ "message":"Service authentication is not configured.", "code":"SERVICE_MISCONFIGURED" }` |
| Unknown TMDB movie | 404 | `{ "message":"Movie not found", "code":"MOVIE_NOT_FOUND" }` |
| Catalog/TMDB unavailable | 503 | `{ "message":"Movie service unavailable", "code":"UPSTREAM_UNAVAILABLE" }` |
| Client/provider throttling | 429 / 503 | Distinguish client vs upstream, do not leak secrets |
| CSRF mismatch | 419 | Session/CSRF recovery, not silent bypass |
| Unexpected Catalog error | 500 | `{ "message":"Internal server error", "code":"INTERNAL_ERROR" }` even with debug enabled |

Time out Core → Catalog, fail gracefully if Catalog is down, and avoid infinite retry loops. Provider outages may yield cached **stale details** with `meta.stale: true`; rankings can only be returned if a genuine previously cached ordered response exists. List ordering always follows TMDB.

### Cache configuration (Catalog only)

- `CATALOG_METADATA_TTL_SECONDS=604800` (seven days)
- `CATALOG_RANKING_TTL_SECONDS=900` (fifteen minutes)
- Never refresh detail `metadata_fetched_at` on summary-only search/popular results.

### Contract testing

Catalog returns 503 for provider authentication/validation failures, 429, malformed payloads, timeouts and server outages unless hydrated stale details exist. A genuine detail 404 is not masked by stale metadata. No Catalog client-facing throttle is configured; 429 remains applicable to Core's existing throttles. Native HTTP connection/500/502/503/504 failures receive at most one retry after 200 ms. Provider `Retry-After` (seconds or HTTP date) defers subsequent provider calls in shared cache; 429 without usable guidance defaults to 30 seconds.

Ranking keys include operation, page, normalized query and the fixed language/adult policy. Snapshots expire after `CATALOG_RANKING_TTL_SECONDS`; this implementation has no stale-ranking fallback. Only complete detail hydration sets `metadata_fetched_at`. Per-ID locks prevent simultaneous detail refreshes: contenders receive stale hydrated details or 503. Failed refreshes have `CATALOG_REFRESH_COOLDOWN_SECONDS=30` cooldown. The cache must be shared across Catalog workers. See [manual API requests and configuration](../../services/movie-catalog/README.md).

Fake Catalog HTTP in Core tests and fake TMDB in Catalog tests. Validate the exact public/internal payloads, 401/403/419/422/404/429/503, query validation, pagination order, and stale behavior before declaring endpoints complete.
