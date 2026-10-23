# VYBE — repository-wide engineering instructions

## Source of truth
- Read the checked-out source and the relevant `docs/` contracts first. Planned architecture is not evidence of implementation.
- **Active scope: Milestone 1 (`v0.1.0`) only.** Core SPA authentication, VYBE UI foundation, separate Movie Catalog service, movie metadata/search/popular/details, tests, docs, CI.
- Out of scope: production OAuth, reviews, watchlists, social accounts, social graph, recommendations, administration. OAuth buttons may be disabled and labelled “Coming soon.”
- Team has **approved two independently runnable Laravel backends** for Milestone 1; instructor has not confirmed whether this fully meets microservices grading expectations. See [ADR 0001](docs/decisions/0001-initial-architecture.md).

## Architectural boundaries
- `frontend/`: React SPA. Calls **only** Core API (`backend/`), never Catalog directly, TMDB directly, or either database.
- `backend/`: Core Laravel API/BFF. Owns user accounts, Sanctum stateful SPA sessions, auth endpoints, public `/api/v1/movies/*` proxy/adapter, and `vybe_core` database. It **must not** query `vybe_movies` or call TMDB.
- `services/movie-catalog/`: independently runnable Laravel Catalog API. Owns `vybe_movies`, movie normalization, TMDB secrets/client, persistent movie metadata and provider-ordered list caching. It **must not** query `vybe_core` or manage browser sessions.
- Core → Catalog: versioned HTTP JSON with internal service authentication, short timeouts, bounded retries where safe, error translation. The internal token is server-to-server only and is never exposed in `VITE_*` variables.
- Each backend uses pragmatic route → controller → FormRequest (when appropriate) → service → Eloquent/external client → Resource. Avoid fake generic repository layers.
- Add independent, disposable test databases. NEVER run `migrate:fresh`, database wipes, or destructive SQL on shared or non-test data.
- Interservice relationships in later milestones use IDs/contracts, not cross-service foreign keys.

## Delivery and collaboration
1. Check branch and working-tree state. Work from up-to-date `dev` on a task branch.
2. Read relevant [architecture](docs/architecture/system-overview.md), [public/internal contracts](docs/api/contracts.md), [database ownership](docs/database/schema.md) and [design system](docs/design/design-system.md).
3. Make focused, reviewable changes. Update contract/doc/test in the same PR as behavior changes.
4. Do not claim something works without running checks; do not fabricate TMDB content, credentials, CI results or local server status.
5. Do not install unnecessary dependencies, silently broaden the milestone, or alter another service's database.
6. Do not commit `.env`, secrets, DB dumps, access tokens or framework keys; redact exceptions/logs.
7. Do not commit, switch branches, push or merge unless explicitly authorized by the person running the agent.
8. Every PR targets `dev`, passes applicable CI, and receives human review. Releases go `dev` → `main`.

## Applicable validation
- Core: `cd backend && php artisan test` plus migration verification against a disposable MySQL database.
- Catalog: `cd services/movie-catalog && php artisan test` plus migration verification against its **own** disposable MySQL database.
- Frontend: `cd frontend && npm run lint && npx tsc -b --noEmit && npm run build`.
- Provider HTTP must be faked in automated tests. Verify 401/403/419/422/429, internal-service failure, cache freshness and stale fallbacks as relevant.

## Final response requirements
Report changed files, checks actually run and results, affected API/DB contracts, configuration or migration steps, assumptions and unresolved risks.
