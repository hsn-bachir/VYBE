# VYBE

**VYBE** is a cinematic movie-discovery and planned social platform built by a four-person Antonine University team. This repository contains a Laravel API and a React single-page application.

> **Active scope:** Milestone 1, targeting `v0.1.0`. No milestone release or movie/authentication features are claimed yet.

## Repository status (audited 2026-10-23)

| Classification | Meaning |
| --- | --- |
| **Implemented** | Confirmed in a named Git revision |
| **Approved** | Agreed target, potentially not yet built |
| **Proposed** | Design idea needing team/instructor approval |
| **Undecided** | Open decision |

As checked on 2026-10-23, `dev` (`23eaef16`) contains the original README only. The Laravel/React starter is on `feature/project-setup` (`7ac30f69`) in [open PR #1](https://github.com/hsn-bachir/VYBE/pull/1), which had **not** been merged at audit time. The passing scaffold CI checks do not establish that VYBE features are complete. [Read the evidence](docs/development/repository-audit.md).

### Milestone 1 (approved, not yet implemented in the audited scaffold)

- VYBE tokens, consistent shared layouts, accessible responsive pages.
- MySQL `users` and `movies` schema.
- Sanctum stateful SPA email/password registration, login, logout and `/me`.
- TMDB-backed popular, search and movie-details endpoints, normalized resources and persistent movie metadata cache.
- Backend/frontend integration tests and release `v0.1.0` through a reviewed `dev` → `main` PR.

**Deferred:** Google/GitHub OAuth, watchlists, reviews, user social features, recommendations, admin tools. Sign-in screens may show disabled "Coming soon" OAuth buttons.

## Stack

| Layer | Audited setup branch | Target use |
| --- | --- | --- |
| Backend | Laravel 13, Eloquent; PHP lock may require >=8.4.1 | Versioned JSON REST API and Sanctum SPA sessions |
| Data | Laravel example defaults to SQLite; CI service MySQL 8.0 | MySQL via XAMPP locally |
| Frontend | React 19, Vite 8, TypeScript 6, Oxlint | React Router, Axios, TanStack Query, Tailwind |
| Integrations | No TMDB API client yet | Backend-only TMDB integration |
| Delivery | GitHub Actions CI in setup PR | Reviewed feature PRs and milestone release |

Install target libraries only on the appropriate feature branch. Lockfiles, not this summary, determine exact installed versions.

## Getting started

1. Check [repository audit](docs/development/repository-audit.md) and ensure the scaffold PR has merged before branching from `dev`.
2. Follow [local setup](docs/development/setup.md), then [teammate onboarding](docs/development/teammate-onboarding.md).
3. Review [system architecture](docs/architecture/system-overview.md), [Milestone 1 checklist](docs/development/milestone-1-checklist.md) and [agent instructions](AGENTS.md).

```powershell
# Run from the repo root after the scaffold is integrated.
cd backend
composer install
php artisan serve --host=localhost --port=8000
# In another terminal:
cd frontend
npm ci
npm run dev -- --host localhost
```

These commands do not provision database credentials automatically. See [setup](docs/development/setup.md).

## Docs map

- [System overview](docs/architecture/system-overview.md) · [Backend](docs/architecture/backend.md) · [Frontend](docs/architecture/frontend.md) · [Microservices decision](docs/architecture/microservices.md)
- [Database](docs/database/schema.md) · [Proposed API contract](docs/api/contracts.md) · [Design system](docs/design/design-system.md)
- [Setup](docs/development/setup.md) · [Git workflow](docs/development/git-workflow.md) · [Onboarding](docs/development/teammate-onboarding.md) · [Milestone checklist](docs/development/milestone-1-checklist.md)
- [ADR 0001](docs/decisions/0001-initial-architecture.md)

## Contributing

Work from updated `dev` using a `feature/*`, `fix/*`, `docs/*`, or `chore/*` branch; create PRs into `dev`, seek human review, and require passing CI where supported. Ship milestones via `dev` → `main` PR. Never commit secrets or personal `.env` files.

## TMDB acknowledgement

VYBE intends to use TMDB for data and imagery. The completed app must display an **approved TMDB logo** and the following notice in its About/Credits section, with VYBE branding more prominent:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

See [TMDB attribution requirements](https://developer.themoviedb.org/docs/faq). Integration and attribution UI are pending.
