# Backend-specific agent instructions

Follow root `AGENTS.md` first, plus [backend architecture](../docs/architecture/backend.md), [database schema](../docs/database/schema.md), and [API contracts](../docs/api/contracts.md).

- Prefer Laravel native mechanisms: FormRequest, Eloquent, API Resource, HTTP client, middleware, validation, rate limiting, jobs only if justified.
- Routes/controllers handle transport and authorization; services manage application workflows; TMDB client isolates provider HTTP, timeouts, normalization boundaries and error classification.
- Keep controllers thin. Don't add generic repository interfaces wrapping Eloquent without a demonstrated need.
- Implement `/api/v1` route prefix once; avoid accidentally generating `/api/api/v1`.
- Sanctum SPA must use stateful **session cookies**, CSRF cookie bootstrap, correct CORS + `withCredentials`/`withXSRFToken`, session regeneration on login, invalidation on logout.
- Normal registration requires password; nullable persisted password only supports future OAuth-only accounts. Failed authentication must not leak whether an email exists.
- Never send password/remember_token, secrets, stack traces or TMDB credentials in API Resources.
- Normalize TMDB data. Maintain unique `tmdb_id` and config-driven metadata TTL. Treat summary hydration and details differently. Handle upstream 404/429/5xx/timeouts explicitly; fake provider responses in tests.
- Use additive migrations for schema already shared or deployed. Restrict `migrate:fresh` to disposable test DBs; don't modify or wipe real data.
- Add feature tests for auth HTTP/cookie behavior, validation/error shapes, TMDB failure + stale cache, idempotent upsert, and migration compatibility.
- No OAuth providers, social tables, watchlists or review endpoints during Milestone 1.
