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
- [x] Add PR tests for Core service client failing gracefully when Catalog unavailable.
- [x] Add shared, centralized design tokens and React Router/Tailwind/Axios/TanStack Query packages.

## 2. Core API owner

- [x] Update `vybe_core.users` migration to name(100), nullable password, avatar_url(2048); no Catalog movie table.
- [x] Install Sanctum and enable API/stateful SPA/CORS/cookie settings; login/logout session security.
- [x] Implement `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` with tests (validation, 401/419/429).
- [x] Implement public `/movies/*` façade and `MovieCatalogClient` using HTTP fake tests and internal token.

## 3. Movie Catalog owner

- [x] Scaffold Catalog app, remove starter users migration/model, configure own `vybe_movies`, token middleware, protected `/api/internal/v1/health` and tests.
- [x] Implement TMDB HTTP client with safe timeouts, error classification and HTTP fakes.
- [x] Implement movie normalization, unique `tmdb_id` summary upserts vs full-detail hydration, 7-day configurable persistent metadata freshness.
- [x] Implement short-lived TMDB-ranked popular/search caching (15-minute configurable), separate from movie table.
- [x] Implement `/api/internal/v1/movies/popular`, `/search`, `/{tmdb_id}` and tests for errors, stale fallback, pagination, 404/503.

Catalog verification (2026-10-28): 68 tests / 270 assertions passed on SQLite and isolated MariaDB 10.4.32; existing migrations passed on the disposable MariaDB instance. Real TMDB credentials, hosted MySQL 8 CI and multiprocess load testing remain unverified. Core forwarding and React movie discovery are now implemented; see the verification evidence below.

## 4. Frontend foundation/auth owner

- [x] Username registration and data-preserving migration; signed email verification, resend and status UI/API. Browser acceptance remains pending.
- [x] Mandatory verification in account-route guard, Laravel verified-middleware test, and public guest access preserved. Approved logo assets are integrated; real email-link acceptance remains pending.

Authentication layouts, inputs/buttons, tokens and retry states are implemented. Movie discovery primitives and pages are implemented. Verification: 13 Core tests (83 assertions), 16 frontend API/rendering tests, lint/typecheck/build and Pint passed; disposable MariaDB migrations and real HTTP cookie lifecycle passed. Visual browser acceptance and exact MySQL 8 CI remain pending.

- [ ] `AppLayout`, `AuthLayout`, navigation, buttons, inputs, skeletons, toasts, empty/errors and responsive VYBE tokens.
- [x] Login/register forms, Sanctum CSRF init, current-user query, logout/guards, form errors.
- [x] Google/GitHub buttons disabled with “Coming soon”; no OAuth implementation.

## 5. Frontend movie discovery owner

- [x] Typed public API and TanStack Query hooks, no direct Catalog/TMDB browser calls.
- [x] Popular/home, search/discover, details and not-found pages using **real Core API data**.
- [x] Pagination, debounced search, loading/retry/empty/error/stale UI, responsive posters, TMDB logo/notice in Credits.

## 6. Integration and release (shared)

- [ ] Independently boot all three apps and both MySQL schemas from a clean clone.
- [ ] CI: independent Core and Catalog migrations/tests + frontend lint/typecheck/build + relevant integration tests.
- [ ] Demo authentication CSRF/session lifecycle, two-service search, stale detail on TMDB outage and controlled Core 503 when Catalog is down.
- [ ] Review API docs vs real response shapes; no secrets, fake features or contradictory claims.
- [ ] Human review + green CI: `dev` → `main`, tag `v0.1.0` only after acceptance.

**Out of scope:** actual OAuth, social tables, review/watchlist systems, moderation/admin, paid features, distributed message broker and advanced orchestration.

## Movie discovery verification — 2026-10-28

