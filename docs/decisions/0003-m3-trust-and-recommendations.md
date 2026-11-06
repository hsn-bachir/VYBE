# ADR 0003 — M3 trust and personalized discovery

**Status:** Proposed architecture, 2026-11-03; implementation and review pending.

## Context

Core owns identity and user-generated activity. Catalog owns TMDB and metadata; current summaries omit genres and current credits are bounded, cached experience data. A four-person team needs review moderation and understandable recommendations without new service topology or speculative ML infrastructure.

## Decision

Use a three-value user role and a single account-state field, enforced by Core policies and middleware; provision admin via trusted server operation. Record bounded admin and moderation decisions in one append-only Core table. Report only reviews initially through an allowlisted target kind, preserve report metadata after content deletion, and add separate review visibility and moderator spoiler state. Keep reviews immediately published until a moderator acts.

Rank in Core with deterministic, bounded weighted library/rating signals. Catalog owns a single additive internal candidate endpoint and its provider/cache logic, returning genre IDs and optional cached contributor IDs. Missing features reduce matching coverage; they never justify fabricated explanations. Use revision-scoped private cache, bounded calls and explicitly labelled popular fallback.

## Alternatives and consequences

- A permissions framework, new moderation service, event sourcing or AI classification adds deployment and policy complexity without the current scope. A simple enum/policy model requires careful server-side tests and a future migration if permissions become granular.
- A database FK to reviews would simplify referential integrity but cannot accommodate future target kinds and would either cascade away reports or prevent review deletion. Logical IDs require transactionally validated allowlists, tombstone behavior and explicit retention.
- Fetching full details/credits for every candidate improves coverage but creates N+1 provider calls and latency. Cache-only contributor matching and genre-based fallback are bounded but may have sparse creative matches; measure actual coverage in M3.3.
- Hard deletion removes M2 data and cannot recall already cached public avatars. Retention policy and operational mail/session settings must be approved and tested before release.

M3.1 owns roles/state/admin/audit, M3.2 reports/review moderation, M3.3 the Catalog extension and Core/React recommendation slice. M2.6 acceptance remains separately outstanding.
