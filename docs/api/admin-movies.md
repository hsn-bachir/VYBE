# Administrator movie management — M7.6

Core exposes `GET /api/v1/admin/movies`, `GET /api/v1/admin/movies/{tmdb_id}` and `POST /api/v1/admin/movies/{tmdb_id}/refresh`. Reads require a verified active or restricted administrator. Refresh requires a verified active administrator, the existing Sanctum session and CSRF token. All responses are private and non-cacheable. Read limits are 60/minute per actor and 120/minute per IP. Refresh shares the existing write limit of 20/minute per actor and 60/minute per IP.

Catalog implements corresponding service-token protected routes under `/api/internal/v1/movies/manage`. The browser communicates through Core. Each Core request makes one Catalog request. Listing and inspection use only Catalog persistence.

## Listing and inspection

List parameters are `q` (up to 200 characters), `page` (1–10000) and `status`. Status accepts `all`, `fresh`, `stale`, `not_hydrated`, `missing_poster`, `missing_overview` and `unknown_genres`. Numeric search looks up a TMDB ID. Other searches match a literal, case-insensitive title substring. Results are ordered by TMDB ID and paginated at 20 records. The envelope is `{data: ManagedMovie[], meta: {page,total_pages,total_results}}`.

Inspection returns `{data: ManagedMovie}`. The DTO extends the existing movie detail fields with `metadata_status` and nullable ISO `metadata_fetched_at`. It preserves `genres: null` for unknown associations and `genres: []` for a known empty list. It exposes title, original title, overview, image paths, release date, runtime, language, genres and TMDB score/vote count. No internal keys, provider responses or credentials enter the DTO.

Catalog calculates status using its configured metadata TTL. A null full-fetch timestamp means `not_hydrated`. A timestamp newer than `now - metadata_ttl_seconds` means `fresh`. An older or boundary timestamp means `stale`. `updated_at` has no role in this classification. Missing posters and overviews identify metadata gaps and can occur on otherwise valid hydrated movies.

## Explicit refresh

Refresh accepts an existing local TMDB ID and no configurable destination. Catalog calls the existing detail fetch with force enabled, bypassing freshness while retaining the shared nonblocking detail lock and failure cooldown. A successful response is `{data: ManagedMovie, meta: {outcome:"refreshed"}}`. Core validates the explicit outcome, fresh status and full-fetch timestamp before returning its `{data: ManagedMovie}` response.

An active lock or cooldown returns 409. Provider failure or malformed metadata returns a safe 503. Missing local or provider movies return 404. Invalid IDs return 422. Previous persisted movie fields survive provider failure. Catalog applies its configured cooldown after a manual success and after provider failures, including provider 404. Existing TMDB transport can retry eligible transient failures within its bounded policy. No caller retry is automatic.

Core creates `movie.refresh_requested` in `administrative_actions` before contacting Catalog. Confirmed refresh changes that record to `movie.refreshed` and records only the full-fetch timestamp in details. `movie.refresh_failed` means Core knows the refresh did not complete: no request was dispatched because local configuration was invalid, Catalog rejected the refresh with 409 before writing (lock/cooldown), or Catalog returned its structured pre-write provider failure (`404 MOVIE_NOT_FOUND` or `503 UPSTREAM_UNAVAILABLE`). These existing Catalog error codes escape the forced detail path before the base metadata upsert; optional post-write upstream failures are swallowed by that path.

Timeouts, connection loss, generic/unrecognized error responses and invalid success DTOs produce `movie.refresh_unconfirmed`: Catalog may already have committed. Caller HTTP status/messages remain unchanged and internal errors are not disclosed. A process interruption or audit completion-write failure may leave `movie.refresh_requested`, displayed as incomplete. Neither unconfirmed nor incomplete proves success or failure. Inspect current movie metadata and its full-fetch timestamp, then explicitly retry after the existing cooldown if needed. There is no automatic retry or background reconciliation. Historical `movie.refresh_failed` rows are not rewritten and may include outcomes classified under the older M7.6 behavior.

The services cannot commit one transaction across their databases. Movie audit records use target type `movie` and TMDB target ID. Existing history permissions restrict them to administrators. The existing 48-character action column and string resource projection accept the new action without a migration.

Deploy Catalog, then Core, then the frontend. This scope needs no migration, environment variable or dependency. It provides inspection and manual rehydration as the proposed non-destructive interpretation of PDF item 11. Instructor confirmation of the university's full movie-management rubric remains open.
