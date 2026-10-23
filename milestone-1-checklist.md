# Milestone 1 readiness and completion checklist

These boxes are intentionally unchecked unless confirmed as integrated. Branch-local scaffold and historical CI evidence are in [audit](repository-audit.md).

## Before feature implementation

- [ ] Team reviews documentation/ADR and accepts proposed contracts, public browsing and cache defaults.
- [ ] Review and integrate setup PR #1 through authorized human workflow; refresh audit.
- [ ] Verify branch protection rules, required checks, teammate access and review process.
- [ ] Align teammates on compatible PHP 8.4 patch, Node 22.12+ and actual MySQL engine.
- [ ] Each teammate completes [onboarding](teammate-onboarding.md) using their own environment/database.
- [ ] Assign small issues and migration/contract owners; coordinate first frontend/backend integration.
- [ ] Ask instructors about service topology, independent deployment and MVC assessment now; final topology can remain undecided until answered.
- [ ] Resolve password/hash policy and Unicode byte limits without truncation.

## Authorized feature sequence after documentation review

1. Add required frontend/backend foundations in focused PRs: routing/providers/design tokens, API routing/Sanctum/config.
2. Implement additive users adjustment and movies schema with MySQL verification.
3. Deliver registration/login/me/logout and matching frontend forms; test browser session/CSRF behavior.
4. Implement TMDB client, normalization and full metadata persistence; test cold/fresh/stale/failure paths.
5. Implement ranked popular/search caches and list contracts; prevent summary false freshness.
6. Connect popular/search/detail screens to real Laravel APIs and consistent layouts.
7. Add missing test foundations deliberately; validate responsive/accessibility/error states.
8. Refresh docs and review integrated v0.1.0 readiness.

This sequence is planning, not authorization for agents to implement features during a documentation task.

## Acceptance before v0.1.0

- [ ] Only users/movies business tables plus required framework tables.
- [ ] Password registration required; hashes private; null-password login safely rejected.
- [ ] Stateful cookies/CSRF/CORS verified; session expiry/logout and auth throttle handled.
- [ ] No auth tokens in localStorage or TMDB secrets in frontend bundles/logs.
- [ ] Popular/search preserve upstream rankings/pagination; no fake finished datasets.
- [ ] Persistent full metadata freshness configurable; summaries not marked hydrated.
- [ ] Stale fallback and cold failure behavior documented and tested.
- [ ] Movie validation, timeouts, upstream error cases and race integrity verified without live TMDB.
- [ ] All initial pages and states coherent; keyboard, contrast, reduced motion and responsive checks complete.
- [ ] TMDB approved logo and required notice in real About/Credits UI.
- [ ] Actual frontend behavior tests and MySQL integration coverage reviewed; no claims based solely on starter tests.
- [ ] CI passing for the release revision; local commands/results reported.
- [ ] Setup guide reproducible by another teammate; no secrets or unrelated changes.
- [ ] Human-reviewed release PR dev→main; explicit permission to merge/tag v0.1.0.

Later university requirements remain required for the final project: upcoming/cast/director/trailers, profile/password/OAuth, reviews/ratings/moderation, watchlist/history, recommendations, weather/maps/sentiment/calendar/realtime, custom lists/privacy, follows/activity, movie nights/voting/invitations, admin metrics/management and real microservices evidence. None are silently fulfilled by this milestone.

