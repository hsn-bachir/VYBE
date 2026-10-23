# Laravel backend architecture — Milestone 1

**Status:** Approved target, not present in initial setup scaffold. Actual setup branch includes Laravel 13 and basic web routing; API routing and Sanctum are not installed/configured as of audit. See [audit](../development/repository-audit.md).

## Ownership and runtime

`backend/` is one deployable Laravel application. It owns session authentication, MySQL/Eloquent persistence, provider HTTP and normalized JSON API. Laravel's HTTP client is the only TMDB caller. Controller → FormRequest → service → model/external API client → API Resource describes roles, not a rigid dependency count for every trivial request.

### Proposed organization

```text
backend/
  app/
    Http/
      Controllers/Api/V1/Auth/
      Controllers/Api/V1/Movies/
      Requests/Auth/
      Requests/Movies/
      Resources/
    Models/User.php
    Models/Movie.php
    Services/Auth/
    Services/Movies/
    Integrations/Tmdb/TmdbClient.php
  config/services.php
  routes/api.php
  database/migrations/
  tests/Feature/
  tests/Unit/
```

Names and locations can be adjusted to Laravel conventions; avoid unnecessary repository/DTO/framework boilerplate. Code isn't implemented merely because its target path appears above.

## HTTP conventions

- API `GET /api/v1/movies/*` is public; `/api/v1/auth/me` and logout require authenticated session.
- Auth register/login are guest endpoints with validation + rate limits, and successful login regenerates the session ID.
- Prefix `/api/v1` exactly once: Laravel's `routes/api.php` normally includes `/api` automatically, so group `v1` within it.
- FormRequests for request parameters and payloads; controllers map inputs to services and return Resources or framework responses.
- Validation 422, unauthenticated 401, forbidden 403, unknown movie 404, provider outage 502/503 (proposed contract), rate-limited 429, server error 500 without stack details.
- Do not return raw TMDB schema or sensitive Eloquent attributes to clients.

## Sanctum SPA setup plan

1. Install Sanctum in the framework-compatible way (e.g. `php artisan install:api` if appropriate) and enable `routes/api.php`.
2. Enable the stateful API middleware in `bootstrap/app.php` (Laravel's `statefulApi()` configuration).
3. Explicitly configure first-party stateful domains (including dev ports), cookie domain, session driver, CORS allowed origin (`http://localhost:5173`) and credential support.
4. Use a common hostname (`localhost`) for frontend/backend; initialize CSRF using `/sanctum/csrf-cookie`. Axios must send credentials and XSRF token.
5. Implement registration with a required password, login via session guard, logout via session invalidation and CSRF regeneration, and `/me` resource. Password is nullable in schema for *future* OAuth-only users; never allow blank-password email sign-in.
6. Harden with session regeneration, login throttling, sensible password policy, login error normalization, secure cookies in HTTPS environments and authorization tests.
7. In production, SPA and backend must share the same top-level domain for cookie-based Sanctum; determine hosting topology early.

Refer to [Laravel Sanctum SPA docs](https://laravel.com/docs/13.x/sanctum) and [API routing docs](https://laravel.com/docs/13.x/routing) and verify against installed version before coding.

## TMDB integration plan

A `TmdbClient` wraps Laravel HTTP calls: credentials only from server env/config; connect/read timeout; bounded retries only on transient failures; explicit 404 vs 429 vs 5xx. Avoid logging tokens, raw URLs with secrets or user search values without need. Fake all provider HTTP for tests.

A movie service maps upstream properties to VYBE's schema, upserts by unique `tmdb_id` safely and uses `metadata_fetched_at` for **complete detail** freshness (default 7 days). Popular/search *ordered identifiers* use separate short-lived cache (proposed 15 min) by endpoint + page + query + locale. List summaries may persist compatible fields but must not reset detailed metadata freshness or overwrite known fields with absent values. Parallel upserts must tolerate unique-index conflicts.

When TMDB fails:
- Detail: if a cached record exists, return a documented stale response; otherwise return an appropriate upstream-unavailable error.
- Popular/search: stale ranking fallback is an explicit optional policy; do not fabricate popularity ordering from local DB entries. If none, return retryable upstream error.
- Distinguish upstream not found from upstream unavailable and log diagnostics safely.

See [API contracts](../api/contracts.md), [schema](../database/schema.md).

## Testing strategy

- Request/feature tests: success, 401/419/422/429, session lifecycle, CSRF where test middleware is enabled, pagination/search.
- Service tests: list summary vs detail hydration, fresh/stale refresh, upstream failure with stale local metadata, missing metadata error, upsert concurrency/uniqueness.
- Migration tests against disposable MySQL 8.0, plus verify local MariaDB compatibility if used. CI migration job and PHPUnit currently use **different DB settings**; verify `phpunit.xml` before calling tests MySQL-backed.
- No live TMDB requests in automated tests; Laravel HTTP fake provider responses.

## Security and deployment notes

Never commit `.env`, `APP_KEY`, DB password, TMDB access token or prod CORS whitelist. Do not expose provider creds via frontend `VITE_*`. Use least-privilege DB user beyond disposable local XAMPP. HTTPS + secure session cookies for deployed environments. API health checks should not disclose configuration.
