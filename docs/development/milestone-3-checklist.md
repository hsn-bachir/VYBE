# Milestone 3 execution checklist

## M3.1A — roles, state and access foundation

- [x] Add role/status defaults, constraints and index in Core; test SQLite migration rollback and existing-user defaults.
- [x] Enforce current account state on protected Core routes and inside write transactions; retain logout for blocked accounts.
- [x] Restrict rating writes and review creation/edits while preserving own-review deletion and personal library/profile access.
- [x] Add role gates, role middleware and private `GET /me/access`; keep `/auth/me` unchanged.
- [x] Add trusted `app:provision-admin {user_id}` command for one existing verified active account.
- [x] Add lazy role-gated `/admin` landing for admin and moderator with role-aware navigation.
- [x] Complete fixture and disposable SQLite real-session browser checks.
- [ ] Complete isolated MySQL migration check and hosted CI/human review.

M3.0 documentation, M3.1A foundation and M3.1B user management are delivered locally. M3.1C and M3.2 are implemented locally; M3.3 remains proposed. Each slice includes migrations/models → validation/policies → API → backend tests → React → frontend tests → browser/real-service verification, plus docs and human review. The [architecture](../architecture/milestone-3.md), [schema](../database/milestone-3-schema.md), [API](../api/milestone-3-contracts.md) and [frontend plan](../architecture/milestone-3-frontend.md) are the implementation starting point.

## M3.0 — architecture and contracts

- [x] Audit source, routes, services, migrations, M2 docs, frontend and CI; distinguish implemented from proposed and note M2.6 acceptance remains open.
- [x] Specify roles, account lifecycle, authorization, reporting, moderation, spoiler enforcement, audit history and retention questions.
- [x] Specify Core/Catalog boundaries, deterministic recommendations, metadata limits, candidate contract, cache and fallback.
- [x] Propose schema, API DTOs/errors, frontend integration, security tests, dependencies and ADR. No application code, migrations or dependencies added.
- [ ] Human review and hosted CI acceptance of this architecture.

## M3.1B — administrator user management

- [x] Add Core administrative action table, indexes, nullable actor FK, rollback and SQLite tests.
- [x] Add administrator-only list/search/filter/detail/edit, moderator role and status APIs with narrow DTOs and strict validation.
- [x] Lock and recheck actor/target for writes; protect self and the last verified active administrator; record actual mutations atomically with audit.
- [x] Revoke target database sessions on actual role/status/email change; retain live account-state authorization; enforce CSRF and administrator throttles.
- [x] Add lazy user list/detail routes, responsive VYBE styling, shared dialogs, account-scoped queries and server-confirmed feedback.
- [x] Exercise Core PHPUnit, frontend unit, real disposable SQLite browser/API journey, and 375/768/1440 viewport checks.
- [ ] Verify the migration and lock behavior on isolated MySQL, hosted CI, and human review.

## M3.1C — creation, invitations and password management

- [x] Add invitation state, safe account creation, one-use setup tokens and delivery/resend flow.
- [ ] Decide retention before implementing hard deletion and confirm production administrator access protection.
- [x] Add invitation UI, security tests and disposable SQLite browser journey.
- [x] Add confirmed administrator password change and broker reset initiation, shared validation, audit, post-commit notification and one-use reset completion.
- [x] Rotate a private session version and remember token on password changes, revoke same-connection database sessions, and reject stale file sessions.
- [x] Add eligible-account password dialogs and a token-based reset page; run focused security tests and frontend checks.
- [ ] Verify the new password-management journey in a disposable browser and isolated MySQL; confirm SMTP delivery.
- [ ] Verify SMTP delivery and MySQL concurrency/migrations on isolated infrastructure.

## M3.2 — reporting and review moderation

- [x] Reuse M3.1 roles, state enforcement and action log; add report table, review visibility and moderator spoiler flag with safe defaults and indexes.
- [x] Implement one-report-per-reporter/review, bounded queue/detail, resolve/dismiss, hide/restore and moderator spoiler toggle; lock target/report, audit and handle deleted targets.
- [x] Filter public review reads/counts at SQL level; preserve author edit/delete and enforced spoiler on edits; deny owner impersonation.
- [x] Add report dialog, queue/review/history screens, owner enforcement feedback and query invalidation; run focused Core and frontend tests.
- [ ] Complete real-browser focus/responsive/CSRF acceptance and isolated MySQL concurrency verification before release.

## M3.3 — For You recommendations

- [ ] Depends on M2 ratings/library/collections and Catalog discovery; does not require M3.2. Add Core preference revision and increment it transactionally with all relevant writes.
- [ ] Implement and test Catalog candidate/feature contract, bounded provider calls, metadata normalization, missing-credits behavior and token guard; deploy Catalog before Core.
- [ ] Implement Core bounded seed selection, exclusions across all watched/rated rows, deterministic weighted score, diversity, grounded explanations, revision-aware cache and truthful fallback/outage behavior.
- [ ] Add Home section, owner-scoped queries, invalidation, guest/cold-start/loading/error/stale states and responsive accessible cards.
- [ ] Test positive/negative weights, ties, duplicates, missing data, large libraries, cache/write race, user isolation, network call limits and outage; run browser and real-service checks without invented provider data.

## M3.2.5 — performance and administration UX

- [x] Capture a local development performance baseline and identify auth gating, Core-to-Catalog latency and admin density problems.
- [x] Show public page shells during auth checks while preserving protected-route checks; keep verification success fresh.
- [x] Add real admin aggregates, scoped review views, compact previews, full review inspection and batched movie titles.
- [x] Refactor all seven administration pages with compact navigation/tables, mobile states, filters and simplified reason forms.
- [x] Preserve session/CSRF/role/audit semantics and test Core SQLite plus frontend unit/browser fixtures at 375/768/1440 px.
- [ ] Run isolated MySQL EXPLAIN/migration and live authenticated browser-action timing when disposable services are available; complete hosted CI and human review.

## Release and open decisions

- [ ] Confirm hard-deletion/audit/report retention and avatar cache implications with the project owner before production deletion.
- [ ] Confirm mail delivery and invitation domain/expiry settings before M3.1 rollout.
- [ ] Decide how internet-facing administrator access receives MFA or equivalent additional protection; the current application has no MFA.
- [ ] Measure Catalog genre/contributor coverage and candidate latency before tuning weights or considering further metadata persistence.
- [ ] Complete separate M2.6 acceptance and hosted CI/human review; do not infer release readiness from M3.0 docs.
