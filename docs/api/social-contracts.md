# M4 social contracts

**Status (2026-11-26):** M4.0 initial contract approved and documented. M4.1 Core endpoint and frontend integration are implemented, with developer-confirmed manual local acceptance; team review and CI remain pending. M4.2 backend/frontend are implemented with subsequent developer-reported manual local acceptance; developer-performed PostgreSQL migration and separate agent read-only/automated evidence are recorded below. Agent browser/responsive evidence, team review and CI remain pending. M4.3 and later features are not implemented. Scope maps to university objectives **8 (Custom Movie Lists)** and **9 (Follow Users)** in [PROJECT_ROADMAP.md](../../PROJECT_ROADMAP.md). Later-phase policy and schema decisions remain deferred below.

## Ownership and compatibility

Core owns public identity, social data, authorization and browser-facing `/api/v1/*` APIs. React uses the existing credentialed Axios client. Catalog is unchanged; later movie previews reuse bounded summary requests without user data or per-movie detail calls.

Preserve Sanctum sessions, Firebase UID mapping, CSRF, verification and account-access gates, session revocation, private `/me/profile`, library and collection contracts, recommendation synchronization, and existing movie-page review visibility/moderation/spoiler behavior. Do not reuse private `ProfileResource` or `UserResource` for public responses.

## M4.1 public identity

Public identity is automatically available for eligible members. A target must have a verified email, `invitation_pending=false`, and account status `active` or `restricted`. Missing, banned, deactivated, unverified and invitation-pending targets are unavailable. Apply these predicates to the Core lookup before serialization; roles do not bypass eligibility.

| Request | Access | Success |
| --- | --- | --- |
| `GET /api/v1/users/{id}` | Guest-readable, read-only | `200` with the exact projection below |

```json
{"data":{"id":17,"username":"movie_fan","avatar_url":null}}
```

The example is synthetic. `id` is the stable Core integer ID; `username` is the current username and may change. `avatar_url` is the existing trusted accessor's URL or null. These are the only public fields. Bio, email, verification time, role/status, provider/UID information, tokens, private counts and library activity remain excluded, including for the owner or an administrator requesting this public endpoint.

### Validation, middleware and errors

- Match existing identifier conventions: decimal digits without signs, leading zeroes, whitespace or exponents; range `1..2147483647`. Validate the route ID in a focused FormRequest before querying. Invalid IDs return `422` with an `id` validation error. IDs above this existing API bound remain unsupported; reconsider consistently if Core IDs approach the bound.
- Accept no request body or query parameters; unsupported inputs return `422` using existing JSON validation conventions. This is a single identity response, without pagination or Catalog calls.
- Reuse `throttle:community-read` (120 requests/minute/IP, shared with current community reads). No `auth:sanctum`, owner-only, active-account or verified-viewer middleware is required for this guest-readable projection. Target eligibility is enforced independently. Existing authenticated/private route middleware stays unchanged.
- Return identical `404` status and `{"message":"Not found."}` for a valid missing or ineligible target. Do not distinguish hidden-account reasons or expose counts in error responses.
- Return `429` with the existing rate-limit behavior and `Retry-After`. Unexpected server failures return sanitized JSON `500`; no database details or credentials. Ensure the new route uses JSON errors even without an `Accept` header.
- Apply `Cache-Control: no-store` to success and error responses. Existing `PreventAuthCaching` (`no-store, private`) is compatible. No shared response cache or long-lived negative cache.

### Privacy and authorization matrix

| Viewer / target | Minimal public identity | Private profile / mutations |
| --- | --- | --- |
| Guest | Eligible targets only | No access |
| Unverified viewer | Same guest-readable API projection | Existing verification gates; preserve SPA verification redirect |
| Active verified viewer, owner or other member | Same three fields | Existing owner/session/verification permissions |
| Restricted verified viewer or target | Eligible public target; same projection | Preserve existing personal permissions; future public contributions require separate active-account checks |
| Banned/deactivated viewer | Public endpoint has guest-equivalent content only; no authenticated privileges | Existing account-access denial and SPA behavior remain |
| Banned/deactivated/unverified/invitation-pending target | Indistinguishable `404` | Public endpoint never exposes owner/admin exceptions |
| Moderator/admin viewer | Same public projection and target eligibility | Existing separate administration/moderation APIs only |

