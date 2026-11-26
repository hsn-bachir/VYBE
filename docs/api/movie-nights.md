# Movie Night Planner — M5.0–M5.6 backend contracts

PDF §3 item **10**; roadmap **M5.0 + M5.1 + M5.2 + M5.3 + M5.4 + M5.5 + M5.6**. Core owns all event, participant and voting data. **M5.1 implements create/list/detail/edit/cancel; M5.2 adds user lookup and invitation creation/listing; M5.3 adds invitee RSVP; M5.4 adds the shared candidate shortlist; M5.5 adds voting/private totals; M5.6 exposes winner selection/finalization**, on `feature/movie-night`. Frontend and live acceptance remain for M5.7. M5.7.2 adds a frontend data/utilities foundation for these unchanged contracts; pages, navigation, components, notifications and live acceptance remain pending. See the [frontend foundation report](../development/m5.7.2-movie-night-frontend-foundation-report.md). See the [M5.1 verification report](../development/m5.1-movie-night-management-report.md).

## Implemented domain boundary

`MovieNight`, `MovieNightInvitation`, `MovieNightMovie`, `MovieNightVote`, backed enums, auto-discovered `MovieNightPolicy`, `MovieNightRules` and internal `MovieNightTransitions` form the foundation. M5.3 exposes the existing RSVP transition; M5.6 exposes the same foundation finalization transition through its public HTTP adapter. M5.1 adds `MovieNightService`, FormRequests, summary/detail Resources and a controller for five event-management routes. M5.2 adds `MovieNightInvitationService`, controller, FormRequests and safe participant/invitation Resources. M5.4 exposes shortlist nomination/removal; M5.5 exposes voting/totals. M5.6 exposes the shared finalization transition without duplicating winner calculation.

State machine: `scheduled → finalized` or `scheduled → cancelled`. Both terminal states are immutable through the domain permissions. Time passing does not change status: a scheduled event at/past its start has closed voting but can still be finalized or cancelled. Finalization requires a valid vote, not a Catalog response. There is no reopen, unfinalize, host transfer or delete operation.

The host is implicitly accepted and has one vote under the same unique key as invitees. Do not create a host invitation. No following relationship is required to invite a platform user. A valid historical vote belongs to the host or a currently accepted invitee; pending, declined and outsider votes are excluded from finalization. Later account moderation does not retroactively invalidate a previously cast valid vote; it prevents new actions. Restriction/banning of the host currently prevents finalization until account eligibility is restored; no administrative override is introduced here.

| Actor | Minimal invitation info | Full private event details | Edit / invite | Cancel / finalize | RSVP | Nominate / vote |
| --- | --- | --- | --- | --- | --- | --- |
| Active verified host | Yes | Yes | Before start | While scheduled, including after start | Implicit accepted | While voting open |
| Active verified accepted invitee | Yes | Yes | No | No | Before start while scheduled | While voting open |
| Active verified pending/declined invitee | Yes | No (404) | No | No | Before start while scheduled | No |
| Restricted verified host/accepted invitee | Yes | Yes | No | No | No | No |
| Restricted verified pending/declined invitee | Yes | No (404) | No | No | No | No |
| Guest / outsider / banned / deactivated / unverified / pending activation | No | No | No | No | No | No |

**Azure work item #90 privacy correction:** invitation membership is not full-detail authorization. `forMember` scopes host/all invitees for minimal listing and RSVP; `visibleTo` scopes only host/accepted participants for private details. `viewInvitation` and `view` preserve the same distinction and existing account eligibility gates. Direct detail requests from pending, declined and uninvited users return the standard hidden 404. Membership-based RSVP resolution deliberately retains declined-to-accepted transitions before the deadline. This supersedes earlier M5.0–M5.2 assumptions that every invitation grants private detail access.

The invitation roster remains host-only; invitees see their own received invitations, never other invitees. There is no moderator/admin bypass. Full-detail SQL scoping and the detail Resource's policy recheck both enforce current accepted status; raw models/related users are never serialized. Future shortlist, vote/tally and winner-detail reads must use host/accepted private authorization, not membership alone.

Voting/RSVP/nominations close at **now >= starts_at**, or on finalization/cancellation. Accepted invitees may change RSVP in either direction while open. Declining atomically removes their vote; accepting again does not restore it. RSVP `pending` is initial state only. A movie with votes cannot be removed; the host or original nominator may remove an unvoted movie while open. Declining does not remove nominations.

**Mandatory write protocol for subsequent phases:** transaction → `AccountAccess::lock(actor, community: true)` → load membership-scoped event with `lockForUpdate()` → state/deadline check → authorize against the freshly loaded actor/event → mutation. All event edits, invitations, RSVPs, shortlist changes, votes, cancellation and finalization must take the same parent event lock. Validate target eligibility under a fresh read when inviting. Do Catalog validation outside the lock and recheck everything inside it. Do not perform network calls while holding locks. The database unique keys are the final duplicate safeguard. Future vote changes use a scoped update/upsert under this protocol, never an unconstrained insert.

Finalization counts existing valid votes and chooses the sole highest-voted movie automatically. In a tie the host must submit a TMDB ID from tied leaders. No votes / unresolved tie return 409. An explicit nonleader returns 422. Winner ID, status and timestamp are saved together; subsequent finalization returns 409. These guarantees apply through the domain/write protocol, not arbitrary direct SQL. Database checks enforce coherent state fields but are not a historical immutability trigger. M5.1–M5.6 must not bypass this boundary.

