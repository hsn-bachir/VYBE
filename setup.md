# Local setup and troubleshooting

Read [audit](repository-audit.md) first. These instructions target the inspected scaffold after setup PR #1 is merged. At this snapshot dev has no app directories. Do not merge or change branches automatically to bypass that prerequisite.

## Prerequisites

- Git, VS Code, Composer 2, PHP **8.4.1 or a compatible newer 8.4 patch** for current lockfile.
- Node.js 22.12+ in the 22.x line and npm; CI selects Node 22.
- Target MySQL compatible with CI's MySQL 8.0; XAMPP can provide local database tooling, but verify its actual engine/version. Some installations provide MariaDB, which is not identical.
- PHP extensions needed by locked packages and PDO drivers; CI enables mbstring, pdo_mysql, bcmath, xml and pdo_sqlite. Use Composer platform checks rather than guessing completeness.

XAMPP's bundled PHP may be too old even when its database works. Laravel's CLI server can run from a separate compatible PHP installation; Apache is not required for this workflow. Never replace an existing machine's runtime blindly.

PowerShell checks:

```powershell
git --version
php -v
where.exe php
php --ini
composer --version
node --version
npm --version
```

All terminal/Composer commands must resolve the same intended PHP. After a PATH change restart VS Code terminals.

## Clone and branch

Human developer workflow, after the setup PR is integrated:

```powershell
git clone https://github.com/hsn-bachir/VYBE.git
cd VYBE
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feature/your-task
```

Use a new unique task branch name. If changes already exist, inspect git status before switching. AI agents need explicit authorization for Git mutations; these instructions are not blanket approval.

## Database

Start database service using XAMPP Control Panel. Verify server version in the SQL console:

```sql
SELECT VERSION();
```

Create a dedicated local database (for example vybe) with utf8mb4 and a local application account restricted to that database. Use a separate vybe_test database/account for future MySQL tests. Credentials depend on the machine; do not share production credentials or commit them. A blank root password is not a team deployment configuration.

## Laravel installation

From backend:

```powershell
cd backend
Copy-Item .env.example .env
```

Only copy when .env does not already exist. Configure the new file before installation scripts use it:

```dotenv
APP_NAME=VYBE
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=vybe
DB_USERNAME=your_local_account
DB_PASSWORD=your_local_password
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_DOMAIN=null
SESSION_SECURE_COOKIE=false
CACHE_STORE=database
```

These values replace the SQLite defaults. Keep DB_URL unset unless intentionally configured; it can override individual database settings.

```powershell
composer install
composer check-platform-reqs
php artisan key:generate
php artisan config:clear
php artisan migrate
php artisan migrate:status
php artisan serve --host=localhost --port=8000
```

Generate APP_KEY once for a new environment, not on every start. Inspect DB_DATABASE before migration. Never run migrate:fresh as routine setup. Do not use composer update or --ignore-platform-reqs to hide PHP mismatch. Keep committed lockfiles.

The stock composer setup script also installs/builds backend Blade assets and migrates with --force; it is not the recommended React SPA onboarding shortcut. Backend still has its own starter package.json/Vite resources; the separate frontend is the approved SPA. Do not delete stock resources in a docs task.

At current scaffold, http://localhost:8000/ shows Laravel welcome and /up is health. Auth and movie API URLs are not implemented.

## React installation

In a second terminal from repository root:

```powershell
cd frontend
npm ci
npm run dev -- --host localhost
```

Open the printed URL (normally http://localhost:5173). Current scaffold shows the Vite starter. npm ci uses package-lock.json; do not regenerate the scaffold or replace lockfiles.

No frontend .env.example/API client exists in the inspected revision. A future authorized implementation should add a documented public VITE_API_BASE_URL=http://localhost:8000/api/v1. VITE_* variables are included in browser builds: never put a TMDB credential there.

## Future session and TMDB configuration

The following are **planned configuration requirements**, not complete features enabled by adding env lines:

- Sanctum stateful domain localhost:5173, exact credentialed CORS origin http://localhost:5173, paths api/* and sanctum/csrf-cookie.
- Laravel stateful middleware/API routes; Axios credentials/XSRF; CSRF bootstrap before auth POSTs.
- Backend-only TMDB read credential (proposed TMDB_READ_ACCESS_TOKEN), consumed through config/services.php.
- Proposed MOVIE_METADATA_TTL_DAYS=7, result TTLs 900/300 seconds, timeout configuration.
- Keep all browser origins localhost, even though DB_HOST may be 127.0.0.1.

These keys require matching application configuration/code in later PRs. Review [backend architecture](../architecture/backend.md) for exact boundaries.

## Checks

Backend: php artisan test; inspect phpunit.xml first (currently SQLite :memory:). Frontend: npm run lint, npx tsc -b --noEmit, npm run build. No frontend test script yet. Optional PHP style: vendor/bin/pint --test (Windows: vendor\bin\pint --test).

CI separately migrates MySQL but existing PHPUnit configuration defaults to SQLite. Do not run tests against a development database assuming they are nondestructive; future RefreshDatabase tests can rebuild schemas. Explicitly verify a dedicated test connection before MySQL tests.

## Troubleshooting

| Symptom | Inspect / action |
| --- | --- |
| No backend/frontend on dev | Setup PR #1 is still pending; check integration status |
| Composer PHP incompatibility | php -v / where.exe php; lock requires ≥8.4.1 |
| Missing PDO driver | Correct php.ini and CLI extension load; restart terminal |
| Database access refused | XAMPP service, port, database/account and password; clear Laravel config |
| JSON/collation differences | Verify MySQL vs MariaDB version and CI parity |
| API route 404 | Current scaffold has no API routes; do not invent auth success |
| Future 419 | CSRF bootstrap, XSRF header, cookie domain, consistent host, session expiry |
| Future CORS/network failure | Exact origin/port, CORS paths, credentials and running backend |
| Node/Vite engine failure | Use compatible Node 22.12+; reinstall via npm ci |
| Port conflict | Stop only your own process or deliberately choose new ports and update configuration |
| Missing movie poster | Null/failed public image fallback; never insert fake movies |
| Blank welcome view after asset changes | Distinguish Laravel Blade assets from React SPA; inspect actual error |

## Production differences

Do not deploy XAMPP, artisan serve or Vite dev server publicly. Use an appropriate PHP web runtime with backend/public web root and production-built SPA. Configure HTTPS, secure cookies, APP_DEBUG=false, actual trusted origins/proxies, least-privilege database account, secret injection and tested backups. Current CI is validation only; deployment is undecided.

