# VYBE local setup — Windows, XAMPP, two Laravel APIs

**Status:** Core auth and the independent Catalog movie API are implemented. Core movie forwarding and React discovery are implemented. Never commit `.env` files.

## Prerequisites

Git, VS Code, Composer, PHP compatible with `composer.lock` (the audited Laravel 13 lock set needs PHP **8.4.1+**, notwithstanding `composer.json` declaring `^8.3`), npm/Node compatible with Vite 8, and XAMPP MySQL/MariaDB. Verify `where.exe php` and `composer check-platform-reqs`; do not bypass Composer checks. The user-facing SPA uses `http://localhost:5173`, Core `http://localhost:8000`, Catalog `http://localhost:8001`.

## 1. Work from an integration branch

```powershell
git switch dev
git pull --ff-only origin dev
git switch -c chore/microservice-foundation
```

The Catalog application is already checked in. Do not bootstrap another Laravel app. The historical foundation helper below is only for recovering a missing scaffold, not normal setup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-catalog.ps1
```

The helper fills missing Laravel framework files from the already-committed `backend/` skeleton; it does **not** copy `.env`, `vendor`, Node dependencies, runtime DBs or logs. It removes starter users migration/model/factory in Catalog. Review its changes with `git diff`, don't run it on an existing populated Catalog app without reviewing.

## 2. Create two MySQL databases

Start XAMPP MySQL. In phpMyAdmin/SQL terminal:

```sql
CREATE DATABASE IF NOT EXISTS vybe_core CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS vybe_movies CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Use dedicated DB users with per-database grants when possible. An unpassworded XAMPP `root` is **local disposable development only**.

## 3. Core API (terminal A)

```powershell
cd backend
composer install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate
# Edit backend/.env using values below
php artisan migrate
php artisan serve --host=localhost --port=8000
```

In `backend/.env`:

```dotenv
APP_NAME="VYBE Core"
APP_URL=http://localhost:8000
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=vybe_core
DB_USERNAME=root
DB_PASSWORD=
MOVIE_CATALOG_URL=http://localhost:8001
MOVIE_CATALOG_TOKEN=<same-long-random-secret-as-catalog>
```

The Core MovieCatalogClient reads this URL and token from server configuration. Do not generate random secrets in tracked `.env.example` or in frontend Vite config.

## 4. Catalog API (terminal B)

```powershell
cd services/movie-catalog
composer install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate
# Set Catalog-only DB credentials, CATALOG_INTERNAL_TOKEN and TMDB_TOKEN in local .env
php artisan migrate
php artisan test
php artisan serve --host=localhost --port=8001
```

`services/movie-catalog/.env.example` selects `vybe_movies`, not `vybe_core`. Set a **matching strong value** in Core's `MOVIE_CATALOG_TOKEN` and Catalog's `CATALOG_INTERNAL_TOKEN`. Generate one locally and share it by an approved secure channel, not Git.

### Service boundary smoke test

```powershell
# Without token: intentionally forbidden (403)
curl.exe -i http://localhost:8001/api/internal/v1/health

# With correct locally configured token: 200
curl.exe -i -H "X-VYBE-Service-Token: YOUR_LOCAL_TOKEN" http://localhost:8001/api/internal/v1/health
```

This health probe tests internal auth only, not TMDB readiness. Catalog now implements popular, search and details. Configure `TMDB_TOKEN` with a TMDB API Read Access Token (server-side bearer authentication). Defaults are `CATALOG_METADATA_TTL_SECONDS=604800`, `CATALOG_RANKING_TTL_SECONDS=900`, `CATALOG_REFRESH_COOLDOWN_SECONDS=30`, `TMDB_CONNECT_TIMEOUT_SECONDS=2`, `TMDB_REQUEST_TIMEOUT_SECONDS=5`. Use `CACHE_STORE=database` for persistent rankings and shared refresh locks. Run `php artisan config:clear` after editing local configuration.

See the [Catalog README](../../services/movie-catalog/README.md) for PowerShell requests for all movie endpoints, exact startup/test configuration, stale-detail behavior and Task 2 handoff. Expired ranking caches have no outage fallback; hydrated details may return `meta.stale: true`. No new migration is required beyond the existing Catalog migrations.

## 5. React (terminal C)

```powershell
cd frontend
npm ci
npm run dev -- --host localhost
```

Visit `http://localhost:5173`. Authentication uses Sanctum cookies through Core; React never calls Catalog directly.

## 6. Checks

