# VYBE Movie Catalog Laravel Service — Scoped Agent Rules

**Mandatory first reads:** [`../../AGENTS.md`](../../AGENTS.md), [`../../PROJECT_ROADMAP.md`](../../PROJECT_ROADMAP.md), [`../../docs/AI_AGENT_PLAYBOOK.md`](../../docs/AI_AGENT_PLAYBOOK.md), [`../../docs/architecture/backend.md`](../../docs/architecture/backend.md), [`../../docs/api/movie-discovery.md`](../../docs/api/movie-discovery.md), [`../../docs/api/recommendations.md`](../../docs/api/recommendations.md), and current Catalog source/tests.

## Ownership and boundaries

Catalog is an **independent Laravel process** (development default `:8001`) with its **own movie metadata database**, framework cache and jobs. It owns TMDB credentials/client, provider paging/filtering, genres/credits/normalization, movies table, summary/detail hydration, provider-ordered caches and bounded FYP candidate endpoints.

- Internal business routes are under `/api/internal/v1/*` and must authenticate the nonempty `X-VYBE-Service-Token` using existing middleware. Core calls them; React must **never** call Catalog directly.
- No Core users, personalized preferences, Laravel browser sessions, rating/review/social/event data, cross-service Eloquent or direct Core DB calls. Movie identifiers passed from Core are TMDB IDs in validated, bounded contracts.
- Never disclose TMDB/internal credentials through responses, browser bundles, logging or exceptions. Protect service network exposure/TLS as required in deployment.

## Technical standards

- Reuse `app/Integrations/Tmdb/TmdbClient.php`, `MovieNormalizer`, `ExperienceNormalizer`, `MovieService`, `MovieExperienceService`, `RecommendationCandidateService`, FormRequests and Resources rather than creating a second provider adapter.
- Persist summaries with safe **batch upsert** and only fields actually present. Never erase hydrated metadata or advance `metadata_fetched_at` on a summary. Full details have separate freshness, cooldown, nonblocking locks and stale fallback semantics.
- Popular/Discover/Trending/Upcoming list caches retain the appropriate provider order; no invented rankings or global counts from a bounded Trending pool. Respect pagination, canonical cache keys, UTC date-sensitive keys and provider 429/Retry-After.
- Recommendation candidate generation must remain bounded (provider page/request budget, hard output cap), deduplicated and cacheable across users. Reuse cached credits; no N+1 detail hydration. Real writer/director sections require matching credited roles, not arbitrary crew matches.
- Future admin movie metadata operations must remain within Catalog authorization/ownership; Core can orchestrate through a narrow authenticated contract, not directly edit the movie database.
- Avoid service proliferation, speculative Redis/queues, cross-service DTO class sharing or unbounded DB scans.

## Testing and release

Use `Http::fake` for TMDB and test internal token guards, malformed/empty/partial provider results, cache semantics, upserts and migrations (in isolated disposable DB). Confirm actual DB engine and env before migrations; no destructive commands against shared data. If Catalog contract changes, add Core client validation tests and document required deployment order (**Catalog first** for additive internal support). Report tested outcomes vs live-provider unknowns. No unauthorized Git actions.
