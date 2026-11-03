# Milestone 3 execution checklist

Only M3.0 documentation is delivered here. M3.1–M3.3 are proposed and unchecked. Each future slice includes migrations/models → validation/policies → API → backend tests → React → frontend tests → browser/real-service verification, plus docs and human review. The [architecture](../architecture/milestone-3.md), [schema](../database/milestone-3-schema.md), [API](../api/milestone-3-contracts.md) and [frontend plan](../architecture/milestone-3-frontend.md) are the implementation starting point.

## M3.0 — architecture and contracts

- [x] Audit source, routes, services, migrations, M2 docs, frontend and CI; distinguish implemented from proposed and note M2.6 acceptance remains open.
- [x] Specify roles, account lifecycle, authorization, reporting, moderation, spoiler enforcement, audit history and retention questions.
- [x] Specify Core/Catalog boundaries, deterministic recommendations, metadata limits, candidate contract, cache and fallback.
- [x] Propose schema, API DTOs/errors, frontend integration, security tests, dependencies and ADR. No application code, migrations or dependencies added.
- [ ] Human review and hosted CI acceptance of this architecture.

## M3.1 — administration and user management

- [ ] Add role/status and invitation state with safe defaults/backfill, indexed access, rollback and isolated DB tests.
- [ ] Trusted first-admin provisioning; role gates/policies, last-admin and self-protection with concurrent tests.
- [ ] Enforce current account status on every protected path and existing sessions/tokens; restrict community writes, generic login failure, CSRF and throttles.
- [ ] Create/invite/activate user, list/search/detail/edit, moderator assignment, status and confirmed deletion; safe DTOs, audit records, race/error tests; decide retention before exposing deletion.
- [ ] Build lazy protected admin layout and user screens, responsive dialogs, invitation screen, role-aware navigation, server-confirmed states and account isolation.
- [ ] Run backend/DB, frontend, browser and real-session tests; exercise demotion/ban with retained session, 401/403/419/429, delivery failure and concurrent last-admin attempts.

## M3.2 — reporting and review moderation

- [ ] Depends on M3.1 roles, policies, status enforcement and action log. Add report table, review visibility and moderator spoiler flag with safe defaults and indexes.
- [ ] Implement one-report-per-reporter/review, bounded queue/detail, resolve/dismiss, hide/restore and moderator spoiler toggle; lock target/report, audit and sanitize deleted-target races.
- [ ] Filter every public review read/count at SQL level, preserve author edit/delete and enforced spoiler on edits; ensure moderator cannot impersonate owner.
- [ ] Add report dialog, queue/review screens, owner enforcement feedback and invalidation. Test guest/unverified/restricted/moderator/admin, IDOR, CSRF, duplicate and deletion races, UI focus and real persistence.

## M3.3 — For You recommendations

- [ ] Depends on M2 ratings/library/collections and Catalog discovery; does not require M3.2. Add Core preference revision and increment it transactionally with all relevant writes.
- [ ] Implement and test Catalog candidate/feature contract, bounded provider calls, metadata normalization, missing-credits behavior and token guard; deploy Catalog before Core.
- [ ] Implement Core bounded seed selection, exclusions across all watched/rated rows, deterministic weighted score, diversity, grounded explanations, revision-aware cache and truthful fallback/outage behavior.
- [ ] Add Home section, owner-scoped queries, invalidation, guest/cold-start/loading/error/stale states and responsive accessible cards.
- [ ] Test positive/negative weights, ties, duplicates, missing data, large libraries, cache/write race, user isolation, network call limits and outage; run browser and real-service checks without invented provider data.

## Release and open decisions

- [ ] Confirm hard-deletion/audit/report retention and avatar cache implications with the project owner before production deletion.
- [ ] Confirm mail delivery and invitation domain/expiry settings before M3.1 rollout.
- [ ] Decide how internet-facing administrator access receives MFA or equivalent additional protection; the current application has no MFA.
- [ ] Measure Catalog genre/contributor coverage and candidate latency before tuning weights or considering further metadata persistence.
- [ ] Complete separate M2.6 acceptance and hosted CI/human review; do not infer release readiness from M3.0 docs.
