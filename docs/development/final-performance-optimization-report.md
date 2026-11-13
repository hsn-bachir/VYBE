# Performance reassessment — 2026-11-12

## Current verified development setup

Both applications now use **local PostgreSQL 18**, verified through Laravel's resolved connection and successful `SELECT 1` calls: Core `127.0.0.1:55435/vybe_core`, Catalog `127.0.0.1:55436/vybe_movies`, SSL mode `disable`. Both report **zero pending migrations**. Docker binds the two existing containers to the expected loopback ports. No containers, databases or data were recreated. The prior Neon measurements below are historical and are not the current bottleneck.

Core uses file sessions and file cache. Catalog uses database cache. Core's configured Catalog URL is `http://localhost:8001`; the browser was observed requesting Core on `http://localhost:8000`. Neither Laravel configuration is cached. The running PHP server router paths resolve to these checked-out applications, which bootstrap the same `.env` on each request. No environment credentials were changed. The user's existing `config/database.php` edits were preserved.

## Measured bottlenecks and changes

The local database is fast. Warm probe medians were **2.28 ms Core / 1.91 ms Catalog**, with first connections about 21 ms. The remaining public request delay is primarily in the two PHP development processes and their sequential HTTP path. PHP reported `opcache.enable_cli=0`; enabling it in isolated test servers reduced actual endpoint times. This demonstrates a PHP compilation/startup contribution; filesystem scanning and Windows antivirus remain unmeasured hypotheses. A PHP development server also serializes concurrent requests; the browser waterfall was slower than isolated curl calls, including cancelled StrictMode requests. No production duplicate-request claim follows from that observation.

Added `scripts/serve-api.ps1` to run either API with OPcache enabled, timestamp validation enabled, and revalidation on every request. After proving this on ports 8010/8011, the identified workspace API processes on **8000/8001 were restarted with these settings**, preserving their normal URLs and environment. Both returned HTTP 200 on `/up`; their listening process command lines confirm the flags. To reproduce after stopping the existing server on each port, use two terminals:

```powershell
.\scripts\serve-api.ps1 -Service catalog
.\scripts\serve-api.ps1 -Service core
```

Movie community queries now mount within 500 px of the viewport using `DeferredSection`, so below-the-fold ratings/reviews do not compete with primary detail data on initial navigation. The detail and experience metadata flow, shared Catalog cache and authentication boundaries are unchanged.

## Local comparison

These measurements use the same Windows machine, existing local datasets, Vite dev mode, normal Core/Catalog URLs, and real HTTP responses. Endpoint samples are 6–8 warm sequential requests; browser figures are medians of three full navigations at 1440×900. Sample sizes are too small for a reliable p95 claim. Browser first content measures DOM usability, not an isolated React profiler or paint duration. Image completion is separate from movie-card availability. No latency samples use mocked responses or artificial delays.

| Scenario | New local baseline | After fixes | Change |
| --- | --- | --- | --- |
| Core warm `SELECT 1` | 2.28 ms median | 1.96 ms median | No DB optimization claimed; normal variation |
| Catalog warm `SELECT 1` | 1.91 ms median | 2.00 ms median | No DB optimization claimed |
| Core popular API | 730 ms median, 721–766 ms warm range | 515 ms median, 505–533 ms | ~29.5% lower |
| Catalog popular API | 336 ms median, 316–356 ms | 259 ms median, 239–288 ms | ~23.0% lower |
| Core detail API, ID 687163 | 723 ms median, 710–743 ms | 545 ms median, 474–597 ms | ~24.6% lower |
| Home first movie cards | 2494 ms median (3378/2494/2441) | 1956 ms median (1988/1956/1956) | ~21.6% lower |
| Spotlight text | Not timed separately in original local baseline | Available with Home cards; isolated diagnostic pair 1064–1604 ms | No normal-port independent before/after claim |
| Discover initial picks | Not measured before changes | 1931 ms median (1973/1931/1931) | No valid comparison |
| Search first results, `query=batman` | API 729 ms median; browser not measured | Browser 1965 ms median | Different layers; no calculated reduction |
| Next popular page, 20→40 | Not timed before changes | 858 ms median (858/837/861) | No valid comparison |
| Next search page, 20→40 | Not timed before changes | 829 ms median (829/856/820) | No valid comparison |
| Login/session exchange, private library/profile/admin, real rating/review writes | Unmeasured | Unmeasured | No controlled credentials; fixture behavior is not latency evidence |

