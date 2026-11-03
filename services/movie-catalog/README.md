# VYBE Movie Catalog Service

Independent Laravel REST API for normalized movie metadata and TMDB-ordered discovery. Owns only `vybe_movies`; no Core classes, users, browser sessions or cross-database queries. Core and other authorized backend clients consume its versioned HTTP contract. React must use Core.

## Start locally

From this directory run `composer install`. Copy `.env.example` to `.env` only if absent, generate the initial key with `php artisan key:generate`, then configure the Catalog database and secrets. Create `vybe_movies` first:

```powershell
php artisan migrate
php artisan serve --host=localhost --port=8001
```

No new migration is introduced. Existing movies/cache/cache_locks/jobs migrations remain authoritative. Do not reset development data. Catalog runs independently of Core. `/up` is process liveness; `/api/internal/v1/health` is a token-protected probe. Neither checks TMDB readiness.

## Configuration

| Variable | Default / meaning |
| --- | --- |
| `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Catalog-owned MySQL/MariaDB connection; database `vybe_movies` |
| `CATALOG_INTERNAL_TOKEN` | Required shared backend secret, compared in constant time |
| `TMDB_TOKEN` | Required TMDB API Read Access Token, server-side bearer auth |
| `CATALOG_METADATA_TTL_SECONDS` | `604800`: seven-day detail freshness |
| `CATALOG_RANKING_TTL_SECONDS` | `900`: fifteen-minute ranking expiration |
| `CATALOG_REFRESH_COOLDOWN_SECONDS` | `30`: delay after failed detail refresh |
| `TMDB_CONNECT_TIMEOUT_SECONDS` | `2`, constrained to 1–5 seconds |
| `TMDB_REQUEST_TIMEOUT_SECONDS` | `5`, constrained to 1–15 seconds per attempt |
| `CACHE_STORE` | `database`; shared Catalog cache and locks across workers |

Run `php artisan config:clear` after local configuration changes. Use positive TTLs and a persistent shared cache in deployment; `array` is for tests. No frontend `VITE_*` secrets. Use TLS and restricted networking outside localhost. Rotate the shared service secret in all clients together; per-client identities/scopes are not implemented.

## Internal API and manual checks

All routes require `X-VYBE-Service-Token`, with no cookies or CSRF bootstrap. Missing/invalid credentials return `403 FORBIDDEN`; absent server token configuration fails closed with `503 SERVICE_MISCONFIGURED`.

| GET route under `/api/internal/v1` | Behavior |
| --- | --- |
| `/health` | `{ "status": "ok", "service": "movie-catalog" }` |
| `/movies/popular?page=1` | Ordered summaries with pagination |
| `/movies/search?query=...&page=1` | Ordered search, including empty results |
| `/movies/{tmdb_id}` | Full details with `meta.stale` |

Page defaults to 1 and accepts integers 1–500. Search trims/collapses whitespace, preserves case and accepts 1–200 characters. IDs must be canonical positive integers through 2147483647 (TMDB int32); malformed IDs return 422. Only English (`en-US`) is supported. Optional provider filters are not exposed. `total_pages` is capped at 500; `total_results` retains the provider count. Extra parameters are ignored, not forwarded.

Set `CATALOG_INTERNAL_TOKEN` securely in your terminal to match the service configuration:

```powershell
$headers = @{ 'X-VYBE-Service-Token' = $env:CATALOG_INTERNAL_TOKEN; Accept = 'application/json' }
$base = 'http://localhost:8001/api/internal/v1'
Invoke-RestMethod "$base/health" -Headers $headers
Invoke-RestMethod "$base/movies/popular?page=1" -Headers $headers
Invoke-RestMethod "$base/movies/search?query=Arrival&page=1" -Headers $headers
$movies = Invoke-RestMethod "$base/movies/popular?page=1" -Headers $headers
Invoke-RestMethod "$base/movies/$($movies.data[0].tmdb_id)" -Headers $headers
curl.exe -i "$base/movies/popular" # expected 403 without token
```

Exact response examples: [API contracts](../../docs/api/contracts.md). Test/doc movie values are synthetic fixtures, never seeded application content.

## Caching, persistence and failures

`MovieService` orchestrates the native HTTP `TmdbClient`, `MovieNormalizer`, Eloquent and API Resources. Unique-index upserts prevent duplicate `tmdb_id` rows. Malformed optional dates, image paths and numbers become null; required IDs/titles, detail genre structures and ranking envelopes must be valid. Unknown provider fields never reach clients. Ratings are JSON numbers; absent values remain null and empty genres serialize as `[]`.

Summary upserts omit absent/null fields from updates, preserve runtime/genres and never set `metadata_fetched_at`. Details are fetched when missing, summary-only or expired. Only successful hydration sets freshness. A nonblocking per-movie cache lock limits concurrent refreshes. Contending requests receive hydrated stale details or 503 if no hydrated copy exists. The lock outlives both bounded HTTP attempts and is released on success/failure. Failed refreshes trigger a short per-movie cooldown.

Rankings cache normalized provider snapshots, retaining order and summary values even if details later change. Keys distinguish operation, page, normalized query and fixed language/adult policy. Expired rankings must be fetched again; there is **no stale-ranking fallback** or local popularity sort. Concurrent cold list misses may each call TMDB; unique upserts still prevent duplicate rows.

Connection failures/timeouts and HTTP 500/502/503/504 receive at most one retry after 200 ms. Authentication/validation errors, malformed payloads and genuine 404s are not retried. Provider 429 or transient server responses with `Retry-After` defer further calls using shared cache (seconds or HTTP date; 30-second fallback), without sleeping a web worker for a long delay.

Genuine detail 404 returns `MOVIE_NOT_FOUND`, even with an old row. Outages, provider authentication failures, rate limits and malformed responses return `503 UPSTREAM_UNAVAILABLE`, or hydrated details with `meta.stale: true`. Summary-only rows cannot be an outage fallback. Unexpected errors return safe `500 INTERNAL_ERROR`, even in debug mode. No local client throttle is introduced; provider 429 maps to 503. The integration never logs provider bodies, tokens or authorization headers.

## Tests

### M2.0 cache-only batch summaries

`POST /api/internal/v1/movies/summaries` accepts JSON `{"tmdb_ids":[550,551]}` with the same internal token. Maximum 50 strict positive integer IDs; duplicates collapse in first-occurrence order. One database query returns persisted summary DTOs and `meta.requested_count`, `returned_count`, `missing_tmdb_ids`. Missing rows are reported with 200, not hydrated. Stale/summary-only rows are allowed; no TMDB token or provider call is needed for this operation. See the [full contract](../../../docs/api/catalog-batch-summaries.md) and [verification record](../../../docs/development/m2-foundation-report.md). No new configuration or migration is required.

```powershell
Invoke-RestMethod "$base/movies/summaries" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"tmdb_ids":[550,551]}'
```

```powershell
composer validate --strict
composer check-platform-reqs
php artisan test
php vendor/bin/pint --test
```

Tests use `Http::fake()` and reject stray HTTP; no real credentials are required. Default database is SQLite `:memory:`. For MySQL/MariaDB, create a new disposable database (e.g. `vybe_catalog_disposable_test`) on an isolated instance, then set `APP_ENV=testing`, `DB_CONNECTION=mysql`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_URL=''`, `CACHE_STORE=array` in that terminal before `php artisan migrate --force` and `php artisan test`. PHPUnit respects externally supplied database variables. **RefreshDatabase resets the selected test database: never use development/shared data.**

