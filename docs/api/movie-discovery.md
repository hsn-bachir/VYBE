# Advanced movie discovery

Core exposes guest `GET /api/v1/movies/discover`; Catalog exposes the same parameters at token-protected `GET /api/internal/v1/movies/discover`. Both static routes precede movie-ID routes. React calls Core only. Responses reuse the existing summary DTO and `{page, total_pages, total_results}` metadata; no new database columns or migrations are required.

## Parameters

| Parameter | Accepted values / default |
| --- | --- |
| `category` | `popular` (default), `trending`, `top_rated`, `now_playing`, `upcoming` |
| `page` | Integer 1–500, default 1 |
| `sort` | `popularity.desc`, `vote_average.desc`, `primary_release_date.asc`, `primary_release_date.desc`, `title.asc`, `title.desc`; default highest rated for Top Rated, most popular otherwise. Unavailable for Trending. |
| `genres[]` | At most 19 movie genre IDs from the allowlist below; deduplicated and numerically sorted |
| `genre_match` | `any` (default) or `all`; ignored when no genres are selected |
| `year_from`, `year_to` | Optional inclusive primary-release-year bounds, integers 1888–2100; minimum must not exceed maximum |
| `rating_min` | Optional number 0–10 (TMDB rating, independent of VYBE user ratings) |
| `runtime_min`, `runtime_max` | Optional inclusive minute bounds, integers 0–600; minimum must not exceed maximum. Unavailable for Trending. |
| `original_language` | Optional lowercase two-letter ISO 639-1 code; selects original language, not translated response language |

Genre allowlist: Action 28, Adventure 12, Animation 16, Comedy 35, Crime 80, Documentary 99, Drama 18, Family 10751, Fantasy 14, History 36, Horror 27, Music 10402, Mystery 9648, Romance 10749, Science Fiction 878, TV Movie 10770, Thriller 53, War 10752, Western 37. The SPA bundles these stable labels without an additional metadata request.

Example Core request: `/api/v1/movies/discover?category=upcoming&genres[]=18&genres[]=35&genre_match=any&sort=popularity.desc&page=1`.

Invalid recognized parameters return 422 before upstream HTTP. Unknown parameters are discarded, never forwarded. A title `query` is prohibited on Discover: use the existing `/movies/search` endpoint. Core and Catalog independently validate their contracts; they share no application classes or databases. Internal authentication and existing safe 503 error translation remain intact.

## Category and provider semantics

- Plain Popular shares `/movie/popular` and its existing ranking cache. Filtered/sorted Popular uses `/discover/movie`.
- Trending reads at most three pages (up to 60 candidates) of `/trending/movie/week` into a shared 15-minute cache. Genre ANY/ALL, primary release year, minimum TMDB rating and original language filter this bounded weekly selection in memory while preserving provider rank. Counts and pages describe the filtered selection, never all TMDB movies. Sorting and runtime filtering return 422 because the provider ranking must remain intact and trending summaries lack runtime. No detail requests are made. Switching to Trending keeps supported filters and removes unsupported ones.
- Top Rated uses Discover, defaults to rating descending, and requires at least 300 TMDB votes. Sorting any other discovery category by rating also requires 300 votes.
- Now Playing uses Discover with primary release dates from 42 days before today through today, intersected with requested year bounds. This is a global recent-release window, not regional cinema availability or local showtimes; the UI says so.
- Upcoming uses Discover with primary release dates strictly after today (tomorrow onward), intersected with requested year bounds; default order is popularity descending. Catalog also removes rows without valid posters or future dates after normalization. Returned order remains the provider's global order, never a sort of the current page.

Dates use UTC. Release dates are provider estimates and may change. Responses remain English (`en-US`); Discover excludes adult/video entries. TMDB's [Discover API](https://developer.themoviedb.org/reference/discover-movie) uses commas for ALL genres and pipes for ANY genres. Its separate [Trending API](https://developer.themoviedb.org/reference/trending-movies) supplies trending rank. Original-language filtering does not translate the interface.

## Cache, persistence and request bounds