First observed popular calls were 1.82 s before and 2.48 s after the process restart, followed by warm-up samples around 0.76–0.82 s before settling near 0.51 s. These are process/cache warm-up observations, not controlled TMDB cache-miss benchmarks. The initial OPcache diagnostic on alternate ports produced faster browser times (median 1065 ms), but that intercepted-port experiment is **not** substituted for the normal-port result above. A simple local DB query is no longer an adequate explanation for the remaining 0.5-second proxy response or ~2-second development navigation. Provider miss duration, React execution, paint and image download time were not independently profiled.

## Loading and review implementation

- `MovieGrid` now renders real cards and `MovieSkeletonCards` as sibling `<li>` elements inside **one** responsive `<ul>`. `pendingCount` adds placeholders without creating another grid; skeleton poster/title/year/rating geometry matches the loaded card. Home and Discover both use this path, retain earlier cards and keep the existing duplicate-page guard and retry behavior.
- `SpotlightSkeleton` reserves the same stage height, heading, metadata, title, description and action region as the real carousel. Its desktop height was 547 px before and after resolution. Existing React Bits/carousel interactions remain.
- `SectionSkeleton` provides small text-section shapes for review entries, moderation inspection/report details, verification and library controls. Profile, movie-detail/trailer/cast, admin stats/tables/history and library movie-grid skeletons remain. `CollectionCardSkeleton` adds actual portrait-collage geometry to Library and collection overview loading.
- Movie Details renders one centered **Your take** section at a maximum width of 1080 px. The original rating card is restored inside it, with the full community average, count and always-visible five-row distribution above the interactive personal stars. The review action sits beside the personal rating, and the compact conversation follows immediately below. Rating and review writes remain independent APIs; no combined submission or false atomicity was introduced.
- Review creation/editing opens the existing accessible `Dialog`, with keyboard/focus behavior and a local pending state. A draft survives closing/reopening; a failed submission keeps the dialog and draft. Existing validation, spoiler controls, reporting, edit/delete and owner checks remain. Short reviews use compact divider-separated entries; long reviews retain accessible expansion; zero reviews use a small inline empty state without a reserved card region.

## Browser evidence and regression checks

`frontend/browser-checks/loading-layout.js` is executable through Playwright MCP's filename runner. It passed Home and Discover at **360, 599, 768, 899, 1024, 1199 and 1440 px**: shared-grid and correct-row assertions passed in all 14 cases, each page fetched once, and each ended with 40 unique cards. Spotlight's delayed real response retained its 547 px region. Delays existed only in the browser test handler. Primary viewport checks had no horizontal overflow.

`frontend/browser-checks/review-experience.js` passed **24 layout combinations**: guest, verified empty, rating only, review only, both, and multiple/long/spoiler reviews at 360/768/1024/1440 px. The restored card showed five distribution rows in every case, with no horizontal overflow. It also passed close/reopen draft preservation, pending submission, 503 failure, successful retry, review edit/delete, rating save/removal, and independent writes. Movie metadata, private identity and all writes were browser-only fixtures because the live Core/Catalog movie request timed out during this check. No real user records were altered.

Visual evidence: [pending grid](evidence/2026-11-12-grid-pending.png), [restored rating desktop](evidence/2026-11-12-restored-rating-desktop.png), [restored rating mobile](evidence/2026-11-12-restored-rating-mobile.png). These were opened and inspected. Browser console errors observed during guest/fixture tests corresponded to expected 401 identity and intentional 503 failure responses; no React warning was observed.

## Validation and remaining limits

