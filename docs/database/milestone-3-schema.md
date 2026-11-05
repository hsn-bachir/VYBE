# M3 database design — roles, invitations and review moderation implemented

## M3.2 migration

Core migration `2026_11_06_000001_add_review_moderation_and_reports.php` adds `reviews.visibility VARCHAR(16) NOT NULL DEFAULT 'visible'`, `reviews.moderator_spoiler BOOLEAN NOT NULL DEFAULT false`, public listing index `(tmdb_id, visibility, created_at, id)` and moderation index `(visibility, created_at, id)`. Existing author `contains_spoilers` is preserved. MySQL uses a visibility CHECK; API validation and controlled writes enforce the same enum on SQLite. The migration also creates the `reports` table below. Its rollback drops reports and the two review columns/indexes without deleting reviews or users; the rollback test runs outside `RefreshDatabase` transactions.

## M3.1C migration

Core migration `2026_11_04_000001_create_account_invitations_table.php` adds `users.invitation_pending BOOLEAN NOT NULL DEFAULT false` and a dedicated `account_invitations` table. The table has an auto-increment `id`, unique `user_id` FK to Core `users` with cascade delete, normalized current `email`, unique 64-character SHA-256 `token_hash`, indexed `expires_at` and Laravel timestamps. One row per invited user makes replacement atomic under the user row lock. The plaintext token is never persisted; acceptance deletes the row. Ordinary registration and `password_reset_tokens` are unchanged. Rollback drops the invitation table then marker, preserving users. SQLite rollback was tested; MySQL migration and locking still need an isolated run. `invitation_pending` is server managed and exposed only as a boolean in the private administrator projection.

### M3.1C password session version

Core migration `2026_11_05_000001_add_password_session_version_to_users_table.php` adds nullable `users.password_session_version VARCHAR(64)` with no index or default token. Existing accounts remain null and existing sessions remain valid until a password change. A direct administrator change or completed broker reset writes a fresh random version in the same transaction as the password hash, remember-token rotation, same-connection database session deletion and (for a direct change) audit record. Authenticated session middleware rejects a stale version even when local session storage uses files. Successful login stores the current version in the server-side session. The column is excluded from mass assignment, model serialization and every API resource. Rollback drops only the column.

Laravel's existing `password_reset_tokens` table is reused; its keyed email, hashed token and creation time support one-use broker validation, 60-minute expiry and 60-second issuance cooldown. It remains separate from `account_invitations`. The M3.1C action allowlist adds `user.password_changed` and `user.password_reset_initiated`; each records actor/target IDs, reason and timestamp with empty safe details. No password, hash, reset token, session identifier or raw request payload is written to audit.

## M3.1B migration

Core migration `2026_11_03_000005_create_administrative_actions_table.php` creates `administrative_actions` with an auto-increment primary key, nullable `actor_id` FK to `users` (`ON DELETE SET NULL`), bounded action and logical target type/ID, nullable reason (maximum 1000), nullable JSON details, and a server timestamp. It has indexes `(target_type, target_id, created_at, id)` and `(actor_id, created_at, id)`; rollback drops the table. M3.1B writes only `user.updated`, `user.role_changed`, and `user.status_changed` through a private service. Details contain only username/email-changed flags or old/new role/status; no email or request payload is stored. Failed and no-op changes create no record. The action and account change commit in one Core transaction. The application offers no update/delete route for audit rows. Retention remains undecided before production rollout.

## M3.1A migration

Core migration `2026_11_03_000004_add_access_fields_to_users_table.php` adds `users.role VARCHAR(16) NOT NULL DEFAULT 'user'` and `users.account_status VARCHAR(16) NOT NULL DEFAULT 'active'`, with allowed-value CHECK constraints and `(account_status, role, id)` index. Existing users inherit the safe defaults. SQLite and MySQL use their respective CHECK syntax; rollback removes the index, constraints and columns. Only the Core database changes. Invitation state is implemented in M3.1C; review moderation, reports and recommendation revision remain proposed below.

M3.1A role/status, M3.1B action-log and M3.1C invitation migrations are implemented; later migrations remain proposed. This design extends the implemented [M2 schema](milestone-2-schema.md) in Core's existing database; Catalog owns only movie metadata. IDs below are unsigned BIGINT auto-increment primary keys unless stated. Timestamps follow existing nullable Laravel UTC timestamps. APIs validate string/enum bounds; add portable CHECK constraints where supported and verify enforcement on the actual MySQL and SQLite test engines. No client can mass-assign owner, actor, state, or timestamps.

