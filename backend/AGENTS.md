# VYBE Core Laravel API — Scoped Agent Rules

**Mandatory first reads:** [`../AGENTS.md`](../AGENTS.md), [`../PROJECT_ROADMAP.md`](../PROJECT_ROADMAP.md), [`../docs/AI_AGENT_PLAYBOOK.md`](../docs/AI_AGENT_PLAYBOOK.md), [`../docs/architecture/backend.md`](../docs/architecture/backend.md), [`../docs/database/schema.md`](../docs/database/schema.md), plus relevant API contracts, current routes, services, models and tests.

## Ownership

Core owns the **Core database** and all browser-facing `/api/v1/*` APIs: SQL user profiles/roles/status, Firebase UID mapping and Laravel/Sanctum session, email/invitation/admin control, watchlist/watched, Favorites/collections, ratings/reviews, reports/moderation, personalized FYP ranking/exclusions. The next PDF slices add public profiles/sharing/follows/feed and Movie Night users/invites/votes **here**, subject to explicit privacy/security designs.

Core must **not** query the Catalog DB, own the movie metadata table or call TMDB. Call Catalog through `app/Integrations/MovieCatalog/MovieCatalogClient.php` with server-only configured URL/token and bounded HTTP. Represent movie references by valid TMDB IDs, use bounded batch summaries, and normalize errors/DTOs.

## Existing patterns to reuse

- Routing: `routes/api.php`, current authenticated/read/write middleware and `app/Http/Controllers/Api/V1/*`.
- FormRequests and resources for allowlisting, validation and safe public/private projection.
- `app/Models/User.php`, `Collection.php`, `MovieRating.php`, `Review.php`, `WatchedMovie.php`, `WatchlistEntry.php` and domain services for owner-scoped interactions.
- `app/Services/Recommendations/*` and `config/recommendations.php`: no generic recommender rewrite for new social features.
- Authentication: read `docs/architecture/authentication.md` and `docs/development/firebase-final-acceptance.md`. Firebase establishes external identity; Core SQL retains user/role/status and a rotated Laravel session. Never reintroduce a parallel JWT/localStorage auth stack.
- Admin: `AdminUserController`, `ModerationController`, audit service and role/account-state middleware. Avoid direct arbitrary movie-DB editing from Core.

## Required security semantics

- Resolve the signed-in owner from session, **not** request `user_id`. Enforce verification, current status, roles, CSRF, throttling, owner checks and sensitive action confirmation. Restricted and banned states are not interchangeable.
- For M4, explicit public resources **must** exclude emails, Firebase UIDs, token metadata, private membership/history, private lists and activity without opt-in. Existing collections are private until migrated by approved logic. Public/owner/follower permission behavior requires tests.
- For M5, model invitation/RSVP/vote permissions and unique DB constraints. Protect against repeated/concurrent votes and disclosure of private event details; ensure timezone-safe date handling.
- Do not hard-delete user data/audits until retention policy approved. Log decisions safely; redact secrets and private preference data.
- Respect per-request bounded SQL and Catalog HTTP calls; no cross-service joins or per-movie HTTP loops. Update schema/API/docs and migration tests if persistence changes.
- Use isolated disposable test databases only; never reset development/shared/hosted data. Verify selected driver; documentation spans MySQL, MariaDB and PostgreSQL.

## Acceptance

Run focused/full PHPUnit (`php artisan test --compact`), Pint where relevant, migration checks on independent disposable DB, `Http::fake` for Catalog, security tests for 401/403/404/409/419/422/429/503, concurrency and cross-user isolation. Summarize actual checks, DB/API changes, rollout order, unresolved risks and Git state. **No automatic Git mutations without authorization.**
