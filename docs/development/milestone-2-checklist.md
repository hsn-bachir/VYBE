# Milestone 2 execution checklist

Only checked items have been delivered; future feature contracts are proposals, not implementation. Each slice targets `dev`, needs human review and applicable CI. M2.0 does not authorize later slices. See [foundation report](m2-foundation-report.md) for actual local evidence and remaining limits.

## M2.0 Architecture & Contracts

- [x] Investigate service ownership, auth/verification, movie caching, actual serializers and frontend conventions.
- [x] Document M2 ownership, scope, implementation sequence, proposed schema/ERD/constraints, public APIs, security, frontend contracts and ADR.
- [x] Backend: internal bounded cache-only Catalog batch endpoint using existing summary serializer/token guard.
- [x] Backend: extend existing Core MovieCatalogClient on the authorized `origin/dev` baseline.
- [x] Catalog tests: token/validation/order/missing/stale/no-provider/query-count coverage; 91 tests / 387 assertions pass on SQLite and isolated MySQL 8.0.43; existing migrations pass.
- [x] Core: 112 tests / 502 assertions on SQLite/MySQL; existing isolated MySQL migrations pass. Unchanged frontend lint/type/build and 59 tests pass (build has a bundle-size warning).
- [x] Core batch transport/response/failure tests and real HTTP Core → Catalog smoke check with disposable fixture data.
- [x] Catalog security: no public batch route, existing token protection, safe failures, no cross-DB access.
- [x] Core batch credential forwarding and failure sanitization verification.
- [x] DoD: final diff reviewed, documentation synchronized to verified behavior, no M2 product migrations/UI/dependencies.
- [ ] PR review and hosted CI acceptance (not run or claimed by local verification).
- Dependencies: current M1 Catalog + Core discovery client; local test runtime. Review proposed details before consuming them in later slices.

## M2.1 Personal Library and Cinematic Details

- [x] Core migrations, owner-scoped models/services/requests/resources, unique keys/FKs/cascades/indexes, seven library routes and bounded batch composition.
- [x] Catalog-confirmed new additions; duplicate 200 with preserved timestamps, removal/state without Catalog; missing/outage rows and totals preserved.
- [x] Sanctum, verified email, CSRF without Origin, JSON errors without Accept, private no-store, DELETE CORS, read/write throttles.
- [x] Catalog/Core experience endpoint, appended TMDB retrieval, safe trailer selection, bounded cast/directors/related, shared cache/lock/cooldown and stale fallback; base detail compatibility.
- [x] Cinematic details, on-demand native trailer dialog, independent real actions, protected Library, shared cards/pagination and deliberate loading/empty/error/outage states.
- [x] SQLite and independent disposable MySQL suites; frontend tests/lint/type/build; responsive browser fixture acceptance and real two-service login/persistence/outage checks. See [report](m2.1-report.md) for counts, commands and limits.
- [x] Local diff/security review and synchronized docs; no collection CRUD, no new runtime dependencies, no Git delivery actions.
- [ ] Hosted CI and human PR review (not claimed by local checks).
- Deploy Catalog support, run the two additive Core migrations, then deploy Core/frontend. Optional Core summary timeout defaults to 3 seconds; discovery remains 12.

## M2.2 Custom Collections

- [x] Backend: collections/memberships migrations, duplicate permitted case-preserving names with ID identity, CRUD/counts, paginated membership annotation/list/add/remove.
- [x] Frontend: private collection pages/editor and paginated multi-save modal with per-operation outcomes.
- [x] Tests: duplicate names and preserved capitalization, empty collections, multi-membership, cascading deletion, wrong-owner 404, modal partial failure/invalidation/focus; SQLite/MySQL, concurrent adds, migration rollback/reapply, browser fixture and real-service journeys.
- [x] Security: owner scope before all access, no user_id trust or public sharing; CSRF/verified/shared limits, safe errors, account-isolated caches.
- [x] Local DoD: full private vertical slice, no separate Favorites/Saved feature, responsive/keyboard/reduced-motion verification, actual Catalog outage, final diff and synchronized documentation. See [M2.2 report](m2.2-report.md).
- [ ] Hosted CI and human PR review; no Git delivery action or release was performed.
- Deployment: run the two `2026_11_01_*` Core migrations before the new Core/frontend consumer. No Catalog change, new configuration or dependency is required.
- Dependencies: M2.0; reuse M2.1 library composition; follow the approved duplicate-name decision and review modal UX.

