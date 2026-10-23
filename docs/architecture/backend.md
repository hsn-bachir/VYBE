# Backend architecture — Core and Catalog

**Status:** Approved implementation target; the foundation package adds Catalog scaffold only. Endpoint features still require their own PRs.

## Core API (`backend/`)

Independently runnable Laravel application on `http://localhost:8000`, connected to `vybe_core`. It is the sole browser-facing API and owns Sanctum sessions and users. Its responsibilities are registration/login/logout/me, validation, authentication throttles, and a public movie façade that requests Catalog through a server-configured `MovieCatalogClient`.

```text
backend/app/
  Http/Controllers/Api/V1/AuthController.php
  Http/Controllers/Api/V1/MovieController.php  # HTTP adapter; no TMDB logic
  Http/Requests/Auth/{LoginRequest,RegisterRequest}.php
  Http/Requests/Movies/{SearchMoviesRequest,ListMoviesRequest}.php
  Http/Resources/UserResource.php
  Models/User.php
  Integrations/MovieCatalog/MovieCatalogClient.php
```

The movie façade validates parameters and translates Catalog failures, but never queries Catalog's database, stores movie metadata, or makes direct TMDB requests.

### Sanctum stateful SPA

Core email/password authentication is now implemented. See [authentication implementation](authentication.md) for route middleware, validation, rate limits, session lifecycle and test coverage. Movie facade functionality remains a separate task.

React runs at `http://localhost:5173` and calls the Core API at `http://localhost:8000`. Browser first calls **`GET /sanctum/csrf-cookie`**, then sends cookie-backed credentialed POSTs and receives normal session cookies. Configure `statefulApi()`, allowed CORS origins with credentials, `SANCTUM_STATEFUL_DOMAINS`, and a common browser hostname. Use `SESSION_DOMAIN` unset for local `localhost`. Login regenerates session; logout invalidates it and regenerates CSRF token. No bearer JWT/localStorage scheme.

### Core → Catalog HTTP

Configured base URL `MOVIE_CATALOG_URL=http://localhost:8001`, token `MOVIE_CATALOG_TOKEN` (secret, Core only). Call `GET /api/internal/v1/movies/*` with `X-VYBE-Service-Token`. Bound connection/read timeouts. Do not expose internal URI/token or raw upstream errors to the SPA. Catalog 404 maps to public 404; Catalog unavailable maps to public 503; validation stays 422. No blind retries on writes; GET retries should be tightly bounded.

## Catalog API (`services/movie-catalog/`)

Separate Laravel process on `http://localhost:8001`, connected to **`vybe_movies` only**. The Catalog provides normalized TMDB movie data and persistent caching. Its internal business routes are protected by `EnsureInternalCatalogToken` middleware using a nonempty token configured at runtime and constant-time comparison.

```text
services/movie-catalog/app/
  Http/Controllers/Internal/V1/MovieController.php # planned
  Http/Requests/Movies/{SearchMoviesRequest,ListMoviesRequest}.php # planned
  Http/Resources/MovieResource.php # planned
  Http/Middleware/EnsureInternalCatalogToken.php
  Models/Movie.php
  Services/MovieService.php # planned
  Integrations/Tmdb/TmdbClient.php # planned
services/movie-catalog/config/catalog.php
services/movie-catalog/routes/api.php
```

Catalog has **no users migration, no Sanctum browser session handling, and no OAuth code**. Its DB may include necessary framework cache/jobs tables. Middleware must protect all `/api/internal/v1/` business routes. `/up` is a separate Laravel liveness endpoint, not a movie API.

### TMDB/cache semantics

- `tmdb_id` unique on `movies`, cache full detail with `metadata_fetched_at` for 7 days by default; only successful full detail hydration refreshes the timestamp.
- Summary/list upserts update fields actually provided and never erase hydrated data; use unique-index-safe upserts under concurrent requests.
- `popular` and `search` are **TMDB-ranked**, stored as ordered identifiers/responses in a distinct short-lived cache (default 15 minutes; page and normalized query in cache key).
- Upstream 404 is not a timeout/503; stale details can be served during provider outages when a DB copy exists, marked `meta.stale`.
- Set strict provider timeouts and bounded retries. Use Laravel HTTP fakes in tests, not live TMDB.

## Quality requirements

Separate MySQL migration test jobs for Core and Catalog, plus PHP tests. PHPUnit may still default to SQLite `:memory:`; a MySQL migration job is not proof the entire PHPUnit suite uses MySQL. Add integration coverage deliberately. No dangerous database reset outside disposable test DBs.

Read [public/internal contracts](../api/contracts.md) and [database ownership](../database/schema.md).
