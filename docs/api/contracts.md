# VYBE Milestone 1 — browser-facing and internal API contracts

**Status:** Team-approved architectural boundaries and proposed concrete payloads. Routes remain unimplemented unless verified by code/tests. Keep Core and Catalog response mappings consistent.

## A. Public Core API — `http://localhost:8000/api/v1`

Browser: `http://localhost:5173`; `Accept: application/json`, Axios `withCredentials: true`, `withXSRFToken: true`. **Sanctum CSRF bootstrap**: `GET http://localhost:8000/sanctum/csrf-cookie`, outside `/api/v1`. Login cookies are browser/Core-only; never forwarded to Catalog.

### Auth

| Verb | Route | Session needed | Success |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | `201 {data: User}` and session |
| POST | `/auth/login` | No | `200 {data: User}` and session |
| POST | `/auth/logout` | Yes | `204` no body |
| GET | `/auth/me` | Yes | `200 {data: User}` |

Register body: `{ "name":"Movie Fan", "email":"fan@example.com", "password":"strong-password", "password_confirmation":"strong-password" }`. Validate name 1..100, email <=255 and unique, password required/confirmed. Login body `{ "email":"...", "password":"..." }`; return identical generic failure for unknown or null-password accounts. Never send password, hash, remember token or service credentials in API responses.

**User DTO:**

```json
{"data":{"id":17,"name":"Movie Fan","email":"fan@example.com","avatar_url":null,"email_verified_at":null}}
```

### Movie discovery (public GET; no user session required)

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

Called only by **Core** over backend HTTP. Each internal business request must contain `X-VYBE-Service-Token: <secret>`, verified with constant-time comparison. No session cookies, CSRF bootstrap or user JWT. Protect network reachability in real deployments.

| Verb | Internal route | Catalog behavior |
| --- | --- | --- |
| GET | `/movies/popular?page=1` | Provider-ordered popular list, independent short cache |
| GET | `/movies/search?query=...&page=1` | Provider-ordered search, independent short cache |
| GET | `/movies/{tmdb_id}` | Metadata cache and detail hydration |
| GET | `/health` | Token-protected starter integration probe (implemented by scaffold) |

The Catalog returns the same normalized movie DTO shapes as Core; Core validates/map errors, but should not blindly relay arbitrary internal response headers. The separate health probe is **not** an application feature. Laravel's `/up` can provide bare liveness and should expose no secrets.

## Error contract

| Condition | Status | Shape |
| --- | --- | --- |
| Invalid input | 422 | `{ "message":"...", "errors":{"query":["..."]} }` |
| Invalid login / session | 401 | `{ "message":"Unauthenticated." }` (or approved equivalent) |
| Catalog bad/missing service token | 403 | Never disclose expected token |
| Unknown TMDB movie | 404 | `{ "message":"Movie not found", "code":"MOVIE_NOT_FOUND" }` |
| Catalog/TMDB unavailable | 503 | `{ "message":"Movie service unavailable", "code":"UPSTREAM_UNAVAILABLE" }` |
| Client/provider throttling | 429 / 503 | Distinguish client vs upstream, do not leak secrets |
| CSRF mismatch | 419 | Session/CSRF recovery, not silent bypass |

Time out Core → Catalog, fail gracefully if Catalog is down, and avoid infinite retry loops. Provider outages may yield cached **stale details** with `meta.stale: true`; rankings can only be returned if a genuine previously cached ordered response exists. List ordering always follows TMDB.

### Cache configuration (Catalog only)

- `CATALOG_METADATA_TTL_SECONDS=604800` (seven days)
- `CATALOG_RANKING_TTL_SECONDS=900` (fifteen minutes)
- Never refresh detail `metadata_fetched_at` on summary-only search/popular results.

### Contract testing

Fake Catalog HTTP in Core tests and fake TMDB in Catalog tests. Validate the exact public/internal payloads, 401/403/419/422/404/429/503, query validation, pagination order, and stale behavior before declaring endpoints complete.
