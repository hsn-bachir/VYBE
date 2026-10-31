# VYBE 🎬

VYBE is a dark cinematic movie discovery application and planned social platform built by a four-person Antonine University team.

> **Current work:** M2.0 architecture/contracts and Catalog batch summaries, building on implemented Milestone 1 authentication and movie discovery. **Approved architecture:** React SPA + two independent Laravel backend services. No release or hosted-CI claim.

## Architecture

```text
frontend/                   React + Vite + TypeScript :5173
   |
   v
backend/                    Core Laravel API :8000, Sanctum SPA, public /api/v1
   |                                 |
   |                                 +--> vybe_core (users and framework tables)
   | internal HTTP token
   v
services/movie-catalog/     Movie Catalog Laravel :8001
   |                     |
   v                     v
vybe_movies              TMDB API
```

- One GitHub monorepo, `main` stable / `dev` integration / reviewed feature PRs.
- Browser only calls the Core API. Core owns login/session and browser-facing movie routes. Catalog owns all movie persistence, TMDB credentials, and caching.
- Separate MySQL databases can use the same XAMPP server. There are **no cross-service DB queries**.
- University rubric specifically rewards microservices. Two independent runtimes are approved by the team; full grading expectations remain to be clarified with the instructor.

## Scope

**Milestone 1 targets:** users schema; Sanctum registration/login/logout/me; TMDB popular/search/detail through Core → Catalog; persistent movie metadata and short-lived ranked caches; responsive VYBE layouts/tokens; tests/CI and TMDB attribution.

**M2.0:** design the later personal-library, ratings, reviews and profile slices; implement only internal Catalog batch summaries and Core client support. Those product features remain unimplemented. OAuth, social feeds, admin and recommendations remain deferred. Google/GitHub UI options are disabled with “Coming soon.”

## Current implementation status

The checked-out baseline includes Core session authentication/email verification, Catalog TMDB caching/discovery, Core movie forwarding and React popular/search/details. M2.0 adds cache-only batch summaries plus Core integration; the [foundation report](docs/development/m2-foundation-report.md) records local verification and limitations. Do not confuse the [historical repo audit](docs/development/repository-audit.md) with current source status.

## Quick start

See [Windows + XAMPP setup](docs/development/setup.md) for required PHP/Node versions, scaffold bootstrap, the two databases, `.env` configuration, Composer/npm installs and independent startup/testing commands.

| Local application | Port | Storage owner |
| --- | --- | --- |
| React SPA | 5173 | Browser-only |
| Core Laravel API | 8000 | `vybe_core` |
| Catalog Laravel service | 8001 | `vybe_movies` |

## Docs and collaboration

M2.0 foundation work is tracked in the [M2 architecture](docs/architecture/milestone-2.md), [M2 checklist](docs/development/milestone-2-checklist.md) and [audit/verification report](docs/development/m2-foundation-report.md). Future M2 features are design-only; only Catalog batch summaries and Core integration are authorized for implementation. The report distinguishes checked-out code from newer branch history and historical scaffold descriptions below.

- [System overview](docs/architecture/system-overview.md) · [Core/Catalog responsibilities](docs/architecture/backend.md) · [Microservices](docs/architecture/microservices.md)
- [API contracts](docs/api/contracts.md) · [DB schema](docs/database/schema.md) · [Frontend architecture](docs/architecture/frontend.md) · [Design system](docs/design/design-system.md)
- [Initial ADR](docs/decisions/0001-initial-architecture.md) · [Milestone checklist](docs/development/milestone-1-checklist.md) · [Team ownership](docs/development/team-plan.md)
- [Git workflow](docs/development/git-workflow.md) · [Teammate onboarding](docs/development/teammate-onboarding.md) · [Codex instructions](AGENTS.md)

## TMDB acknowledgement (required in final UI)

> This product uses the TMDB API but is not endorsed or certified by TMDB.

VYBE must also include approved TMDB logo attribution in its About/Credits page. See [TMDB requirements](https://developer.themoviedb.org/docs/faq).
