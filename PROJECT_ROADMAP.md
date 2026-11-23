# VYBE — Master Project Roadmap and Requirements Tracker

> **Project:** Modern Movie Discovery & Social Platform · **Course:** WEB2 / PROG303-EC10  
> **Roadmap version:** 2026-11-23 · **Repository baseline reviewed:** `hsn-bachir/VYBE`, remote `dev` at `26d66438729c`\
> **Course source:** `Web2_CCE_Project.pdf` (5-page university project brief, Sections 3–7).  
> **Purpose:** A shared, living plan for the four-person team and AI coding assistants.  
> **Agent onboarding:** [docs/AI_AGENT_PLAYBOOK.md](docs/AI_AGENT_PLAYBOOK.md) · [AGENTS.md](AGENTS.md) · [CLAUDE.md](CLAUDE.md)

## How to use and maintain this roadmap

This file tracks **implemented product scope**, **missing PDF obligations**, **verification gaps**, and **planned work**. The PDF's 11 numbered objectives are the requirements baseline. **M4–M8 below are the team's proposed delivery phases, not official university milestones.** Previous branch/PR descriptions may use “M4” to mean the Firebase/PostgreSQL migration; that historical label does **not** mean the Social phase is implemented.

**Source-of-truth precedence:** current checked-out code + tests + migrations + API contracts; merged PRs on `dev`; dated feature reports; this roadmap; older checklists/proposals. If they conflict, investigate and update documents. “Merged” proves code integration, **not** live-provider verification or release readiness. Do not mark a feature complete solely because its plan or tests exist. Never silently assume local unpushed work is reflected here.

Status legend:
- **✅ Implemented** — code exists in the reviewed `dev` baseline. Production/integration acceptance may still be open.
- **🟡 Partial** — part of the PDF objective is implemented, with explicit remaining scope.
- **⬜ Not implemented** — no complete implementation verified in the reviewed baseline.
- **🔬 Acceptance pending** — implementation exists; real environment/security/performance verification required.
- **📋 Planned** — agreed direction, not an implemented feature or approved API contract.

**Update this file in every relevant PR**: move status only after code and tests are present; link new contract/report/PR; add unresolved decisions or acceptance gaps. Update associated old milestone checklists where they contradict shipped functionality. The university PDF's eight-week outline is **relative**, not confirmed calendar dates; assign actual owners/dates in Azure Boards after agreement.

## 1. Executive snapshot

**What the team has built:** React/Vite/TypeScript movie UI; Laravel Core API + independent Laravel Movie Catalog microservice; TMDB popular/search/details, advanced browsing and upcoming; Firebase-based email/password and Google/GitHub login; private library/collections; ratings/reviews/spoilers; private profiles; admin accounts/moderation/reports; personalized For You; performance/UI refinements; PostgreSQL compatibility work.

**What is still required by the PDF:** public/private lists and discovery, public profiles, follows and activity controls/feed, complete Movie Night Planner, all five third-party integrations, and missing movie/activity analytics and local movie data management in the admin dashboard. End-to-end live acceptance and reviewed release promotion are still outstanding.

**Branch verification at snapshot:** Discover PR **#31** merged into `dev` on 2026-11-13; FYP PR **#32** merged into `dev` on 2026-11-13. Release PR **#33** (`release/dev-to-main` → `main`) was **open, not merged** when checked on 2026-11-21. `main` therefore must **not** be treated as equivalent to `dev`. Recheck live PR state before any release action.

**Top next slice:** M4.0 social contract/privacy audit → M4.1 public profiles + collection visibility. Do not begin a large all-in-one social implementation without agreeing its privacy model.

## 2. PDF requirement coverage — all 11 objectives

