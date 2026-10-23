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

Visit `http://localhost:5173`. Implement Sanctum cookies in Core only; React must not call Catalog directly.

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

- Composer platform errors: compare `php -v`, `where.exe php`, and locked dependencies; do not blindly `composer update` or `--ignore-platform-reqs`.
- Catalog 403: missing/mismatched token; Catalog 503: missing token config; avoid printing secrets in logs.
- Core 503 when movie façade is implemented: check Catalog process, port, token, MySQL, TMDB availability and bounded HTTP timeout.
- Browser 419 when Sanctum is implemented: consistently use `localhost`, configure `statefulApi`, CORS credentials and cookies; don't disable CSRF to hide the problem.
- XAMPP database might be MariaDB; verify JSON behavior against CI MySQL 8.0.
