# VYBE 🎬

VYBE is a dark cinematic movie discovery application and planned social platform built by a four-person Antonine University team.

> **Current milestone:** Milestone 1 → `v0.1.0` (in development; no release claim). **Approved architecture:** React SPA + two independent Laravel backend services. The foundation starter does **not** claim authentication or TMDB pages are implemented.

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

**Deferred:** OAuth implementation, reviews, watchlists, social feeds, admin, recommendations and other future capabilities. Google/GitHub UI options may be disabled with “Coming soon.”

## Current implementation status

Initial Laravel/React scaffold and GitHub Actions have been merged into `dev` through [setup PR #1](https://github.com/hsn-bachir/VYBE/pull/1). The **microservice foundation archive** adds a Catalog scaffold/template, internal token guard and separate CI job **only after applied and merged**. Auth/movie business endpoints and frontend features remain to be built on follow-up branches. Do not confuse [historical repo audit](docs/development/repository-audit.md) with live implementation status.

## Quick start

See [Windows + XAMPP setup](docs/development/setup.md) for required PHP/Node versions, scaffold bootstrap, the two databases, `.env` configuration, Composer/npm installs and independent startup/testing commands.

| Local application | Port | Storage owner |
| --- | --- | --- |
| React SPA | 5173 | Browser-only |
| Core Laravel API | 8000 | `vybe_core` |
| Catalog Laravel service | 8001 | `vybe_movies` |

## Docs and collaboration

- [System overview](docs/architecture/system-overview.md) · [Core/Catalog responsibilities](docs/architecture/backend.md) · [Microservices](docs/architecture/microservices.md)
- [API contracts](docs/api/contracts.md) · [DB schema](docs/database/schema.md) · [Frontend architecture](docs/architecture/frontend.md) · [Design system](docs/design/design-system.md)
- [Initial ADR](docs/decisions/0001-initial-architecture.md) · [Milestone checklist](docs/development/milestone-1-checklist.md) · [Team ownership](docs/development/team-plan.md)
- [Git workflow](docs/development/git-workflow.md) · [Teammate onboarding](docs/development/teammate-onboarding.md) · [Codex instructions](AGENTS.md)

## TMDB acknowledgement (required in final UI)

> This product uses the TMDB API but is not endorsed or certified by TMDB.

VYBE must also include approved TMDB logo attribution in its About/Credits page. See [TMDB requirements](https://developer.themoviedb.org/docs/faq).