| PDF §3 item | University requirement | Current `dev` evidence | Status | Remaining / release gap |
|---|---|---|---|---|
| **1** | Registration/login/logout, password, profile, authorization, social sign-in | Core/Firebase auth + Google/GitHub, private profile, role/status management | ✅ / 🔬 | Complete live Firebase email, provider, session, password, invitation and multi-browser acceptance; production security settings. |
| **2** | Movie fields, search, filtering, sorting, detail page | Movie DTOs, details/experience, Advanced Discover | ✅ / 🔬 | Live TMDB combinations and data completeness checks. |
| **3** | TMDB external API: popular/upcoming, movie details, people/genres/posters/ratings | Catalog TMDB client, cached summaries/details/experience, Home Coming Soon | ✅ / 🔬 | Validate live release dates, provider failures and credits coverage. |
| **4** | Ratings, own reviews CRUD, other reviews, averages, admin moderation | Ratings + aggregated histogram, review CRUD/spoilers, moderation | ✅ | Final permission/concurrency and cross-browser acceptance. |
| **5** | Watchlist add/remove/view, watched marks and history | Core library + React Library | ✅ | Test full lifecycle with real DB/session at release. |
| **6** | Recommendations from watched, ratings, favorite genres, actors/directors, similarity | M3.3 For You: preference/scoring/Catalog candidates/six conditional sections | ✅ / 🔬 | Measure real TMDB latency, genre/credits coverage and recommendation relevance. |
| **7** | **Weather**, **Maps/geolocation**, **sentiment**, **calendar**, **real-time discussion rooms** | No completed feature integration identified in reviewed `dev` | ⬜ | Implement five independently testable integrations (M6). TMDB alone does not satisfy this separate item. |
| **8** | Custom movie lists, descriptions, public/private, browse public lists | Private collections/Favorites CRUD and memberships | 🟡 | Visibility policy, sharing, public browse/detail and access controls (M4). |
| **9** | Follow/unfollow, counts/lists, public profiles/reviews/lists, followed-user activity, user activity visibility | Private profile and public review author projection only | ⬜ / 🟡 foundation | Public social identity, relationships, activity feed/controls (M4). |
| **10** | Movie-night date/time/location/link, invitations, shortlist, voting/winner, RSVP, final details | Not present in reviewed `dev` | ⬜ | Implement complete workflow (M5). |
| **11** | Admin KPIs: registered users, reviews, top watched/rated/genres, activity; user/admin moderation; local movie data management | Admin user management, moderation, platform KPIs and movie rankings through M7.3 | 🟡 | M7.4–M7.5 are verified on the feature branch. Scoped movie-data tools and operational hardening remain open. |

PDF source: §3 Objectives, pages 1–3. The brief also requires clean architecture/security/privacy, runnable application, documentation/report and a live demo (§§4–5, pages 3–4). The rubric emphasizes **Laravel/MVC, microservices, incremental delivery, teamwork and maintainability** (§6, page 4).

## 3. Delivered work by existing milestone

| Workstream | Evidence / current implementation | Remaining acceptance |
|---|---|---|
| **M1 — Foundation** | Monorepo; feature→`dev` PR flow; separate Laravel Core/Catalog; React app; TMDB popular/search/details; internal Catalog token; caching; normalized movie summaries; basic auth. | Full clean-clone run, CI/release and instructor confirmation of microservices presentation expectations. |
| **M2.0 — Contracts & batch metadata** | Core→Catalog authenticated HTTP and cache-only bounded movie summaries | Revalidate contracts at integration release. |
| **M2.1 — Library & movie experience** | Watchlist, watched history, trailer, cast, directors, related movies; server-owned writes and personal view | Real environment smoke/reliability. |
| **M2.2 — Collections** | Create/edit/delete private lists and memberships | **Public/private visibility and public browse still absent** (PDF item 8). |
| **M2.3 — Ratings** | Integer 1–5 personal ratings and VYBE aggregates; preserves TMDB rating distinction | Real DB/provider journey. |
| **M2.4 — Reviews** | Own CRUD, public listing, spoilers | Integration/privacy checks. |
| **M2.5 — Private profiles** | Username/bio, stats, avatars | **Public profiles still absent**; storage/delivery acceptance. |
| **M2.6 — Release acceptance** | Documented plan | 🔬 Not signed off; keep open. |
| **M3.0/M3.1 — Administration** | Role/status permissions, user creation/invitations, profile updates, password/reset flows, audit, ban/restrict/deactivate | Hard-delete retention decision; MFA/additional admin protection; SMTP; full DB/release acceptance. |
| **M3.2 — Trust/moderation** | Report flow, review visibility/spoiler controls, moderator interfaces | Real browser/DB concurrency acceptance. |
| **M3.2.5 — UX/performance** | Faster loading flows and compact admin; targeted measurements/reports | Production-like latency and EXPLAIN as needed. |
| **M3.3 — For You** | `GET /api/v1/me/recommendations`; private preference/scoring/exclusion/cache; bounded Catalog candidate endpoint; conditional Top/Loved/Watchlist/Genre/Actor/Creators sections; PR #32 merged | 🔬 Live-provider timing/quality/credits and high-activity users. Reported fixture timings **not** production timings. |
| **Advanced Discover** | Popular/Trending/Top Rated/Now Playing/Upcoming, genre/year/rating/runtime/language filters, sort, URL pagination, compact full-width filtering UI; PR #31 merged | 🔬 Live provider behavior and responsive regression checks. |
| **Identity modernization** | Firebase email/password and Google/GitHub, Laravel session exchange; PostgreSQL compatibility migration/test work | 🔬 Live OAuth/email/SMTP/session acceptance; deployed DB configuration/data migration must be validated separately. |

