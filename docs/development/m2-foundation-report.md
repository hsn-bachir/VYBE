# M2.0 foundation engineering report — 2026-10-31

**Status: M2.0 implementation and local verification complete; ready for human review before M2.1.** Catalog batch summaries, Core client support and design documents are delivered. Future M2 product features remain unimplemented. The user authorized the task branch fast-forward to `origin/dev`; no commits, branch switches, pushes or PR creation were performed. Hosted CI and human acceptance remain outstanding.

## 1. Repository findings

The task branch `feature/m2-foundation` was fast-forwarded with explicit user authorization from `e36a1ad` to locally available `origin/dev` at `1ff1e14` (frontend PR #6 and movie discovery PR #7). Remote freshness was not fetched/claimed. Existing M2 edits were preserved, including a saved/reapplied contracts patch where Git initially refused to overwrite that file. The initial untracked `.playwright-mcp/` directory remains untouched; the newer baseline ignores it.

The checked-out Core has Sanctum session auth, username normalization/uniqueness, verification notification/status, exact five-field UserResource, public movie facade and MovieCatalogClient. React has shared Axios, TanStack Query authKey/movie query patterns, verification guards, layouts, MovieCard and Movie Details/popular/search pages. These are existing M1 features, not new M2 implementation. The task extends the existing client rather than creating another abstraction.

Catalog has token-protected internal popular/search/detail, persistent Movie model, unique TMDB ID, normalized summary/detail Resources, provider-ranked list caching, full-detail freshness and safe stale fallback. Batch reuses these extension points. PHP CLI is 8.5.11 with pdo_sqlite and pdo_mysql; missing SQLite drivers are not a blocker here. Existing CI defines separate Core/Catalog MySQL 8 migration/test jobs and frontend lint/type/build; this task did not run hosted CI.

### Documentation discrepancies and resolution

| Finding | Classification and treatment |
| --- | --- |
| README described an auth/movie scaffold despite implemented features | Outdated status text, not an application defect. Synchronized README to checked-out implementation and M2 scope. |
| Initial task branch lacked the existing Core client/movie UI | Resolved by authorized fast-forward; preserved work and extended actual client. |
| M1 microservices doc suggested future review/watchlist services | Updated to approved M2 Core ownership in ADR 0002; no additional services. |
| Auth prose says approved logo absent although checked-out SVGs/layout exist | Outdated documentation; preserve supplied assets and implementation, record discrepancy rather than redesign. |
| Root/backend guidance says active M1/users-only | Current direct M2.0 request narrowly authorizes documentation and batch support; future product entities remain design-only. |
| SummaryResource expects array-style date values, whereas model casts date to Carbon | Adapt new batch rows through model `toArray()` (date:Y-m-d), preserving serializer behavior. Regression test verifies exact date shape. |

Codebase-memory graph was indexed and coverage checked, supplemented by direct source reads; updated Core-client coverage was checked after the fast-forward. Markdown contracts are the repository's existing artifact format. Postman API engineering/documentation/simulation skills were consulted; no local Postman artifacts or CLI were available. No remote workspace/mock publication or new API-tooling dependency was introduced. Automated tests use established Laravel HTTP fakes. An additional real HTTP smoke check used the actual Catalog with synthetic data in the isolated test DB, not a Postman simulation or live TMDB.

## 2. M2 architecture

See [architecture](../architecture/milestone-2.md) and [ADR 0002](../decisions/0002-m2-core-data-and-batch-summaries.md). Core owns personal/library/community records; Catalog owns metadata/TMDB. Browser calls Core only. Personal rows use TMDB IDs without cross-DB FKs. Each subsequent task is a vertical slice. Ratings/reviews are independent; collections private; Profile and Library remain separate.

## 3. Database design

[Schema reference and ERD](../database/milestone-2-schema.md) specifies existing users plus proposed bio, watchlist_entries, watched_movies, collections, collection_movies, movie_ratings and reviews. It records every column, PK/FK, null/default behavior, owner uniqueness, query indexes, cascading deletion, cardinality and validation.

Proposals include a surrogate collection-membership key plus composite uniqueness, owner-local case/accent-insensitive collection names, first-mark watched timestamps, independent rating/review keys, movie-leading review/rating indexes and query-derived counts/aggregates. No migration, production DB change or persistent aggregate was added.

## 4. API and frontend contracts

[Planned public contracts](../api/milestone-2-contracts.md) cover bounded watchlist/watched lists and mutations, Details membership state, collections and modal membership lookup, rating singletons/statistics, public review reading/owner editing, and personal profile/count/avatar proposals. Shared auth/verification/ownership/CSRF/error/pagination rules apply explicitly to every endpoint. All future routes remain unimplemented.

[Frontend plan](../architecture/milestone-2-frontend.md) documents Details actions, verified Library/Profile routes, reuse of shared client/guards/cards, user-scoped query keys, invalidations, existing authKey reuse and missing/outage/empty/error states. No frontend files changed.

## 5. Batch implementation

Implemented `POST /api/internal/v1/movies/summaries`. Accepts JSON `tmdb_ids`, 1–50 entries before deduplication, strict integers 1–2147483647. Rejects numeric strings, floats, bools, maps (including numeric object keys), zero/negative/oversized IDs and empty/oversized batches. Existing middleware enforces service token before validation.

One indexed query selects the eight summary fields, then application ordering preserves first occurrences. Existing MovieSummaryResource serializes found rows. Response `meta` contains distinct requested_count, returned_count and ordered missing_tmdb_ids. All missing still succeeds. Stale and summary-only metadata are returned unchanged; no TMDB calls, writes, new cache or queue. Tests verify full rows remain unchanged and 50-ID retrieval performs one query.

Core's existing client now exposes `summaries(array $tmdbIds)`, accepting 0–50 strict integer IDs before deduplication. Invalid local input raises InvalidArgumentException without HTTP; empty pages return an empty batch locally. Nonempty pages use one JSON POST, existing server token, 2s connect/12s total timeout defaults, no redirects and no retries. Existing summary normalization strips unknown fields. Envelope/count validation and disjoint found/missing coverage reject duplicate, foreign, overlapping or unexplained IDs, then restore caller order. All upstream status/connection/malformed-response failures become sanitized CatalogFailure (503); internal batch 422 is a protocol failure, not relayed caller validation. Existing GET error semantics remain covered by regression tests. See the [full batch contract](../api/catalog-batch-summaries.md).

## 6. Files changed

| Group | Files and purpose |
| --- | --- |
| Core | `backend/app/Integrations/MovieCatalog/MovieCatalogClient.php`: bounded summaries operation, shared GET/POST transport and complete response-integrity validation |
| Catalog | `app/Http/Requests/Movies/MovieSummariesRequest.php` strict validation; `app/Services/MovieService.php` bulk retrieval/order/missing metadata; `app/Http/Controllers/Internal/V1/MovieController.php` resource response; `routes/api.php` token-protected POST |
| Tests | `services/movie-catalog/tests/Feature/MovieSummariesTest.php`: 23 cases; `backend/tests/Feature/MovieSummariesClientTest.php`: 59 cases, including data-provider cases |
| Architecture | `docs/architecture/milestone-2.md`, `milestone-2-frontend.md`; `docs/decisions/0002-m2-core-data-and-batch-summaries.md`; links/status in existing `backend.md` and `microservices.md` |
| Schema | `docs/database/milestone-2-schema.md`; link from existing `schema.md` |
| API | `docs/api/milestone-2-contracts.md`, `catalog-batch-summaries.md`; route/link in existing `contracts.md` |
| Delivery/navigation | `docs/development/milestone-2-checklist.md`, this report, root `README.md`, Catalog `README.md` |

No runtime dependencies, env keys, credentials, M2 feature migrations/controllers, public batch route or React feature code added. Existing application behavior was not refactored.

## 7. Checks actually run

| Check | Result |
| --- | --- |
| Catalog `php artisan test --compact --no-ansi` (SQLite :memory:) | 91 passed, 387 assertions |
| Catalog `php artisan migrate --force` on isolated MySQL 8.0.43 | All three existing migrations passed |
| Catalog same test command with isolated MySQL env | 91 passed, 387 assertions |
| Catalog `php vendor/bin/pint --test` | Passed after formatting new test |
| Core `php artisan test --compact --no-ansi` (SQLite) | 112 passed, 502 assertions; current M1 baseline plus batch tests |
| Core `php artisan migrate --force` on its own isolated MySQL DB | All five existing migrations passed |
| Core same test suite with isolated MySQL env | 112 passed, 502 assertions |
| Core `php vendor/bin/pint --test` | Passed |
| Frontend `npm run lint` | Passed |
| Frontend `npx tsc -b --noEmit` | Passed |
| Frontend `npm run build` | Passed; existing main bundle 505.98 kB triggers Vite's >500 kB warning |
| Frontend `npm test -- --run` | 59 tests passed, 3 files |
| Real HTTP smoke: Core client → actual Catalog on 127.0.0.1:18091 | Exact typed summary/date, deduplication, partial missing IDs and safe wrong-token rejection passed |
| `git diff --check` | Passed |
| Both services `php artisan route:list --path=movies --json` | Batch exists only in Catalog under `catalog.internal`; Core still has only the three existing public movie GET routes |
| Relative-link validation across eight new M2 documents | All targets resolve |

Interim failures were in new test fixtures: the Catalog raw-JSON test omitted the token; the Core HTTP fake encoded 2.0 as integer 2, so it did not exercise float rejection. Fixed the header and preserved JSON zero fractions, then reran successfully. Pint initially flagged imports in the new Catalog test; fixed. No remaining failures or skipped tests in completed suites. No provider requests were made; new Catalog tests explicitly assert no HTTP. Existing Core auth/discovery and Catalog caching tests remain green.

Disposable verification: initialized a new temporary MySQL data directory with `mysqld --no-defaults --initialize-insecure`, started bound to 127.0.0.1:33317, created only `vybe_core_m20_test` and `vybe_catalog_m20_test`. Per-command env: APP_ENV=testing, DB_CONNECTION=mysql, DB_HOST=127.0.0.1, DB_PORT=33317, separate DB_DATABASE, DB_USERNAME=root, empty test password/DB_URL, CACHE_STORE=array, SESSION_DRIVER=array. Existing application env files and shared databases were untouched. The task server is shut down after checks; temporary data is left outside the repository.

The smoke check seeded only the disposable Catalog DB, ran actual Catalog PHP HTTP and invoked Core's actual client from a temporary console script; no public test endpoint was added. Test-only credentials and scripts remain outside tracked files, and task servers are stopped after validation. This proves local transport/serialization/auth interoperability, not live-provider freshness or deployment behavior.

Not verified: hosted CI, live TMDB, M2 frontend interactions (not implemented), concurrent multi-process traffic. No production migration/configuration step is required. Deploy Catalog support before later Core product consumers use batch summaries. Existing configured URL/token/timeouts are reused.

## 8. Open decisions

The baseline decision is resolved by explicit user authorization. No further architectural approval is needed to review the delivered batch capability.

Before respective slices, review proposed collection collation/name uniqueness, first-watch timestamp semantics, unresolved movie-reference writes, limits/throttles/pagination, and Core-local avatar storage/re-encoding/deployment persistence. These do not alter the approved service boundary and are documented proposals. Instructor grading expectations remain unresolved separately.

## 9. M2.1 readiness

M2.1 can reuse the verified Catalog endpoint, Core `MovieCatalogClient::summaries()`, existing summary DTO/auth/session patterns and proposed schema/API/security/UI designs. No implementation blocker remains in M2.0. Before starting the next slice, review the proposed unresolved-ID write policy, first-watch timestamp and API details; obtain normal human review/CI acceptance and deploy matching Catalog support. M2.1 will paginate Core rows, call summaries once per nonempty page and retain unresolved records as placeholders. No watchlist/watched migrations or UI were created here.
