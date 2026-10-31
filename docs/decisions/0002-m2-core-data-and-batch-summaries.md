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

Proposals still requiring slice review: case/accent-insensitive collection names; server-first watched timestamps; accepting unresolved valid IDs; pagination/limits/throttles; Core-local avatar upload storage. See [architecture](../architecture/milestone-2.md), [schema](../database/milestone-2-schema.md) and [public contracts](../api/milestone-2-contracts.md). No later feature implementation is authorized by this ADR.
