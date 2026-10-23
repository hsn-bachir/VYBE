# Milestone 1 readiness, implementation and release checklist

**Status as of 2026-10-23:** Scaffold verified on `feature/project-setup`; PR #1 is open, not yet merged into `dev` per GitHub. Feature sections below are **not complete**. Update checkboxes only with code revision/test evidence.

## Foundation

- [x] Repository created with `main`, `dev`, `feature/project-setup`.
- [x] Laravel/React starter present on `feature/project-setup` (not integrated at audit).
- [x] Setup PR CI passing for its latest audited head.
- [ ] Setup PR #1 reviewed and merged into `dev`; verify branch commit/tree afterwards.
- [ ] Collaborators invited and accepted — requires manual GitHub confirmation.
- [ ] Branch policies actually enforced or documented manual procedure.
- [ ] Documentation foundation reviewed and merged into `dev`.
- [ ] University microservices milestone expectations resolved and ADR updated.

## Development and design

- [ ] Install approved frontend packages and centralize design tokens.
- [ ] Add AppLayout/AuthLayout and consistent responsive navigation.
- [ ] Create accessible buttons, inputs, cards, skeletons, empty/error/toasts.
- [ ] Approve final logo/icon treatment separately.

## Database and authentication

- [ ] `users` migration satisfies [schema](../database/schema.md), with nullable hashed password, name 100, avatar URL.
- [ ] `movies` migration includes unique `tmdb_id`, metadata fields and timestamps.
- [ ] Verify migration/test behavior against isolated MySQL, not only SQLite.
- [ ] Install/configure Sanctum SPA and stateful cookie/CSRF/CORS flow.
- [ ] Implement + test registration, login, logout and `/auth/me` contracts.
- [ ] Implement frontend forms, session bootstrap/auth guard, 401/419 handling.
- [ ] Display disabled future Google/GitHub options honestly.

## TMDB movie features

- [ ] Store TMDB credentials in backend config only; verify TMDB attribution requirements.
- [ ] Implement robust provider client with HTTP fakes for tests.
- [ ] Implement normalized movie Resources and DTO/API contracts.
- [ ] Persistent unique `tmdb_id` upserts, detail hydration and 7-day configurable TTL.
- [ ] Separate 15-minute configurable popular/search ranked-list caches.
- [ ] Define/test stale detail fallback, upstream failures, pagination and search validation.
- [ ] Build popular/home, discover/search, detail and 404 pages with real Laravel API data.
- [ ] Add responsive/loading/empty/error/retry states and official TMDB credits.

## Quality and release

- [ ] Backend feature tests and MySQL migration tests pass on CI.
- [ ] Frontend lint/typecheck/build pass; add interaction tests for actual UI when tool chosen.
- [ ] Security checks: no secrets, no localStorage tokens, session regeneration, CSRF, rate limits.
- [ ] Docs and API examples match implementation, no promised-but-missing features.
- [ ] Teammate demonstration smoke-test from clean clone.
- [ ] Reviewed `dev` → `main` PR, green CI, tag `v0.1.0`.

## Out of scope / not a hidden requirement

OAuth implementation, watchlists, reviews, activity feeds, social graph, recommendation engine, admin tools, production microservice orchestration unless explicitly demanded by instructor. Any scope change requires team decision and document update.
