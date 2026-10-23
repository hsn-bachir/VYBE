# Git workflow — four-person team

## Branch model

- `main` — stable approved release snapshots; do not push directly.
- `dev` — integration branch for reviewed features; do not push directly.
- `feature/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>` — short-lived task branches from fresh `dev`.

**Current exception:** Setup PR #1 is still open as of 2026-10-23; merge it through its existing review/CI process *before* using its scaffold as the base for future feature branches. Don't report `dev` as containing setup until verified.

## Start work

```powershell
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feature/authentication
```

Commit small logical changes with Conventional Commits, for example `feat(auth): implement session login`. Do not commit `.env`, vendor/node_modules, build outputs, database dumps or tokens. Use `git diff --cached` to inspect staged changes.

```powershell
git add <specific-files>
git diff --cached
git commit -m "feat(auth): implement session login"
git push -u origin feature/authentication
```

## Pull request workflow

PR base `dev`, compare your task branch. Describe scope, screenshots for UI changes, config/migration changes, tests run, expected behavior and any API contract docs changed. Ask at least one teammate for human review, address comments and check GitHub Actions. If rules aren't enforceable on the current account plan, follow the process manually anyway. Use squash merging for task PRs. Avoid merging when checks are failing or review concerns are unresolved.

**Release:** when milestone acceptance tests pass, open `dev` → `main` PR, review/regression-test, merge and tag `v0.1.0`. Never tag an unreviewed milestone. Don't delete long-lived `dev` or `main`. Auto-delete merged task branches if configured.

## Updating a branch after integration changes

Fetch changes, then either merge `origin/dev` into the task branch for shared/long-running PRs, or rebase your private branch when the team is comfortable with rewriting its history. Don't force-push a shared branch; prefer simple merges for novice teams. Resolve conflicts in code and re-run tests. GitHub squash merges mean a feature branch should generally be retired after merge.

## Codex rules

AI-generated changes use the same workflow, test coverage and human review as hand-written changes. Codex can propose edits and analyze a PR, but cannot declare test success without logs and cannot commit/push/merge without explicit user authorization. Review particularly for unrelated changes, hardcoded test data, auth/CSRF bypass, lost error states, deleted docs and secret leakage.

## Contributor checklist

- Task is in active milestone; docs/contract updates included as needed.
- Tested affected backend/frontend commands and documented what was actually run.
- No generated junk, debug statements, secrets or unnecessary dependencies.
- API and UI response contracts agree; error/loading states checked.
- PR into `dev`; reviewer + green checks; no direct `main` updates.
