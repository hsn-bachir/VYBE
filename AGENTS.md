# VYBE — Agent instructions

Applies to the whole repository. Read `backend/AGENTS.md` or `frontend/AGENTS.md` when working in that tree. Read the relevant docs before changing behavior.

## Source of truth and scope

- Current implementation is defined by **the checked-out branch and source code**, not by this document or previous chat summaries.
- `docs/architecture/system-overview.md` is long-range context; future proposals are **not** authorization to implement them.
- **Active: Milestone 1 only.** Allowed: project foundation, VYBE shared UI, users/movies schema, Sanctum email/password SPA auth, TMDB popular/search/details, persistent caching, tests and docs.
- **Out of scope:** OAuth implementation, social accounts, reviews, watchlists, followers, social feeds, recommendations, admin dashboards, payments. OAuth buttons may be disabled/"Coming soon".
- Mark findings as **implemented / approved / proposed / undecided**. Do not describe unmerged branch code as released or integrated.

## Work protocol

1. Confirm the working branch and inspect existing code before proposing edits.
2. Check architecture, DB, API and design contracts relevant to the request.
3. Plan small, reviewable changes; preserve working behavior and current conventions.
4. Prefer framework defaults and straightforward code. Avoid speculative abstractions and dependencies.
5. For changes affecting contracts, data, security or architecture, update corresponding docs and tests in the same PR.
6. Never invent test results, live DB state, TMDB responses or frontend data.
7. Do not switch branches, commit, push, merge, amend history, or install broad tooling without explicit authorization.
8. Do not inspect, copy, print or commit secret files. Keep credentials out of browser bundles, errors and logs.

## Runtime architecture

React/TypeScript SPA → Laravel `/api/v1` → application services → Eloquent/MySQL or TMDB client. Backend owns TMDB secrets. Typical request flow: route → controller → FormRequest (when there is request payload/validation) → service → model/external client → API Resource. Do not add layers solely for appearance.

- Backend: documented in [backend architecture](docs/architecture/backend.md).
- Frontend: [frontend architecture](docs/architecture/frontend.md), shared layout/tokens and feature modules.
- API: [contracts](docs/api/contracts.md). DB: [schema](docs/database/schema.md).
- Security: cookie/session Sanctum for same-site SPA; no bearer/session token persisted in localStorage; CSRF and credentialed CORS required.
- TMDB: metadata keyed on `tmdb_id`; separate shorter-lived ranking cache; avoid marking incomplete list summaries as fully hydrated details.
- University microservices requirement needs clarification; a modular Laravel application is **not** independently deployed microservices.

## Quality and safety

- Run focused tests first and then appropriate broader checks; report actual commands/outcomes.
- Backend: `php artisan test`, plus dedicated disposable-MySQL migration tests when applicable. NEVER run `migrate:fresh`, `db:wipe` or destructive SQL against non-disposable data.
- Frontend: `npm run lint`, `npx tsc -b --noEmit`, `npm run build`; add interaction tests when introduced.
- Avoid disabling authorization, CSRF, request validation or rate limiting to make tests pass.
- No placeholder UI data in delivered functionality; display honest loading/error/empty states.
- Use `main` stable, `dev` integration and task branches. PRs target `dev`, releases `main`.

## Completion report

State what changed, files touched, tests run with outcomes, remaining limitations/assumptions, required migrations/environment steps and whether docs/contracts need approval. If unable to test, say so.