## Existing structures

`users` already has unique normalized email and username, nullable password, avatar reference, nullable verification timestamp and bio. `reviews` has `user_id` cascade FK, `tmdb_id`, `body`, author-controlled boolean `contains_spoilers`, timestamps, unique `(user_id, tmdb_id)` and `(tmdb_id, created_at, id)` index. `movie_ratings` has unique `(user_id, tmdb_id)`, 1–5 check and `(tmdb_id, rating)` index. Watchlist, watched and collections have their owner keys, timestamps and uniqueness described in M2. `sessions.user_id` is indexed but is not a foreign key. `password_reset_tokens` already exists. Existing user deletion cascades the M2 relationships; it does not remove Catalog movies.

## Proposed Core changes

| Table / column | Type, default, relationship and validation |
| --- | --- |
| `users.role` | `VARCHAR(16) NOT NULL DEFAULT 'user'`; allow `user`, `moderator`, `admin`; only trusted bootstrap can assign admin; API assigns only user/moderator. Existing rows backfill `user`. |
| `users.account_status` | `VARCHAR(16) NOT NULL DEFAULT 'active'`; allow `active`, `restricted`, `banned`, `deactivated`; existing rows backfill active. No separate ban/restriction booleans. |
| `users.invitation_pending` | `BOOLEAN NOT NULL DEFAULT false`, implemented in M3.1C; set only for admin-created invitees and clear atomically when the setup token is consumed. Ordinary unverified registration cannot use this flow. Existing rows backfill false; never accept it from a client. Only the admin DTO exposes the safe boolean. |
| `users.recommendation_revision` | `BIGINT UNSIGNED NOT NULL DEFAULT 0`, M3.3; increment atomically in the same transaction as every successful rating, watchlist, watched or collection-membership change, including membership loss from collection deletion. It is server-managed, not a public user field. It prevents a computation begun before a write from installing an obsolete cache entry. |
| `reviews.visibility` | `VARCHAR(16) NOT NULL DEFAULT 'visible'`; `visible`/`hidden`; backfill visible. Moderator action only. |
| `reviews.moderator_spoiler` | `BOOLEAN NOT NULL DEFAULT false`; moderator action only. Existing `contains_spoilers` remains the author flag. Public effective flag is their OR. |

Add `INDEX(account_status, role, id)` for active-admin locking and status listing; existing unique indexes support exact username/email searches. Initial user search should use indexed exact email/username or username prefix and stable `id` order; arbitrary contains search needs a measured indexing decision. Add `INDEX(reviews.tmdb_id, visibility, created_at, id)` for public page/count and `INDEX(reviews.visibility, created_at, id)` for moderation queue. Preserve existing uniqueness and author ownership. Test pagination query plans on target DB before removing any existing index.

## `reports` — Core, M3.2

| Column | Definition |
| --- | --- |
| `id` | PK. |
| `reporter_id` | `BIGINT UNSIGNED NULL`, FK `users(id) ON DELETE SET NULL`; non-null at creation, nullable only after account deletion. |
| `target_type` | `VARCHAR(24) NOT NULL`; allowlisted `review` only in M3. No arbitrary PHP class names. |
| `target_id` | `BIGINT UNSIGNED NOT NULL`; positive review ID. Logical reference, deliberately no polymorphic FK; see deletion rules below. |
| `reason` | `VARCHAR(24) NOT NULL`; one of `harassment`, `hate`, `spam`, `spoiler`, `other`. |
| `description` | `VARCHAR(1000) NULL DEFAULT NULL`; trimmed plain text, max 1000 Unicode characters, blank becomes null. |
| `status` | `VARCHAR(16) NOT NULL DEFAULT 'pending'`; `pending`, `resolved`, `dismissed`. |
| `resolved_by` | `BIGINT UNSIGNED NULL`, FK `users(id) ON DELETE SET NULL`; set by server on transition. |
| `resolved_at` | `TIMESTAMP NULL DEFAULT NULL`; server UTC, set on transition. |
| `resolution_note` | `VARCHAR(1000) NULL DEFAULT NULL`; plain text, required for dismissal and resolution. |
| `resolution_action` | `VARCHAR(24) NULL DEFAULT NULL`; server-set `hide` or `mark_spoiler` on resolution; null while pending or dismissed. Supports deterministic replay even if the review is later deleted. |
| `created_at`, `updated_at` | Laravel timestamps. |