```powershell
cd backend
php artisan test
cd ../services/movie-catalog
php artisan test
php vendor/bin/pint --test
composer validate --strict
composer check-platform-reqs
cd ../../frontend
npm run lint
npx tsc -b --noEmit
npm run build
```

On CI, Core and Catalog migrations run independently against isolated MySQL databases. PHPUnit's committed `phpunit.xml` may still use SQLite `:memory:`; don't mislabel those tests as MySQL-backed without explicit env verification. **Never run `migrate:fresh` on `vybe_core` or `vybe_movies` with actual data.**

## Troubleshooting

### “We couldn’t check your session”

This is a failed Core session request, not proof that you are signed out. The SPA keeps the current URL and verification guard in place, and offers a retry with pending feedback. Only a genuine `/api/v1/auth/me` 401 is treated as a guest; network errors, timeouts and server failures are not.

Check Core and its database before changing authentication settings. With `SESSION_DRIVER=database`, a stopped MySQL instance can fail the session request even while Core's `/up` probe returns 200. `start.ps1` launches the three application processes; it does **not** start MySQL. Start the existing database installation that owns `vybe_core` and `vybe_movies` first. For a Windows MySQL80 installation, use Services, or run `Start-Service MySQL80` in an administrator PowerShell. For XAMPP, start MySQL in its control panel. Do not initialize a replacement database or reset existing data to fix a stopped service.

After restoring the database, select **Try again**. If the error persists, check Core's local log without sharing credentials or session cookies, and confirm `VITE_API_URL`, `FRONTEND_URL` and Sanctum origins all use the same `localhost` convention. A 401 for a guest is expected; a 500 or connection timeout requires fixing the service connection.

### Movie discovery walkthrough

1. In Catalog's existing local `.env`, configure its `vybe_movies` credentials, `CATALOG_INTERNAL_TOKEN` and a valid `TMDB_TOKEN`. Run `php artisan config:clear`, apply existing migrations with `php artisan migrate`, and start `php artisan serve --host=localhost --port=8001` from `services/movie-catalog`.
2. In Core's existing local `.env`, set `MOVIE_CATALOG_URL=http://localhost:8001` and `MOVIE_CATALOG_TOKEN` to the same service secret. Defaults `MOVIE_CATALOG_CONNECT_TIMEOUT_SECONDS=2` and `MOVIE_CATALOG_TIMEOUT_SECONDS=12` accommodate Catalog's provider attempts. Run `php artisan config:clear` and `php artisan serve --host=localhost --port=8000` from `backend`. This feature introduces no DB migration.
3. In the frontend use `VITE_API_URL=http://localhost:8000`, run `npm ci` if dependencies are absent, then `npm run dev -- --host localhost`. Use `localhost` consistently for browser/Core/CORS/session configuration.
4. As a guest, open `/`, follow a movie card, return to discovery, search by title and change pages. Verify browser back/forward restores the query/page. Reload a detail URL. Check missing-poster fallbacks when available. About & credits is expandable in the footer.
5. Check mobile/tablet/desktop widths, keyboard focus and OS reduced-motion. Sign-in/register/verification/logout retain their existing behavior; an authenticated unverified user still goes to `/verify-email`. The public API itself requires no session.
6. Stop Catalog and reload a movie request to see controlled 503/retry feedback. Frontend query data is cached for 60 seconds, so a hard reload makes this check explicit. Restart Catalog and retry. During TMDB failure, Catalog can still serve fresh rankings or hydrated stale details under its documented rules.

Public API smoke checks need no internal credential:

```powershell
curl.exe -i 'http://localhost:8000/api/v1/movies/popular?page=1'
curl.exe -i 'http://localhost:8000/api/v1/movies/search?query=Arrival&page=1'
# Use a tmdb_id returned above:
curl.exe -i 'http://localhost:8000/api/v1/movies/550'
```

Discovery verification on 2026-10-28: Core 53 tests/258 assertions passed with SQLite and isolated MariaDB 10.4.32; migrations, Pint and Composer platform/validation checks passed. Frontend 45 Vitest tests, lint, TypeScript and build passed. Playwright checked 13 groups including debounce/history, guards, image failures, errors and 360/768/1024/1440 responsive layouts; desktop/mobile screenshots were inspected. A real HTTP React → Core → Catalog run passed with only TMDB faked in a temporary test harness, including stale details and safe uncached-search 503. Real provider credentials, real email delivery and hosted MySQL 8 CI remain unverified. See the [frontend README](../../frontend/README.md) for reusable browser checks.

