# Milestone 2 foundation

Status: M2 ownership and scope approved by the project owner on 2026-10-30. M2.0 delivered the batch-summary boundary. M2.1–M2.5 are implemented locally; see the [M2.1 report](../development/m2.1-report.md), [M2.2 report](../development/m2.2-report.md) [M2.3 report](../development/m2.3-report.md) [M2.4 report](../development/m2.4-report.md) and [M2.5 report](../development/m2.5-report.md). M2.6 release acceptance remains pending.

## Boundaries and sequence

Core owns users, profile information, watchlist, watched history (one current entry per movie), private collections, ratings and reviews in `vybe_core`. Catalog continues to own TMDB access, normalized metadata and ranked caches in `vybe_movies`. React calls Core only. Core stores `tmdb_id` references without Catalog foreign keys or copied metadata. No additional service, database, queue or cache infrastructure is required.

Implement M2.1 Watchlist/Watched, M2.2 Collections, M2.3 Ratings, M2.4 Reviews, M2.5 Profiles as separate database → API → tests → React → UI/test slices. M2.6 integrates and releases. Ratings and reviews are independent; neither requires the other. Watching never implicitly removes a watchlist or collection entry. Collections are private; Favorites is an ordinary user-created collection. Profile means identity/activity summary; Library means movie organization.

Use existing Core controllers, domain FormRequests, services, Eloquent models and Resources. Proposed feature namespaces under these existing directories: Library (watchlist/watched), Collections, Ratings, Reviews, Profile. Add them only in their slice; no generic repository layer or empty module scaffold. Scope all private resource queries through the authenticated owner before reading or writing. Use policies where a resource has ownership checks; avoid trusting client `user_id`.

## Library metadata composition

1. Query and paginate the owner's Core rows, default 20, maximum 50.
2. Pass the page's distinct TMDB IDs to `MovieCatalogClient::summaries()` once. Skip HTTP for an empty page.
3. Map returned summaries by `tmdb_id`, then attach them to the original Core rows in Core order. Preserve every saved row, including unresolved IDs.
4. A Catalog cache miss becomes `movie: null`, `metadata_status: "missing"`. A whole Catalog failure becomes `movie: null`, `metadata_status: "unavailable"` for each row and `meta.metadata_unavailable: true`; Core relationships remain readable. This graceful degradation is implemented by shared Core LibraryMetadata, consumed by LibraryService and CollectionService, outside the transport client.

Batch lookup is cache-only: stale and summary-only metadata is useful and returned without promising freshness. It never hydrates missing IDs. Future bounded hydration needs a separate reviewed contract; library views must not fan out through detail requests.

M2.1 new additions confirm persisted movie identity via one batch request. Syntax-invalid or unresolved references return 422 (a cache miss is not a TMDB 404); unavailable Catalog returns 503. Popular/search/detail/related results are persisted before display. Opening details can hydrate a valid uncached ID; additions do not trigger provider hydration. Existing memberships return unchanged 200 without Catalog. Removal and library-state are Core-only. The summary-only request timeout is 3 seconds, bounded to 1–5; discovery retains 12 seconds.

## Security contract

- Reuse Sanctum sessions and existing email verification. All private M2 reads and writes use `auth:sanctum` + verified-email enforcement (`EnsureVerifiedAccount` for M2.1 JSON responses). Public rating statistics and reviews allow guests. Preserve verification status/resend/logout access for unverified accounts.
- Implemented library route groups follow the existing explicit `web` session/CSRF stack, exclude the duplicate conditional Sanctum wrapper as auth routes already do, and apply `PreventAuthCaching`. Do not add global verification to public routes.
- Bootstrap CSRF before writes; 419 needs explicit resubmission, no automatic write replay. 401 means lost session; 403 means verification is required. Non-owned private resources return the same 404 as absent resources.
- Use validated allowlists for mass assignment, authenticated IDs from the session, database unique constraints and transactions for duplicate/concurrent writes. Translate expected uniqueness races to documented 200/409/422 outcomes.
- Reviews/bios/descriptions are plain text. React escapes text; never use HTML injection. Spoiler hiding is a display control, not access control: public review text is present in JSON.
- Implemented limits: shared private writes 60/minute/user, private reads 120/minute/user, and M2.3/M2.4 public community reads 120/minute/IP. Existing Laravel limiter/cache infrastructure returns 429 + Retry-After. M2.5 avatar uploads additionally use 5/minute/user.
- Return sanitized errors, never DB exceptions, internal URLs, service headers or tokens. Do not put credentials in VITE variables. Catalog shared-token auth is service identity, not user authorization.
- M2.5 avatars use Core local storage and a constrained public image route, with MIME/dimension/size validation, GD re-encoding, owner-scoped cleanup and fixed APP_URL origin. No arbitrary remote URL fetch.