Core status evidence includes `docs/development/m2.*-report.md`, `m3.*-report.md`, `advanced-discovery-report.md`, `docs/api/recommendations.md`, `docs/development/firebase-*.md`, and `docs/development/neon-*.md`. **Historical checklists contain stale “M3.3 proposed” or “OAuth out of scope” statements; do not copy them forward as current facts.**

## 4. Proposed remaining roadmap — work in vertical slices

Each slice should have: owner, issue/task in Azure, approved API/security contract, API/DB/UI implementation, tests, responsive/browser acceptance, docs, and a reviewed PR to `dev`. Items are **not done** until these gates are met. API route names below are **design topics**, not already approved routes.

### M4 — Social foundation & sharing (next; PDF items 8, 9)

**Goal:** Let people share selected movie activity safely without exposing private lists, private histories or emails.

| ID | Work | Status | Dependencies / acceptance |
|---|---|---|---|
| **M4.0** | Privacy/visibility contracts + schema/permissions design | 📋 | Define public profile fields; list default visibility; who can see reviews, activities, follows; migration/backfill; block/banned behavior; index/ownership rules. |
| **M4.1** | Public profiles | ⬜ | Separate safe public projection from private profile; username/id lookup; stable not-found/hidden states; no emails, tokens, secrets, private counts unless allowed. |
| **M4.2** | Collection visibility | ⬜ | Explicit `public`/`private` selection with **existing lists private by default**; owner permissions; unique URLs; no accidental public Favorites; transition privacy tests. |
| **M4.3** | Public collection discovery | ⬜ | Browse public lists/authors, bounded pagination, safe movie-summary enrichment through Catalog; direct private link must not disclose data. |
| **M4.4** | Follow/unfollow users | ⬜ | User-scoped relations, unique follower/followee, no self-follow, transactional idempotency/concurrency, counts/lists and pagination, optional visibility/block policy. |
| **M4.5** | Social activity feed | ⬜ | Followed-user reviews/ratings/public lists, bounded timeline, avoid N+1; activity-source model chosen explicitly; do not expose historical private actions by default. |
| **M4.6** | User activity visibility controls | ⬜ | Opt-in/opt-out rules and server-enforced visibility for each activity type; fan-out/cached-feed invalidation for privacy changes. |
| **M4.7** | Browser, security and integration acceptance | ⬜ | Cross-user matrix: guest, owner, follower, non-follower, restricted/banned; privacy toggle, deletion, pagination, race tests. |

**Suggested PR sequence:** `M4.0 + M4.1 + M4.2` (safe public surface), `M4.3 + M4.4` (discovery/follows), `M4.5 + M4.6 + M4.7` (feed/privacy); split further if reviews become large. Public profile need not depend on following; Movie Night must **not** be made dependent on following if PDF only requires invites to platform users.

### M5 — Movie Night Planner (PDF item 10)

**Goal:** End-to-end event planning, invitations, shortlist, voting and final result.

