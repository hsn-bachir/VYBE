# Performance and loading architecture

This is the implementation convention for M2.5 and later VYBE slices. The frontend calls Core only. Core owns user data and sessions; Catalog owns movie metadata and TMDB access. See [system overview](system-overview.md), [API contracts](../api/contracts.md), and [final performance report](../development/final-performance-optimization-report.md).

## A. Data fetching

- Put HTTP methods in each feature's `api/` module and TanStack Query options/hooks in its `hooks/` module. Pass the Query `AbortSignal` to Axios. Components render query state; they do not issue ad hoc HTTP calls.
- Include every input that changes a response in its key: owner ID, movie ID, normalized search string, page, filters, and collection preview mode. Examples: `libraryKeys.state(owner, movie)`, `collectionKeys.list(owner, page, movie, includePreviews)`, `searchFeedOptions(query, startPage)`. Key prefixes identify the affected resource for invalidation.
- Public `movies` popular/search/detail/experience data is shared across accounts. Every private key includes the owner ID. `storeAuthenticatedUser` and logout cancel and remove private queries before changing the authenticated identity. Preserve the public allowlist in `useAuth.ts`; new private query families must never be added to it.
- Use a modest freshness window for stable movie data (currently 60 seconds in `useMovies.ts`) and account-scoped collections/library/admin lists (typically 30 seconds). Access decisions use zero freshness and focus revalidation. Set `refetchOnMount` and focus policies deliberately, not globally. Public infinite feeds retain their pages for ten minutes and do not refetch on a routine remount.
- Start independent requests together: collection details and collection movies can load in parallel; account details render while history and identity methods load separately. Dependent requests require explicit `enabled` conditions. Avoid a detail response just to learn information already in a list row.
- Prefetch only likely next navigation when there is evidence of benefit. Reuse `popularOptions(1)` and the popular feed's first page instead of making duplicate initial requests. Cancellation on route/account changes prevents old responses from repopulating private UI.

## B. Mutations

- Keep mutation HTTP methods in the feature API module and use `useMutation` in the feature hook. Show local pending state immediately and disable duplicate submissions.
- For library membership, collections, ratings, reviews and profile edits, wait for the server response, cancel the affected in-flight query, update the confirmed local cache, and start targeted invalidation in the background. Do not await network refetches merely to release the button or close a dialog. `useMembership`, `useCollectionMutation`, `useRatingMutation`, and `useReviewMutation` demonstrate this. Errors keep/recover the previous state and expose retryable feedback.
- Speculative changes are appropriate only when rollback is clear and authorization cannot change the meaning of success. VYBE currently favors server-confirmed writes for its user content. Role/status/password changes always use server authority. Self access changes must revalidate auth/access before showing another protected action.
- Check the current owner before a private write and again before applying its response. On 401/403, discard affected private cache and revalidate identity. Invalidate the smallest key prefix that contains dependent data; avoid refreshing public movie metadata after a private write.

## C. Backend requests

- Follow route → controller/FormRequest → service → Eloquent/external client → Resource. Authorization remains server-side. Avoid queries from serialization and unbounded eager relations.
- Select needed columns, paginate large lists, eager load bounded relationships, and batch Catalog summary IDs. Collection lists load at most three recent movies per collection. The save dialog requests `include_previews=0` to avoid the preview query and Catalog round trip it cannot display.
- Combine compatible aggregate counts when this removes serial remote-DB round trips; the admin summary uses a single SQL aggregate request for report and user counters. Add indexes only for demonstrated query plans and filters. Maintain independent Core and Catalog test databases.
- Keep external network I/O outside transactions and locks. Preserve row locks and transaction guarantees for membership, access and moderation writes. Avoid database-backed session/cache stores on a remote host unless measured and justified; current Core sessions/cache are files, while Catalog cache is database backed.

## D. Core → Catalog

- Core's versioned HTTP client sends the internal service token, uses bounded timeouts/retries, and translates failures. Browser code never contacts Catalog or TMDB and never receives the internal token.
- Catalog persists movie details in `movies`, with a seven-day default freshness based on `metadata_fetched_at`. Fresh reads do not advance this timestamp. Popular/search ranking and experience caches use the configured persistent cache store. Preserve locks, stale-data fallback, provider order and batched upserts. Do not add a second metadata cache in Core.
- Core can return a saved user record when Catalog metadata is unavailable. A Catalog outage must not delete user data. New enrichment endpoints should accept bounded ID batches instead of one request per row.

## E. Authentication

- Firebase establishes identity when that provider is configured. Exchange an ID token with Core once for a Laravel session; ordinary requests use that session, not repeated Firebase exchanges. Firebase SDK code is loaded only for routes/actions needing it.
- Core's session middleware and user/access checks run on private requests. Do not cache role or account status in a way that bypasses immediate server restrictions. `useAccess` refetches authorization on focus; account changes clear private query data. CSRF bootstrap precedes session writes.
- Do not log tokens, cookies, passwords, private profile fields or provider exceptions. Authentication timing must be measured with a controlled test account before setting a login latency budget.