Unique `(reporter_id, target_type, target_id)` guarantees one report per existing reporter/target, including concurrent submissions; nullable reporter after deletion deliberately permits multiple historical nulls. Index `(status, created_at, id)` supports the queue and `(target_type, target_id, created_at, id)` supports target investigation. MySQL CHECK constraints restrict target type, reason and status; SQLite relies on strict API validation and server-controlled writes. Target type/id references are deliberately logical so later allowlisted target kinds can be added without accepting arbitrary models. The M3.2 service locks and verifies a visible review before insert; author delete uses the same review row lock. A deleted review leaves the report's target ID, but no content snapshot; the queue marks it unavailable and permits dismissal. This preserves action context without retaining deleted review text. Reports by a deleted user are retained with a null reporter; resolved actor may also become null. Review deletion does not cascade reports.

## `administrative_actions` — Core, M3.1 then M3.2

| Column | Definition |
| --- | --- |
| `id` | PK. |
| `actor_id` | `BIGINT UNSIGNED NULL`, FK `users(id) ON DELETE SET NULL`; non-null when written. |
| `action` | `VARCHAR(48) NOT NULL`; user actions include `user.updated`, `user.role_changed`, `user.status_changed`, `user.created` and `user.invitation_resent`. M3.2 adds `review.hidden`, `review.restored`, `review.spoiler_set`, `review.spoiler_cleared`, `report.resolved`, and `report.dismissed`. |
| `target_type` | `VARCHAR(24) NOT NULL`; server allowlist `user`, `review`, `report`. |
| `target_id` | `BIGINT UNSIGNED NOT NULL`; logical target ID; deliberately no FK so deletion does not erase history. |
| `reason` | `VARCHAR(1000) NULL DEFAULT NULL`; bounded plain text, required for destructive/status decisions as specified by API. |
| `details` | `JSON NULL DEFAULT NULL`; server-generated allowlisted non-sensitive transitions only, e.g. old/new role or status. Never store body, email, password, session, token or request payload. |
| `created_at` | `TIMESTAMP NOT NULL`, server-generated; append-only; no `updated_at`. |

Indexes `(target_type, target_id, created_at, id)` and `(actor_id, created_at, id)`. Actions and corresponding state changes commit in the same transaction; failed/no-op operations produce no misleading action. Action log is not event sourcing. Access is privileged and private. Define and approve an actual retention period before deployment; a null actor/ID after account deletion is not a full anonymization guarantee.

## Relationships and deletion

```mermaid
erDiagram
    users ||--o{ reviews : writes
    users o|--o{ reports : submits
    users o|--o{ reports : resolves
    users o|--o{ administrative_actions : performs
    reviews ||--o{ reports : "logical target; may be deleted"
```

Admin deactivation preserves identity and all content, denies authenticated access, and can be restored. Public reviews and aggregate ratings remain visible during restriction, ban, or deactivation until a separate review moderation decision or hard deletion; do not silently treat a ban as content moderation. Admin hard deletion is a separate confirmed action: delete the user and current M2 cascades remove reviews, ratings, libraries and collections; cleanup of exact managed avatar path is best effort, recorded without secrets. Report and action FK references null out as above; logical target IDs remain. Cached immutable public avatar copies cannot be recalled. Protect the last active admin and prohibit self-delete. There is no Catalog FK or cross-service delete. Sign off the data-retention policy before exposing hard delete in production.

M3.3 needs no new recommendation table. Catalog's existing `movies.genres` is nullable detail metadata; popular summaries do not carry genre IDs and credits are cached separately. The proposed internal candidate endpoint may extend Catalog normalization and cache entries for list genre IDs and writer credits; it must not pretend those fields exist today. Any future Catalog migration or cache format/version change is owned and tested in M3.3, separately from Core. Rollback plans and isolated SQLite/MySQL cascade, uniqueness, check, race and migration tests belong to each implementation slice.