M4.1 has no follower-dependent access. A public identity route is not a new account-access entitlement. Existing movie-page author identity remains unchanged, so a review author link may legitimately lead to the unavailable profile state.

## Minimal implementation and frontend integration

Extend `ProfileService` with a focused eligible public lookup. Use a separate public controller, FormRequest and resource; no new service abstraction, migration, dependency or Firebase request is needed for this SQL identity read.

Backend implementation: `PublicProfileController`, `PublicProfileRequest`, `PublicProfileResource`, and `ProfileService::publicProfile()`, with `PublicProfileTest` coverage. Route-scoped exception handling preserves JSON and no-store headers on unavailable, validation, throttle and sanitized server-error responses. Body-free GETs are required; an explicitly supplied empty JSON object/array is still a request body and returns `422`.

Backend verification (2026-11-25): 27 focused public-profile tests passed. The full Core suite on isolated SQLite `:memory:` completed with 558 passed and 2 opt-in live Firebase tests skipped (4,980 assertions), using direct PHPUnit with temporary GD/EXIF/PDO extension flags. Live local PostgreSQL/Core probes confirmed an existing eligible user's exact three-field `200` response and JSON/no-store `422` and `404` responses, without changing application data. Automated PostgreSQL/MySQL runs remain unverified for this slice.

React adds `/users/:id` inside the existing public application shell, outside `RequireAuth`, while preserving `PublicOrVerified` and account-access behavior. Extend `features/profile` with separate public types/API/query/page files. Reuse Avatar, page states, buttons, semantic tokens, branding and reduced-motion patterns. Keep `/profile` and its private editor unchanged.

Use a distinct public query key such as `['public-profile', id]`, cancellation, no automatic retries, and refetch on mount so an old eligible response does not mask a later unavailable response on revisit. Clear relevant queries on account transitions through the existing auth cleanup. Profile username/avatar mutations must invalidate this public identity and existing review-author views. Do not persist public-profile responses to browser storage. Client caching is not authorization; each API read rechecks eligibility.

Link review author identity to the stable user-ID route without changing review controls or spoiler behavior. Show explicit loading, unavailable (`404`), invalid-ID and retryable-error states. Update the public page title in AppLayout. No follow controls, follower counts, private statistics or automatically published bio.

Frontend implementation: `PublicProfilePage`, a separate three-field DTO/API and `publicProfileOptions`, lazy `/users/:id` routing, and semantic review-author links. Links carry a validated local movie return path; direct visits fall back to Discover. Queries use `staleTime: 0`, `gcTime: 0`, revalidation on mount and cancellation, with no automatic retries/reconnect refetches. M4.2 additionally enables window-focus revalidation alongside public collections. Error states take precedence over retained data, including after an authoritative `404`. Profile edits invalidate the changed public identity, matching public creator projections and existing private/author views; existing auth cleanup clears public queries on account transitions. No browser-storage persistence or optimistic identity updates.

Frontend verification (2026-11-25): `npm test -- --reporter=dot` passed **269 tests across 20 files** (previous baseline 256; 13 new public-profile tests). `npm run lint`, `npx tsc -b --noEmit`, and `npm run build` passed. Coverage uses the existing Node/Vitest server-rendering and query-observer patterns for API/cancellation, ID validation, presentation/errors, controlled retry, target isolation, account cleanup/invalidation, safe navigation, actual route placement and review-control/spoiler preservation. Existing standalone review/moderation test renders now supply router context; their assertions are retained. Browser/interactive and geometry checks at 390/768/1024/1440 px remain pending; these automated checks do not establish visual or authenticated acceptance.

Resumption recheck (2026-11-25): reviewed the existing implementation against the original frontend task and repeated all four frontend checks above with the same passing results; no additional application source changes were needed. Backend changes remain preserved, and public-profile exception handling is confined to the named `public-profile.show` route.

