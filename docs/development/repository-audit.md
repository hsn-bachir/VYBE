# Repository audit — 2026-10-23 (historical snapshot)

> **Later verification, 2026-10-23:** Setup PR #1 was subsequently merged into `dev` (commit `6d6e60c80c3d0f5d5516df5d3971954ae8ac96d9` observed). The branch table below deliberately preserves its earlier read-only snapshot. Current architecture is now two independently runnable Laravel backends; see [ADR 0001](../decisions/0001-initial-architecture.md).

**Source:** Read-only GitHub inspection of `hsn-bachir/VYBE` on 23 October 2026. Earlier conversations reported PR #1 merged; **GitHub itself showed it open**, so branch evidence supersedes the prior assertion. Re-run this audit after integration; do not silently rewrite its history.

| Ref | Git revision | Observed |
| --- | --- | --- |
| `main` / `dev` | `23eaef16ce092aaa34183c830a59f46cae590cb3` | Original README only |
| `feature/project-setup` | `7ac30f69b1bf7861bf2a0b147442c61acebface3` | Laravel/React scaffold, `.gitignore`, `.editorconfig`, CI |
| [PR #1](https://github.com/hsn-bachir/VYBE/pull/1) | Open, not merged | Setup proposed for `dev` |

## Verified setup branch

- Backend `composer.json`: Laravel `^13.0`, PHP `^8.3`, basic PHPUnit/Artisan/Pint setup. Dependency lock was reported to contain packages requiring PHP >=8.4.1; verify locally via Composer platform check.
- Backend `bootstrap/app.php`: web and console routing; no API routing, stateful Sanctum middleware or feature controllers yet.
- Existing users migration: `name` default length 255, password required, no `avatar_url`; `sessions` and `password_reset_tokens` included. No movies table.
- Backend `phpunit.xml`: `DB_CONNECTION=sqlite`, in-memory DB; CI separately runs `php artisan migrate` with a MySQL service. Do **not** call PHPUnit MySQL coverage without confirming runtime override.
- Frontend `package.json`: React, React DOM, Vite, TypeScript, Oxlint; no Tailwind, Axios, React Router, TanStack Query, test runner. Frontend starter only.
- CI `.github/workflows/ci.yml`: PHP 8.4, MySQL 8.0 migration step, backend tests, npm lint + TypeScript check + build. No deployment pipeline.
- No original AGENTS.md or engineering docs in audited ref.

## Not verified by this audit

- Local XAMPP engine/version, teammates' runtime environments, enforcement of all branch rules, acceptance of collaborator invitations, complete PR review status, actual implementation of milestone requirements.
- The Work-generated documentation text was not committed merely because it appeared in the chat output.

## Next action

Review/setup PR #1 and merge when all required policies/checks pass. Then branch documentation from fresh `dev`, install these docs, open a docs PR and update current status in README/checklist appropriately. Do not merge documentation directly into `main`.