- Final frontend checks: `npm run lint`, `npx tsc -b --noEmit`, `npm test -- --run` (209 passed), and `npm run build` all passed after the rating-card correction. Final main entry: 474.35 kB / 156.13 kB gzip. `git diff --check` passed.
- Core: 431 passed, 2 skipped, 3896 assertions. Catalog: 100 passed, 3 skipped, 442 assertions. Providers remain faked in automated suites.
- Local PostgreSQL migration repositories show zero pending migrations in both services. No new schema or API contract change was introduced in this reassessment; no migration or reset was run. Earlier disposable MySQL migration verification remains historical evidence.
- Real authenticated acceptance and timing still require controlled Firebase/user/admin accounts. Fixture success does not prove those live paths or real write latency. There was no destructive database operation, Neon access, commit, push, merge or branch switch.
- Public requests still cross two single-process PHP development servers. OPcache reduces compilation work but does not provide concurrent production workers. Measure production-like workers before changing query/cache architecture further. The next investigation should profile bootstrap CPU/filesystem time and queued requests, then provider misses and image/paint timings. Do not attribute the remaining delay to local PostgreSQL without new evidence.

See [performance and loading architecture](../architecture/performance-and-loading.md) for the updated implementation rules. The sections below preserve the previous remote-environment investigation for historical context only.

### Files changed in this reassessment

| Responsibility | Paths |
| --- | --- |
| Local runtime | `scripts/serve-api.ps1` |
| Shared loading | `frontend/src/components/ui/DeferredSection.tsx`, `SectionSkeleton.tsx`, `frontend/src/index.css` |
| Movie grids/Spotlight | `frontend/src/features/movies/components/MovieGrid.tsx`, `SpotlightSkeleton.tsx`, `pages/PopularMoviesPage.tsx`, `pages/DiscoverPage.tsx`, `pages/MovieDetailsPage.tsx`, `movies.css`, `homepage.css` |
| Unified opinions | `frontend/src/features/ratings/components/CommunityRatingSection.tsx`, `ratings.css`, `frontend/src/features/reviews/components/CommunityReviewsSection.tsx`, `ReviewEditor.tsx`, `reviews.css` |
| Other loading states | `frontend/src/features/collections/components/CollectionCard.tsx`, `pages/CollectionsPage.tsx`, `frontend/src/features/library/pages/LibraryOverviewPage.tsx`, `components/LibraryActions.tsx`, `frontend/src/features/auth/pages/VerificationPage.tsx`, `frontend/src/features/moderation/components/ReviewInspectDialog.tsx`, `pages/ReportDetailsPage.tsx` |
| Browser checks/evidence | `frontend/browser-checks/loading-layout.js`, `review-experience.js`, `docs/development/evidence/2026-11-12-*.png` |
| Existing docs | This report, `docs/architecture/performance-and-loading.md`, `docs/development/performance-ui-polish-report.md` |

The working tree already contained the prior optimization/Favorites work and the user's PostgreSQL configuration changes. Those remain uncommitted alongside this reassessment. Branch: `feature/ui-ux-performance-polish`; no commit or push occurred.

# Historical investigation — 2026-11-11

## 1. Executive summary

VYBE is still slow on this development setup. The strongest measured contributor is the remote PostgreSQL path: a warm `SELECT 1` takes about 0.20–0.25 seconds in each service and the first connection took 1.60 seconds in Core and 2.11 seconds in Catalog. Public requests also cross two development Laravel processes. Warm Core popular requests took 1.67–2.29 seconds after this pass; a browser reload took 3.57 seconds to first movie cards. This phase removes avoidable work (a Catalog call in collection membership choices, one admin aggregate round trip, refetch-blocked mutation completion and eager Firebase loading), but it cannot turn the current remote database and development servers into a low-latency deployment. This distinction is essential: the public endpoints were not changed to conceal their infrastructure latency.

Confirmed frontend defects included mutation callbacks awaiting active refetches, a Save dialog fetching poster previews it never displays, a roughly 540 kB initial JS chunk with eager Firebase modules, missing next-page skeletons, and landscape collection artwork. No Firebase test identity or administrator session was provided, so login, protected endpoint and real mutation wall times remain unmeasured.

## 2. Measurements and method