Browser acceptance attempt and resumption recheck (2026-11-25): Computer Use returned no available browsers and `The browser access host is unavailable`. Existing Frontend/Core/Catalog instances responded successfully on ports 5173/8000/8001; no additional processes were started. Interactive navigation, guest/private-account behavior, refresh, keyboard/focus and responsive geometry remain unverified. M4.1 is not fully accepted.

Subsequent operator handoff (2026-11-25): the developer confirmed manual local M4.1 public-profile acceptance. This supersedes the local acceptance gap above, without claiming agent browser screenshots or responsive measurements. Team review, CI and release acceptance are still pending.

## M4.1 acceptance

- Eligible active and restricted verified targets return exactly the three allowed fields to guests, owners and other viewers. Assert absence of private fields and relations, not only presence of allowed fields.
- Missing/ineligible targets return the same `404` body. Cover every target status, verification, invitation state and changes between requests.
- Invalid/overflow/noncanonical IDs and unsupported inputs return `422`; valid nonexistent IDs return `404`. Cover JSON error behavior without `Accept`, read throttling and no-store headers on errors/success.
- Confirm no Catalog/provider calls, no profile/social-data writes and no extra private-count queries. Existing private profile, username/avatar updates, sessions and review moderation contracts remain compatible; normal framework session handling is unchanged.
- Frontend tests cover distinct public/private keys, cancellation, updated author identity, logout/account switching, unavailable targets and failed requests without stale private content.
- Browser journey: existing review author -> profile -> back. Verify keyboard/focus, accessible names, image failure, long usernames, loading/empty/error states, reduced motion and no horizontal overflow at **390, 768, 1024 and 1440 px**. Use approved existing test accounts; no account creation is required.

## M4.2 collection visibility and public reads

### Storage and publication

Additive migration `2026_11_25_000001_add_visibility_to_collections.php` adds constrained `visibility: private | public NOT NULL DEFAULT private`. Existing rows, Favorites, new rows and omitted create inputs default to private; identifiers and memberships are preserved. Laravel's enum schema abstraction uses the target engine's enum/check representation (PostgreSQL/MySQL/SQLite). The `(user_id, visibility, created_at, id)` index supports the author-filtered listing and stable newest-created ordering. No global discovery index or activity infrastructure is added.

No publication timestamp is introduced: this slice neither orders by publication nor generates activity. `created_at`/`updated_at` must not later be treated as publication or consent evidence. Future feed work must define explicit publication events/consent and avoid backfilling existing public collections as new activity.

Favorites cannot be edited, published or deleted through owner endpoints. Every public query additionally excludes **all** system collections before counting/enriching, even if a corrupted row were marked public. Existing Favorites memberships, private ownership and recommendation inputs remain unchanged.

### Owner writes and authorization

Existing `POST /api/v1/me/collections` and `PATCH /api/v1/me/collections/{id}` accept optional `visibility` in addition to the existing validated `name`/`description`. POST still requires a name; PATCH accepts any nonempty subset of these three fields. Unsupported fields and invalid/null visibility return `422`. Omitting visibility on PATCH preserves the stored value. Owner collection DTOs add `visibility`; all existing fields and owner endpoints remain available.

| Owner | Private operations | Public operations |
| --- | --- | --- |
| Active, verified, not invitation-pending | Existing CRUD/membership permissions | Explicit publish, metadata edits, membership additions, withdrawal/removal/deletion |
| Restricted, verified | Existing CRUD/membership permissions | Read existing public content; make private, remove movies or delete custom collection; cannot publish (including redundant `visibility: public`), edit public name/description or POST memberships (including duplicates) |
| Banned/deactivated | Existing denial retained | Existing denial retained; all their public collection reads unavailable |

Restricted **combined withdrawal + metadata edit is rejected atomically with `403`**. Send visibility-only withdrawal first, then edit privately. Explicit publication and public expansion use freshly locked account verification/invitation/status, not the caller's stale User object. AccountAccess and ownership/collection locks remain inside transactions; additions recheck both account and visibility after Catalog confirmation. Owner routes retain session/CSRF/verification/no-store and existing library throttles. Other users cannot modify even public collections (`404` on owner routes). Existing deletion/cascade behavior is retained; no new deletion mechanism is introduced.

### Guest-readable endpoints and DTOs

