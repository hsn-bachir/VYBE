# Movie Catalog Laravel microservice — scoped agent instructions

Read [root AGENTS.md](../../AGENTS.md), [service architecture](../../docs/architecture/backend.md), [internal API contracts](../../docs/api/contracts.md), [movie schema](../../docs/database/schema.md).

- Independent process at `http://localhost:8001` for development; owns only `vybe_movies` plus local Laravel cache/jobs tables. No user table, sessions from Core, or cross-service DB connection.
- Internal endpoints under `/api/internal/v1/*` are called by Core, not React. Require a nonempty constant-time-checked `X-VYBE-Service-Token` on all internal business routes; a public bare `/up` can remain the framework liveness check.
- Never expose `TMDB_TOKEN` or `CATALOG_INTERNAL_TOKEN`; use Laravel configuration and HTTP client, with fake provider requests in tests.
- Preserve TMDB ranking order. Provider-ordered list caches are distinct from normalized persistent movie metadata. Detail `metadata_fetched_at` changes only after complete detail hydration; summary upserts must never destroy known detailed fields.
- Timeout and provider 404/429/5xx handling must be explicit; serve stale persisted details when safe, never invent rankings.
- Use unique `tmdb_id` database constraint and safe upserts. Keep controllers/Requests/services/resources focused. Avoid sharing Eloquent models across the two backends.
- Tests must exercise unauthorized internal access, schema constraints, normal and stale metadata behavior, and upstream fakes. Never run destructive migrations on a real catalog database.
