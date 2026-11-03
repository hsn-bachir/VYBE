# M2 frontend integration — M2.1–M2.4 implemented, profile planned

M2.0 changed no React code. M2.1 adds `features/library` and cinematic movie details. Build future features under `src/features/<feature>/api`, `hooks`, `types`, `components`, `pages`, with tests beside their feature; create directories only as needed. Reuse `src/lib/api/client.ts`, `useAuth`, `RequireAuth`, `AppLayout`, semantic design tokens, shared Button/Input, `MovieCard`, `MovieGrid`, `MovieImage` and `MovieState`. Existing movie DTOs and public detail query remain unchanged.

## Implemented M2.1

- Details refinement: `MovieCast` presents a horizontally scrollable portrait/card row with named previous/next controls, disabled boundary states, native keyboard/touch scrolling and instant navigation for reduced motion. No autoplay or animation dependency. Trailer buttons use the shared subtle VYBE hover lift, without a shine effect. Shared error feedback distinguishes HTTP 5xx failures from an unreachable connection without displaying raw backend messages.

- Lazy routes: /library redirects to /library/watchlist; watchlist and watched use RequireAuth inside AppLayout. Details and the native trailer dialog are lazy-loaded. Existing public/verification guards remain intact.
- Shared components: Button, MovieCard (optional controls outside its anchor), MovieImage, MovieGrid, skeletons, MoviePagination, MovieState, useAuth and the existing Axios client. Library has no independent authentication store.
- Actual numeric-ID keys: `['library', userId, kind, page]` with fixed per_page 20, and `['library', userId, 'state', tmdbId]`. Private queries use 30-second staleTime, no automatic retries, no focus refetch, and forward AbortSignal. Media key: `['movies', 'experience', tmdbIdString]`; existing discovery/detail keys remain compatible.
- Successful writes update only the affected state field from the confirmed result, invalidate the matching user's list pages and movie state, and leave the other list/discovery caches intact. No optimistic success or automatic write replay. CSRF is bootstrapped before each write and the current account is rechecked before dispatch. Login/logout cancels and clears existing non-auth queries; late mutation callbacks check owner identity.
- 401/403 reads and writes recheck auth and remove inaccessible private data. 419, 422, 429, 503 and network errors have safe contextual feedback. Catalog list failure returns removable placeholders and true totals. Full Core failures show retry; empty libraries have discovery links. Pagination is in the URL.
- Details contain a responsive backdrop/poster hero, visible TMDB score, independent save/watched controls, story/director/facts, trailer preview, twelve-person cast strip and up to six related cards. Only authoritative API fields render. YouTube loads on explicit play, with Escape/close, focus restoration and external playback fallback.
- Motion: existing vendored React Bits AnimatedContent for story reveal; a small server-confirmed bookmark pulse and hover/focus trailer highlight use CSS and existing tokens. Reduced motion disables decorative effects. Compact library feedback has a dismiss button; errors persist. No new dependencies. See the [React Bits evaluation](../development/m2.1-report.md#d-react-bits-evaluation).

## Implemented M2.2

- `features/collections/{api,hooks,types,components,pages,tests}` adds lazy protected `/library/collections` and `/library/collections/:id` routes. Shared LibraryHeader now renders Watchlist, Watched and Collections without changing the existing page layout. Existing MovieCard/MoviePagination/MovieState/Button/Input, auth guards and Axios remain in use.
- Collections overview shows real counts, descriptions, ID-distinguished duplicate names, edit/delete actions and a compact inline SVG collection icon. Edit/Delete buttons share equal-width columns. No metadata calls or fake cover images are used for collection cards. Details reuse the existing movie grid and removable missing/unavailable placeholders.
- CollectionForm is reused for create/edit and inline create-and-save. Native dialogs contain focus, support Escape, restore the trigger, and block closing during create/edit/delete writes. Delete copy states the precise scope. The Save dialog is lazy, has bounded Previous/Next paging, per-row pending/error states and server-confirmed checkboxes. Creation and membership are separate operations: a failed second operation retains the collection and offers retry. Reopening refetches persisted state.
- All IDs remain numeric, matching M2.1. Fixed per_page=20 keys: `['library', owner, 'collections', {page, contains_tmdb_id: movieIdOrNull}]`, `['library', owner, 'collection', id]`, and `['library', owner, 'collection', id, 'movies', page]`. Private reads forward AbortSignal, staleTime=30 seconds, retry=false, no focus refetch. The modal forces a mount refetch.
- Successful CRUD invalidates all owner collection-list variants, including Save pages; edit updates/invalidates the affected detail; delete removes affected detail/movie caches. Membership writes cancel pending list reads, update confirmed flags in matching movie-annotation pages, then invalidate collection lists/counts and the affected collection detail/movies. Watchlist/Watched/discovery/media keys are untouched.
- All writes bootstrap CSRF and check the current owner before dispatch. Completion checks owner identity before cache writes or UI callbacks; auth changes retain existing cancel/clear behavior. 401/403 reuse the library access handler. Writes never retry automatically. Tests include account changes during bootstrap/completion and browser logout/login isolation.
- No dependency was added. Native checkboxes were chosen over Spring Check; the compact SVG collection icon avoids Folder Float's physics runtime. Existing feedback is reused. Decorative motion honors reduced motion. See [report](../development/m2.2-report.md) for source evaluation and actual checks.

## Implemented M2.3

- Lazy `features/ratings/components/CommunityRatingSection` sits after Cast and before related movies in Details. Public community score/count and a five-row accessible CSS histogram remain distinct from the hero's TMDB score. Empty averages display “No community ratings yet.” Cached statistics remain visible with retry feedback when refresh fails.
- Numeric-ID query keys: `['movies','ratings',tmdbId]` for guest-readable aggregates; `['me',userId,'rating',tmdbId]` for verified personal state; `['me',userId,'rating-write',tmdbId]` for pending writes. Reads use AbortSignal, 30-second staleTime, no retry/focus polling. Existing auth cancellation/clearing covers these keys. Private reads only mount after verified authentication. 401/403 clear the affected owner's private data and refresh auth.
- Mutation scope serializes a user/movie and pending state disables conflicting controls. PUT/DELETE bootstrap CSRF and check account identity before dispatch. Callbacks check identity before and after cancellation; confirmed responses set only the matching personal key and invalidate that key plus matching public statistics. No discovery, movie metadata or library/collection invalidation. Writes do not retry automatically; failure preserves confirmed state with explicit retry guidance.
- `components/react-bits/PeekRating.tsx` is an attributed adaptation of the official controlled preview/lift interaction. Native five-radio semantics, inline star SVG, restrained 3px lift/1.08 scale and CSS replace pointer capture and Hugeicons dependencies. Local preview never changes checked server state or aggregates; a new mutation revision discards old previews. Confirmation pop follows server success only. Removal is an explicit DELETE button; no zero-star clearing. Keyboard arrows use native radio behavior, labels expose values, focus is visible and reduced motion removes lift/pop/bar transitions. Guests are directed to the existing login flow, unverified users to verification. No dependency added.

## Implemented M2.4

- Lazy `features/reviews/components/CommunityReviewsSection` follows Community Ratings and precedes related movies in Details. Public reads remain independent of authentication/private failures. Guest and unverified accounts get the existing sign-in/verification paths; verified users get their own review without scanning public pages. Reviews do not require a rating.
- Numeric keys: public prefix `['movies','reviews',tmdbId]`, page `['movies','reviews',tmdbId,page,perPage]`; own `['me',userId,'review',tmdbId]`; write `['me',userId,'review-write',tmdbId]`. Page size 20, AbortSignal, 30-second staleTime, no read retry/focus polling. Public pages and own state alone are invalidated after writes; discovery, metadata, rating and library caches are untouched. Creation/deletion return to page one; editing preserves ordering/page.
- Mutations serialize per owner/movie, bootstrap CSRF, disable conflicting operations and check current account before dispatch and before/after cancellation/cache callbacks. Existing auth-change cancellation/clearing applies. No write retries/optimistic success. 401/403 remove affected private queries and refresh auth. 404/409 refetch own/public state; a POST conflict never turns into an automatic PATCH.
- ReviewEditor counts Unicode code points after edge trim, accepts 1–5000, preserves body/spoiler flag after failure and exposes field errors. Failed creation/409 keeps a separate draft; opening an existing review requires an explicit action. IDs, created/updated dates and author identity come from the server.
- ReviewCard renders escaped plain text, safe avatar URL or initials, edited/owner labels and accessible Read more for long text. Concealed spoilers have no body text in DOM/accessibility output; Reveal/Hide remains keyboard operable and per instance. Body subcomponent identity includes movie/id/updated_at/body/flag so same-second edits also conceal again. The reveal-only CSS blur never hides already-mounted spoilers.
- Shared `components/ui/Dialog` extracts the existing CollectionDialog behavior. Native modal, labelled heading, explicit Tab wrapping, pending focus containment/Escape protection and trigger/logical focus restoration serve review deletion and preserve Collections. Permanent deletion copy explains that ratings and library memberships remain unchanged. Failed deletion leaves the dialog open; a disappeared trigger falls back to the management button.
- VYBE tokens, compact cards, visible focus/status/errors, restrained editor/reveal CSS and reduced-motion overrides; no new dependency or React Bits component. Browser fixtures and real-service persistence/outage checks are recorded in the [M2.4 report](../development/m2.4-report.md).

## Later slice plan (not implemented)

Only M2.5 profile editing remains proposed. The following shared conventions include implemented movie organization, ratings and reviews; `/profile` and profile count invalidation do not exist yet.

## Pages and state

- `/library` redirects to `/library/watchlist`; `/library/watchlist`, `/library/watched`, `/library/collections`, `/library/collections/:id` use RequireAuth; the proposed `/profile` route will reuse it. Server authentication/verification/ownership still enforce every request.
- Movie Details remains public with public VYBE rating statistics and paginated reviews. Add watchlist/watched/save/rate/review controls only in their vertical slices. Guests sign in; unverified accounts use existing verification flow. Never block public metadata on a failed private-state request.
- Use library-state singleton for watchlist/watched action state; own rating/review singleton APIs for editors. Collection modal uses paginated collections with `contains_tmdb_id`, a single query per page returning all check states. Each selection tracks its own request outcome; failed changes stay visible with retry. No unbounded fetch-all or per-collection membership calls.
- Library responses already combine Core relationship fields and Catalog summaries. Render available `movie` through existing cards. Missing/unavailable metadata retains a card-sized placeholder with TMDB ID and removal action; do not fabricate title/poster or silently drop saved entries. Distinguish a Catalog outage banner from individual missing records and from a Core list-fetch error.
- Loading skeletons match grid shape. Empty lists offer a discovery link; empty collections still show edit/delete/add controls. Full errors preserve cached data with feedback and retry. Disable duplicate pending mutations, restore focus, label status/validation accessibly, respect reduced motion. No automatic retry of writes.
- TMDB rating remains labelled TMDB on a 0–10 scale. VYBE community rating is 1–5 with count and all five histogram bins; null average displays “No ratings yet”. Review writing works without rating and vice versa.
- Review bodies/descriptions/bios render as escaped plain text. Spoilers are concealed until an explicit accessible reveal action. Reset reveal state on review ID/updated_at change; spoiler hiding is not data privacy. Show edit/delete only for matching auth user IDs; server remains authoritative.
- Profile GET returns the existing auth UserResource under `data.user`. Read identity from `authKey = ['auth','me']`; on profile success update that key with `data.user`, not a second global user store. Profile query caches only page response/details; no localStorage identity or tokens. Counts come from Core.

## Future query key and invalidation proposal

Keep existing keys `['movies','popular',page]`, `['movies','search',normalizedQuery,page]`, `['movies','detail',tmdbIdString]` and popular-feed. Use numeric IDs for implemented M2 feature keys below; retain existing string movie-detail IDs. Proposed profile keys should follow these conventions; user-scoped keys prevent identity crossover. Include every query parameter in keys and forward AbortSignal to Axios. Private queries enabled only after verified auth resolves.

| Data | Key |
| --- | --- |
| Watchlist / watched page (implemented) | `['library', userIdNumber, kind, pageNumber]` (per_page fixed at 20) |
| Movie library state (implemented) | `['library', userIdNumber, 'state', tmdbIdNumber]` |
| Collections/modal page (implemented, numeric IDs) | `['library', userId, 'collections', {page, contains_tmdb_id}]`; fixed per_page=20, absent annotation=null |
| Collection detail / movies (implemented, numeric IDs) | `['library', userId, 'collection', id]` / `['library', userId, 'collection', id, 'movies', page]` |
| Own rating / review | `['me', userId, 'rating' or 'review', tmdbId]` |
| Profile | `['me', userId, 'profile']` |
| Public statistics | `['movies', 'ratings', tmdbId]` |
| Public reviews | `['movies', 'reviews', tmdbId, page, perPage]` (implemented, numeric IDs) |

| Successful mutation | Invalidate/update |
| --- | --- |
| Watchlist add/remove | All user's watchlist pages, affected library-state; profile count only when M2.5 exists |
| Watched add/remove | All user's watched pages, affected library-state; future profile count; no implicit watchlist mutation |
| Collection create/rename/delete | All collections queries (including every modal ID/page); detail/movie queries for affected collection; remove deleted detail caches |
| Collection membership | All collections queries/counts/membership flags and affected collection detail/movie pages |
| Rating PUT/delete | Own rating singleton and public rating statistics; leave TMDB detail cache alone |
| Review create/edit/delete | Own review singleton, public reviews for movie; profile review count only when M2.5 exists |
| Profile/username/avatar | Set existing authKey from returned UserResource; refresh profile and public review queries so displayed author identity updates |

Existing login/logout hooks cancel in-flight queries and remove non-auth queries; preserve this behavior for all private keys. On 401 clear private state and recheck auth; use context-specific signed-out messaging (shared auth error helper currently says “Invalid email or password”). On 403 refresh verification state and show existing verification UI; on 419 bootstrap again only for explicit resubmission. 404 private collection goes to a safe not-found view, 409 review reloads own-review state, 422 maps inline fields, 429 observes Retry-After. Do not add a blind global retry interceptor.

Start with server-confirmed mutations + invalidation. Optimistic updates require cancellation, rollback and membership-count consistency tests; defer until justified. Default no mutation retries. Server caches and TanStack Query stale-time serve different purposes.

## Slice test expectations

Follow existing Vitest API/render tests and browser test convention; verify each new API method, CSRF/error handling, query invalidation, stale request cancellation, cross-user cache isolation, all page states, accessible dialogs/rating inputs, independent rating/review operations, spoiler reveal/reset, and partial metadata placeholders. Run lint, TypeScript, build and npm test. Add browser acceptance for keyboard flow and actual interactions as each UI ships; M2.0 does not claim these exist.
