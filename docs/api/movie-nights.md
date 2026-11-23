# M5.0 Movie Night Planner foundation and proposed API

PDF §3 item **10**; roadmap **M5.0**. Core owns all event, participant and voting data. **None of the routes below are registered in M5.0.** They are proposed contracts for M5.1–M5.7; no frontend or notifications are implemented.

## Implemented domain boundary

`MovieNight`, `MovieNightInvitation`, `MovieNightMovie`, `MovieNightVote`, backed enums, auto-discovered `MovieNightPolicy`, `MovieNightRules` and internal `MovieNightTransitions` form the foundation. Only RSVP and finalization state transitions are executable internally; event CRUD, invitation creation, nomination and vote HTTP workflows await subsequent slices.

State machine: `scheduled → finalized` or `scheduled → cancelled`. Both terminal states are immutable through the domain permissions. Time passing does not change status: a scheduled event at/past its start has closed voting but can still be finalized or cancelled. Finalization requires a valid vote, not a Catalog response. There is no reopen, unfinalize, host transfer or delete operation.

The host is implicitly accepted and has one vote under the same unique key as invitees. Do not create a host invitation. No following relationship is required to invite a platform user. A valid historical vote belongs to the host or a currently accepted invitee; pending, declined and outsider votes are excluded from finalization. Later account moderation does not retroactively invalidate a previously cast valid vote; it prevents new actions. Restriction/banning of the host currently prevents finalization until account eligibility is restored; no administrative override is introduced here.

| Actor | View event, invitations and totals | Edit / invite | Cancel / finalize | RSVP | Nominate / vote |
| --- | --- | --- | --- | --- | --- |
| Active verified host | Yes | Before start | While scheduled, including after start | Implicit accepted | While voting open |
| Active verified accepted invitee | Yes | No | No | Before start while scheduled | While voting open |
| Active verified pending/declined invitee | Yes | No | No | Before start while scheduled | No |
| Restricted verified host/invitee | Yes | No | No | No | No |
| Guest / outsider / banned / deactivated / unverified / pending activation | No | No | No | No | No |

There is no moderator/admin bypass. Use membership-scoped SQL (`visibleTo`) before loading event details; policy `view` denies as 404 to hide private event existence. Account middleware retains its existing 401/403 behavior. Future list handlers must apply the same account/verification gates before `visibleTo`. Never serialize raw models or related `User` objects.

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

All FKs use restrictive deletion, preserving event history and preventing voted-movie removal. Cancellation retains every row. No cross-service FK or movie metadata is stored. No user data is migrated/backfilled. RSVP/participation eligibility is enforced in domain logic, not a cross-table CHECK. Host self-invitation is prohibited by the proposed invitation handler, not a DB constraint. PostgreSQL uses `timestamptz`; API writes use explicit UTC and keep the IANA zone for display/DST interpretation. SQLite tests cover foreign keys and enum checks; added ALTER TABLE range/state checks target PostgreSQL (and compatible MySQL), so SQLite alone is insufficient acceptance.

Apply the additive migration to **Core only** before later endpoint deployment using the normal reviewed migration process. M5.0 does not run it on development/hosted data. Rollback drops the four new tables in dependency order and loses their contents; only use rollback on disposable databases or under an approved retention plan. Hard deletion/retention policy remains a later product decision.

### UTC persistence fix (M5.0 review)

All four Movie Night models use `HasMovieNightUtcTimestamps`: Eloquent date writes normalize to UTC and PostgreSQL values include an explicit `+00:00` offset. PostgreSQL session-local timestamp strings are decoded using their returned offset and exposed as UTC dates. This covers `starts_at`, `finalized_at`, `cancelled_at`, invitation `responded_at`, and every Movie Night model's automatic `created_at`/`updated_at`, including `touch()`. SQLite/other drivers retain Laravel's normal SQL date format with UTC-normalized values. Existing second precision is preserved.

No global connection timezone, authentication behavior or migration changes are needed. Persist timestamp fields through these models (`save`/instance `update`/`touch`); raw SQL and bulk query-builder timestamp assignments bypass model conversion and must supply explicit-offset instants themselves. This fix prevents new timestamp shifts; it does not infer or repair any previously misinterpreted persisted instant.

Real PostgreSQL tests explicitly set the session to `Asia/Beirut`, exercise winter/summer offsets, inspect stored epoch values independently of Eloquent, and restore the original session timezone afterwards. Voting stays open immediately before the absolute start instant and closes exactly at it. Previously cast votes can still be finalized afterwards.

## Proposed HTTP conventions

Base `/api/v1/me/movie-nights`. Existing `web`, session/CSRF, `auth:sanctum`, `EnsureAccountAccess`, `EnsureVerifiedAccount`, `PreventAuthCaching` and library read/write throttles are reused. All writes additionally require active account status. All responses, including errors, use `Cache-Control: no-store, private`. No anonymous sharing, bearer auth, client-supplied actor/host/voter/nominator IDs or shared personalized caches.