## Schema

One additive Core migration, `2026_11_23_000001_create_movie_night_tables.php`, creates:

| Table | Fields beyond `id` and timezone-aware created/updated timestamps | Constraints / indexes |
| --- | --- | --- |
| `movie_nights` | `host_user_id`, title(150), UTC `starts_at`, IANA `timezone`(64), nullable location(500)/meeting_url(2048), status, nullable `finalized_tmdb_id`, `finalized_at`, `cancelled_at` | Host FK; `(host_user_id, starts_at, id)` index; scheduled/finalized/cancelled enum; PostgreSQL state consistency check |
| `movie_night_invitations` | `movie_night_id`, `invited_user_id`, `rsvp_status`, nullable `responded_at` | Event/user FKs; unique `(movie_night_id, invited_user_id)`; invitee/event index; pending/accepted/declined enum |
| `movie_night_movies` | `movie_night_id`, `tmdb_id`, `nominated_by_user_id` | Event/user FKs; unique `(movie_night_id, tmdb_id)` and `(movie_night_id, id)`; nominator index; PostgreSQL positive int32 TMDB check |
| `movie_night_votes` | `movie_night_id`, `movie_night_movie_id`, `voting_user_id` | Event/user FKs; unique `(movie_night_id, voting_user_id)`; composite FK `(movie_night_id, movie_night_movie_id)` → shortlist `(movie_night_id, id)`; totals and voter indexes |

All FKs use restrictive deletion, preserving event history and preventing voted-movie removal. Cancellation retains every row. No cross-service FK or movie metadata is stored. No user data is migrated/backfilled. RSVP/participation eligibility is enforced in domain logic, not a cross-table CHECK. Host self-invitation is prohibited by the M5.2 invitation service, not a DB constraint. PostgreSQL uses `timestamptz`; API writes use explicit UTC and keep the IANA zone for display/DST interpretation. SQLite tests cover foreign keys and enum checks; added ALTER TABLE range/state checks target PostgreSQL (and compatible MySQL), so SQLite alone is insufficient acceptance.

Apply the additive migration to **Core only** before later endpoint deployment using the normal reviewed migration process. M5.0 does not run it on development/hosted data. Rollback drops the four new tables in dependency order and loses their contents; only use rollback on disposable databases or under an approved retention plan. Hard deletion/retention policy remains a later product decision.

### UTC persistence fix (M5.0 review)

All four Movie Night models use `HasMovieNightUtcTimestamps`: Eloquent date writes normalize to UTC and PostgreSQL values include an explicit `+00:00` offset. PostgreSQL session-local timestamp strings are decoded using their returned offset and exposed as UTC dates. This covers `starts_at`, `finalized_at`, `cancelled_at`, invitation `responded_at`, and every Movie Night model's automatic `created_at`/`updated_at`, including `touch()`. SQLite/other drivers retain Laravel's normal SQL date format with UTC-normalized values. Existing second precision is preserved.

No global connection timezone, authentication behavior or migration changes are needed. Persist timestamp fields through these models (`save`/instance `update`/`touch`); raw SQL and bulk query-builder timestamp assignments bypass model conversion and must supply explicit-offset instants themselves. This fix prevents new timestamp shifts; it does not infer or repair any previously misinterpreted persisted instant.

Real PostgreSQL tests explicitly set the session to `Asia/Beirut`, exercise winter/summer offsets, inspect stored epoch values independently of Eloquent, and restore the original session timezone afterwards. Voting stays open immediately before the absolute start instant and closes exactly at it. Previously cast votes can still be finalized afterwards.

## HTTP conventions

Base `/api/v1/me/movie-nights`. Existing `web`, session/CSRF, `auth:sanctum`, `EnsureAccountAccess`, `EnsureVerifiedAccount`, `PreventAuthCaching` and library read/write throttles are reused. All writes additionally require active account status. All responses, including errors, use `Cache-Control: no-store, private`. No anonymous sharing, bearer auth, client-supplied actor/host/voter/nominator IDs or shared personalized caches.

Event IDs are canonical positive SQL integers up to `PHP_INT_MAX` (signed BIGINT on this 64-bit runtime); malformed IDs return 422. TMDB IDs are integers 1–2147483647. M5.1 FormRequests reject unsupported body/query fields; future endpoints must retain allowlists. Dates must be `YYYY-MM-DDTHH:mm:ssZ` UTC, future on create/edit; timezone must pass Laravel `timezone:all`. `MovieNightRules::eventFields()` provides reusable validation. A zone controls display; clients must resolve local/DST ambiguity to an instant before submitting. `title` is nonblank, max 150; optional location max 500; optional meeting URL max 2048 and HTTPS only. Meeting URLs are stored/displayed as links and never fetched by Core. No user may mutate status/winner/timestamps directly. PATCH allows only title/start/zone/location/URL, before the original deadline; omitted fields are unchanged and nullable fields may be cleared.

List requests use page 1–10000, per_page 1–50 (default 20); order events by starts_at then id, invitations by id, shortlist by id. Optional event `status` filter is one of the three states. Pagination envelope matches Core: `{data:[...],meta:{page,per_page,total_pages,total_results}}`. M5.2 enforces at most 200 invitations/event under the event lock, counting all RSVP states. M5.4 enforces at most 50 candidates/event under the event lock; a page accepts at most 50 entries to respect the Catalog batch limit.

