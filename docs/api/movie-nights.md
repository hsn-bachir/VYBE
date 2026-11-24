# Movie Night Planner — M5.0–M5.3 backend contracts

PDF §3 item **10**; roadmap **M5.0 + M5.1 + M5.2 + M5.3**. Core owns all event, participant and voting data. **M5.1 implements create/list/detail/edit/cancel; M5.2 adds user lookup and invitation creation/listing; M5.3 adds invitee RSVP**, on `feature/movie-night`. Shortlist/voting/finalization endpoints remain proposed for M5.4–M5.7. No frontend or notifications are implemented. See the [M5.1 verification report](../development/m5.1-movie-night-management-report.md).

## Implemented domain boundary

`MovieNight`, `MovieNightInvitation`, `MovieNightMovie`, `MovieNightVote`, backed enums, auto-discovered `MovieNightPolicy`, `MovieNightRules` and internal `MovieNightTransitions` form the foundation. M5.3 exposes the existing RSVP transition; the foundation finalization transition remains internal only. M5.1 adds `MovieNightService`, FormRequests, summary/detail Resources and a controller for five event-management routes. M5.2 adds `MovieNightInvitationService`, controller, FormRequests and safe participant/invitation Resources. Nomination and vote HTTP workflows await subsequent slices.

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

List requests use page 1–10000, per_page 1–50 (default 20); order events by starts_at then id, invitations by id, shortlist by id. Optional event `status` filter is one of the three states. Pagination envelope matches Core: `{data:[...],meta:{page,per_page,total_pages,total_results}}`. M5.2 enforces at most 200 invitations/event under the event lock, counting all RSVP states. The proposed shortlist cap remains 50 entries/event for its later handler.

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
| POST `/{night}/movies` | `{tmdb_id}` | 201 `{data: ShortlistEntry}` | Accepted actor; open; duplicate 409; validate real movie through existing Catalog client | Planned |
| DELETE `/{night}/movies/{entry}` | — | 204 | Host or original nominator, accepted; open; voted entry 409; cross-event entry 404 | Planned |
| PUT `/{night}/vote` | `{movie_night_movie_id}` | 200 `{data:{movie_night_movie_id,updated_at}}` | Accepted actor; open; scoped shortlist entry required; creates/changes one vote | Planned |
| GET `/{night}/votes` | — | 200 `{data:{totals:[{tmdb_id,movie_night_movie_id,votes}],my_vote,leaders:[tmdb_id],voting_open}}` | Host or accepted participant; no voter identity list; zero counts included; leaders empty if no valid votes | Planned |
| POST `/{night}/finalize` | `{tmdb_id?}` | 200 `{data: Event}` | Host; scheduled; at least one valid vote; optional explicit sole leader or required tied leader | Planned |

Place static subroutes before dynamic identifiers. The eligible-user search is scoped to an event so it cannot become an unsolicited public social directory. It has no notification side effects. M5.2 uses pull-based received invitations only; no notification delivery, email or WebSocket is required.

## Response projections

Participant: `{id,username,avatar_url}` only (used for host and invitation participants). Exclude email, bio, Firebase UID, roles, account status, credentials and personal activity. Invitation: `{id,participant:Participant,rsvp_status,responded_at}`. ReceivedInvitation adds `movie_night` using the role/RSVP-sensitive summary below. Location/meeting URL require the host/accepted-only event detail endpoint. The host is represented separately with implicit `accepted`, never as an invitation row.

Minimal invitation event summary (pending/declined): **exactly** `{id,title,host:Participant,starts_at,timezone,status,my_rsvp}`. It excludes location, meeting URL, finalized movie ID/timestamp, cancellation timestamp, voting-open state, event audit timestamps, shortlist, votes and all other private event data. This allowlist applies to both event listings and received invitations, including cancelled/finalized events.

Host/accepted Event summary adds `{finalized_tmdb_id,finalized_at,cancelled_at,voting_open,created_at,updated_at}`. Full Event detail adds `{location,meeting_url}` and requires host/accepted authorization. `my_rsvp` is accepted for host, otherwise the caller's own invitation state. Invitation creation and RSVP responses contain only the Invitation projection without a nested event. Separate invitation/shortlist routes avoid unbounded nested lists. Decline immediately revokes full-detail access and removes the actor's vote atomically; reacceptance restores private access while open but never restores the deleted vote.

ShortlistEntry: `{id,tmdb_id,nominated_by:Participant,created_at,movie:MovieSummary|null}`. Proposed `GET /{night}/movies` returns paginated ShortlistEntry with `meta.metadata_unavailable` in addition to pagination. Enrichment uses existing `MovieCatalogClient::summaries()` in one bounded batch of at most 50 IDs/page; cache misses keep the entry with `movie:null`. Catalog outage returns persisted entries with null enrichment and `metadata_unavailable:true`, never deletes rows. Final winner ID is authoritative independent of enrichment. Movie validation before *new* nominations uses existing `LibraryMetadata::confirm()`/Catalog details and safe 404/503 translation; no Catalog call is needed for votes, RSVP or finalization. Never send event, user, location, RSVP or vote data to Catalog.

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

See the [M5.3 report](../development/m5.3-movie-night-rsvp-report.md) for actual SQLite/PostgreSQL results, independent-process contention coverage, rollback verification and manual acceptance steps. No migration/configuration/dependency changes or M5.4+ endpoints are introduced.