| Endpoint | Inputs | Response |
| --- | --- | --- |
| `GET /api/v1/users/{id}/collections` | `page` 1..10000 (default 1), `per_page` 1..50 (default 20) | Public custom collections for an M4.1-eligible target; newest `created_at DESC, id DESC`; up to three movie previews per row |
| `GET /api/v1/collections/{id}` | No query parameters | One public custom collection and safe creator identity; no previews or owner fields |
| `GET /api/v1/collections/{id}/movies` | Same pagination | Memberships newest `created_at DESC, id DESC`, enriched using one bounded Catalog summary batch per nonempty page |

All are body-free GETs, including rejecting explicit `{}`/`[]` bodies; unknown query keys return `422`. IDs use the existing canonical `1..2147483647` rules. Named `public-collections.*` routes share `community-read` (120/minute/IP) with public profiles/reviews and use `no-store, private` on success/errors. JSON exception sanitization is scoped to these route names and `public-profile.show`; unrelated routes retain their existing handling.

Collection detail example (synthetic):

```json
{"data":{"id":23,"name":"Weekend","description":"Films to share","movie_count":2,"creator":{"id":17,"username":"movie_fan","avatar_url":null}}}
```

Author listings return these fields plus `preview_movies: [{"tmdb_id":550,"title":"Example","poster_path":null}]`, with `meta: {"page":1,"per_page":20,"total_pages":1,"total_results":1,"preview_metadata_unavailable":false}`. An eligible author with no public collections returns an empty page, not `404`. Previews are SQL-limited per collection, deduplicated and enriched in batches of at most 50 IDs (at most three batches for a 50-row page). Private/Favorites movies never enter these batches. Summary outages retain IDs/counts with null preview metadata and set `preview_metadata_unavailable: true`.

Public movie page example (synthetic):

```json
{"data":[{"tmdb_id":550,"movie":null,"metadata_status":"missing"}],"meta":{"page":1,"per_page":20,"total_pages":1,"total_results":1,"metadata_unavailable":false}}
```

`movie` uses the existing normalized Catalog summary DTO; `metadata_status` is `available | missing | unavailable`. Catalog outages preserve membership rows with null movie metadata and `metadata_unavailable: true`. Empty/out-of-range pages preserve filtered totals without Catalog calls. Public DTOs exclude collection membership timestamps/IDs, system keys, visibility/membership flags, owner email/UID/bio/status/role, private counts and private relations. Creator uses the exact M4.1 three-field resource.

Missing, private, system collections and collections whose owner is ineligible return the same `404 {"message":"Not found."}` on detail/movie reads, including for their owner or an administrator. Author targets use the same M4.1 eligibility and indistinguishable `404`. Restricted verified targets remain publicly readable. Every read rechecks SQL eligibility; no social response cache. Subsequent reads after withdrawal or owner ineligibility revoke access. Validation is `422`, throttling `429` with Retry-After, unexpected failure sanitized `500`; public reads grant no private-account privileges.

### Frontend handoff and rollout

Backend verification (2026-11-25): before execution, a temporary local preflight bootstrapped Core and verified `APP_ENV=testing`, SQLite `:memory:`, empty database URL, array cache/session/mail and synchronous queues; the existing TestCase/MigrationTestCase disposable-database guard remained enabled. No running database or environment file was modified. Commands from `backend`:

```powershell
php -d extension=gd -d extension=exif vendor/phpunit/phpunit/phpunit tests/Feature/PublicCollectionsTest.php tests/Feature/CollectionVisibilityMigrationTest.php
php -d extension=gd -d extension=exif vendor/phpunit/phpunit/phpunit
```

Final focused run: **27 passed, 533 assertions**. Full Core: **585 passed, 2 opt-in live Firebase tests skipped** (587 total, 5,510 assertions; previous baseline 558 passed/2 skipped). Focused coverage includes migration upgrade/rollback/defaults/invalid DB values, explicit publication/withdrawal, existing clients, safe public DTOs, filtered totals/previews, account eligibility revocation, restricted combined-write denial, ownership, post-Catalog state changes, no-store/validation/throttling/sanitization and unchanged recommendation inputs on visibility-only edits. Existing full-suite collection/Favorites, auth/profile/review/library/recommendation coverage passed. Catalog calls were faked, not live-provider evidence; simulated state changes do not prove real engine concurrency.