| Method / relative path | Request | Success envelope | Authorization / special validation | Status |
| --- | --- | --- | --- | --- |
| POST `/` | `{title,starts_at,timezone,location?,meeting_url?}` | 201 `{data: Event}` | Eligible host; actor assigned from session | Implemented M5.1 |
| GET `/` | pagination, `status?` | 200 paginated Event summaries | SQL membership scope; no Catalog required | Implemented M5.1 |
| GET `/{night}` | — | 200 `{data: Event}` | Host or accepted participant only; pending/declined/outsider return 404; terminal events included | Implemented M5.1, corrected M5.3 |
| PATCH `/{night}` | Any editable event fields | 200 `{data: Event}` | Host; scheduled and before original start | Implemented M5.1 |
| POST `/{night}/cancel` | `{}` | 200 `{data: Event}` | Host; scheduled only; record cancelled_at; repeat 409 | Implemented M5.1 |
| GET `/{night}/eligible-users` | `query` username prefix, 3–30 chars, page/per_page | 200 paginated Participant projections | Eligible host; open; active verified nonpending users only; exclude host and already invited; no email lookup | Implemented M5.2 |
| POST `/{night}/invitations` | `{invited_user_id}` | 201 `{data: Invitation}` | Eligible host; open; eligible target; duplicate 409, self/ineligible/unknown target 422 | Implemented M5.2 |
| GET `/{night}/invitations` | pagination | 200 paginated Invitation | Host only, including restricted verified host; safe participant projections only; terminal events included | Implemented M5.2 |
| GET `/invitations` | pagination | 200 paginated ReceivedInvitation | Caller's invitations only, all RSVP/event states; restricted verified invitees may read | Implemented M5.2 |
| PUT `/{night}/rsvp` | `{rsvp_status:"accepted"\|"declined"}` | 200 `{data: Invitation}` | Invited actor only; open; identical repeats preserve timestamps; decline clears own vote atomically | Implemented M5.3 |
| GET `/{night}/movies` | page/per_page | 200 paginated ShortlistEntry, meta.metadata_unavailable | Host/accepted only; private 404 otherwise; terminal reads retained | Implemented M5.4 |
| POST `/{night}/movies` | `{tmdb_id}` | 201 `{data: ShortlistEntry}` | Eligible host/accepted actor; open; duplicate/capacity 409; Catalog detail validation | Implemented M5.4 |
| DELETE `/{night}/movies/{movie}` | — | 204 | Eligible host or accepted original nominator; open; voted entry 409; cross-event/missing entry 404 | Implemented M5.4 |
| PUT `/{night}/vote` | `{movie_night_movie_id}` | 200 `{data:{movie_night_movie_id,updated_at}}` | Eligible host/accepted actor; open; scoped shortlist candidate; identical repeat preserves timestamps | Implemented M5.5 |
| GET `/{night}/votes` | — | 200 `{data:{totals:[{tmdb_id,movie_night_movie_id,votes}],my_vote,total_votes,leaders:[tmdb_id],voting_open}}` | Host/accepted only; caller selection only; zero counts included; closed reads allowed | Implemented M5.5 |
| POST `/{night}/finalize` | `{tmdb_id?}` | 200 `{data: Event}` | Eligible host; scheduled even at/after start; at least one valid vote; sole leader automatic or explicit; tied leader explicit | Implemented M5.6 |

Place static subroutes before dynamic identifiers. The eligible-user search is scoped to an event so it cannot become an unsolicited public social directory. It has no notification side effects. M5.2 uses pull-based received invitations only; no notification delivery, email or WebSocket is required.

## Response projections

Participant: `{id,username,avatar_url}` only (used for host and invitation participants). Exclude email, bio, Firebase UID, roles, account status, credentials and personal activity. Invitation: `{id,participant:Participant,rsvp_status,responded_at}`. ReceivedInvitation adds `movie_night` using the role/RSVP-sensitive summary below. Location/meeting URL require the host/accepted-only event detail endpoint. The host is represented separately with implicit `accepted`, never as an invitation row.

Minimal invitation event summary (pending/declined): **exactly** `{id,title,host:Participant,starts_at,timezone,status,my_rsvp}`. It excludes location, meeting URL, finalized movie ID/timestamp, cancellation timestamp, voting-open state, event audit timestamps, shortlist, votes and all other private event data. This allowlist applies to both event listings and received invitations, including cancelled/finalized events.

Host/accepted Event summary adds `{finalized_tmdb_id,finalized_at,cancelled_at,voting_open,created_at,updated_at}`. Full Event detail adds `{location,meeting_url}` and requires host/accepted authorization. `my_rsvp` is accepted for host, otherwise the caller's own invitation state. Invitation creation and RSVP responses contain only the Invitation projection without a nested event. Separate invitation/shortlist routes avoid unbounded nested lists. Decline immediately revokes full-detail access and removes the actor's vote atomically; reacceptance restores private access while open but never restores the deleted vote.

