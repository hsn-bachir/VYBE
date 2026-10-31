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

## M2.1 Watchlist & Watched

- [ ] Backend: two additive migrations, unique/FK/index constraints, models, owner-scoped services/requests/resources, paginated lists/add/remove and library-state singleton; compose summaries once/page.
- [ ] Frontend: verified Library routes, Details actions, missing/outage placeholders; reuse cards/query/auth stack.
- [ ] Tests: duplicate/concurrent add, idempotent delete, independent lists, unchanged repeat watched time, cascades, pagination/query counts, batch outage and partial metadata; React invalidation/accessibility/interactions.
- [ ] Security: session/CSRF/verified, cross-user isolation, input allowlists, bounded pagination and throttling.
- [ ] DoD: tested vertical slice, docs match, no collection side effects, CI/human review.
- Dependencies: M2.0 batch deployed; review unresolved-ID write policy and timestamp/API proposals; disposable MySQL migrations.

## M2.2 Custom Collections

- [ ] Backend: collections/memberships migrations, owner-local name uniqueness, CRUD/counts, paginated membership annotation/list/add/remove.
- [ ] Frontend: private collection pages/editor and paginated multi-save modal with per-operation outcomes.
- [ ] Tests: case/accent collisions and races, empty collections, multi-membership, cascading deletion, wrong-owner 404, modal partial failure/invalidation/focus.
- [ ] Security: owner scope before all access, no user_id trust or public sharing; CSRF/verified/limits.
- [ ] DoD: full private vertical slice, no separate Favorites/Saved feature, docs/CI/review.
- Dependencies: M2.0; reuse M2.1 library composition; review collation and modal UX.

## M2.3 Movie Ratings

- [ ] Backend: rating migration/constraint, independent singleton get/PUT/delete, one grouped aggregate query with all five bins.
- [ ] Frontend: own rating controls and explicitly labelled VYBE histogram alongside TMDB rating.
- [ ] Tests: 1–5 integer validation, concurrent replace, zero statistics, aggregate update/delete, rating without review, UI/query invalidation.
- [ ] Security: own rows only, verified writes, public aggregate privacy, CSRF/rate limits.
- [ ] DoD: slice passes, no persistent aggregate infrastructure, docs/CI/review.
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
