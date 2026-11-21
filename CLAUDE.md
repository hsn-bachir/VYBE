# VYBE — Claude Code Project Entry Point

This repository uses **the same architecture, product roadmap, design and delivery rules for Claude and Codex**. Do not invent a separate Claude workflow.

## Mandatory read order

1. [`AGENTS.md`](AGENTS.md) — project-wide coding rules and security boundaries.
2. [`PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md) — PDF requirements, what has actually been implemented, remaining milestones, release gaps.
3. [`docs/AI_AGENT_PLAYBOOK.md`](docs/AI_AGENT_PLAYBOOK.md) — working agreement, startup commands, UI requirements, verification and PR handoffs.
4. Relevant nested `AGENTS.md`: `backend/AGENTS.md`, `frontend/AGENTS.md`, or `services/movie-catalog/AGENTS.md`.
5. Relevant source, tests, contracts and design docs listed in the playbook.

**Before editing:** run `git status -sb` and check current branch/PR dependencies. Existing branches may have been created before required PR merges. Protect uncommitted work. Inspect actual code rather than relying on historical roadmap statements.

**Architectural invariant:** React → Core Laravel API → independently running Catalog Laravel API → TMDB. Core owns user/social/event data and all personalization; Catalog owns movie metadata/providers; never cross-query databases or bypass Core from the browser.

**UI invariant:** preserve premium dark VYBE branding, official ribbon-V assets, shared React components and React Bits, responsive/accessible interaction and actual rendered geometry. Do not turn cinematic movie pages into dense admin panels.

**Current product direction:** complete the missing PDF objectives in `PROJECT_ROADMAP.md` (social/public sharing, Movie Night, five integrations, admin analytics), then system-wide release acceptance. The roadmap's proposed M4–M8 phases are not proof of implementation.

**Finish:** summarize actual changed files, tests executed, browser/provider evidence, risks, and uncommitted Git state. Do not automatically commit, push, create or merge PRs without explicit authorization.
