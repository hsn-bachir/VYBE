# Teammate onboarding

Start here. VYBE is a four-person Laravel API + React TypeScript project. Only Milestone 1 is active.

## First session

1. Accept the GitHub invitation using the intended account; ask the maintainer if repository access fails. Invitation acceptance was not verified in this audit.
2. Read [README](../../README.md), [scope](../architecture/system-overview.md) and [audit](repository-audit.md).
3. Check [setup PR #1](https://github.com/hsn-bachir/VYBE/pull/1). At audit it is open and dev only has a README. Do not assume scaffolding is integrated.
4. Install compatible PHP/Node/Composer/database tools, then follow [setup](setup.md). Do not rerun project generators.
5. Use your own ignored .env, APP_KEY and database; never copy a teammate's real credentials.
6. Run documented checks and open the current starter pages. Record problems with actual command/output, excluding secrets.
7. Choose one scoped task/issue and create a task branch from current dev after integration.
8. Read relevant docs and nested AGENTS.md before using Codex or editing code.

## Working together

| Area | Team convention |
| --- | --- |
| Task board | One owner per small issue; definition of done and milestone |
| Reviews | Another teammate reviews changes; authors do not self-approve |
| Database | Coordinate migration owner; never reset shared data |
| Contracts | Agree API payload/error changes before frontend/backend diverge |
| UI | Reuse tokens/layout/components across all screens |
| Tests | Include behavior/failure paths and report what ran |
| Secrets | Private local configuration; no tokens in Git, screenshots or chat logs |
| Integration | Small PRs to dev; demonstrate each working increment |

Proposed division for the first implementation increment: backend identity, backend movie/cache, frontend auth/design foundation, frontend discovery/integration. These are work areas, not assigned people. Rotate reviews and require cross-layer integration checks; avoid four long-lived isolated branches.

## Daily routine

Inspect git status, synchronize clean dev with --ff-only, branch for the task, implement only its scope, run checks, review diff and submit a focused PR. Details in [git workflow](git-workflow.md). Never solve a conflict by deleting somebody else's work.

PR notes should explain outcome, related issue, contract/schema impact, screenshots for UI and exact verification. A passing build does not prove authentication or cache behavior.

## Using Codex safely

Give the task, acceptance criteria and permitted scope. Ask it to inspect relevant docs/code and propose a focused change. State whether Git mutations are authorized. Root instructions prohibit automatic commits/pushes/merges/branch switches without explicit authorization. Do not paste .env credentials. Review every generated diff and run the app yourself for the user workflow.

Do not ask an agent to “finish the whole platform.” Future proposals and the university feature list do not authorize implementation outside the active milestone.

## Escalate early

- Instructor clarification: independently deployable services and Laravel/MVC evidence.
- Team decision: proposed contracts, public browsing, password/hash policy and UI additions.
- Maintainer issue: missing access, protection settings, runtime/CI incompatibility.
- Security issue: stop sharing sensitive output, notify maintainer privately and rotate exposed secrets.

No merge/release permission follows from this document. See [readiness checklist](milestone-1-checklist.md).

