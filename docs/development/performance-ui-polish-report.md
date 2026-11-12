# Performance and UI polish investigation (2026-11-11)

> **2026-11-12 reassessment:** Local PostgreSQL is now verified for both services. The updated [final report](final-performance-optimization-report.md) records the new local baseline, measured PHP OPcache improvements, shared-grid pagination correction, Spotlight skeleton, unified Your take/review dialog, browser regression scripts and screenshot evidence. The remote-database findings below are historical.

> **Follow-up:** The [final performance investigation](final-performance-optimization-report.md) measured the live configured remote PostgreSQL path and local browser/API latency, implemented further loading and request optimizations, and documented the [performance architecture](../architecture/performance-and-loading.md). This report records the earlier pass and its then-current verification; use the follow-up for current measurements and remaining risks.

## Scope and evidence

This pass inspected the current React, Core, and Catalog implementation, the M2 API/database contracts, existing tests, and the WatchWise list-card reference. The WatchWise reference uses a small poster collage and resolves list movie IDs on the client; VYBE's collection cards use bounded summary previews from Core instead. No production timing, Firebase credential, TMDB credential, or authenticated browser session was available. The findings below distinguish code-level and test measurements from live latency measurements.

## Confirmed bottlenecks and changes

| Path | Confirmed cause | Change and evidence |
| --- | --- | --- |
| Catalog ranking and related movies | Each normalized summary caused a separate `Movie::upsert`, even when rows had the same supplied fields. | Group rows by supplied-field signature and upsert each group in one statement. A Catalog test records **one movie upsert for 20 equal-shape summaries**, versus 20 statements in the prior loop. Null/absent summary values still cannot replace hydrated detail fields, and provider order is unchanged. This is a statement-count result, not a wall-time benchmark. |
| Account changes | Login, logout, and a 401 cleared all non-auth TanStack queries, including shared public movie metadata. | Keep public popular, search, detail, and experience queries, including infinite-feed keys; clear private library, review, access, and admin queries. A frontend test verifies public retention and private removal. |
| Admin users | Users and detail queries had zero staleness and refetched on focus, causing repeated requests during navigation. | Use a 30-second freshness window and disable focus refetch for these queries. Mutations still invalidate their affected data. |
| Collection details | Details and movie membership were requested sequentially. | Start independent requests together. The collection list now provides three recent poster summaries per card through bounded Catalog summary batches. |
| Route transitions | Several lazy routes showed plain text placeholders. | Use the existing VYBE loader. Home and Discover keep loaded infinite-query pages visible while fetching more. |

In the local browser pass, the Laravel development server logged guest `GET /api/v1/auth/me` requests at roughly 0.5 seconds while using the disposable MySQL database. This includes development-server work; it does not isolate network, middleware, database, or rendering time. The build still reports a 540.55 kB main JavaScript chunk above Vite's 500 kB advisory threshold. No browser network waterfall, database query-time profile, Firebase exchange timing, Core-to-Catalog timing, or cold/warm production comparison was measured, so no latency reduction is claimed.

## Catalog cache correctness

Catalog movie detail metadata is stored in its `movies` table with `metadata_fetched_at`; the configured default freshness is seven days. The Catalog database cache store also holds list and experience entries. A normal fresh read does not advance the detail timestamp. Successful provider refreshes do; stale fallback and request locks remain in place. Core forwards public movie responses, while user membership, ratings, and review projections stay in Core and are excluded from the public query-retention allowlist. Tests cover persisted detail reuse after clearing the process cache and rebuilding the service, plus existing expiry, refresh, lock, failure, and experience scenarios. A process restart was simulated in a test; an actual restarted deployment was not benchmarked.

## UI and behavior

Shared semantic alerts and button treatments support success, error, warning, and information states, including rating save/error feedback. Authentication provider controls now use local Google and GitHub SVG marks, and provider errors sit above the provider divider. The main header groups account controls; the admin shell has clearer navigation and role context. The community review list includes the viewer's review without a second large personal panel. The Library overview uses Favorites, Watchlist, Watched, then custom collection cards; movie details offer a direct Favorites action. Home popular and Discover search use controlled infinite queries with an observer, retry, an accessible manual fallback, and retained earlier pages.

The frontend was rendered in a local browser at 360, 768, 1024, and 1440 px for guest Home, login, and registration. These pages showed no horizontal overflow, and registration provider controls remained visible. Home showed its expected movie-load error because a usable Catalog/TMDB environment was not configured. Library and admin overview were also rendered at all four widths with explicitly mocked local API responses; each showed no horizontal overflow. This caught and corrected a Watchlist/Watched card label that incorrectly said “Private collection.” Authenticated integration, review, modal, and movie-detail visual states still need browser acceptance with a configured account and Catalog service.

## Contract and migration

Core adds nullable `collections.system_key` with a unique `(user_id, system_key)` index. The migration adopts one existing case-insensitive Favorites collection for each user, preserves duplicate legacy collections under distinct names, and provisions missing Favorites collections. New users receive one through the model creation hook. Built-in Favorites cannot be renamed or deleted; its movie membership remains editable and independent of other collections. Collection listings add `system_key`, up to three `preview_movies`, and `meta.preview_metadata_unavailable`. Existing Watchlist and Watched storage and URLs remain intact. The [M2 API contract](../api/milestone-2-contracts.md) and [M2 schema](../database/milestone-2-schema.md) describe the additions.

The Core and Catalog migrations ran successfully against separate disposable MySQL 8.4 databases. A Core test-database rollback/reapply of only the new migration verified an existing Favorites adoption, duplicate preservation, and missing Favorites creation. Deploy Core migrations before serving the updated application code. No shared database was reset.

## Verification and limits

- `cd frontend && npm run lint`: passed.
- `cd frontend && npx tsc -b --noEmit`: passed.
- `cd frontend && npm test`: 15 files, 207 tests passed after the final frontend changes.
- `cd frontend && npm run build`: passed, with the chunk-size advisory above.
- `cd backend && php artisan test --compact`: 431 passed, 2 skipped, 3889 assertions.
- `cd services/movie-catalog && php artisan test --compact`: 100 passed, 3 skipped, 442 assertions.
- Disposable MySQL migration and legacy Favorites backfill verification: passed.

Live Firebase and social-provider flows, authenticated admin interactions, and the full responsive matrix of protected pages remain unverified in a browser. The UI changes cover the shared feedback/button baseline and principal screens; a full dialog-by-dialog admin redesign and measured end-to-end performance study remain open.