Measurements used the already running local Vite/Core/Catalog development services on 11 November 2026 and the configured database URLs. No credentials, cookies or tokens were recorded. HTTP samples use `curl.exe -s -o NUL -w '%{time_total}'` with JSON accept headers. These are small observational samples, not controlled load tests. “Before” and “after” are same machine/host but not identical server load. Public API code paths were unchanged in this pass, so their timing differences are noise, not claimed improvements.

| Operation | Before | After | Supported improvement / cause |
| --- | --- | --- | --- |
| Home initial movies | Browser first cards ~3.02 s; Core popular 3.67 s first, 1.74–1.81 s warm | Browser first cards 3.57 s on reload; Core popular 3.42 s first, 1.67–2.29 s warm | No demonstrated latency improvement; remote DB + two services dominate. Initial card skeleton remains visible. |
| Catalog popular | 1.30, 1.18, 1.55 s warm | Not remeasured | Catalog's cached ranking read still hits the remote database. |
| Movie details | Core detail 1.44–1.48 s warm | 1.65–1.68 s warm | No demonstrated API improvement; detail now has a content-shaped loading state. |
| Movie experience | Core 1.46–1.50 s warm | 1.62–1.78 s warm | No demonstrated API improvement; extras render independently. |
| Discover search | Core “batman” 2.66 s first, 1.52–1.57 s warm | Not remeasured | No claimed latency improvement. |
| Next movie page | Browser 20→40 cards in ~4.09 s, one page-2 response | Real page 20→40; delayed-response UI check showed 20 retained cards + 20 skeleton cards | Layout/feedback improved; no real latency reduction established. |
| Login / account switch | Unmeasured | Unmeasured | Firebase credentials unavailable; public/private query ownership verified in tests. |
| Admin users / account details | Unmeasured | Unmeasured | Administrator credentials unavailable; admin aggregate query count reduced, not a latency result. |
| Add to Favorites / publish review / other writes | Unmeasured | Unmeasured | No authenticated benchmark; confirmed cache updates no longer await background refetch. |
| Initial JS entry | 540.55 kB / 173.77 kB gzip | 472.59 kB / 155.92 kB gzip | 67.96 kB (12.6%) raw and 17.85 kB (10.3%) gzip reduction; Firebase split into 96.32 kB async chunk. This is bundle size, not a load-time measurement. |

Direct CLI read-only DB probe (same app configuration): Core `SELECT 1` first 1599.9 ms, then 197.9/196.9/216.0/234.8/217.2 ms; Catalog first 2113.6 ms, then 254.6/245.4/222.4/217.8/226.1 ms. Catalog `MovieService::ranking(1)` took 880.1 ms on its first probe with one DB query of 868.7 ms; repeats took 199.5 and 203.3 ms, each with one query. Core `/up` took 0.285–0.475 s; guest `/auth/me` 401 took 0.298–0.342 s. This separates baseline development-server overhead from the remote query and interservice path, though it does not isolate every middleware step.

Active configuration was inspected without disclosing secrets: **both services use remote `pgsql` on separate Neon hosts in `eu-central-1`**, Core `SESSION_DRIVER=file` and `CACHE_STORE=file`, Catalog `SESSION_DRIVER=file` and `CACHE_STORE=database`. There is no evidence that changing Core's session/cache driver would fix the principal latency. The Catalog database cache persists list/experience data but its remote lookups incur RTT. User-owned local PostgreSQL containers also exist; they were not reset or substituted for the configured remote databases.

## 3. Request-flow and root-cause map

All browser requests enter Core. Public movie routes avoid the private session middleware; authenticated routes use `web`, session/Sanctum, account-access and verification middleware plus route throttles. The controller/service and query families below were verified in source; timings for protected paths are not inferred from public timings.