Coverage includes service auth, validation, provider paths/auth/timeouts/retries, payloads, persistence/uniqueness, freshness/cooldown, lock contention, database cache, ordered snapshots, query/page separation, expiry, empty search and safe errors. Lock contention is deterministic, not a multiprocess load test. Existing CI separately verifies MySQL 8 migrations and runs Catalog tests; local MariaDB does not establish hosted CI success.

## Core integration

Core's existing `MovieCatalogClient` uses `MOVIE_CATALOG_URL=http://localhost:8001` and matching `MOVIE_CATALOG_TOKEN`, bounded HTTP, normalized DTOs and safe errors. Core/React discovery is implemented. M2.0 extends the client with `summaries()`; future Library pages will consume it without adding public batch access. No new credentials/configuration are required. Core uses no retries and a default 12-second timeout, accommodating Catalog's two provider attempts for existing discovery/detail operations.

Provider references: [popular](https://developer.themoviedb.org/reference/movie-popular-list), [search](https://developer.themoviedb.org/reference/search-movie), [details](https://developer.themoviedb.org/reference/movie-details), [bearer auth](https://developer.themoviedb.org/docs/authentication-application), [errors/page limit](https://developer.themoviedb.org/docs/errors), [rate limiting](https://developer.themoviedb.org/docs/rate-limiting).