## M2.3 Movie Ratings

- [x] Backend: rating migration/constraint, independent singleton get/PUT/delete, one grouped aggregate query with all five bins.
- [x] Frontend: controlled Peek Rating adaptation, personal save/change/remove and explicitly labelled VYBE histogram alongside TMDB rating.
- [x] Tests: strict JSON 1–5, SQLite/MySQL constraints, concurrent create/update, rollback/reapply, empty/aggregate behavior, independent memberships, UI/query/account isolation, browser fixtures and real two-service/database journey/outage.
- [x] Security: own rows only, verified writes, guest-readable aggregates, CSRF including no Origin, PUT CORS, read/write limits and sanitized errors.
- [x] Local DoD: full vertical slice, no persistent aggregate infrastructure, synchronized documentation; see [M2.3 report](m2.3-report.md).
- [ ] Hosted CI and human PR review; no Git delivery or release performed.
- Deployment: apply the single `2026_11_03_000001_create_movie_ratings_table.php` Core migration before Core/frontend, with enforced CHECK support (tested MySQL 8.0.43). No Catalog change or new configuration/dependency. Refresh cached CORS config to allow PUT if used.
- Dependencies: M2.0 contracts, review DB CHECK enforcement and rounding.

## M2.4 Reviews & Spoilers

- [ ] Backend: review migration/unique key, public bounded listing, own singleton/create/edit/delete; public author projection.
- [ ] Frontend: plain-text composer/list, explicit spoiler reveal, own edit/delete, no rating dependency.
- [ ] Tests: duplicate 409/races, movie/owner mismatch 404, stable ordering after edit, boundaries, public guest reads, author privacy, XSS escaping and reveal/reset.
- [ ] Security: verified writes, CSRF/limits, no HTML injection or email leakage.
- [ ] DoD: full slice with no moderation/replies/likes/reporting, docs/CI/review.
- Dependencies: M2.0; can ship independently of ratings; M2.5 identity changes invalidate authors.

## M2.5 User Profiles

- [ ] Backend: additive nullable bio, existing UserResource reuse, basic update/counts, reviewed local avatar storage and cleanup.
- [ ] Frontend: profile route/editor/stats, existing authKey update, safe upload feedback.
- [ ] Tests: username races/reserved names, counts/cascades, legacy null timestamps, upload content/size/dimensions, storage failure/cleanup, cache identity refresh.
- [ ] Security: own identity only; no email/password update; raster re-encoding, safe URLs, CSRF/verified/upload limits.
- [ ] DoD: full slice, no duplicate auth store/public social profile, docs/CI/review.
- Dependencies: M2.1 and M2.4 counts; review storage deployment/persistence and available image-processing support.

## M2.6 Integration & Release

- [ ] Backend: verify all additive migrations on independent disposable MySQL schemas; three-process integration and controlled Catalog outage.
- [ ] Frontend: all routes/states, responsive/keyboard acceptance, no fake data or direct Catalog/TMDB API access.
- [ ] Tests: both PHP suites, frontend test/lint/type/build, query counts, concurrency/privacy and end-to-end flows; hosted CI.
- [ ] Security: inspect cross-user boundaries, service credentials, mass assignment, session isolation, errors, upload delivery.
- [ ] DoD: resolve open decisions, update acceptance docs, human-reviewed `dev` → `main` release only when explicitly authorized.
- Dependencies: M2.1–M2.5 complete; instructor microservices grading expectations remain to be confirmed separately.