| User action | Frontend → Core → downstream and UI sequence |
| --- | --- |
| Open VYBE/Home | App layout starts `/api/v1/auth/me` for identity; Home's public `popular-feed` starts `/movies/popular?page=1` independently. Core proxy calls Catalog internal ranking; Catalog reads cached ranking/movie rows and may call TMDB on expiry. Static hero renders first, then cards. |
| Discover | Search state is normalized into `search-feed` key; empty query can reuse popular page 1. Query starts on valid input; Core search proxies Catalog ranking/search cache. Existing pages stay during the next request. |
| Search for movie | Query/page key changes; prior Axios request is cancellable. Core → Catalog search → persistent ranking cache/provider as needed, then cards replace the result set. |
| Open movie details | Detail query calls Core → Catalog `show` → persisted movie row or TMDB refresh. Detail appears before its independent experience query (Core → Catalog) and community rating/review queries (Core DB). Trailer iframe loads only on play. |
| Sign in | Firebase mode initializes SDK for the auth route/action, obtains an ID token and exchanges it at Core `/auth/firebase/session`; legacy mode posts Core login. Core establishes Laravel session, `/auth/me` supplies user, guards load `/me/access` where required, then private routes start. Live provider timings unavailable. |
| Switch accounts | Login/logout callbacks cancel/remove private TanStack queries and update `authKey`. Public movie keys remain. Guarded private queries start under the new owner ID. A write response checks owner before cache application. |
| Open Library | Verified auth/access gates private queries. Overview starts Favorites collection and Watchlist/Watched queries under owner keys; Core sessions/access checks precede Core user-data DB reads; metadata enrichment batches IDs to Catalog. |
| Save a movie | CSRF bootstrap precedes POST/DELETE. Core verifies session/account, confirms movie with Catalog where necessary, writes Core membership in transaction. On response, state cache updates and button releases; related list/profile refetch runs in background. |
| Publish review | CSRF and active-account checks precede Core review service/DB write. The confirmed own-review cache updates; public list/profile invalidation runs in background. |
| Open Admin | Role/status guard calls `/me/access`; overview/users/reports each have own query. Core admin middleware checks role/status, then aggregate/list SQL. Overview counters now share one aggregate SQL statement; recent rows remain separate. |
| Edit account | Dialog opens from already loaded detail. Change submits Core admin request, whose authorization and identity checks remain server authoritative; confirmed detail cache updates and related lists refresh. Self access changes await auth/access revalidation. |

The expensive path on a warm public listing is request routing in Core → internal HTTP → Catalog → remote persistent cache/DB query, with development process overhead at both ends. Catalog's ranking probe had **one** DB query, so an N+1 fix there would not explain current warm latency. A previous pass batched provider upserts and preserved cache reuse; this pass left the seven-day freshness and stale fallback intact. Real TMDB duration on misses was not measured because the inspected requests were warm.

## 4. Implemented changes

- Collection choice requests accept `include_previews=0`. Core skips the bounded preview relation and Catalog summary request for that mode, while normal collection cards retain previews. A Core test confirms two collection SQL queries versus three for its fixture and no extra Catalog HTTP. The dialog reuses the action's fresh query instead of forcing a second mount refetch. See `CollectionService`, `ListCollectionsRequest`, `useCollections`, and the [M2 contract](../api/milestone-2-contracts.md).
- Admin overview hidden/spoiler report and user counts use one SQL aggregate statement with independent subqueries, rather than separate remote round trips. Recent report rows remain bounded. A query-count test covers this shape.
- Library, collection, rating, review, profile, admin and moderation mutations release local pending state after authoritative success and cache reconciliation, while targeted refetch runs in the background. Self access changes retain the required security revalidation. Errors and account ownership checks remain in place.
- Firebase social SDK imports move to the relevant action/account route. The final initial JS entry is 472.59 kB (155.92 kB gzip) versus 540.55 kB (173.77 kB gzip) before this phase.
- Home/Discover append geometry-matched movie skeletons for next-page fetches and keep existing cards. Movie detail, trailer/cast, profile, admin account/history and collection-choice dialog now have content-shaped local loading states. Existing library, admin table/stats and review skeletons remain. Collection preview cards use up to three portrait `poster_path` images from the existing bounded API data, with 2:3 boxes, lazy image decoding and missing-image/empty fallback.

## 5. Cache architecture

