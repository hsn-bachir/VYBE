# Neon PostgreSQL migration — Phase 3 compatibility report

Date: 2026-11-10. Branch: `feature/neon-postgres-migration`. Scope: compatibility code, additive Catalog schema evolution, disposable PostgreSQL test coverage and documentation. This phase did **not** import application data, change existing development databases, create Neon projects, change Firebase identities, change frontend behavior, or switch either application to PostgreSQL.

## A. Confirmed incompatibilities fixed

| Finding | Change | Verification |
|---|---|---|
| D1 — Core `DROP CHECK` rollback | `backend/database/migrations/2026_11_03_000004_add_access_fields_to_users_table.php` and `2026_11_06_000001_add_review_moderation_and_reports.php` now use `DROP CONSTRAINT` outside SQLite; constraint names and up migrations are unchanged. This syntax is supported by PostgreSQL, local MariaDB 10.4, and [MySQL 8.0.19+](https://dev.mysql.com/doc/refman/8.0/en/alter-table.html). | Existing `CoreMigrationRollbackTest` executes targeted down/up on disposable databases. SQLite keeps its own migration branch. |
| D2 — Boolean aggregate | `backend/app/Http/Controllers/Api/V1/ModerationController.php` counts `WHEN moderator_spoiler THEN 1`, valid for PostgreSQL Boolean and MySQL/MariaDB Boolean/TINYINT. Response fields and aggregate query shape remain unchanged. | `AdminDashboardOptimizationTest` checks the actual count and response on all tested engines. |
| D3 — Catalog signed widths | New additive `services/movie-catalog/database/migrations/2026_11_10_000001_expand_movie_numeric_columns.php` widens `runtime` to MySQL unsigned INT / PostgreSQL INT and `tmdb_vote_count` to MySQL unsigned BIGINT / PostgreSQL BIGINT. Named checks retain 0–65535 and 0–4294967295 respectively on MySQL/MariaDB and PostgreSQL. `tmdb_id` remains unchanged and the normalizer continues to cap it at 2147483647. | Fresh migration chains, maximum accepted movie detail through the API, over-range database rejection and safe down/up were exercised on disposable databases. The down migration refuses a PostgreSQL narrowing that would lose accepted upper-range rows. |
| D8 — outdated Core seeder | `DatabaseSeeder` now sets `username=test_user` and seeds only in legacy identity mode. The existing factory already supplies normalized usernames and unprivileged users; Firebase mode creates no unlinked password account. | `DatabaseSeederCompatibilityTest` covers both modes. |

The test run also exposed a **PostgreSQL test isolation difference**: an expected unique-key or database cache-lock failure aborts the surrounding PostgreSQL transaction. Four affected test classes now use table truncation before and after each PostgreSQL test, with disposable-database guards; they retain fast `RefreshDatabase` transactions for SQLite/MySQL. Application Firebase and Catalog request logic did not change. The PostgreSQL-specific cleanup runs only against loopback `*_test` databases with `APP_ENV=testing`, empty `DB_URL` and `VYBE_DISPOSABLE_TEST_DB=1`.

## B. Files and behavior changed

- **Core:** two historical migration down methods, one moderation aggregate, one seeder, PostgreSQL TLS default, test guards and PostgreSQL-safe test isolation, plus seeder/persistence tests.
- **Catalog:** one additive migration, PostgreSQL TLS default, test guard/isolation, numeric migration tests and a maximum-value API test.
- **Shared infrastructure/docs:** `.github/workflows/ci.yml`, `compose.postgres-test.yml`, both `.env.example` files, `docs/database/schema.md`, `docs/development/setup.md`, and this report.
- **API contract:** unchanged. Core still reaches Catalog over the authenticated HTTP contract; neither service gained access to the other's database. Firebase UID mapping and Sanctum session design are unchanged.

## C. Schema changes and migration steps

Core has no new schema migration. Its historical migrations preserve the role/status/visibility checks and now roll back correctly on PostgreSQL and MariaDB. Their intentionally irreversible `name`→`username` history remains irreversible.

Catalog has one **additive** migration after the existing `movies` migration. It changes only the two numeric column widths and adds `movies_runtime_range_check` and `movies_vote_count_range_check` on MySQL/MariaDB/PostgreSQL. No IDs, uniqueness, JSON type, timestamp type, metadata merge behavior or table ownership changed. SQLite's integer affinity does not enforce these two named checks; the normalizer/API boundary still applies in SQLite tests. Existing MySQL rows within the former widths are valid after widening. The migration was applied only to isolated test databases here. For a future existing Catalog installation, review its data and backup, then run its normal `php artisan migrate`; never run `migrate:fresh` on development or production data.

## D. PostgreSQL test infrastructure

`compose.postgres-test.yml` defines two localhost-only PostgreSQL 18 test services on ports 55433/55434 with distinct `vybe_core_test` and `vybe_movies_test` databases. Docker Compose configuration validates, but Docker's daemon was unavailable locally. Verification instead used a **separate temporary PostgreSQL 18 cluster** initialized under the Windows temp directory and bound to `127.0.0.1:55433`. Its two explicitly named `_test` databases were fresh and contained no application data. The existing PostgreSQL service, MySQL development databases and Neon were not targets.

The temporary cluster used trust authentication only on loopback for this isolated test run and was stopped after verification; its test files remain under the Windows temp directory. Local MariaDB test databases `vybe_core_phase3_f6c54403_test` and `vybe_movies_phase3_f6c54403_test` were created separately from `vybe_core` and `vybe_movies` and left in place, because this phase did not delete databases. They contain only test fixtures and may be removed later by an authorized operator after confirming their identity.

CI adds a PostgreSQL service and `pdo_pgsql` to each existing backend job, then migrates and tests that job's own disposable PostgreSQL database after its MySQL lane. Each job keeps its existing MySQL test. CI connection values are localhost-only and clear `DB_URL`; it never uses Neon. Both backend test base classes reject a remote host, non-`*_test` database, nonempty URL, absent disposable flag or non-testing environment before destructive test traits run. The Core and Catalog PHPUnit defaults remain in-memory SQLite. In a shell, explicitly set the PostgreSQL test environment as shown in [local setup](setup.md).

The active PHP CLI has `pdo_pgsql` and `pgsql`. Both `config/database.php` files now default PostgreSQL `DB_SSLMODE` to `verify-full`; local isolated tests set `DB_SSLMODE=disable` on loopback. Deployment must provide valid hostname/CA verification and separate database secrets before any Neon connection. Direct connections should be used for migrations/import; pooling requires separate runtime validation.

## E. Verification results

All test commands below target in-memory SQLite or newly created, explicitly named local `_test` databases. PostgreSQL and MariaDB suites were run in separate processes. Initial exploratory failures while adjusting test isolation and MariaDB constraint syntax are superseded by the final results; they did not touch development data.

| Check | Result |
|---|---|
| Active PHP CLI / PostgreSQL extensions | PHP 8.5.11; `pdo_pgsql`, `pgsql`, `pdo_mysql`, `pdo_sqlite` present. |
| Docker Compose file | `docker compose -f compose.postgres-test.yml config --quiet` passed; Docker daemon unavailable, so containers were not started locally. |
| Fresh Core PostgreSQL migration history | 18 migrations passed on temporary PostgreSQL 18; 18 physical tables including migration tracking. |
| Fresh Catalog PostgreSQL migration history | 4 migrations passed, including numeric widening; 7 physical tables including migration tracking. |
| Fresh Core MariaDB migration history | 18 migrations passed on a new `_test` database. |
| Fresh Catalog MariaDB migration history | 4 migrations passed on a new `_test` database. |
| Core PostgreSQL suite | **430 passed, 2 skipped** (3871 assertions). |
| Catalog PostgreSQL suite | **101 passed** (438 assertions). |
| Core MariaDB suite | **430 passed, 2 skipped** (3871 assertions). |
| Catalog MariaDB suite | **101 passed** (437 assertions). |
| Core SQLite suite | **430 passed, 2 skipped** (3871 assertions). |
| Catalog SQLite suite | **98 passed, 3 skipped** (434 assertions). |
| Targeted rollback tests | Core access/review checks and Catalog numeric down/up passed on PostgreSQL and MariaDB disposable databases. |
| PHP style / whitespace | `pint --test --dirty` passed in both Laravel apps; `git diff --check` passed. GitHub Actions YAML parsed with PyYAML and has the expected three jobs. |
| Frontend | Not changed; frontend tests/type/build were not run in this backend-only phase. |
| GitHub Actions | Workflow edited locally; hosted CI execution remains unverified until a PR run. |

The two skipped Core tests are existing tests requiring live Firebase credentials. Their skip does not imply a PostgreSQL failure. SQLite skips Catalog's named-check tests and the engine-specific lossy rollback test because SQLite has no equivalent fixed integer width or support for these added named checks. MySQL 8 is covered by CI configuration but **was not available locally**; local MySQL-family verification used MariaDB 10.4. The MySQL 8 `DROP CONSTRAINT` syntax requires 8.0.19 or later per the official manual.

## F. Remaining behavioral differences and risks

- PostgreSQL default string equality and `LIKE` are case-sensitive; local MariaDB uses a case-insensitive collation. Existing normalization and tests passed on the test data, but full historical data collision/Unicode behavior needs Phase 5 reconciliation. No `citext` conversion was made.
- PostgreSQL has transactional DDL and aborts failed transactions until rollback; the adjusted test isolation demonstrates expected conflict paths without altering application logic. Concurrent multi-process write behavior and pooler behavior still require integration/stress tests.
- PostgreSQL `json`, decimal, nullable unique indexes, FK actions, timestamp/date casts, upserts, library/ratings/reviews/moderation and cache paths were exercised by suites. Historical MariaDB session timezone is `Asia/Beirut` while Laravel config is UTC; existing-data timestamp transfer remains Phase 4/5 work.
- Docker Compose was validated but not launched locally. The temporary native PostgreSQL cluster provides actual PostgreSQL execution. CI MySQL 8, Docker execution, Neon TLS/cold start, direct/pooled connection behavior and live-data migration remain unverified.

## G. Phase 4 — Catalog migration readiness

Phase 4 may begin when the Catalog fresh PostgreSQL migration and full PostgreSQL suite results above are green, the PR's MySQL 8/PostgreSQL CI lanes pass, a separate Neon Catalog project/direct connection with verified TLS and least-privilege role is available, and a restorable MySQL Catalog backup plus isolated migration rehearsal target exist. Before transfer, capture a consistent `movies` snapshot and explicit counts/hashes, verify JSON/date/time conversion and numeric bounds, choose a data-only import method, preserve TMDB IDs and timestamps, then synchronize the PostgreSQL sequence. Keep Core and Catalog credentials, roles and databases separate. No data import or connection switch is authorized by this Phase 3 report.

## H. Changed-file manifest

- CI and local test services: `.github/workflows/ci.yml`, `compose.postgres-test.yml`.
- Core configuration and behavior: `backend/.env.example`, `backend/config/database.php`, `backend/app/Http/Controllers/Api/V1/ModerationController.php`, `backend/database/migrations/2026_11_03_000004_add_access_fields_to_users_table.php`, `backend/database/migrations/2026_11_06_000001_add_review_moderation_and_reports.php`, `backend/database/seeders/DatabaseSeeder.php`.
- Core test infrastructure and cases: `backend/tests/TestCase.php`, `backend/tests/UsesPostgresSafeRefreshDatabase.php`, `backend/tests/Feature/AccessFoundationTest.php`, `backend/tests/Feature/FirebasePhase2BTest.php`, `backend/tests/Feature/FirebaseSessionTest.php`, `backend/tests/Feature/DatabaseSeederCompatibilityTest.php`, `backend/tests/Feature/PostgresPersistenceTest.php`.
- Catalog configuration and schema: `services/movie-catalog/.env.example`, `services/movie-catalog/config/database.php`, `services/movie-catalog/database/migrations/2026_11_10_000001_expand_movie_numeric_columns.php`.
- Catalog test infrastructure and cases: `services/movie-catalog/tests/TestCase.php`, `services/movie-catalog/tests/MigrationTestCase.php`, `services/movie-catalog/tests/UsesPostgresSafeRefreshDatabase.php`, `services/movie-catalog/tests/Feature/MovieApiTest.php`, `services/movie-catalog/tests/Feature/MovieNumericMigrationTest.php`.
- Documentation: `docs/database/schema.md`, `docs/development/setup.md`, `docs/development/neon-phase-3-report.md`.

## I. Neon connection prerequisites

Provision two independent projects and service roles outside this phase. Supply each Laravel service its own direct PostgreSQL host, port, database name, role and password through server-side secrets; verify `pdo_pgsql`, DNS/firewall access, CA trust, hostname validation with `DB_SSLMODE=verify-full`, and a backup/restore route. Keep Catalog's internal token and TMDB token server-side. Evaluate a separate pooled endpoint only after session/cache/queue, transaction and prepared-statement checks. Do not put database settings in `VITE_*` variables or reuse the disposable local test credentials.

## J. Exact Phase 4 gate

The local Catalog PostgreSQL migration and suite pass. Before importing any Catalog data, require a green hosted CI run on the PR (including MySQL 8 and PostgreSQL), a reviewed restorable MariaDB backup, a separate Neon Catalog target and direct connection with verified TLS, an isolated rehearsal target, and a data-only import/reconciliation plan for all movie rows and the sequence. Phase 4 must not use Core's database or credentials and must not switch the running Catalog service until its own rehearsal and HTTP acceptance pass.
