# Local development setup — Windows + XAMPP

**Status:** Instructions assume scaffold in `feature/project-setup` is merged into `dev`. As audited 2026-10-23, PR #1 is still open, so first verify your branch contents.

## Requirements

- Git, VS Code, Composer, PHP compatible with `backend/composer.lock`, Node.js compatible with `frontend/package-lock.json`, npm, and XAMPP MySQL/MariaDB.
- Scaffolding: Laravel 13, React 19, Vite 8, TypeScript 6, Oxlint. The lockfile needs a PHP 8.4-compatible patch (audit notes Symfony constraints >=8.4.1). `composer check-platform-reqs` is authoritative.
- Preferred dev hostnames: frontend `http://localhost:5173`, Laravel `http://localhost:8000`. Don't mix browser `127.0.0.1` and `localhost` when adding cookie/session auth.

## 1. Clone and select branch

```powershell
git clone https://github.com/hsn-bachir/VYBE.git
cd VYBE
git fetch origin
git switch dev
git pull --ff-only origin dev
```

Before setup PR #1 is merged, `dev` may not contain `backend/` and `frontend/`. Do **not** assume missing directories indicate a bad clone. Check [PR #1](https://github.com/hsn-bachir/VYBE/pull/1).

## 2. Verify tools

```powershell
php -v
where.exe php
composer --version
node -v
npm -v
```

Ensure Composer uses the intended PHP executable; XAMPP's PHP may differ from an independently installed CLI PHP. Check exact lockfile compatibility if install fails, and update the lock with a reviewed dependency PR rather than blindly running `composer update` across the entire project.

## 3. Backend dependencies and local config

```powershell
cd backend
composer install
Copy-Item .env.example .env
php artisan key:generate
```

Create MySQL schema in phpMyAdmin or SQL console:

```sql
CREATE DATABASE vybe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Edit **local only** `backend/.env`:

```dotenv
APP_NAME=VYBE
APP_ENV=local
APP_URL=http://localhost:8000
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=vybe
DB_USERNAME=root
DB_PASSWORD=
```

`root` with no password is a common *local-only* XAMPP default, not a safe shared/deployed account. Verify port, MySQL/MariaDB flavor and credentials on each machine. A dedicated limited-privilege account is preferable for any environment beyond a disposable local setup.

```powershell
php artisan migrate
php artisan test
php artisan serve --host=localhost --port=8000
```

The current PHPUnit default is SQLite `:memory:` for test runs; this does **not** imply the PHPUnit suite exercises MySQL. `migrate:fresh` wipes the current database: use only in a dedicated disposable test environment with verified `DB_DATABASE`.

## 4. Frontend dependencies and dev server

In a second terminal from root:

```powershell
cd frontend
npm ci
npm run dev -- --host localhost
```

Browse `http://localhost:5173`. At the audited revision, only the Vite starter is available. React Router, Axios, TanStack Query and Tailwind will be installed in later feature PRs.

## 5. Planned Sanctum integration configuration

After Sanctum is installed, configure backend `SANCTUM_STATEFUL_DOMAINS` with both `localhost:5173` and `localhost:8000` as appropriate; allow origin `http://localhost:5173` in backend CORS, support credentials and avoid wildcard origins for credentialed CORS. Axios uses `withCredentials` and `withXSRFToken`. Set a valid session cookie domain (normally unset/null for local `localhost`, `.yourdomain.com` on shared production parent domain with HTTPS). `GET /sanctum/csrf-cookie` precedes mutating login/register/logout calls. Consult [backend architecture](../architecture/backend.md). Do not add these configs before the auth feature requires them.

## 6. Quality commands

```powershell
# backend
cd backend
php artisan test
vendor/bin/pint --test

# frontend
cd ../frontend
npm run lint
npx tsc -b --noEmit
npm run build
```

Pint is present but not in scaffold CI. A frontend test script isn't installed yet.

## Troubleshooting

- **Composer platform error**: compare `php -v`, `where.exe php`, and locked dependencies. CI uses PHP 8.4; local PHP 8.3 may be insufficient even if `composer.json` accepts `^8.3`.
- **DB connection refused**: start XAMPP database, confirm port/credentials/driver and `php artisan config:clear` after `.env` edits.
- **CORS/419 after auth introduced**: inspect exact origin, stateful domain ports, credentialed CORS, `XSRF-TOKEN`/`X-XSRF-TOKEN`, cookie domain, session driver; don't disable CSRF.
- **React API 404**: check `/api/v1` prefix is applied only once and that the routes have actually been implemented.
- **Port conflict**: stop unrelated process or intentionally change app and documented frontend/backend origin configuration together.