IDs are canonical positive SQL integers; TMDB IDs are integers 1–2147483647. Future FormRequests must allowlist fields. Dates must be `YYYY-MM-DDTHH:mm:ssZ` UTC, future on create/edit; timezone must pass Laravel `timezone:all`. `MovieNightRules::eventFields()` provides reusable validation. A zone controls display; clients must resolve local/DST ambiguity to an instant before submitting. `title` is nonblank, max 150; optional location max 500; optional meeting URL max 2048 and HTTPS only. Meeting URLs are stored/displayed as links and never fetched by Core. No user may mutate status/winner/timestamps directly. PATCH allows only title/start/zone/location/URL, before the original deadline; omitted fields are unchanged and nullable fields may be cleared.

List requests use page>=1, per_page 1–50 (default 20); order events by starts_at then id, invitations by id, shortlist by id. Optional event `status` filter is one of the three states. Pagination envelope matches Core: `{data:[...],meta:{page,per_page,total_pages,total_results}}`. Shortlist is capped at 50 entries/event and invitations at 200/event in the proposed handlers; enforce limits under the event lock. Limits are design assumptions to review before implementing those handlers.

| Method / relative path | Request | Success envelope | Authorization / special validation |
| --- | --- | --- | --- |
| POST `/` | `{title,starts_at,timezone,location?,meeting_url?}` | 201 `{data: Event}` | Eligible host; actor assigned from session |
| GET `/` | pagination, `status?` | 200 paginated Event summaries | SQL membership scope; no Catalog required |
| GET `/{night}` | — | 200 `{data: Event}` | Host or invitee; terminal events included |
| PATCH `/{night}` | Any editable event fields | 200 `{data: Event}` | Host; scheduled and before original start |
| POST `/{night}/cancel` | `{}` | 200 `{data: Event}` | Host; scheduled only; record cancelled_at; repeat 409 |
| GET `/{night}/eligible-users` | `query` username prefix, 3–30 chars, page/per_page | 200 paginated Participant projections | Host; open; active verified nonpending users only; exclude host and already invited; no email lookup |
| POST `/{night}/invitations` | `{invited_user_id}` | 201 `{data: Invitation}` | Host; open; eligible target; duplicate 409, self/ineligible/unknown target 422 |
| GET `/{night}/invitations` | pagination | 200 paginated Invitation | Host or invitee; safe participant projections only |
| PUT `/{night}/rsvp` | `{rsvp_status:"accepted"\|"declined"}` | 200 `{data: Invitation}` | Invited actor only; open; repeated same response is allowed; decline clears vote |
| POST `/{night}/movies` | `{tmdb_id}` | 201 `{data: ShortlistEntry}` | Accepted actor; open; duplicate 409; validate real movie through existing Catalog client |
| DELETE `/{night}/movies/{entry}` | — | 204 | Host or original nominator, accepted; open; voted entry 409; cross-event entry 404 |
| PUT `/{night}/vote` | `{movie_night_movie_id}` | 200 `{data:{movie_night_movie_id,updated_at}}` | Accepted actor; open; scoped shortlist entry required; creates/changes one vote |
| GET `/{night}/votes` | — | 200 `{data:{totals:[{tmdb_id,movie_night_movie_id,votes}],my_vote,leaders:[tmdb_id],voting_open}}` | Host or invitee; no voter identity list; zero counts included; leaders empty if no valid votes |
| POST `/{night}/finalize` | `{tmdb_id?}` | 200 `{data: Event}` | Host; scheduled; at least one valid vote; optional explicit sole leader or required tied leader |

Place static subroutes before dynamic identifiers. The eligible-user search is scoped to an event so it cannot become an unsolicited public social directory. It has no notification side effects. Notifications remain undecided and outside M5.0.

## Proposed response projections

Participant: `{id,username,avatar_url}` only. Exclude email, bio, Firebase UID, roles, account status, credentials and personal activity. Invitation: `{id,participant:Participant,rsvp_status,responded_at}`. The host is represented separately with implicit `accepted`, never as an invitation row.

Event summary: `{id,title,host:Participant,starts_at,timezone,status,finalized_tmdb_id,finalized_at,cancelled_at,my_rsvp,voting_open,created_at,updated_at}`; `my_rsvp` is accepted for host, otherwise invitation state. Event detail adds `{location,meeting_url}`. Separate paginated invitation/shortlist routes avoid unbounded nested lists. Host/invitee access is required even for meeting URLs and cancelled/finalized details.

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

Event reads and tally/finalization must continue without Catalog availability. Endpoint adapters must scope membership before state checks to avoid existence leaks; separate temporal conflicts (409) from actor authorization (403). M5.0 does not claim route-level middleware, CSRF, throttle, projection or browser acceptance: those remain tests required with the future HTTP adapters.