Targeted Pint `--test` passed for 13 M4.2 PHP files (model/service/controllers/requests/resources/migration/tests/routes). `php -l` passed for all 19 changed/untracked PHP files, including bootstrap and preserved M4.1 files. Existing unrelated bootstrap formatting was retained; its functional diff only expands the existing social route-name scope. `git diff --check` passed. At this backend-verification stage the frontend/Catalog implementation and dependencies were unchanged; subsequent frontend evidence follows below.

Frontend implementation (2026-11-26): existing CollectionForm/Editor now supports explicit visibility, private defaults, actual edit visibility and public-access explanation. Favorites remains uneditable. Existing `useAccess` supplies permissions: restricted public editors offer a visibility-only withdrawal, with metadata editing available after withdrawal; save choices block public additions but retain permitted removals. CollectionCard reuses poster previews in owner and public modes; owner cards/details show actual visibility and public-page links. Owner DTOs add visibility and PATCH supports partial values; existing create-then-save, memberships, CSRF and recommendation synchronization remain.

PublicProfilePage retains its three-field identity and review-return link, mounting paginated PublicProfileCollections only after profile success; authoritative parent errors unmount collection content. `/collections/:id` is lazy-loaded in the existing public/verification shell with a page title, creator profile/back links, paginated MovieCards, metadata fallbacks and no collection-owner controls. Invalid IDs/pages, loading, empty, unavailable, rate-limit and recoverable failures have explicit states. Public DTOs stay separate from owner DTOs. Pagination can preserve profile navigation state without changing existing callers' behavior. Movie details additionally accepts local public collection return paths, preserving collection pagination and rejecting external paths.

Public keys use `['public-collections','author',userId,page]`, `['public-collections','collection',collectionId]`, and that collection prefix plus `['movies',page]`. Public queries are cancellable, `staleTime: 0`, `gcTime: 0`, no automatic retries, and revalidate on navigation/window focus; public identity also revalidates on focus. Error states take precedence over retained data. Confirmed writes cancel matching author/detail/movie requests, remove inactive matching caches and reset active observers before revalidation (removal alone can leave observer results visible). Other members/collections are unaffected. Profile edits invalidate matching public creator/list projections. Existing auth cleanup clears these queries on account transitions. No optimistic publication, polling, WebSockets or persistent browser storage was added. Each subsequent request checks server authorization; information already delivered to another browser cannot be retroactively erased.

Frontend verification (2026-11-26): `npm test -- --reporter=dot` passed **292 tests across 21 files** (269 baseline + 23 focused cases); `npm run lint`, `npx tsc -b --noEmit`, and `npm run build` passed. Focused coverage includes public/Core paths and cancellation, visibility/defaults/Favorites, restricted controls, create-then-save API sequencing, projections/navigation/pagination, movie return-path safety, parent unavailable states, metadata failures, active-observer reset, aborted late response protection, targeted mutation/profile invalidation, auth cleanup and public route guards. Existing assertions are retained; owner fixtures now include visibility and the M4.1 focus-policy assertion reflects intentional focus revalidation. Tests use Node server rendering/query observers, not live browser interaction.

**Developer-performed runtime migration verified in the 2026-11-26 handoff:** PostgreSQL 18, local `vybe-core-postgres-dev` / `vybe_core` on 127.0.0.1:55435, no DB_URL override. The developer independently checked the connection/container match and applied from `backend`:

```powershell
php -d extension=pdo_pgsql artisan migrate --path=database/migrations/2026_11_25_000001_add_visibility_to_collections.php
```

Reported result: `78.68ms DONE`, migration status `[2] Ran`; Favorites IDs 1 and 2 preserved with private visibility. The developer elected to proceed without a backup for this small additive local change. This is developer-performed local PostgreSQL migration evidence, not PostgreSQL test-suite/CI acceptance. The agent did not rerun migrations, change database/Docker configuration or mutate application data.