## F. Loading states

| State | Presentation |
| --- | --- |
| Initial movie list | `MovieGridSkeleton` cards in the real grid; keep the static Home hero visible. |
| Next popular/search page | Pass `pendingCount` to `MovieGrid`; placeholders and real cards must be sibling list items in the same grid, filling incomplete rows. Never append a separate `MovieGridSkeleton` grid. Keep scroll position and retry on error. |
| Home Spotlight | `SpotlightSkeleton` uses the real `.spotlight-stage` dimensions and copy geometry. It shares the popular query; the static Home hero remains available. |
| Movie detail | `MovieDetailsSkeleton` matches poster, title, metadata, actions and story geometry. Independent trailer, cast and community sections load separately. |
| Library/profile/admin initial data | Card, identity/statistics or table skeletons with the actual responsive geometry. |
| Dialog data | Open the dialog immediately and show local rows (for example `SaveCollectionDialog`). |
| Background refresh | Keep confirmed content; use a small status message when useful. |
| Mutation | Pending label and disabled control near the action; confirmed cache update on success. |
| Error/empty | Replace only the failed section with an explanation and retry; empty content has its own deliberate state. |

All skeleton groups have `role="status"` and an accessible name; decorative shapes are hidden from assistive technology. Use the shared `.skeleton` styling and its reduced-motion rule. Never add artificial loading delays.

`CollectionCardSkeleton` reserves the collection art/copy geometry. Use `SectionSkeleton` for bounded text sections, not poster grids. `DeferredSection` mounts below-the-fold community data when it approaches the viewport; do not defer primary title/metadata or require community responses before showing a movie.

### Movie opinions

Movie Details mounts `CommunityReviewsSection` as the single Your take/conversation composition. It embeds the original `CommunityRatingSection` card with the existing `PeekRating` interaction, community average/count and visible five-row distribution. The review action sits in the card's personal rating area, and the compact conversation follows directly below it. Rating and review resources stay separate and optional. Review create/edit uses `Dialog` and `ReviewEditor`; draft changes are retained when closing, and pending/failure stays local. Never infer that one write succeeded because another resource succeeded. Review cards retain spoof-safe author rendering, spoiler concealment, expansion, owner controls and reporting.

### Local PHP runtime

The verified development setup on 2026-11-12 uses independent local PostgreSQL containers on 55435/55436, SSL disabled locally, file sessions in Core and database cache in Catalog. This is environment evidence, not a required deployment driver. `scripts/serve-api.ps1 -Service core|catalog` enables CLI OPcache for PHP's development server while validating timestamps on every request. Use it in two terminals after stopping the old server on the same port; do not spawn competing listeners. Do not disable timestamp validation during interactive development. This reduces compilation overhead but does not make the PHP development server a production worker pool.

Browser geometry/interaction regressions live in `frontend/browser-checks/loading-layout.js` and `review-experience.js`, run through Playwright MCP's filename runner. The review check uses browser-only movie, account, rating and review fixtures; the loading test continues real API responses after test-only delays. Neither is a latency benchmark.

## G. Rendering and assets

- Lazy-load route modules and large feature-only SDKs. Firebase social code loads when a provider action or Firebase account page needs it; ordinary movie browsing should not download it up front.
- Use poster-sized TMDB URLs for card/collection images, backdrop URLs for hero art, `aspect-ratio` and `object-fit` for stable boxes, `loading="lazy"` for offscreen art, and eager loading only for immediately visible hero images. Collection previews consume existing `preview_movies` data and never request one movie per poster.
- Avoid speculative memoization. Measure renders before adding it. Keep animations scoped and respect reduced motion. Preserve visible content during background refetches.

## H. Required checklist for new features

- [ ] Trace browser → Core → Catalog/provider requests and count database/network round trips.
- [ ] Confirm query ownership, complete keys, freshness, cancellation, and account-switch cleanup.
- [ ] Start independent queries together and invalidate only affected data.
- [ ] Use safe pending/confirmed/error behavior for every write; never weaken authorization.
- [ ] Provide geometry-matched, responsive skeletons for genuine initial/partial/pagination waits.
- [ ] Keep existing content on refresh and pagination failure; provide retry.
- [ ] Bound pagination, relations, summary batches and external calls; verify query plans before indexing.
- [ ] Check 360, 768, 1024 and 1440 px, reduced motion, accessibility status, and image dimensions.
- [ ] Add deterministic request/query-count or cache-ownership regression tests and record controlled cold/warm timings when relevant.
