# Milestone 1 (`v0.1.0`) — two-service execution and acceptance

**Branch evidence:** Setup PR #1 has merged into `dev` as checked 2026-10-23. Foundation source package is **not merged** until its own PR passes. Check actual branch commits for later claims.

## 0. Architecture and team readiness

- [x] Monorepo, `main`, `dev`, short-lived feature branches and PR+CI convention.
- [x] Initial Laravel/React scaffolding integrated through PR #1 into `dev`.
- [x] Project owner approved Core API + Movie Catalog independent Laravel processes, separate DB ownership and Core-only browser façade.
- [ ] Confirm with instructor whether two separate services satisfy the 20-mark microservices rubric and whether deploy/demo requirements apply now.
- [ ] Review and merge docs/service-foundation PR. Confirm Catalog exists as committed Laravel app (not just starter overlay).
- [ ] Verify Core and Catalog migrations with separate disposable MySQL databases and green CI.
- [ ] Confirm four developer owners/reviewers and teammate access.

## 1. Contract and platform foundation (all developers)

- [ ] Approve public Core and internal Catalog API response/error contracts.
- [ ] Set shared local hosts, secure service-secret provisioning, split DBs; document exact XAMPP flavor/PHP version.
- [ ] Add PR tests for Core service client failing gracefully when Catalog unavailable.
- [x] Add shared, centralized design tokens and React Router/Tailwind/Axios/TanStack Query packages.

## 2. Core API owner

- [x] Update `vybe_core.users` migration to name(100), nullable password, avatar_url(2048); no Catalog movie table.
- [x] Install Sanctum and enable API/stateful SPA/CORS/cookie settings; login/logout session security.
- [x] Implement `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` with tests (validation, 401/419/429).
- [ ] Implement public `/movies/*` façade and `MovieCatalogClient` using HTTP fake tests and internal token.

## 3. Movie Catalog owner

- [ ] Scaffold Catalog app, remove starter users migration/model, configure own `vybe_movies`, token middleware, protected `/api/internal/v1/health` and tests.
- [ ] Implement TMDB HTTP client with safe timeouts, error classification and HTTP fakes.
- [ ] Implement movie normalization, unique `tmdb_id` summary upserts vs full-detail hydration, 7-day configurable persistent metadata freshness.
- [ ] Implement short-lived TMDB-ranked popular/search caching (15-minute configurable), separate from movie table.
- [ ] Implement `/api/internal/v1/movies/popular`, `/search`, `/{tmdb_id}` and tests for errors, stale fallback, pagination, 404/503.

## 4. Frontend foundation/auth owner

- [x] Username registration and data-preserving migration; signed email verification, resend and status UI/API. Browser acceptance remains pending.
- [x] Mandatory verification in account-route guard, Laravel verified-middleware test, and public guest access preserved. Approved logo asset and browser acceptance remain pending.

Authentication layouts, inputs/buttons, tokens and retry states are implemented. Broader movie UI primitives remain pending. Verification: 13 Core tests (83 assertions), 16 frontend API/rendering tests, lint/typecheck/build and Pint passed; disposable MariaDB migrations and real HTTP cookie lifecycle passed. Visual browser acceptance and exact MySQL 8 CI remain pending.

- [ ] `AppLayout`, `AuthLayout`, navigation, buttons, inputs, skeletons, toasts, empty/errors and responsive VYBE tokens.
- [x] Login/register forms, Sanctum CSRF init, current-user query, logout/guards, form errors.
- [x] Google/GitHub buttons disabled with “Coming soon”; no OAuth implementation.

## 5. Frontend movie discovery owner

- [ ] Typed public API and TanStack Query hooks, no direct Catalog/TMDB browser calls.
- [ ] Popular/home, search/discover, details and not-found pages using **real Core API data**.
- [ ] Pagination, debounced search, loading/retry/empty/error/stale UI, responsive posters, TMDB logo/notice in Credits.

## 6. Integration and release (shared)

- [ ] Independently boot all three apps and both MySQL schemas from a clean clone.
- [ ] CI: independent Core and Catalog migrations/tests + frontend lint/typecheck/build + relevant integration tests.
- [ ] Demo authentication CSRF/session lifecycle, two-service search, stale detail on TMDB outage and controlled Core 503 when Catalog is down.
- [ ] Review API docs vs real response shapes; no secrets, fake features or contradictory claims.
- [ ] Human review + green CI: `dev` → `main`, tag `v0.1.0` only after acceptance.

**Out of scope:** actual OAuth, social tables, review/watchlist systems, moderation/admin, paid features, distributed message broker and advanced orchestration.