| ID | Work | Status | Dependencies / acceptance |
|---|---|---|---|
| **M5.0** | Domain design and state machine | 📋 | Hosts, invitees/roles, event timezone, date/time, optional physical location/meeting URL, deadlines, edit/cancel rules, permissions, deletion/retention. |
| **M5.1** | Create/edit/cancel and detail | ⬜ | Owner-only edits, validated future dates/timezone, timezone-safe API, sensible empty UI. |
| **M5.2** | Invite platform users | ⬜ | Target selection, duplicate/invalid invite handling, permission and notification decision. |
| **M5.3** | RSVP | ⬜ | Accept/decline, withdraw/participant state; enforce visibility of private event. |
| **M5.4** | Shared movie shortlist | ⬜ | Add/remove valid TMDB movie IDs, deduplicate, honor organizer/participant permissions; batch Catalog summaries. |
| **M5.5** | Voting and counts | ⬜ | Document one-vote/ranked-vote policy; transaction and unique indexes prevent duplicate votes; concurrency; accurate totals. |
| **M5.6** | Winner selection | ⬜ | Explicit tie-break, locked/finalized result, permission to finalize, re-vote policy. |
| **M5.7** | Final details and acceptance | ⬜ | All invitees see final event/winner per access rules; tests for RSVP, stale state, voting races, mobile flow. |

**Suggested order:** event skeleton → invitations/RSVP → shortlist/vote/finalize → full integration. Realtime or calendar are later integration improvements, **not substitutes for** a correct core workflow.

### M6 — Five third-party integrations (PDF item 7)

| ID | Required integration | Status | Minimum useful implementation / acceptance |
|---|---|---|---|
| **M6.1** | Weather-aware suggestions | ⬜ | Reliable weather provider via Core/server, user consent/location selection as appropriate, weather→movie selection with **honest** context; bounded caching/timeouts; do not distort all FYP scores silently. |
| **M6.2** | Maps/geolocation: nearby cinemas or movie places | ⬜ | Supported places/data provider, permission-based location or manual city, map/list fallback, no precise location tracking by default; provider attribution/rate limits. |
| **M6.3** | Review sentiment analysis | ⬜ | Classify reviews as positive/neutral/negative, moderate vs classify are distinct; provider or documented service method, async/bounded use, safe text handling, transparent errors and tests. |
| **M6.4** | Calendar | ⬜ | Add releases or movie-night events; pick **ICS export** vs authenticated provider sync based on instructor acceptance, consent and scope. ICS alone may not satisfy “Calendar Integration” if instructor expects a real API; confirm before deciding. |
| **M6.5** | Real-time **movie discussion rooms** | ⬜ | Authenticated rooms, WebSockets or approved equivalent real-time tech, membership/moderation, safe message handling, reconnect state. **Voting refresh alone does not satisfy this PDF requirement.** |
| **M6.6** | Provider acceptance | ⬜ | Separate service credentials, request limits, fallback and privacy; integration demos, manual provider checks and tests with fakes. |

### M7 — Administration completion (PDF item 11)

