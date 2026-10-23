# Core Laravel API — scoped agent instructions

Read [root AGENTS.md](../AGENTS.md), [Core API architecture](../docs/architecture/backend.md), [API contracts](../docs/api/contracts.md).

- This service owns only `vybe_core`: users and Laravel's framework tables. The `movies` table does **not** belong here.
- Own Sanctum first-party SPA login/register/logout/me; regenerate session on login, invalidate on logout, and protect CSRF with credentialed CORS.
- Own `/api/v1/movies/popular`, `/search`, and `/{tmdb_id}` **public** façade routes; call the Catalog service using the Laravel HTTP client and typed normalization. Do not directly call TMDB or import the Catalog's PHP classes.
- Never accept a user-provided Catalog URL or internal token. Read base URL/token from server config/env. Supply the internal token only in server-to-server requests and never echo it in logs/responses.
- Reject missing/invalid credentials; nullable `users.password` is solely for future OAuth-only accounts. User resources exclude sensitive fields.
- Keep controllers thin and test the MovieCatalogClient via `Http::fake`, including timeout/malformed/403/5xx responses and error mapping.
- Use dedicated test DBs; no destructive operations on dev or production databases. Do not introduce OAuth/social tables during Milestone 1.