Catalog's `movies` table stores shared metadata and `metadata_fetched_at`, default freshness seven days. Reads of fresh metadata do not renew that timestamp; refreshes, locks and stale fallback remain. Popular/search order and experience data use Catalog's persistent database cache. Core owns session/user data and does not create a duplicate movie cache. Frontend public movie queries may survive an account switch; owner-keyed private queries cannot. The current Catalog database cache is durable but inherits remote DB latency. A colocated database or measured connection pooling should be evaluated before adding cache infrastructure.

## 6. Loading, mutation and poster architecture

Initial skeletons occupy the dimensions of their eventual cards/sections. Incremental page skeletons append after retained cards. Secondary movie sections load independently. Background refreshes preserve content, while errors expose retry without erasing earlier pages. Skeleton decoration is hidden from screen readers, with a group status/name and reduced-motion CSS. The save dialog opens immediately and shows choice-row placeholders while its membership-only request runs. See the [performance architecture](../architecture/performance-and-loading.md) for future implementation rules.

Collection cards use one centered poster, two side-by-side posters, or a three-poster layered composition; poster aspect ratio stays 2:3 and the cover's outer ratio remains stable. Absent/broken images have an intentional fallback. No per-poster API request was introduced.

## 7. Verification

- `cd frontend && npm run lint`: passed.
- `cd frontend && npx tsc -b --noEmit`: passed.
- `cd frontend && npm test -- --run`: 15 files, 208 tests passed after the final edits, including a regression test that confirmed rating feedback does not await unresolved background refetches.
- `cd frontend && npm run build`: passed; main entry 472.59 kB / 155.92 kB gzip.
- `cd backend && php artisan test --compact`: 431 passed, 2 skipped, 3896 assertions.
- `cd services/movie-catalog && php artisan test --compact`: 100 passed, 3 skipped, 442 assertions.
- Browser actual movie-detail requests at 360/768/1024/1440 px: skeleton observed, title loaded, no horizontal overflow. Home initial skeleton observed. With page-2 response intentionally delayed but still fulfilled by the real server, the browser retained 20 cards beside 20 pending skeleton cards and then showed 40 cards. The delay was a UI-state test and is excluded from latency measurements.
- Browser Discover search for “batman” at the same four widths: initial skeleton observed, results loaded, and no horizontal overflow. An isolated mocked admin overview showed four statistic skeletons while its response was delayed; its layout had no overflow at the four widths. This does not establish authenticated endpoint latency.
- Browser collection-collage rendering with isolated mocked **private** API data at all four widths: zero/one/two/three poster counts appeared (six poster images across the sample cards), six cards rendered, and no horizontal overflow. This verifies responsive rendering only; it is not a real authenticated performance benchmark.
- No migrations were added in this phase. Previous pass verified Core and Catalog migrations in separate disposable MySQL databases; no shared data was reset.

## 8. Remaining bottlenecks and next measurements

Public first content is still roughly 3–4 seconds in this setup, and a warm public Core endpoint remains roughly 1.5–2.3 seconds. Measure again with both Laravel services and PostgreSQL in the same region/network, then compare warm DB `SELECT 1`, Catalog internal endpoint, Core proxy endpoint and browser first-card times. Keep the same data and cache state. Investigate provider misses separately. A local development database could remove network RTT, but moving data or changing environment configuration requires an operational plan; this phase did not change credentials or user-owned containers.

Login, account switch, admin and write response/confirmation timings require a controlled verified user and administrator session. Record browser click → HTTP response → visible confirmation separately, plus Firebase SDK/token/exchange spans for cold and warm login. Use DevTools timing and temporary redacted Laravel query listeners in a nonproduction environment; do not enable production query logs or print tokens. Test real authenticated poster collages, moderation dialogs, and the full responsive matrix with those accounts. Some smaller auth/account-resolution and moderation-inspection states still use local status text rather than shaped skeletons; these remain for authenticated UI review. Social providers were not exercised. No production latency budget can be claimed from the available development-server measurements.

## 9. Future requirements

Future features must follow [performance and loading architecture](../architecture/performance-and-loading.md): owner-complete query keys, targeted background invalidation, bounded Core/Catalog work, content-shaped skeletons and deterministic request-count coverage. Rebenchmark the same 12 request flows after the infrastructure change before calling the latency objective complete.
