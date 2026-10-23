# VYBE Movie Catalog Service

Independently runnable Laravel REST service for TMDB metadata, search/popular rankings and persistent movie cache. Core accesses it using authenticated internal HTTP; React does not call it directly.

**Foundation starter status:** internal health route, service-token middleware, movies migration/model and tests are included; TMDB/popular/search/details endpoints are not yet implemented. `scripts/bootstrap-catalog.ps1` copies missing Laravel framework scaffold from `backend/` before first commit. It intentionally removes Core users model/migration/factory from Catalog.

Configure `.env` from `.env.example`; use `vybe_movies`, `CATALOG_INTERNAL_TOKEN` (match Core `MOVIE_CATALOG_TOKEN`) and eventually `TMDB_TOKEN`. Run `composer install`, `php artisan key:generate`, `php artisan migrate`, `php artisan test`, `php artisan serve --host=localhost --port=8001`.

Read [service-specific AGENTS.md](AGENTS.md), [architecture](../../docs/architecture/backend.md) and [internal contract](../../docs/api/contracts.md).