Read-only live verification (2026-11-26): Frontend 5173, Core 8000 and Catalog 8001 health returned `200` (Catalog required one retry after an initial timeout). Author collection lists for existing members 1/2 returned `200`, zero public rows/totals; Favorites details 1/2 and Favorites-1 movies returned `404`; a valid nonexistent collection returned `404`, malformed `01` returned `422`. Core collection probes carried `no-store, private`. No public collection exists in the checked lists, so successful live public detail/movie rendering and publish/withdraw transitions were not verified. No accounts/authentication requests or collection mutations were submitted by these probes. Backend source hashes match the frontend task's starting snapshot.

Computer Use attempt (2026-11-26): browser inventory was empty with `The browser access host is unavailable`. No alternative control mechanism or screenshots were used. Complete live journey remains pending using an approved local test account: create private collection, add movies, verify public absence, publish, verify profile/detail/movie contents as owner and guest/other member, withdraw and revalidate public denial while owner retains memberships; verify Favorites/private controls. Automated mutations require separate operator authorization. Browser responsive geometry/focus/keyboard checks at 390/768/1024/1440 px and existing movie/private collection regression acceptance remain pending. PostgreSQL/MySQL CI, actual concurrency and live-provider acceptance remain open. M4.2 is not fully accepted.

Subsequent developer report (2026-11-26, collection save-button task): M4.2 manual local testing succeeded. This records developer acceptance separately from the earlier agent read-only probes and does not claim automated browser/responsive, PostgreSQL/MySQL CI or external-provider acceptance.

Collection save-button follow-up (2026-11-26): movie details now shows plus/“Save to collection” or the existing purple active style/check/“Saved to collection” from actual custom membership flags. An owner/movie-scoped aggregate reuses the existing preview-free paginated owner queries and their in-flight requests, excludes system collections/Favorites and stops at the first matching custom collection. It checks subsequent pages before declaring unsaved, revalidates on navigation/focus, and uses existing owner-list mutation invalidation/account cleanup. Failure to complete a read is an error rather than a negative membership result. Dialog access remains unchanged in both states; no direct removal toggle. Confirmed custom add/remove and create-and-save callbacks supply “Added to collection.” / “Removed from collection.” below the button using existing feedback styles; Favorites and failed writes do not emit custom feedback. No CSS, API, backend, authentication or recommendation changes.

Follow-up automated verification: frontend `npm test -- --reporter=dot` passed **300 tests across 22 files** (292 previous + 8 focused cases). `npm run lint`, `npx tsc -b --noEmit`, `npm run build` and `git diff --check` passed. Focused tests cover rendered state/feedback/accessibility, Favorites exclusion, pagination and request deduplication, multiple memberships/final removal after revalidation, dialog success callbacks including create-and-save, failed writes and account-specific keys/read failures. These are Node rendering/query-observer/mutation-boundary tests; they are separate from developer-reported M4.2 manual acceptance and do not establish visual acceptance of the new button.

Final PR review (2026-11-26): live read-only `git ls-remote` confirmed remote `dev` and feature HEAD both at `81bda53effa97b07364509259dc7dd9eeca49dd5`; no base drift, staged changes or unresolved merge entries. All 57 proposed files (32 modified, 25 new) were inventoried and scanned; no contribution environment files, credential-pattern hits, private data dumps, dependencies or generated artifacts were identified. The three application `.env` files are Git-ignored. No full-width shell/header/hero changes are present; AppLayout changes only add social page titles. No implementation changes were made during final review.

Final verification, distinct from historical passing runs above: frontend **300 passed / 22 files**, Oxlint (`npm run lint`), TypeScript and build passed; repository tooling does not configure ESLint. Core full suite on preflight-verified isolated SQLite: **584 passed, 1 failed, 2 opt-in live Firebase skipped** (587 total, **5,496 assertions**). The failing unchanged `RecommendationsTest::test_all_exclusions_cache_revision_signals_and_cross_user_isolation` expects six sections at line 65 but gets five. Its fake hardcodes similar references 1/3 (line 22), while unchanged RecommendationService rotates daily (line 35), choosing reference 2 on November 26. A focused repeat failed at the current clock; a temporary bootstrap pinning November 25 passed (1 test, 23 assertions). This diagnostic is not a clean full-suite result. All social backend tests independently passed (**54 tests, 819 assertions**). Before PR submission, make that recommendation fixture date-independent in an approved isolated test-only correction and rerun the unmodified full-suite command. No test or ranking logic was changed during this frozen-scope review.

