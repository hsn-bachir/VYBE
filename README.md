# VYBE 🎬

VYBE is a dark cinematic movie discovery application and planned social platform built by a four-person Antonine University team.

> **Current work:** M2.5 User Profiles and Managed Avatars, building on implemented M1/M2.0–M2.4. **Approved architecture:** React SPA + two independent Laravel backend services. Local verification is recorded per milestone; no release or hosted-CI claim.

## Architecture

```text
frontend/                   React + Vite + TypeScript :5173
   |
   v
backend/                    Core Laravel API :8000, Sanctum SPA, public /api/v1
   |                                 |
   |                                 +--> vybe_core (users, watchlist, watched, collections, ratings, reviews, framework tables)
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

**M2.1–M2.5 implemented:** independent Watchlist/Watched, protected Library, private custom collections with multi-collection saving, Catalog-confirmed references, outage-safe batch metadata, cinematic Details and on-demand trailers/cast/provider-related movies, plus independent 1–5 star VYBE ratings and public community statistics, and independent plain-text community reviews with owner management and explicit spoiler reveal, plus private profiles, editable username/bio, managed avatars and real activity counts. OAuth, social feeds, administration and personalized recommendation engines remain deferred. Google/GitHub options remain disabled with “Coming soon.”

## Current implementation status

The checked-out implementation includes Core session authentication/email verification, Catalog TMDB caching/discovery, Core movie forwarding, M2.0 batch summaries, M2.1 library/details, M2.2 collections, M2.3 community ratings, M2.4 reviews and M2.5 profiles. The [M2.5 engineering report](docs/development/m2.5-report.md) records actual tests, browser checks, migration/configuration steps and limitations. The [M2.4 report](docs/development/m2.4-report.md), [M2.3 report](docs/development/m2.3-report.md), [M2.2 report](docs/development/m2.2-report.md), [M2.1 report](docs/development/m2.1-report.md), [foundation report](docs/development/m2-foundation-report.md) and [repository audit](docs/development/repository-audit.md) record earlier checkpoints.

## Quick start

See [Windows + XAMPP setup](docs/development/setup.md) for required PHP/Node versions, scaffold bootstrap, the two databases, `.env` configuration, Composer/npm installs and independent startup/testing commands.

| Local application | Port | Storage owner |
| --- | --- | --- |
| React SPA | 5173 | Browser-only |
| Core Laravel API | 8000 | `vybe_core` |
| Catalog Laravel service | 8001 | `vybe_movies` |

## Docs and collaboration

M2 work is tracked in the [architecture](docs/architecture/milestone-2.md), [checklist](docs/development/milestone-2-checklist.md) and [M2.5 report](docs/development/m2.5-report.md). M2.6 release acceptance remains pending. Library/Collections/Ratings/Reviews/Profiles and [movie experience contracts](docs/api/movie-experience.md) document the current implementation. Deploy M2.5 with its additive Core bio migration and configured GD/EXIF plus persistent avatar storage; Catalog needs no change. See setup for earlier migrations when upgrading from an older baseline.

- [System overview](docs/architecture/system-overview.md) · [Core/Catalog responsibilities](docs/architecture/backend.md) · [Microservices](docs/architecture/microservices.md)
- [API contracts](docs/api/contracts.md) · [DB schema](docs/database/schema.md) · [Frontend architecture](docs/architecture/frontend.md) · [Design system](docs/design/design-system.md)
- [Initial ADR](docs/decisions/0001-initial-architecture.md) · [Milestone checklist](docs/development/milestone-1-checklist.md) · [Team ownership](docs/development/team-plan.md)
- [Git workflow](docs/development/git-workflow.md) · [Teammate onboarding](docs/development/teammate-onboarding.md) · [Codex instructions](AGENTS.md)

## TMDB acknowledgement (required in final UI)

> This product uses the TMDB API but is not endorsed or certified by TMDB.

VYBE must also include approved TMDB logo attribution in its About/Credits page. See [TMDB requirements](https://developer.themoviedb.org/docs/faq).
