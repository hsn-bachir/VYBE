# ADR 0001 — VYBE monorepo and two-service architecture

- **Status:** Accepted by project owner for Milestone 1 (pending university grading clarification)
- **Date:** 2026-10-23
- **Supersedes:** An initial *proposed* single Laravel backend design that was never built beyond scaffolding.

## Context

The team has four developers, a Laravel/MVC requirement, and a grading rubric allocating 20 marks to designing and integrating “well-structured micro-services”. A simple controller/service split within one running Laravel backend would not convincingly demonstrate independent microservices. Milestone 1 remains limited to user authentication, TMDB movie discovery/caching and shared React UI.

## Decision

1. Keep a **single monorepo** with long-lived `main` and `dev`, feature branches, reviewed PRs and CI.
2. Keep `frontend/` as one React/Vite/TypeScript SPA. Its sole backend is `backend/` Core API.
3. Implement `backend/` as an **independently runnable Laravel Core API** that owns `vybe_core`, user accounts, Sanctum first-party session authentication and public `/api/v1` routes. It adapts movie requests by calling Catalog over HTTP, not TMDB.
4. Implement `services/movie-catalog/` as a **second independently runnable Laravel application** that owns `vybe_movies`, TMDB provider integration, normalized metadata, and ranked-result cache. Core authenticates to internal Catalog endpoints using a server-only token. Databases are logically isolated (same XAMPP server may host both locally).
5. No additional API gateway container, Redis cluster, event bus, Docker orchestration, social service, or OAuth implementation in Milestone 1 unless later required by evidence.
6. The team demonstrates separate processes/DB ownership, internal HTTP contract, service auth, independent tests and graceful Catalog outage handling.

## Alternatives considered

| Option | Decision |
| --- | --- |
| Single modular Laravel monolith | Simpler but weak evidence for the 20-mark microservices rubric; rejected as Milestone 1 target |
| Identity + Catalog + third gateway service | More overhead; current Core can act as the BFF; deferred |
| Separate repositories | Extra cross-repo coordination for four people; not necessary for independent runtimes |
| React directly calls Catalog/TMDB | Exposes boundaries/secrets and complicates session+API integration; rejected |
| Shared DB schema/tables | Tight coupling and confusing ownership; rejected |
| Full distributed auth/JWT federation | Not needed for public movie reads in Milestone 1; defer |

## Consequences and limitations

+ Clear, demonstrable service boundaries; separate migrations/CI; Catalog can be started or stopped independently; provider credentials only in Catalog.
- More startup configuration, HTTP errors and integration tests. Local XAMPP must create two databases. Service tokens protect internal routes but network restrictions/TLS are required for deployed systems.
- Two applications are a genuine decomposition, **not guaranteed** to achieve all 20 rubric marks. Instructor's required service count, integration complexity and deployment demonstration remain unverified.

## Team ownership

Core auth/BFF developer; Catalog/TMDB/cache developer; frontend shared UI/auth developer; frontend movie discovery developer. Agree on the public/internal contracts before parallel implementation; integration and testing are shared responsibilities.

See [architecture overview](../architecture/system-overview.md), [microservices](../architecture/microservices.md) and [team plan](../development/team-plan.md).