### Authentication configuration and acceptance

Email verification uses Laravel notifications. `MAIL_MAILER=log` writes the verification message and signed link to `backend/storage/logs/laravel.log` in local development; use Mailpit by setting `MAIL_MAILER=smtp`, `MAIL_HOST=127.0.0.1`, `MAIL_PORT=1025` and its configured sender. Open the link while signed in to the registered account at `localhost`. Set `EMAIL_VERIFICATION_EXPIRE_MINUTES=60`. Production requires a real SMTP provider's host, port, encryption and credentials in environment variables, a deliverable sender address, HTTPS `APP_URL`, secure cookies and a matching frontend origin. Never commit mail credentials.

After registration, verify the pending page shows the email and resend cooldown. Open the signed link, confirm the success page and refresh status. Test an expired/modified link and a link opened under another account; each must leave the account unverified. Unverified accounts can continue to use public pages and log in/out.

The application shell redirects signed-in unverified users to `/verify-email`. Guests can still open public discovery routes. Test direct navigation to a future verified-only route with an unverified session: its Core endpoint must return 403 via Laravel's `verified` middleware. Public movie routes can be exercised as a guest; private product endpoints remain out of scope. In the verification UI, confirm sign out, focus-based status refresh, and that a success URL alone does not show success without a verified backend status.

Core requires `composer install` and the additive `php artisan migrate` against your Core database. Do not overwrite an existing `.env` or reset data. Configure:

```dotenv
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
SANCTUM_STATEFUL_DOMAINS=localhost:5173,localhost:8000
SESSION_DRIVER=database
SESSION_DOMAIN=null
SESSION_COOKIE=vybe_core_session
SESSION_SECURE_COOKIE=false
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

Set `frontend/.env` from `.env.example` if needed: `VITE_API_URL=http://localhost:8000` (root URL, without `/api/v1`). Run `npm ci`, then `npm run dev -- --host localhost`. Always use `localhost` in both browser origins; do not mix it with `127.0.0.1`. Run `php artisan config:clear` after changing local Core configuration. Configure a generated local APP_KEY if one does not already exist. Never regenerate an existing application's key casually.

Manual browser acceptance (requires both local apps):

1. Open `/register` at widths 360, 768, 1024 and 1440. Check keyboard focus, labels, reveal controls, and disabled Google/GitHub “Coming soon” buttons.
2. Register with a unique email and a 12+ character password including letters and numbers. Confirm signed-in navigation; refresh and confirm it persists.
3. Sign out, refresh, and verify signed-out navigation. Sign in again using the same email in uppercase.
4. Check wrong passwords, duplicate email and mismatched confirmation. Confirm readable errors and no navigation on failure.
5. Inspect Network: CSRF bootstrap is outside `/api/v1`; requests include credentials/XSRF headers; `/me` returns only documented fields. Removing the XSRF header on an auth POST must return 419. Re-submit normally to recover.
6. Repeat failed login attempts to see 429; wait for Retry-After. Test offline/server-failure retry feedback and pending disabled submit controls.
7. Confirm home remains accessible when signed out; signed-in visits to `/login` and `/register` return home.

Checks: `php artisan test`, `php vendor/bin/pint --test`, `npm test`, `npm run lint`, `npx tsc -b --noEmit`, `npm run build`. Tests use SQLite memory by default. Username migration verification and the 17-test backend suite also passed on a disposable MariaDB 10.4 database; exact MySQL 8 verification remains a CI/release check. Discovery browser acceptance is recorded below; email delivery and the complete verification-link lifecycle still need manual acceptance.

For production, use HTTPS and `SESSION_SECURE_COOKIE=true`, `APP_DEBUG=false`, explicit origin/stateful domains and a suitable shared session domain (SPA and Core must share a parent domain). Use a persistent shared rate-limit cache. Do not use wildcard credentialed CORS.

- Composer platform errors: compare `php -v`, `where.exe php`, and locked dependencies; do not blindly `composer update` or `--ignore-platform-reqs`.
- Catalog 403: missing/mismatched token; Catalog 503: missing token config; avoid printing secrets in logs.
- Core 503 when movie façade is implemented: check Catalog process, port, token, MySQL, TMDB availability and bounded HTTP timeout.
- Browser 419 when Sanctum is implemented: consistently use `localhost`, configure `statefulApi`, CORS credentials and cookies; don't disable CSRF to hide the problem.
- XAMPP database might be MariaDB; verify JSON behavior against CI MySQL 8.0.