ShortlistEntry: `{id,tmdb_id,nominated_by:Participant,created_at,movie:MovieSummary|null}`. Implemented `GET /{night}/movies` returns paginated ShortlistEntry with `meta.metadata_unavailable` in addition to pagination. Enrichment uses existing `MovieCatalogClient::summaries()` in one bounded batch of at most 50 IDs/page; cache misses keep the entry with `movie:null`. Catalog outage returns persisted entries with null enrichment and `metadata_unavailable:true`, never deletes rows. Final winner ID is authoritative independent of enrichment. Movie validation before *new* nominations uses existing `MovieCatalogClient::details()` and safe 404/503 translation (a cache-only `LibraryMetadata::confirm()` miss cannot establish whether an uncached movie is real); no Catalog call is needed for votes, RSVP or finalization. Never send event, user, location, RSVP or vote data to Catalog.

Error envelope follows Core `{message,code?}` and validation `{message,errors:{field:[message]}}`:

| Status | Meaning |
| --- | --- |
| 401 | Missing/expired session |
| 403 | Existing account/verification/active-state gates or known participant lacking action permission |
| 404 | Missing/private event or shortlist entry not belonging to visible event; unknown Catalog movie uses existing MOVIE_NOT_FOUND |
| 409 | Closed event/deadline; duplicate invite/nomination; voted-movie removal; event capacity; no valid votes; unresolved tie |
| 419 | CSRF mismatch; refresh session bootstrap then explicit resubmission |
| 422 | Invalid fields, ineligible target, RSVP pending, explicit nonleader winner |
| 429 | Existing read/write throttle; preserve Retry-After |
| 503 | Catalog unavailable for a new nomination; safe UPSTREAM_UNAVAILABLE |
| 500 | Safe generic INTERNAL_ERROR without private event details or provider diagnostics |

Event reads and tally/finalization must continue without Catalog availability. Endpoint adapters must scope membership before state checks to avoid existence leaks; separate temporal conflicts (409) from actor authorization (403). M5.1 tests its five HTTP adapters for middleware, CSRF, throttling, safe projections and database behavior. M5.2 tests its four invitation adapters and real PostgreSQL duplicate contention; later adapters and browser acceptance remain unimplemented/unverified.

## M5.1 implementation decisions and examples

M5.1 introduced these routes (base `/api/v1/me/movie-nights`): POST base (201); GET base (200); GET `/{night}` (200); PATCH `/{night}` (200); POST `/{night}/cancel` (200). Create/update/cancel return the detail projection. Lists return summaries; no hidden location or meeting URL in list rows. Details include the host and caller's `my_rsvp`, not a nested invitation/participant list: the separate host-only invitation endpoint is implemented in M5.2. There is no Catalog call on any of these operations.

Repeated cancellation returns **409**, as specified in the original contract. It is idempotent in its effect: status/timestamp/invitations are unchanged after the first cancellation. Finalized events cannot be cancelled. Cancellation of scheduled events is allowed after start. Updates are rejected at/past the original start, even if the submitted new start is in the future. State/deadline checks and policy authorization run under the parent event lock; submitted date validation is repeated inside the transaction to reject dates that became past while waiting.

Create requires title/start/zone. PATCH must contain at least one editable field; omitted fields are preserved, nullable location/meeting URL may be cleared with null. Optional whitespace-only fields normalize to null via the existing request middleware. A supplied start is required to use the strict UTC `Z` format; local or offset-based strings are rejected (422), not guessed from the display timezone. For example `2027-07-16T21:00:00` local Beirut summer time must be submitted as `2027-07-16T18:00:00Z` with `timezone: Asia/Beirut`. Standard Laravel response timestamps are ISO UTC with fractional seconds, e.g. `2027-07-16T18:00:00.000000Z`.

List queries accept only page, per_page and status. Detail/cancel accept no body/query fields. No client-supplied host/user/status/winner/internal timestamp fields are allowed. Pending-activation users receive 403 for listing/writes and a hidden 404 for detail. Restricted verified members may read their minimal summaries; only hosts/accepted participants may read full details; active-account middleware denies writes. Banned/deactivated/unverified accounts retain the existing 403 gates. Firebase UID mapping and session-version revocation remain in `EnsureAccountAccess`; the model policy alone is not a substitute for session middleware. No administrator or moderator bypass is introduced.

For every read, SQL scopes precede serialization: membership for minimal summaries, host/accepted visibility for full details. List host and caller-only invitation relations are eager-loaded in a bounded number of queries, without loading other invitees or per-event authorization queries. Lists are ordered by `starts_at ASC, id ASC`. The existing no-store/private cache and read/write throttle behavior also applies to error responses. Unexpected failures return the safe generic 500 envelope, including with application debug enabled.

## M5.2 implementation decisions and examples

See the [M5.2 implementation and verification report](../development/m5.2-movie-night-invitations-report.md). M5.2 introduced four additional endpoints; M5.3 brings the Movie Night route count to ten. The static received-invitations route precedes `/{night}`. RSVP is documented below.

