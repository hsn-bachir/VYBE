# M2 frontend integration — planned only

M2.0 changes no React code. Build future features under `src/features/<feature>/api`, `hooks`, `types`, `components`, `pages`, with tests beside their feature; create directories only as needed. Reuse `src/lib/api/client.ts`, `useAuth`, `RequireAuth`, `AppLayout`, semantic design tokens, shared Button/Input, `MovieCard`, `MovieGrid`, `MovieImage` and `MovieState`. Existing movie DTOs and public detail query remain unchanged.

## Pages and state

- `/library` redirects to `/library/watchlist`; `/library/watchlist`, `/library/watched`, `/library/collections`, `/library/collections/:id` and `/profile` use RequireAuth. Server authentication/verification/ownership still enforce every request.
- Movie Details remains public with public VYBE rating statistics and paginated reviews. Add watchlist/watched/save/rate/review controls only in their vertical slices. Guests sign in; unverified accounts use existing verification flow. Never block public metadata on a failed private-state request.
- Use library-state singleton for watchlist/watched action state; own rating/review singleton APIs for editors. Collection modal uses paginated collections with `contains_tmdb_id`, a single query per page returning all check states. Each selection tracks its own request outcome; failed changes stay visible with retry. No unbounded fetch-all or per-collection membership calls.
- Library responses already combine Core relationship fields and Catalog summaries. Render available `movie` through existing cards. Missing/unavailable metadata retains a card-sized placeholder with TMDB ID and removal action; do not fabricate title/poster or silently drop saved entries. Distinguish a Catalog outage banner from individual missing records and from a Core list-fetch error.
- Loading skeletons match grid shape. Empty lists offer a discovery link; empty collections still show edit/delete/add controls. Full errors preserve cached data with feedback and retry. Disable duplicate pending mutations, restore focus, label status/validation accessibly, respect reduced motion. No automatic retry of writes.
- TMDB rating remains labelled TMDB on a 0–10 scale. VYBE community rating is 1–5 with count and all five histogram bins; null average displays “No ratings yet”. Review writing works without rating and vice versa.
- Review bodies/descriptions/bios render as escaped plain text. Spoilers are concealed until an explicit accessible reveal action. Reset reveal state on review ID/updated_at change; spoiler hiding is not data privacy. Show edit/delete only for matching auth user IDs; server remains authoritative.
- Profile GET returns the existing auth UserResource under `data.user`. Read identity from `authKey = ['auth','me']`; on profile success update that key with `data.user`, not a second global user store. Profile query caches only page response/details; no localStorage identity or tokens. Counts come from Core.

## Query key and invalidation proposal

Keep existing keys `['movies','popular',page]`, `['movies','search',normalizedQuery,page]`, `['movies','detail',tmdbIdString]` and popular-feed. Standardize new keys below (IDs represented consistently as strings); user-scoped keys prevent identity crossover. Include every query parameter in keys and forward AbortSignal to Axios. Private queries enabled only after verified auth resolves.

| Data | Key |
| --- | --- |
| Watchlist / watched page | `['me', userId, 'watchlist' or 'watched', {page, per_page}]` |
| Movie library state | `['me', userId, 'library-state', tmdbId]` |
| Collections/modal page | `['me', userId, 'collections', {page, per_page, contains_tmdb_id}]` |
| Collection detail / movies | `['me', userId, 'collection', id]` / `['me', userId, 'collection', id, 'movies', {page, per_page}]` |
| Own rating / review | `['me', userId, 'rating' or 'review', tmdbId]` |
| Profile | `['me', userId, 'profile']` |
| Public statistics | `['movies', 'ratings', tmdbId]` |
| Public reviews | `['movies', 'reviews', tmdbId, {page, per_page}]` |

| Successful mutation | Invalidate/update |
| --- | --- |
| Watchlist add/remove | All user's watchlist pages, affected library-state, profile count |
| Watched add/remove | All user's watched pages, affected library-state, profile count; no implicit watchlist mutation |
| Collection create/rename/delete | All collections queries (including every modal ID/page); detail/movie queries for affected collection; remove deleted detail caches |
| Collection membership | All collections queries/counts/membership flags and affected collection detail/movie pages |
| Rating PUT/delete | Own rating singleton and public rating statistics; leave TMDB detail cache alone |
| Review create/edit/delete | Own review singleton, public reviews for movie, profile review count |
| Profile/username/avatar | Set existing authKey from returned UserResource; refresh profile and public review queries so displayed author identity updates |

Existing login/logout hooks cancel in-flight queries and remove non-auth queries; preserve this behavior for all private keys. On 401 clear private state and recheck auth; use context-specific signed-out messaging (shared auth error helper currently says “Invalid email or password”). On 403 refresh verification state and show existing verification UI; on 419 bootstrap again only for explicit resubmission. 404 private collection goes to a safe not-found view, 409 review reloads own-review state, 422 maps inline fields, 429 observes Retry-After. Do not add a blind global retry interceptor.

Start with server-confirmed mutations + invalidation. Optimistic updates require cancellation, rollback and membership-count consistency tests; defer until justified. Default no mutation retries. Server caches and TanStack Query stale-time serve different purposes.

## Slice test expectations

Follow existing Vitest API/render tests and browser test convention; verify each new API method, CSRF/error handling, query invalidation, stale request cancellation, cross-user cache isolation, all page states, accessible dialogs/rating inputs, independent rating/review operations, spoiler reveal/reset, and partial metadata placeholders. Run lint, TypeScript, build and npm test. Add browser acceptance for keyboard flow and actual interactions as each UI ships; M2.0 does not claim these exist.
