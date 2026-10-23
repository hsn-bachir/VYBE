# VYBE local setup — Windows, XAMPP, two Laravel APIs

**Status:** Two-service architecture approved. Foundation package includes a Catalog service bootstrap helper; after running it, commit the generated Laravel skeleton and locked dependencies on the same PR. Never commit `.env` files.

## Prerequisites

Git, VS Code, Composer, PHP compatible with `composer.lock` (the audited Laravel 13 lock set needs PHP **8.4.1+**, notwithstanding `composer.json` declaring `^8.3`), npm/Node compatible with Vite 8, and XAMPP MySQL/MariaDB. Verify `where.exe php` and `composer check-platform-reqs`; do not bypass Composer checks. The user-facing SPA uses `http://localhost:5173`, Core `http://localhost:8000`, Catalog `http://localhost:8001`.

## 1. Work from an integration branch

```powershell
git switch dev
git pull --ff-only origin dev
git switch -c chore/microservice-foundation
```

Unpack the foundation archive into the root. It updates docs and CI and provides a Catalog source overlay. Run the helper **before committing** so the actual Catalog scaffold exists for CI.

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
Copy-Item .env.example .env
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

The Catalog URL/token aren't wired into a Core client until that feature PR is implemented. Do not generate random secrets in tracked `.env.example` or in frontend Vite config.

## 4. Catalog API (terminal B)

```powershell
cd services/movie-catalog
composer install
Copy-Item .env.example .env
php artisan key:generate
# Set DB credentials and CATALOG_INTERNAL_TOKEN in local .env
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

This health probe tests internal auth boundary; it does not yet implement TMDB popular/search/details.

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
cd ../../frontend
npm run lint
npx tsc -b --noEmit
npm run build
```

On CI, Core and Catalog migrations run independently against isolated MySQL databases. PHPUnit's committed `phpunit.xml` may still use SQLite `:memory:`; don't mislabel those tests as MySQL-backed without explicit env verification. **Never run `migrate:fresh` on `vybe_core` or `vybe_movies` with actual data.**

## Troubleshooting

### Authentication configuration and acceptance

Email verification uses Laravel notifications. `MAIL_MAILER=log` writes the verification message and signed link to `backend/storage/logs/laravel.log` in local development; use Mailpit by setting `MAIL_MAILER=smtp`, `MAIL_HOST=127.0.0.1`, `MAIL_PORT=1025` and its configured sender. Open the link while signed in to the registered account at `localhost`. Set `EMAIL_VERIFICATION_EXPIRE_MINUTES=60`. Production requires a real SMTP provider's host, port, encryption and credentials in environment variables, a deliverable sender address, HTTPS `APP_URL`, secure cookies and a matching frontend origin. Never commit mail credentials.

After registration, verify the pending page shows the email and resend cooldown. Open the signed link, confirm the success page and refresh status. Test an expired/modified link and a link opened under another account; each must leave the account unverified. Unverified accounts can continue to use public pages and log in/out.

The application shell redirects signed-in unverified users to `/verify-email`. Guests can still open public discovery routes. Test direct navigation to a future verified-only route with an unverified session: its Core endpoint must return 403 via Laravel's `verified` middleware. The current scaffold has no private product endpoint or movie route to exercise in a browser. In the verification UI, confirm sign out, focus-based status refresh, and that a success URL alone does not show success without a verified backend status.

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

Checks: `php artisan test`, `php vendor/bin/pint --test`, `npm test`, `npm run lint`, `npx tsc -b --noEmit`, `npm run build`. Tests use SQLite memory by default. Username migration verification and the 17-test backend suite also passed on a disposable MariaDB 10.4 database; exact MySQL 8 verification remains a CI/release check. No browser connection was available during implementation, so the manual visual steps remain pending.

For production, use HTTPS and `SESSION_SECURE_COOKIE=true`, `APP_DEBUG=false`, explicit origin/stateful domains and a suitable shared session domain (SPA and Core must share a parent domain). Use a persistent shared rate-limit cache. Do not use wildcard credentialed CORS.

- Composer platform errors: compare `php -v`, `where.exe php`, and locked dependencies; do not blindly `composer update` or `--ignore-platform-reqs`.
- Catalog 403: missing/mismatched token; Catalog 503: missing token config; avoid printing secrets in logs.
- Core 503 when movie façade is implemented: check Catalog process, port, token, MySQL, TMDB availability and bounded HTTP timeout.
- Browser 419 when Sanctum is implemented: consistently use `localhost`, configure `statefulApi`, CORS credentials and cookies; don't disable CSRF to hide the problem.
- XAMPP database might be MariaDB; verify JSON behavior against CI MySQL 8.0.