Catalog uses `CATALOG_RANKING_TTL_SECONDS` (existing default 900 seconds). Keys include canonical typed parameters, sorted unique genre IDs, page and the fixed language/adult policy. Omitted/default sort, genre matching, category and zero rating normalize identically. Upcoming/Now Playing keys also include the UTC date, preventing a previous day's snapshot from being reused after midnight. Plain Popular discovery shares the original popular snapshot instead of making a second provider call. Trending candidate pages and the assembled weekly pool share the ranking TTL; changing filters does not fetch TMDB again during freshness.

Each cache miss requests one provider page, with the existing maximum of two transport attempts for safe transient failures. No discovery card triggers a movie-detail request. The existing batched summary upsert persists only non-null supplied values and preserves hydrated fields and `metadata_fetched_at`. Existing detail locks, cooldowns and stale-detail fallback remain unchanged. Expired lists have no stale-ranking fallback: failure returns safe 503, not a database-generated ranking. Provider 429/Retry-After still defer requests through the existing shared cooldown.

Upcoming poster exclusion can produce shorter or empty pages; pagination and counts remain TMDB's provider totals, which may include omitted posterless rows. No pages are scanned merely to fill the Home section. Home shows the first six eligible unique movies from page one, or fewer when that page is sparse, with a genuine empty state when none qualify. This bounds provider requests and keeps Home and Discover on the same cached data.

## Frontend and navigation

Browse state uses `/discover?category=upcoming&genres=18,35&genre_match=any&sort=popularity.desc&page=2` (comma-separated genres in browser URLs, array parameters on the HTTP API). Applied filters and sorting reset the page to one. Sorting applies immediately; draft filter selections submit together with Show results. Browse uses URL page links; back/forward restores the form, category and response. Individual chips remove genres or scalar filters; Clear all keeps the active category. The existing advanced panel remains collapsed by default and uses keyboard-operable chip controls on mobile and desktop.

Title search retains its existing debounce, whitespace normalization, URL query/page state, incremental results, cancellation and errors. Search explicitly hides browse controls and explains that browse filters do not apply. Switching into title search clears browse parameters; returning to browse starts at Popular. Filters are never applied to a loaded search page.

Home renders Brand Hero → Spotlight → Coming Soon / Worth the Wait → Popular. Upcoming has its own React Query request and six-card skeleton, empty, error, retry and cached-error feedback. It shares cards, image sizing, entrance animation, responsive grids and motion preferences. Dates render as semantic `<time>` elements. Explore Upcoming navigates to `/discover?category=upcoming`.

Home and Discover share the exact Upcoming page-one React Query key, with 60-second freshness and ten-minute inactive retention. Fresh navigation does not request the same page again. Default Popular browsing can reuse the existing popular feed's first page. Query functions pass AbortSignal to Axios so obsolete browse requests are cancelled. Home's Popular query, infinite-scroll sentinel, page limits, deduplication and pagination behavior are unchanged.

## Future For You use

Validated Catalog discovery can later supply bounded candidate pages without involving Core-owned user data in Catalog. This change adds no recommendation scoring, preference profiles, social graph or personalized endpoints. FYP still needs an approved user-data/ranking contract, privacy rules, candidate selection strategy and separate acceptance tests; discovery's provider popularity/rating order is not personalization.

## Verification

Core HTTP fakes cover canonical allowlisting, defaults, invalid parameters, order/pagination and safe service failure, alongside existing movie-search tests. Catalog HTTP fakes cover all categories/sorts, combined filters and ANY/ALL genres, normalization, future poster exclusion, cache equivalence/expiry/date rollover, popular cache reuse, summary preservation, authentication, malformed data and bounded failure behavior. Provider HTTP is never live in these tests.

Frontend tests cover API parameters/cancellation, URL validation/round trips, query caching, filters/sort/page links, search separation, six-card selection, independent pending/error states, skeletons and empty/retry rendering. `frontend/tests/advanced-discovery.browser.mjs` exports `runAdvancedDiscoveryChecks(page, base)` for a Playwright host: it intercepts API and poster responses in that isolated page and checks nonblocking Home loading, cache reuse, category selection, combined filter submission, pagination/history, chips/reset, search separation, mobile overflow and error/retry/empty states.