- `GET /api/v1/me/movie-nights/{night}/eligible-users?query=cinema_&page=1&per_page=20` searches a normalized lowercase username **prefix**, 3–30 ASCII letters/digits/underscores. Underscores are escaped literally in SQL LIKE; `%`, email addresses and unsupported fields return 422. Results are ordered by username/id, SQL paginated, and exclude host, existing invitees and inactive/unverified/pending accounts. This is an event-scoped target selector available only to an eligible host before start.
- `POST /api/v1/me/movie-nights/{night}/invitations` accepts only `{ "invited_user_id": 42 }`. Success is 201 `{ "data": { "id": 7, "participant": { "id": 42, "username": "cinema_fan", "avatar_url": null }, "rsvp_status": "pending", "responded_at": null } }`. Host/actor IDs and RSVP are server-assigned. No email, Firebase identifier, status, role, bio or private account field is returned.
- `GET /api/v1/me/movie-nights/invitations?page=1&per_page=20` returns only the caller's received invitations with minimal event summaries for pending/declined RSVP and richer summaries for accepted RSVP under `movie_night`. All pending/accepted/declined invitations and scheduled/cancelled/finalized events remain visible. This endpoint neither accepts nor declines an invitation.
- `GET /api/v1/me/movie-nights/{night}/invitations?page=1&per_page=20` returns the host's safe invitation roster/statuses, ordered by invitation id. Invitees receive 403; nonmembers, including administrators, receive the same 404 as missing events. Restricted verified hosts retain read access; terminal and started events retain their roster.

All list responses use `{data:[...],meta:{page,per_page,total_pages,total_results}}` with page 1–10000 and per_page 1–50, default 20. Unsupported query/body fields are rejected. Lookup and invitation creation close at `now >= starts_at`; lists remain readable under existing membership/account gates. Unknown, ineligible and self targets receive the same 422 validation message. Duplicate invitations in any RSVP state return 409, preserving the original row/status/time. Capacity exhaustion returns 409.

Creation uses a retryable transaction (up to three attempts): lock/reload the actor through `AccountAccess`, lock the membership-scoped parent event, check lifecycle and authorize the fresh host, lock/read the eligible target, check duplicate/capacity, recheck the deadline after target-lock waits, then insert an explicit pending invitation. This shares the M5.0/M5.1 parent-lock protocol; cancellation and concurrent invitation writes serialize. The existing `mn_invitation_unique` database key is the final duplicate guard. Target locks serialize against account moderation; reciprocal host/target locks may deadlock and use Laravel's transaction retry. No network calls occur inside locks. Failed inserts roll back; generic safe 500 responses hide SQL diagnostics. Direct SQL writes outside the service bypass domain rules and are unsupported.

Received listings eagerly load event/host/caller invitation and participant projections, avoiding per-row queries. No Catalog, Firebase, email or external provider call is made. M7 session-version and Firebase mapping middleware are inherited unchanged. Existing library read/write throttles and session/CSRF/no-store rules apply. No schema/config changes, migration/backfill, M4 dependency or frontend are introduced; deploy on the existing M5.0 schema through normal review.

## M5.3 RSVP endpoint

`PUT /api/v1/me/movie-nights/{night}/rsvp` accepts only `{ "rsvp_status": "accepted" }` or `{ "rsvp_status": "declined" }` and returns **200** `{data:Invitation}` using the existing privacy-safe projection. `pending`, invalid/missing/nonstring statuses, unsupported fields and malformed event IDs return **422**. The session actor selects their own invitation; user/invitation IDs and response timestamps are never client-controlled.

Only active, verified, activated invitees may respond. Hosts are implicitly accepted and receive **403** while open. Outsiders, including privileged roles, receive the standard hidden **404**, even for terminal events. Existing authentication/verification/account gates, Firebase mapping, M7 session revocation, CSRF, shared library-write throttle and private/no-store behavior apply. Known members receive **409** for scheduled events at/past `starts_at` or for cancelled/finalized events; lifecycle checks precede action authorization as in earlier Movie Night writes. Repeats also require an open event and current eligibility.

Pending invitees may accept or decline, and accepted/declined invitees may change either way while open. A status change sets `responded_at` to the current UTC instant and updates the invitation timestamp. An identical repeat returns **200**, preserving `responded_at`, `updated_at` and `created_at`. Existing second-precision persistence remains unchanged. Decline removes only the actor's vote for this event in the same transaction; acceptance never restores a deleted vote. No nominations, other users' votes or membership records are removed. Pending and declined invitees retain minimal invitation reads and RSVP eligibility only; direct detail requests return 404. Acceptance grants full detail access, decline revokes it in the same transaction as vote removal, and reacceptance restores access without restoring the vote. Received invitations, event listings and host roster show the persisted status; event details are host/accepted-only.

The adapter calls `MovieNightTransitions::respond()` rather than duplicating foundation logic. It now returns the safely loaded invitation and follows actor → event → actor's invitation row locking, with fresh lifecycle checks after event **and invitation** lock acquisition. Status/timestamps and vote deletion commit or roll back together. The transaction retains three attempts for deadlocks/transient conflicts; no network work occurs inside locks. Existing invitation creation also takes a target-user lock after the parent event, so a host invite and an invitee RSVP can form a user/event lock cycle. RSVP adds no target-user lock or reverse invitation→event acquisition; existing Laravel transaction retries remain the recovery mechanism. Exhaustive deadlock/load testing remains open.

See the [M5.3 report](../development/m5.3-movie-night-rsvp-report.md) for actual SQLite/PostgreSQL results, independent-process contention coverage, rollback verification and manual acceptance steps. M5.3 introduces no migration/configuration/dependency changes; M5.4 shortlist endpoints are documented below.

## M5.4 shared candidate shortlist

