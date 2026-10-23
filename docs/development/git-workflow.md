# Git workflow — VYBE four-person team

`main` stores tested release snapshots, `dev` integrates reviewed work, and `feature/*`, `fix/*`, `docs/*`, `chore/*` branches contain individual changes. The original setup PR #1 was merged into `dev` on 2026-10-23; the historical [audit](repository-audit.md) remains a dated snapshot of earlier status.

```powershell
git switch dev
git pull --ff-only origin dev
git switch -c feature/catalog-tmdb-cache
# edit and run the applicable tests
git add <changed-files>
git diff --cached
git commit -m "feat(catalog): integrate tmdb provider"
git push -u origin feature/catalog-tmdb-cache
```

Open the PR against `dev` (not `main`). Add context, issue/milestone, scope, affected public/internal API contracts, env/migrations, test proof, owner and reviewer. Require CI and human approval; use squash merge. Updating `dev` after merges is a separate step (`git switch dev; git pull --ff-only`). When the milestone is complete: reviewed `dev` → `main` PR, green checks, then tag `v0.1.0`.

**Per-service checks:** Core API owner runs Core PHP tests/MySQL migrations; Catalog owner runs Catalog PHP tests/MySQL migrations and internal-auth tests; frontend owners run Oxlint/TypeScript/build and relevant UI interaction checks. Service/client contract changes require both owners to review. Codex follows the same PR process; it must not push/merge without direct authorization.

Never commit `.env`/secrets, `vendor`, `node_modules`, SQLite DB artifacts, copied temp files or PHP cache. Never force-push a shared branch or reset a populated development database.