## Scope and decisions

M2.4 adds independent Core reviews with one owner/movie row, public bounded pagination and a safe author projection. New review creation reuses LibraryMetadata confirmation outside a transaction; duplicate detection runs first and database uniqueness translates races to 409 REVIEW_EXISTS. Updates/deletes scope by authenticated owner, movie and review ID with local row locks. Public and own reads, existing edits/deletes and duplicate conflicts work without Catalog. No Catalog or rating/library mutation is involved. List ordering remains created_at DESC/id DESC after edits, with eager public authors rather than N+1 queries.

The lazy Details community section uses escaped plain text, local drafts and server-confirmed writes. A creation conflict preserves the draft and offers explicit existing-review editing. Spoilers are excluded from DOM/accessibility output until reveal; content/version changes reset per-instance reveal state. Shared native Dialog now serves Collections and review deletion with explicit keyboard wrapping, pending containment and focus restoration. No new runtime dependency or moderation/social feature.

M2.3 adds independent movie_ratings in Core. RatingService uses shared LibraryMetadata confirmation only for a missing personal rating, atomic upsert under the owner/movie unique key and Core-only reads/deletes. Public statistics are one grouped query with zero-filled buckets; no Catalog call, persistent counter or cache. Private routes reuse the existing protected stack/read/write limits; public statistics use a 120/min/IP limiter. React keeps the TMDB 0–10 score separate from the VYBE 1–5 community score. The lazy community section adapts Peek Rating with confirmed server state, accessible native radios and existing account-isolated query/cache behavior. No Catalog or service topology change.

M2.2 implements private collection CRUD and independent multi-collection memberships. CollectionService resolves every object through `User::collections()`. Counts and optional membership flags use SQL projections; movie pages reuse the existing batch client. New additions confirm metadata outside a short transaction, then lock/re-resolve the parent before insertion to handle deletion races safely. No Catalog schema, endpoint, client policy or service topology changed. Favorites remains an ordinary name; exact duplicate names and case variants are allowed.

Approved: two services, Core ownership of user-generated data, TMDB references, no cross-DB keys, independent ratings/reviews, private collections, separate Profile/Library, bounded batch integration. M2.1 decisions: first-mark timestamps, duplicate 200 without timestamp changes, bounded pagination and Catalog confirmation of new references. M2.2 names preserve capitalization and permit duplicates, using IDs as identity. M2.5 resolves avatar storage through the existing public disk and an explicit Core image-serving route; production persistence/hosting remain deployment responsibilities. See [ADR 0002](../decisions/0002-m2-core-data-and-batch-summaries.md).

Deferred: public profiles/collections, following/social graph, personalized recommendation engines, OAuth, moderation/admin, replies, likes, reports, AI classification, email/password changes and persistent rating aggregates.

## Design and delivery references

- [Schema and ERD](../database/milestone-2-schema.md)
- [Planned public contracts](../api/milestone-2-contracts.md)
- [Batch contract](../api/catalog-batch-summaries.md)
- [Frontend plan](milestone-2-frontend.md)
- [Milestone checklist](../development/milestone-2-checklist.md)
- [Audit and verification record](../development/m2-foundation-report.md)

## Implemented M2.5 profiles

ProfileService reuses Core users and existing activity relationships; ProfileResource wraps the existing auth UserResource. Only nullable bio is added. Username validation is shared with registration, uniqueness stays database-authoritative, and all changes retain the session. Counts use one aggregate projection rather than relationship downloads. AvatarService bounds/decode/re-encodes raster uploads outside the user-row transaction, then swaps the reference under lock and cleans only exact managed paths. No Catalog dependency, cross-service data, storage service or counting infrastructure is added. React has a lazy private /profile page, shared Avatar fallback, existing authKey synchronization, targeted author refresh and activity invalidation. See the M2.5 report for tests and storage deployment limits.