PDF item 10 / Azure #88 [S09-07]. See the [M5.4 implementation report](../development/m5.4-movie-night-shortlist-report.md). M5.4 introduced three shortlist routes; M5.5 added voting; M5.6 brings the route inventory to sixteen with public finalization.

- `GET /api/v1/me/movie-nights/{night}/movies?page=1&per_page=20` returns `{data:[ShortlistEntry],meta:{page,per_page,total_pages,total_results,metadata_unavailable}}`. Pagination uses page 1–10000 and per_page 1–50, default 20. Entries sort by Core candidate `id ASC`, so every authorized participant sees the same candidate membership/order. No per-user nomination filter is applied.
- `POST /api/v1/me/movie-nights/{night}/movies` accepts only `{ "tmdb_id": 550 }`. The canonical positive integer is limited to 1–2147483647. The actor/event/nominator are server-scoped. Success is **201** `{data:{id,tmdb_id,nominated_by:{id,username,avatar_url},created_at,movie:MovieSummary}}`; the nomination timestamp is ISO UTC. The movie summary is selected from the validated Catalog detail DTO and used only for the response, not persisted in Core.
- `DELETE /api/v1/me/movie-nights/{night}/movies/{movie}` takes no fields and returns **204** with no body. `{movie}` is the Core candidate ID, not TMDB ID. Host may remove any unvoted candidate; an accepted participant may remove only their own unvoted nomination. Another participant's nomination returns **403**; candidates with votes return **409**. Missing, already removed or cross-event candidates return hidden **404**.

All three routes use host/accepted-only SQL `visibleTo` plus policy `view`. Pending/declined/nonmembers, including uninvited admins, get hidden **404** before any Catalog call. Restricted verified hosts/accepted users retain reads but cannot write. Standard account/verification/activation, Firebase mapping, session revocation, CSRF, private/no-store and read/write throttles apply. Nomination/removal close at the exact start and on cancellation/finalization (**409** for authorized actors); host/accepted reads remain available afterward. The M5.3 minimal-invitation surfaces remain unchanged and never embed the shortlist.

Nomination first checks private access/open state and existing `nominate` policy, then calls `MovieCatalogClient::details()` **outside the mutation transaction**. The existing Catalog cache/detail/provider rules apply, including valid stale fallback; this is Catalog validation, not a guaranteed live TMDB request. Confirmed not-found returns **404 MOVIE_NOT_FOUND**; timeouts, service errors or malformed DTOs return **503 UPSTREAM_UNAVAILABLE** and insert nothing. Invalid local fields/IDs return **422** without provider calls. The Movie Night exception branch explicitly preserves the existing safe `CatalogFailure::render()` status/body/private header instead of converting its 503 to generic 500; private event/candidate 404 remains the generic hidden envelope. Other endpoint families are unchanged.

After validation, a three-attempt transaction reloads/locks actor → private parent event, rechecks account eligibility/current accepted RSVP/status/deadline, authorizes nomination, checks duplicate and capacity, and inserts using existing FK/unique constraints. A concurrent decline returns hidden 404; cancellation/start returns 409; account restriction blocks mutation. `mn_movie_unique(movie_night_id,tmdb_id)` is the final duplicate safeguard. Duplicate attempts never transfer nomination ownership. The 50-candidate limit is checked under the same event lock. Only TMDB ID, event and nominator references plus timestamps are stored in the existing table. No external call occurs under locks.

Removal reloads/locks actor → private event → event-scoped candidate; then existing removable rules/policy recheck state/deadline, ownership and vote absence. Restrictive vote FKs are retained as the final protection. M5.5 voting shares the same event lock. Repeated removal returns 404; removed movies may later be nominated anew while open, creating a new candidate ID/nominator.

Listing eagerly loads safe nominator projections and reuses `LibraryMetadata::enrich()` for **one** `MovieCatalogClient::summaries()` call per nonempty page. A 50-entry page stays within the client's 50-ID pre-deduplication limit; empty/out-of-range pages skip HTTP. Missing successful batch entries retain `movie:null` with `metadata_unavailable:false`; Catalog outages/malformed batch responses retain IDs and `movie:null` with `metadata_unavailable:true`. No row is deleted or hydrated by listing. Current private eligibility is checked again after enrichment, so a decline during network work returns 404 instead of disclosing the shortlist. Provider requests contain only movie IDs; no event/user/location/RSVP data is sent. No metadata is persisted in Core. There is no N+1 SQL or per-movie Catalog detail loop for listing.

No new migrations, dependencies, configuration, notifications or frontend are introduced. This consumes the existing Catalog detail and batch APIs and existing M5.0 Core schema. Deploy through normal review with those existing dependencies available; no deployment is performed by this slice.

## M5.5 voting and private totals

PDF item 10 / Azure #89 [S09-08]. See the [M5.5 verification report](../development/m5.5-movie-night-voting-report.md). M5.5 introduced voting/totals; the M5.6 public finalization adapter is documented below. Live API/browser acceptance remains deferred to M5.7.

