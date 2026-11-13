# Advanced discovery and Home upcoming delivery

Implemented on the existing `feature/advanced-discover` branch. No branch switch, commit or push was performed. The initial working tree was clean.

## Delivered behavior

Discover now supports Popular, Trending, Top Rated, Now Playing and Upcoming, with URL-backed browse pagination, multi-genre ANY/ALL selection, year/rating/runtime/original-language filters, server-side sorting, individual filter removal and reset. Existing title search remains a separate mode with its debounce and incremental feed. Core and Catalog expose an additive validated Discover endpoint using the existing summary DTO. Catalog reuses normalization, bounded provider transport, batched persistence and ranking caches.

Home has Coming Soon / Worth the Wait between Spotlight and Popular. It shows the first six eligible unique upcoming movies from the shared discovery page, with posters and full release dates, its own loading/error/empty/retry states, and Explore Upcoming linking to the selected Discover category. Loading and failures are independent of Popular. Popular's query/pagination implementation is unchanged.

## Changed files

Core:

- `backend/app/Http/Requests/Movies/DiscoverMoviesRequest.php`
- `backend/app/Http/Controllers/Api/V1/MovieController.php`
- `backend/app/Integrations/MovieCatalog/MovieCatalogClient.php`
- `backend/routes/api.php`
- `backend/tests/Feature/MovieDiscoveryTest.php`

Catalog:

- `services/movie-catalog/app/Http/Requests/Movies/DiscoverMoviesRequest.php`
- `services/movie-catalog/app/Http/Controllers/Internal/V1/MovieController.php`
- `services/movie-catalog/app/Integrations/Tmdb/TmdbClient.php`
- `services/movie-catalog/app/Services/MovieService.php`
- `services/movie-catalog/routes/api.php`
- `services/movie-catalog/tests/Feature/AdvancedDiscoveryTest.php`

Frontend:

- `frontend/src/features/movies/api/moviesApi.ts`
- `frontend/src/features/movies/lib/discovery.ts`
- `frontend/src/features/movies/hooks/useMovies.ts`
- `frontend/src/features/movies/components/DiscoveryControls.tsx`
- `frontend/src/features/movies/components/UpcomingMovies.tsx`
- `frontend/src/features/movies/components/MovieCard.tsx`
- `frontend/src/features/movies/components/MovieGrid.tsx`
- `frontend/src/features/movies/pages/DiscoverPage.tsx`
- `frontend/src/features/movies/pages/PopularMoviesPage.tsx`
- `frontend/src/features/movies/discover.css`
- `frontend/src/features/movies/homepage.css`
- `frontend/src/features/movies/tests/Discovery.test.tsx`
- `frontend/src/features/movies/tests/Movies.test.tsx`
- `frontend/tests/advanced-discovery.browser.mjs`

Documentation:

- `docs/api/contracts.md`
- `docs/api/movie-discovery.md`
- `docs/architecture/backend.md`
- `docs/architecture/frontend.md`
- This delivery report.

## Validation run locally

| Check | Actual result |
| --- | --- |
| Core `php artisan test --compact --no-ansi` | 452 passed, 2 skipped, 3979 assertions |
| Catalog `php artisan test --compact --no-ansi` | 138 passed, 3 skipped, 575 assertions |
| Frontend `npm run lint` | Passed without warnings |
| Frontend `npx tsc -b --noEmit` | Passed |
| Frontend `npm test -- --reporter=dot` | 243 passed across 16 files |
| Frontend `npm run build` | Passed |
| New isolated Playwright acceptance module | Six scenario groups passed, desktop 1440px and mobile 390px |
| Visual inspection | Upcoming section rendered and inspected with clearly synthetic isolated poster fixtures |
| `git diff --check` | Passed |

The two Core skips require an ephemeral live Firebase ID token; the three Catalog skips exercise numeric-column constraints/rollback on database engines beyond SQLite. PHP suites used disposable SQLite memory databases. No MySQL listener was available locally on port 3306, so disposable MySQL migration verification was not run. Existing CI defines independent MySQL migration checks, but no CI run or result is claimed here. Automated provider/acceptance HTTP uses fakes; live TMDB acceptance remains pending.

The codebase graph was consulted for the initial movie flow and then reported a closed transport during broader coverage checks. Relevant implementation and test files were read directly; no completeness claim relies on the unavailable graph. A subsequent focused refinement compacted the existing expanded filter panel, introduced immediate sorting and added cached in-memory Trending filtering; browser checks passed at desktop and mobile widths.

The filter layout was then corrected after visual review: the previous 960px width cap and two-column toolbar grid confined the expanded panel to the left side. The native details content now fills the results container in document flow, with 16px above the panel and 28px before the movie grid. Browser bounding-box checks passed in collapsed and expanded states at 1440, 1024, 768 and 390px, with no page overflow. Screenshots of all eight states were captured for visual inspection. This layout-only correction changed `frontend/src/features/movies/discover.css` and `frontend/tests/advanced-discovery.browser.mjs`; no backend, API, database or configuration behavior changed.

## Contracts, configuration and limitations

The additive public `/api/v1/movies/discover` and internal `/api/internal/v1/movies/discover` contracts are documented in [movie-discovery.md](../api/movie-discovery.md). Existing movie DTOs and endpoints remain compatible. Database ownership/schema, migrations, dependencies and environment variables do not change. Deploy the updated Core/Catalog routes together with the frontend; retain existing server-only service/TMDB configuration and shared Catalog cache.

Trending preserves the provider's weekly ranking and filters a cached candidate pool of at most 60 films. Sorting and runtime are unavailable for Trending; its counts and pagination refer only to that bounded selection. Now Playing is explicitly a global six-week primary-release window, not local cinema listings. Upcoming means a future UTC primary release, and dates may change. Home intentionally reads only the first provider page; it can show fewer than six cards if that page has fewer eligible movies. Upcoming pagination/counts remain provider totals before poster exclusion. These limitations are explained in the contract and relevant UI copy.

FYP is not implemented. Future recommendation work still needs an approved personalized-data/ranking contract and acceptance plan; the discovery service can supply bounded candidates without accessing Core user data.