Core: 53 tests / 258 assertions passed on SQLite and disposable MariaDB 10.4.32; migration verification, Pint, Composer validation/platform checks passed. Frontend: 45 Vitest tests, lint, TypeScript and build passed. Playwright: 13 grouped acceptance checks; responsive home/search/details at 360, 768, 1024 and 1440; reduced motion, image failure, debounce/history, public browsing and verification guards checked. Screenshots inspected on desktop/mobile.

The running React → Core → Catalog flow passed with TMDB faked only in a temporary isolated Catalog harness: popular/search/details, persistent metadata, stale fallback and controlled uncached-search 503. Browser metadata calls went only to Core. No development DB resets, Catalog implementation changes or live-provider success claims. Real TMDB credentials, hosted MySQL 8 CI, and real email delivery remain release acceptance items.

## Cinematic homepage refinement — 2026-10-28

The supplied filmstrip artwork now anchors a functional HTML hero, followed by a smaller accessible rotating Spotlight and the existing cards with Load More. The sticky navbar uses a traveling measured indicator. Discover pagination targets the results region beneath the header. No API or database contract changes, backend edits, dependency additions, or static-logo changes were required in this refinement.

Verification: 51 Vitest tests passed, plus lint, TypeScript and production build. The new Playwright suite passed 16 grouped checks (including virtual-clock playback, pause/visibility/reduced-motion, direct slide controls, retry/deduplication, stable append scroll, cached feed return and indicator alignment). The existing 13-group discovery/auth browser suite also passed. Responsive home/search/details were checked at 360/768/1024/1440 pixels; desktop/mobile screenshots were inspected against the supplied artwork and desired-homepage reference.

Live backend smoke checks also passed: hero search for Arrival opened real results and details; return navigation retained the query. Popular Load More grew from 20 to 37 unique cards while scrollY remained 2366.4. The running Core/Catalog/Vite processes and credentials were preserved. The two screenshots of the old static Spotlight/homepage were not present locally; the rendered application supplied that baseline. Real email delivery and a complete sign-in/out lifecycle were not repeated by this visual refinement.

## Cinematic motion and Discover refinement — 2026-10-28

- [x] Official React Bits Animated Content is mounted on Home section introductions, Discover headings and movie detail information, using GSAP/ScrollTrigger rather than a renamed CSS fade.
- [x] Official React Bits Spotlight Card is mounted on Discover search with low-intensity violet pointer illumination; touch and reduced-motion use a static surface.
- [x] Discover has an editorial introduction and six real popular picks before searching, reusing the Home query cache. Debounce, URL/history, results pagination and scroll/focus behavior are preserved.
- [x] Spotlight has more spacious composition, long-title handling, integrated controls and 1100ms decoded-image crossfades. Delayed/failed backdrops retain the usable scene; all playback pauses and synchronized progress are preserved.
- [x] Shared timing tokens cover controls, cards, navigation, entrances and scenes; reduced motion and keyboard focus remain supported.

Verification: **56 Vitest tests**, lint, TypeScript and production build passed. The three Playwright suites passed **36 grouped checks** (13 discovery/auth, 16 homepage, 7 motion/Discover), including actual pointer light, once-only GSAP motion, delayed/failed images, overlapping opacity and long titles. Home/Discover/details were inspected at desktop and mobile sizes; responsive checks cover 360/768/1024/1440px. A separate 390px touch context confirmed static pointer treatment and working search focus. Live Core-backed Arrival search returned 20 results and opened details; a live Spotlight crossfade was sampled and inspected. Screenshots were captured for Home, Discover, Spotlight and details.

GSAP is the only new dependency; the upstream React Bits revision and MIT + Commons Clause license are retained. React Bits MCP was unavailable, so the official repository supplied both components. No API/DB contract, configuration or migration changes were required. Build succeeds with a 505KB main chunk warning (170KB gzip); existing Axios/follow-redirects audit advisories remain. Hosted CI, real email delivery and a complete authentication session lifecycle were not rerun. The signature ribbon-to-logo animation remains postponed.