`PUT /api/v1/me/movie-nights/{night}/vote` accepts only `{ "movie_night_movie_id": 42 }`, where 42 is a Core candidate ID in the requested event, not a TMDB ID. It returns **200** `{ "data": { "movie_night_movie_id": 42, "updated_at": "2027-01-15T18:00:00.000000Z" } }` for both creation and replacement. The session selects the voter; client voter IDs, counts, timestamps and all unexpected fields return 422. Canonical positive event/candidate identifiers use the existing signed SQL-ID rules. Missing/deleted/cross-event candidates return hidden 404. Only the eligible host and accepted participants may vote; pending/declined/outsider private access returns hidden 404 before candidate lookup. Account/verification/session middleware retains its existing 401/403 gates.

One vote per user/event is stored. Identical repeats while open return the same selection and updated_at without changing created_at, updated_at or row ID. Changing candidate updates the same row atomically and records the current UTC update time, preserving created_at. All writes, including repeats, require scheduled state and strictly `now < starts_at`; cancelled/finalized/exact-start/late writes return 409 for authorized actors. There is no vote-withdrawal endpoint. Open-state RSVP decline atomically deletes the actor's vote through the existing transition; reacceptance restores access without restoring a vote.

`GET /api/v1/me/movie-nights/{night}/votes` accepts no body/query fields and returns:

```json
{
  "data": {
    "totals": [
      {"tmdb_id": 550, "movie_night_movie_id": 42, "votes": 2},
      {"tmdb_id": 551, "movie_night_movie_id": 43, "votes": 0}
    ],
    "my_vote": 42,
    "total_votes": 2,
    "leaders": [550],
    "voting_open": true
  }
}
```

`totals` includes every current candidate in candidate-ID ascending order, including zero counts. `my_vote` is only the caller's selected Core candidate ID or null. `total_votes` is the sum of authoritative valid vote counts. `leaders` retains the existing proposed informational highest-count TMDB-ID list, ordered by candidate ID; it is empty without valid votes and does not select/finalize a winner or resolve ties. Empty shortlists return empty totals/leaders, null selection and zero total. No voter identity, other participant's selection, vote row ID, timestamps of others, profile or Catalog metadata is returned. No pagination is needed for the existing 50-candidate event cap.

Both routes use host/accepted-only private authorization and the existing session/Firebase mapping/M7 revocation, verification/activation, CSRF, library read/write throttle and private/no-store conventions. Restricted verified host/accepted users may read but cannot cast/change. Authorized reads remain available after start/cancellation/finalization with voting_open=false. Supported vote/RSVP/candidate mutations are closed then, so the retained totals remain frozen; no separate snapshot table is added.

`MovieNightVote::validFor()` defines the same authoritative cohort used by totals and existing internal finalization: the event host or a currently accepted invitee. Pending/declined/outsider fixture/invalid votes are excluded. Later account moderation does not retroactively erase a valid recorded vote, preserving the approved foundation rule; it blocks new actions. Internal finalization now reuses this scope instead of duplicating that SQL filter, without changing its winner/tie semantics. M5.6 exposes that shared transition below.

Casting uses a three-attempt transaction with actor → exclusive private event → event-scoped candidate → caller's existing vote row locks. Fresh account/current accepted RSVP/status/deadline checks run after actor/event acquisition, and the deadline is checked again after candidate/vote row waits. Candidate removal, RSVP decline, cancellation and internal finalization share the parent-event lock. Existing unique `(movie_night_id,voting_user_id)` and composite same-event candidate FK remain unchanged. A failed replacement rolls back selection/timestamp together; voted-candidate removal remains blocked. No network call occurs.

Totals use actor → shared private event locks in a retryable transaction. The shared lock serializes the read with all compliant parent-locked mutations and allows other event readers. One aggregate SQL statement obtains candidate counts plus caller-selection existence checks, then sums/maxima are computed over the bounded result. Query count is independent of candidate count; event state/candidate set/cohort stay coherent during the read. Catalog/TMDB availability is irrelevant to casting or totals. Direct SQL outside the domain protocol remains unsupported; exhaustive deadlock/load testing is still an acceptance gap. No migrations, dependencies, configuration, UI, provider request or live manual acceptance is introduced.

## M5.6 winner selection and finalization

PDF item 10 / Azure #89 [S09-08] and #90 [S09-09]. See the [M5.6 verification report](../development/m5.6-movie-night-finalization-report.md). The backend exposes `POST /api/v1/me/movie-nights/{night}/finalize`, bringing the route inventory to sixteen. No frontend, notifications, external integration or live manual acceptance is introduced; M5.7 remains separate.

### Request and success

Only the eligible host may finalize. Send an empty body/`{}` to select a sole highest-voted candidate automatically, or `{ "tmdb_id": 550 }` to explicitly select a current leader. `tmdb_id` is the logical TMDB movie ID, **not the Core shortlist candidate ID used by PUT vote**. When supplied, it is required/non-null and must be a canonical positive integer 1–2147483647. Route night IDs use existing signed SQL-ID rules. Unsupported fields (including client status, winner field, timestamps, counts, rankings, leader lists and organizer identity) return 422.

Success is **200 `{data:Event}`**, using the existing full Event resource, for example:

```json
{
  "data": {
    "id": 12,
    "title": "Final cinema",
    "host": {"id": 7, "username": "host_user", "avatar_url": null},
    "starts_at": "2027-01-16T18:00:00.000000Z",
    "timezone": "Asia/Beirut",
    "status": "finalized",
    "my_rsvp": "accepted",
    "finalized_tmdb_id": 550,
    "finalized_at": "2027-01-15T18:00:00.000000Z",
    "cancelled_at": null,
    "voting_open": false,
    "created_at": "2027-01-15T18:00:00.000000Z",
    "updated_at": "2027-01-15T18:00:00.000000Z",
    "location": "Private hall",
    "meeting_url": "https://example.com/private-room"
  }
}
```