All 19 proposed PHP files passed syntax checks. Pint passed for 18; `bootstrap/app.php` reports five existing formatter categories, reproduced by running Pint against a temporary copy of the original `81bda53` file. Its new social handling is route-scoped; baseline-only formatting is not silently rewritten. `git diff --check` passed. That review's readiness was **READY AFTER SPECIFIC CORRECTIONS** because the Core regression gate was red; the authorized correction and current result follow below. Developer-reported manual M4.0–M4.2 acceptance is retained separately; no specific responsive or restricted-account manual matrix is inferred. Team review/CI, PostgreSQL/MySQL suites, true engine concurrency, live-provider and agent browser evidence remain outstanding. No running database migration was repeated.

Authorized pre-PR test-only correction (2026-11-26): `RecommendationsTest.php` now copies candidate source metadata from the actual fake Catalog request instead of hardcoding similar references. A data provider runs the full existing six-section/exclusion/cache/preference/cross-user assertion set with opposite strongest-film orders, covering selected references 1 and 2 regardless of which daily index is active. The Loved section must also match the actual requested reference. No assertions were removed/weakened, no tests skipped and no application/global/test clock override added. RecommendationService/ranking, all M4 social application code, authentication, dependencies and runtime configuration remain unchanged.

Corrected verification: recommendation suite **7 passed, 71 assertions**, including both reference-order cases; ordinary full Core suite **586 passed, 2 opt-in live Firebase skipped, zero failures** (**588 total, 5,541 assertions**), without any diagnostic bootstrap/clock override; focused social suite **54 passed, 819 assertions**. Execution used the preflight-verified disposable SQLite environment and existing database guards; no runtime migration command was executed. Correction syntax/Pint and `git diff --check` passed. Frontend's prior final result remains 300 passed with lint/typecheck/build passed; frontend code is unchanged by this correction. The reviewed 57-file social inventory remains intact; the recommendation test is one additional modified file and should be committed separately. Remote `dev` was reconfirmed at `81bda53effa97b07364509259dc7dd9eeca49dd5`. Current assessment: **READY FOR PR**, subject to the disclosed nonblocking baseline bootstrap formatting and remaining CI/provider/browser/engine limitations. Nothing was staged, committed, pushed or published.

## Future M4 direction

| Phase | Direction; not an implemented contract |
| --- | --- |
| M4.2 remaining acceptance | Backend/frontend and developer-applied local migration are implemented, with developer-reported manual local acceptance. Agent browser/responsive evidence and team review/CI remain. |
| M4.3 public discovery | Simple bounded pagination, existing collection UI and Catalog summaries. Add public profile collection/review sections in suitable slices to complete the university requirements. No initial trending algorithm or speculative filters. |
| M4.4 follows | Core relational pairs, uniqueness, no self-follow, idempotent operations and paginated lists with derived counts. Approve detailed account-state and graph-visibility policy before implementation. |
| M4.5-M4.6 feed/privacy | Investigate a derived feed first. Enforce controls before exposure, explicit consent/publication boundaries and no automatic backfill of private history. Preserve source moderation/deletion behavior. Add activity persistence only if accepted semantics require it. |
| M4.7 acceptance | Verify regression, privacy/security and responsive browser journeys incrementally; final integrated acceptance covers objectives 8 and 9. |

Deferred decisions: collection/follow target eligibility and graph exposure; exact withdrawal operations; public collection/review pagination; publication/republication and consent timestamps; rating edits and repeated-event semantics; feed schema/cursor/indexes; blocking and retention effects. These must be settled before their surfaces ship, without delaying the approved minimal M4.1 identity slice. Existing review behavior is not silently redefined.

No M4.1 schema/deployment change is required. Later additive migrations must preserve existing data and database compatibility, default private, and precede dependent Core/frontend releases. No cross-database relationships. Verify current Azure mapping before assigning IDs; historical #57 / S08-01 is not evidence of the current board state.
