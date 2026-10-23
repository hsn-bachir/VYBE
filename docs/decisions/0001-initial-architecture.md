# ADR 0001 — Initial VYBE architecture

- **Status:** Proposed pending team/instructor acceptance
- **Date:** 2026-10-23
- **Scope:** Milestone 1 only; document proposed evolution without constructing it

## Context

Four university developers must build movie discovery with Laravel/MVC and a stated microservices requirement. Milestone 1 is restricted to shared project foundations, local MySQL, basic email/password SPA auth and TMDB popular/search/details with persistent cache. The team needs incremental delivery, GitHub PRs and an architecture Codex can follow. Exact microservices grading/deployment conditions are still unknown.

## Proposed decision

1. **One GitHub monorepo** with `backend/` Laravel JSON REST API, `frontend/` React/Vite/TypeScript SPA, `docs/` for source-of-truth decisions; `main` stable and `dev` integration.
2. **One Laravel backend runtime initially** (modular monolith), structured by native MVC HTTP boundaries and thin controller/services/API Resources; database and TMDB credentials never accessible from the browser.
3. **MySQL persistence** for users and persistent TMDB movie metadata, with independent shorter-lived provider ranking caches; external movie key is `tmdb_id`.
4. **Sanctum session-cookie SPA auth** rather than localStorage tokens; future OAuth/social services are documented only.
5. **Feature-based frontend** with shared layouts/design tokens, Axios, TanStack Query and React Router. Accessible responsive loading/errors are core behavior.
6. **Open questions** are recorded explicitly; a service split requires a later ADR and instructor confirmation, not silent reinterpretation of modular code as microservices.

## Alternatives considered

| Alternative | Why not chosen now |
| --- | --- |
| Separate frontend/backend repositories | More coordination and shared-version friction for four people; no deployment need demonstrated |
| Laravel + Inertia rendering React | Conflicts with approved independent React SPA + REST API boundary |
| JWT/localStorage authentication | Unnecessary first-party token exposure and token lifecycle complexity for same-site SPA |
| TMDB requests directly from frontend | Exposes provider credentials and blocks server-owned persistence/caching |
| Full microservice decomposition immediately | Deployment, auth federation, networking, tests and data consistency complexity without verified rubric details |
| Cache only in memory and no movie persistence | Doesn't meet the approved persistent cache requirement |

## Consequences

Positive: easier local development with XAMPP, one API contract, simpler CI and owner boundaries, provider secrets remain server-side, work can proceed incrementally. Negative: single backend deployment boundary; a future service extraction will require data ownership migration and service-auth design. Cookie-based auth requires compatible origins/top-level-domain plan. A cache introduces freshness, concurrency, provider outage and summary/detail hydration semantics to test.

## Follow-up decision gates

- Instructor confirms microservice minimum and milestone timing.
- Team approves the proposed public/private endpoint and error envelope shapes.
- Team confirms MySQL vs MariaDB local target and runtime PHP compatibility.
- Production hosting/domain strategy is decided before a deployed cookie-auth demo.
- ADR status changes to Accepted only upon actual team approval.

## References

[Overview](../architecture/system-overview.md) · [Microservices](../architecture/microservices.md) · [API](../api/contracts.md) · [Database](../database/schema.md)
