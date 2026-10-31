# Milestone 2 foundation

Status: M2 ownership and scope approved by the project owner on 2026-10-30. Detailed schema, future API and UI choices below are proposals for vertical-slice review. M2.0 authorizes only the internal Catalog batch-summary operation and Core client support; no M2 product migrations, routes or UI.

## Boundaries and sequence

Core owns users, profile information, watchlist, watched history (one current entry per movie), private collections, ratings and reviews in `vybe_core`. Catalog continues to own TMDB access, normalized metadata and ranked caches in `vybe_movies`. React calls Core only. Core stores `tmdb_id` references without Catalog foreign keys or copied metadata. No additional service, database, queue or cache infrastructure is required.

Implement M2.1 Watchlist/Watched, M2.2 Collections, M2.3 Ratings, M2.4 Reviews, M2.5 Profiles as separate database → API → tests → React → UI/test slices. M2.6 integrates and releases. Ratings and reviews are independent; neither requires the other. Watching never implicitly removes a watchlist or collection entry. Collections are private; Favorites is an ordinary user-created collection. Profile means identity/activity summary; Library means movie organization.

Use existing Core controllers, domain FormRequests, services, Eloquent models and Resources. Proposed feature namespaces under these existing directories: Library (watchlist/watched), Collections, Ratings, Reviews, Profile. Add them only in their slice; no generic repository layer or empty module scaffold. Scope all private resource queries through the authenticated owner before reading or writing. Use policies where a resource has ownership checks; avoid trusting client `user_id`.

## Library metadata composition

1. Query and paginate the owner's Core rows, default 20, maximum 50.
2. Pass the page's distinct TMDB IDs to `MovieCatalogClient::summaries()` once. Skip HTTP for an empty page.
3. Map returned summaries by `tmdb_id`, then attach them to the original Core rows in Core order. Preserve every saved row, including unresolved IDs.
4. A Catalog cache miss becomes `movie: null`, `metadata_status: "missing"`. A whole Catalog failure becomes `movie: null`, `metadata_status: "unavailable"` for each row and `meta.metadata_unavailable: true`; Core relationships remain readable. This graceful degradation is planned, not implemented by the client itself.

Batch lookup is cache-only: stale and summary-only metadata is useful and returned without promising freshness. It never hydrates missing IDs. Future bounded hydration needs a separate reviewed contract; library views must not fan out through detail requests.

Proposed writes accept canonical positive IDs (1–2147483647) without synchronous existence checks. An unresolved reference is not proof a movie does not exist. This keeps removals and personal writes usable during Catalog outages, at the cost of allowing well-formed IDs that never resolve. Review this policy before M2.1; adding existence enforcement must define outage and latency semantics explicitly.

## Security contract

- Reuse Sanctum sessions and existing email verification. All private M2 reads and writes use `auth:sanctum` + `verified`. Public rating statistics and reviews allow guests. Preserve verification status/resend/logout access for unverified accounts.
- Future private route groups follow the existing explicit `web` session/CSRF stack, exclude the duplicate conditional Sanctum wrapper as auth routes already do, and apply `PreventAuthCaching`. Do not add global verification to public routes.
- Bootstrap CSRF before writes; 419 needs explicit resubmission, no automatic write replay. 401 means lost session; 403 means verification is required. Non-owned private resources return the same 404 as absent resources.
- Use validated allowlists for mass assignment, authenticated IDs from the session, database unique constraints and transactions for duplicate/concurrent writes. Translate expected uniqueness races to documented 200/409/422 outcomes.
- Reviews/bios/descriptions are plain text. React escapes text; never use HTML injection. Spoiler hiding is a display control, not access control: public review text is present in JSON.
- Proposed limits: private writes 60/minute/user; public community reads 120/minute/IP; profile avatar uploads 5/minute/user. Use existing Laravel limiter/cache infrastructure, return 429 + Retry-After; tune during the slice. These limiters do not exist yet.
- Return sanitized errors, never DB exceptions, internal URLs, service headers or tokens. Do not put credentials in VITE variables. Catalog shared-token auth is service identity, not user authorization.
- No avatar upload implementation currently exists. The proposed local Core storage approach and remaining security choices are in the profile contract; no arbitrary remote URL fetch.

## Scope and decisions

Approved: two services, Core ownership of user-generated data, TMDB references, no cross-DB keys, independent ratings/reviews, private collections, separate Profile/Library, bounded batch integration. Proposed details: collection name collation, timestamp and duplicate semantics, limits, pagination, avatar storage and acceptance of unresolved movie references. See [ADR 0002](../decisions/0002-m2-core-data-and-batch-summaries.md).

Deferred: public profiles/collections, following/social graph, recommendations, OAuth, moderation/admin, replies, likes, reports, AI classification, email/password changes and persistent rating aggregates.

## Design and delivery references

- [Schema and ERD](../database/milestone-2-schema.md)
- [Planned public contracts](../api/milestone-2-contracts.md)
- [Batch contract](../api/catalog-batch-summaries.md)
- [Frontend plan](milestone-2-frontend.md)
- [Milestone checklist](../development/milestone-2-checklist.md)
- [Audit and verification record](../development/m2-foundation-report.md)