The same detail is available to the host and accepted participants through existing GET event detail. Pending/declined invitees retain only the seven-field minimal summaries from event listing/inbox, without winner/finalized_at/location/meeting URL/voting state. Their direct detail/finalize requests and outsider private requests return hidden 404. Accepted participants attempting to finalize a scheduled event receive 403; lifecycle conflicts precede mutation permission for already-closed visible events, consistent with earlier Movie Night writes. Account/verification/Firebase/session/CSRF/active-state/throttle/private-no-store conventions are unchanged, including restricted read access and blocked restricted writes. There is no admin bypass.

### Authoritative selection and error contract

Inside the existing transition, load current candidates and counts using `MovieNightVote::validFor()`, exactly the cohort used by GET votes (host or currently accepted invitee; later account moderation does not retroactively erase valid votes). At least one valid vote is required. The maximum positive count defines the leader set, ordered by Core candidate ID for deterministic tie responses. A sole leader is automatic if selection is omitted. Explicit selection must belong to that current leader set; ties require explicit selection. The server never trusts client rankings/counts and never uses another event's candidate/votes. A stale explicit selection that no longer leads is rejected, not silently replaced.

| Condition | Status and safe structure |
| --- | --- |
| Guest/expired/unmapped/revoked session | Existing 401 authentication envelope |
| Ineligible account/verification | Existing 403 account/verification envelope; account policy privacy gates retained |
| Accepted nonhost on scheduled event | 403 `{ "message": "This action is unauthorized." }` |
| Pending/declined/outsider/missing event | 404 `{ "message": "Not found." }` |
| Cancelled or already finalized (including repeated same selection) | 409 `{ "message": "Movie night is closed." }` |
| No valid votes, including empty shortlist | 409 `{ "message": "At least one valid vote is required." }` |
| Tie and omitted explicit selection | 409 `{ "message": "Choose one of the tied leaders.", "code": "MOVIE_NIGHT_TIE", "leaders": [550,551] }` |
| Nonleader/unrelated/foreign-event-only TMDB selection | 422 `{ "message": "Choose a highest-voted movie.", "errors": { "tmdb_id": ["Choose a highest-voted movie."] } }` |
| Malformed IDs, null selection or unsupported input | Existing 422 validation `{message,errors}` envelope |
| Missing CSRF / exhausted write throttle | Existing 419 / 429 safe envelopes; Retry-After retained |
| Unexpected write failure | Existing generic 500/INTERNAL_ERROR; no provider/SQL diagnostics |

**M5.7 tie handling:** identify a tie by `code === "MOVIE_NIGHT_TIE"`, display a choice from its authoritative `leaders` TMDB-ID list (or refresh GET votes for counts/metadata context), and submit one choice explicitly. A rejected/stale selection returns errors.tmdb_id; refresh GET votes and require a current choice. Rechecking is server-side under locks, so earlier displayed leader lists are never authoritative for a later write. Other 409 conflicts should refresh event/totals and show either closed state or the need for a valid vote. Do not automatically retry writes. The tie response contains no individual voter data and is emitted only after host/private authorization. Finalize-specific 403/409 exception responses exclude debug traces; the custom tie error preserves its stable code/leader list.

### Lifecycle, locks and winning-movie display

Finalization requires **scheduled** state but has **no start deadline**: it is valid before, exactly at or after starts_at. Early finalization immediately closes voting, RSVP, nomination/removal and event edits. One atomic save persists finalized status, winning TMDB ID and UTC finalized_at/updated_at. Original title/start/IANA zone/location/link, invitations, candidates and votes are retained. Repeats return 409, cancellation/editing of finalized events is rejected, and no reopening/unfinalization/replacement operation exists. Closed totals remain readable/frozen through supported APIs.

The public adapter calls existing `MovieNightTransitions::finalize()`. Its three-attempt transaction reloads/locks actor → private event, rechecks account/current private access, scheduled state and eligible-host permission, calculates valid totals and resolves the current leader inside that same parent lock, then saves. Competing finalizations serialize; at most one terminal transition succeeds. Voting, RSVP, removal/nomination, edits and cancellation use this same parent lock. No network call or second winner implementation is introduced. The transition now uses host/accepted `visibleTo` rather than invitation membership so pending/declined requests cannot reach private finalization logic; RSVP continues using its separate membership scope.

`finalized_tmdb_id` is authoritative without movie enrichment. After finalization, use this stored winner rather than inferring one from GET votes leaders, which may still contain multiple tied candidates. M5.7 can match it to the existing paginated GET shortlist summaries, preserving null/unavailable metadata fallback, or use existing browser-facing Core movie detail routes. The browser never calls Catalog/TMDB directly. Finalization itself never fetches metadata or persists a duplicate movie object in Core. Existing Core schema, UTC timestamp concern, FKs and uniqueness are retained; no migration/dependency/config step is added. Irreversibility is enforced through supported state transitions, not a new historical SQL trigger; direct SQL outside that protocol remains unsupported. Live API/browser acceptance remains deferred to M5.7.