M7.1–M7.3 are in `dev` at `9a9c8d5` (PR #35). M7.4–M7.5 are verified on `feature/m7-genre-activity-analytics`. See the [API contract](docs/api/admin-movie-insights.md), [M7.1–M7.3 report](docs/development/m7.1-m7.3-report.md) and [M7.4–M7.5 report](docs/development/m7.4-m7.5-report.md) for acceptance evidence.

| ID | Work | Status | Minimum acceptance |
|---|---|---|---|
| **M7.1** | Dashboard total reviews & activity KPIs | ✅ | Administrator-only totals for accounts, stored reviews, VYBE ratings and watched entries. Existing moderation counts remain available to both privileged roles. |
| **M7.2** | Most-watched movies | ✅ | Top 10 by distinct members, with one shared Catalog summary batch and count-preserving fallbacks. |
| **M7.3** | Most highly rated movies | ✅ | Top 10 by Bayesian confidence, with raw VYBE community averages and rating counts on the 1–5 scale. |
| **M7.4** | Most popular genres | ✅ | Watched-entry rankings for up to 50 top movies, with one cache-only Catalog batch and explicit cohort and metadata coverage. |
| **M7.5** | User activity metrics | ✅ | Zero-filled 7/30/90-day UTC trends and distinct active contributors based on retained Core records. |
| **M7.6** | Local movie-data management | ✅ / 🔬 | Local browse/search/health filters, metadata inspection and audited manual refresh. [Report](docs/development/m7.6-report.md). Instructor confirmation of full rubric scope and live-provider acceptance remain open. |
| **M7.7** | Admin operational hardening | ⬜ | Resolve hard delete vs retention/audit, confirm invitations/SMTP, MFA or additional admin protection, role security and audit review. |

### M8 — Integration, delivery and final presentation (PDF §§4–7)

| ID | Release gate | Status | Acceptance evidence |
|---|---|---|---|
| **M8.1** | Requirement-by-requirement PDF audit | ⬜ | Every row of §2 mapped to code, test and demo; no silently dropped obligation. |
| **M8.2** | End-to-end cross-service demo | 🔬 | React → Core → Catalog → TMDB; real auth, movie details, social, movie night, integrations. |
| **M8.3** | Database readiness | 🔬 | Separate **disposable** PostgreSQL test databases or the chosen production engine; migration up and safe rollback, permissions, indexes, concurrency. Do not wipe shared DBs. |
| **M8.4** | Live external integrations | 🔬 | Real TMDB/provider tests, errors, 429 and outages, attribution, privacy, real dates/times. |
| **M8.5** | Firebase/mail/security | 🔬 | Provider login, verification/reset, invitations/SMTP, cookies, CSRF, session revocation, admin controls, privacy matrix. |
| **M8.6** | Performance/load/accessibility | 🔬 | Cold/warm FYP, cached Discover, pagination/large history, SQL/HTTP counts, UI at 390/768/1024/1440px, keyboard/reduced motion. |
| **M8.7** | Documentation and operations | ⬜ | Clean clone setup, env examples, system diagrams, OpenAPI/contracts, ownership, teammate onboarding, test/dev instructions. |
| **M8.8** | Release `dev` → `main` | 🔬 | PR #33 or replacement reviewed after current scope/CI is verified; avoid history-reconciliation shortcuts/force pushes. |
| **M8.9** | University demo and report | ⬜ | Scenario-led demonstration, proof of two-service separation, incremental PR/sprint history, safe demo accounts and contingency plan. |

## 5. Dependencies and work allocation

```text
M1–M3 implemented baseline
    ├── M4 public profiles + visibility ──> follows ──> activity feed
    ├── M5 events/invites ──> shortlist/votes/winner
    │                         └── M6 calendar (can reuse event dates)
    ├── M6 weather / maps / sentiment / real-time discussion (parallel slices)
    └── M7 admin aggregates and Catalog-owned movie tools
                                      ↓
                          M8 full integration/release
```

- Team of four: assign **one accountable owner and one reviewer** per workstream/PR. Avoid two developers editing the same routes/clients simultaneously.
- Suggested parallel tracks after M4.0: **Social**, **Movie Night**, **Integrations**, **Admin/acceptance**. Coordinate shared User, route, auth and layout changes before starting.
- Use Azure Boards with each milestone as an epic/feature and IDs above as tasks/stories. Add real assignee, target sprint, dependencies, acceptance checks and PR link before marking **Done**.
- Recommended first item: M4.0 privacy/contract design, because public-by-default mistakes can expose existing private collections and historical activity.

## 6. Non-negotiable architecture and UX constraints

1. **React browser → Core API → Catalog API → TMDB.** The browser never calls Catalog or TMDB; Core never queries Catalog's DB; Catalog never reads Core users. Use versioned DTOs and server-only internal token.
2. **Core owns identity and user-generated state:** Laravel Sanctum session, Firebase UID association, users, library, ratings, reviews, social graph, events, votes, moderation, personalized ranking.
3. **Catalog owns movie metadata:** TMDB client, normalization, movie table, credits, provider-ranked caches and recommendation candidates. No personalized user data is stored in Catalog.
4. **Privacy before convenience:** owner-scoped writes, safe public projections, private-by-default migration of existing collections/activity, no leaks in cache/query keys/DTOs, safe handling of banned/restricted accounts.
5. **Premium VYBE UI:** approved violet ribbon logo, dark `#0B0D12` page and `#171B24` surfaces, violet `#8B5CF6`, pink `#EC4899`, light `#F8F7FF`, muted `#A1A1AA`; posters are focal; don't build admin-dashboard-looking discovery filters. Reuse `MovieCard`, grids, UI primitives, React Bits motion and design tokens.
6. **Performance:** user-scoped indexed queries, bounded pagination and candidate sets, batch Catalog summaries, cached provider pages, avoid N+1 and per-card/per-movie detail hydration. Test actual geometry as well as logic.
7. **No regression as the price of a feature:** preserve Home, Discover, FYP, rating UI, movie interactions, security and responsive layouts; independent frontend/backend integration tests.

Full instructions: [docs/AI_AGENT_PLAYBOOK.md](docs/AI_AGENT_PLAYBOOK.md), [docs/design/design-system.md](docs/design/design-system.md), [docs/architecture/backend.md](docs/architecture/backend.md), [docs/architecture/frontend.md](docs/architecture/frontend.md).

## 7. Active risks, unknowns and decisions

| Item | Decision / action needed | Owner / state |
|---|---|---|
| Instructor microservices expectations | Confirm that independently runnable Core + Catalog satisfy the rubric/deployment demonstration. | **Open** |
| Existing collection privacy | Introduce explicit visibility; default/backfill existing collections **private**; decide system Favorites behavior. | **M4.0** |
| Social exposure/retention | Profile fields, follows visibility, rating/review/list activity privacy, moderation and deletion semantics. | **M4.0** |
| Movie Night policy | Vote rules, invitation permissions, timezone, finalization, tie behavior. | **M5.0** |
| Calendar provider | Confirm whether ICS export is sufficient or real OAuth/API sync is expected. | **M6.4** |
| “Local movie data management” | Agree allowed administration actions without crossing Catalog ownership. | **M7.6** |
| Admin deletion and MFA | Preserve audit/report records; secure privileged access; verify invitation delivery. | **M7.7** |
| Database/platform | Local/hosted PostgreSQL and historical MySQL/MariaDB documentation differ; inspect current `.env.example`, actual DB connection, CI and migrations. No automatic data migration implied. | **M8** |
| Live FYP and provider coverage | Fixture benchmark in `m3.3-recommendations-report.md` is **not** provider latency; check sparse credits and high-history cases. | **M8** |
| Release branch state | `main` behind `dev`; PR #33 open at snapshot. Check actual ref, conflicts and CI before changing. | **M8** |
| Old docs | `milestone-1/2/3-checklist.md`, older architecture files and agent guides may retain historical status. Update in focused docs PR. | **Ongoing** |

## 8. Definition of Done (applies to every roadmap item)

- [ ] Scope mapped to the relevant PDF requirement; privacy/security and domain owner agreed.
- [ ] Current code inspected; changes follow existing architecture/UI without unnecessary rewrites.
- [ ] Core/Catalog public/internal contracts and migrations updated where applicable; deployment order recorded.
- [ ] FormRequest validation, authorization, owner-scoped DB operations, safe error behavior and rate limits covered.
- [ ] Positive, negative, edge, cross-user and concurrent tests added where relevant; provider HTTP faked.
- [ ] Frontend keyboard, responsive, reduced-motion, loading/empty/error/retry and real geometry tested.
- [ ] Relevant PHP suites, frontend test/lint/typecheck/build and `git diff --check` executed; actual results captured.
- [ ] API docs, roadmap, sprint/issue and test/acceptance report updated.
- [ ] PR targets `dev`; CI and human review pass; no secrets/fixtures/logs leaked.
- [ ] Real-provider/integration gaps are listed explicitly if acceptance cannot be completed.

## 9. Progress updates — template

Copy this into a PR description or new entry in the relevant `docs/development/*-report.md`:

```md
### [ID] [Feature] — [date] — [branch/PR]
- Status: Planned / In progress / Code complete / Accepted / Blocked
- PDF objective(s): #...
- Owner / reviewer: ...
- Implemented: ...
- Files/contracts/migrations: ...
- Checks actually run: ...
- Browser/API evidence: ...
- Unverified: ...
- Decisions made: ...
- Next dependency: ...
```

**Next action at this snapshot:** Review and approve M4.0 visibility/privacy choices, then create a focused feature branch **from current `dev`**. Check whether it already exists before `git switch -c`; do not repeat the previous branch-ordering mistakes.
