# ADR 0002 — M2 Core data and Catalog batch summaries

- Date: 2026-10-30
- Status: ownership/scope accepted by project owner; physical schema and future public contracts proposed for slice review.
- Extends [ADR 0001](0001-initial-architecture.md); does not change the two-service topology or claim instructor approval.

## Decision

Keep watchlist, watched movies, private custom collections, independent ratings and reviews, and personal profiles in Core. Reference Catalog movies by TMDB ID without cross-database FKs or shared models. Keep Profile (identity/activity summary) separate from Library (organization). Favorites is a regular collection, not a new entity. Ratings and reviews never require each other.

Add one token-protected, cache-only Catalog batch-summary operation for up to 50 input IDs, reused through the existing Core HTTP adapter. Preserve first-occurrence order and explicitly report missing IDs. Reuse summary DTOs. Return stored summaries regardless of detail freshness; do not trigger provider fan-out. No temporary public batch route.

## Rationale and consequences

Core user ownership supports local transactions and cascades. HTTP batches keep metadata ownership in Catalog and bound service calls to one per library page. Missing metadata is an expected state, not permission to erase personal rows. Cache-only lookup cannot establish that a movie exists at TMDB or guarantee current metadata. A future hydration policy needs separate latency/error decisions.

Rejected for M2: separate user-content services, copied movie metadata, cross-DB joins/FKs, one detail request per library movie, generic Saved/Favorites tables, public collection/profile features, coupled review/rating rows, persistent aggregate infrastructure.

Historical M2.0 proposals included collection-name uniqueness and unresolved-reference writes; the M2.1 follow-up below supersedes these. Core-local avatar upload storage still requires its slice review. See [architecture](../architecture/milestone-2.md), [schema](../database/milestone-2-schema.md) and [public contracts](../api/milestone-2-contracts.md). No later feature implementation is authorized by this ADR.

## M2.1 follow-up (2026-10-31)

The original proposal review is resolved for this slice: new watchlist/watched additions require Catalog persistence confirmation; unresolved references return 422, outages 503, while duplicates/removal/state remain Core-only. Watched timestamps preserve first mark. For future M2.2, names preserve capitalization and may repeat even exactly; IDs define collection identity. This supersedes the earlier name-uniqueness proposal. See the [M2.1 report](../development/m2.1-report.md).

## M2.2 follow-up (2026-11-01)

Private collections and memberships are implemented with the approved duplicate-name policy. Both tables remain Core-owned, with cascades only through Core users/collections. The existing reference/batch logic is extracted into shared LibraryMetadata and reused by CollectionService. Parent-row locking after Catalog confirmation handles concurrent deletion without holding a database transaction across HTTP. No Catalog or architectural topology changes are required. See the [M2.2 report](../development/m2.2-report.md).
