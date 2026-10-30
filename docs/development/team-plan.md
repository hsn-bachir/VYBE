# Milestone 1 — four-developer delivery plan

**Status:** Proposed individual assignments; the service architecture and scope are approved. Replace role labels with real names only after the team agrees.

| Owner | Area | Branch suggestion | Main deliverables | Review dependency |
| --- | --- | --- | --- | --- |
| Developer A | Core API | `feature/core-auth-bff` | `vybe_core` schema, Sanctum cookie auth, browser-facing API, Catalog HTTP client, errors/tests | Catalog internal contract |
| Developer B | Catalog API | `feature/catalog-tmdb-cache` | Independent Laravel, `vybe_movies`, token guard, TMDB client, normalized persistence/caches, tests | Core public/internal contract |
| Developer C | React shell/auth | `feature/ui-auth-foundation` | Tokens, shared layouts/UI kit, accessible auth pages, Sanctum state hooks | Core auth DTO/CSRF flow |
| Developer D | React movies | `feature/ui-movie-discovery` | Movie cards, popular/search/details, real API hooks/states, Credits attribution | Core movie DTO contract |

## Merge sequence

1. **Foundation first:** docs, Catalog Laravel bootstrap, isolated MySQL CI. Human review and green jobs.
2. **Contract lock:** agree public Core vs internal Catalog paths, response envelopes, status codes, error handling and movie DTO fields. Contract changes use same PR as code.
3. **Parallel tracks:** Core auth + frontend auth, Catalog provider/cache + movie UI components can proceed simultaneously. Frontend uses types and mocked **tests only**, no fake production grids.
4. **Integrate small slices:** first Core auth with UI; then Catalog health through Core (controlled error); then popular; then search; then details/stale fallback. Each PR targets `dev`.
5. **System acceptance:** run all three processes, both DB migrations, CI jobs, provider HTTP fakes, documented failure demos, manual accessibility/security checks and finally reviewed release PR.

## Coordination policy

- One primary owner per directory; cross-cutting changes require the other owner's review.
- Do not create long-lived permanent person-specific branches. Each feature branch starts from the current `dev`.
- Never block a developer on undocumented response assumptions: use `docs/api/contracts.md` as shared agreement.
- Do not directly call Catalog from React, share Eloquent models between backends, or introduce cross-DB joins.
- Each feature PR includes: scope, screenshots (UI), env/migration needs, test commands/results, contract/doc updates, reviewer.
