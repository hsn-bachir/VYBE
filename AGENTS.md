# VYBE — Repository-Wide Instructions for AI Coding Agents

> **Applies to Codex and other coding assistants.** Claude Code also reads [`CLAUDE.md`](CLAUDE.md).  
> **Start:** [`PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md) → [`docs/AI_AGENT_PLAYBOOK.md`](docs/AI_AGENT_PLAYBOOK.md) → relevant service-specific `AGENTS.md` → actual source/tests.  
> These instructions replace an older M2-only scope description. **Current `dev` already includes M3.3 For You, Advanced Discover, Firebase and PostgreSQL compatibility work.** Verify the checkout; this claim is a 2026-11-21 remote `dev` snapshot.

## Required startup workflow

1. Check `git status -sb`, current branch, recent commits and existing branches before editing. Do not silently switch branches or discard work.
2. Read the university requirement map and status in `PROJECT_ROADMAP.md`. Know the requested **PDF item and roadmap task ID**. M4–M8 are proposed team delivery phases, not official university milestones.
3. Read `docs/AI_AGENT_PLAYBOOK.md`, the affected directory's `AGENTS.md`, relevant API/data/architecture docs and the **current implementation**. Old M1/M2/M3 checklist headings may be stale; never equate proposed scope with working code.
4. Propose a focused implementation plan showing service ownership, privacy/authorization, data/API changes, tests, browser validation and migration/deployment implications. Reuse existing patterns.
5. Implement targeted vertical slices, update tests/contracts/roadmap together, and report verified results and remaining limitations. Do not claim live-provider or browser verification from fakes.

## Architectural ownership — never violate

- **React SPA** `frontend/`: React/Vite/TypeScript/Tailwind/React Router/TanStack Query. Calls **only Laravel Core** with session cookies/CSRF through existing Axios client. Never directly calls TMDB, Catalog or either database.
- **Laravel Core** `backend/`: owns authentication/session/Firebase UID mapping, users, ratings/reviews, libraries/collections, public social data and privacy, events/votes, administration, moderation, recommendation ranking and all browser-facing `/api/v1/*` endpoints. Does **not** query Catalog DB or call TMDB.
- **Laravel Catalog** `services/movie-catalog/`: owns TMDB secrets/provider transport, movie metadata/credits, normalization, cache and bounded candidate generation. Internal `/api/internal/v1/*` uses server-only `X-VYBE-Service-Token`. No Core users/user data or cross-DB joins.
- Cross-service movie references use TMDB IDs and HTTP DTOs. Reuse existing batch summaries, pagination, discovery and safe error translation. Never expose private preferences to Catalog or publicly cache personalized responses.
- Follow Laravel's pragmatic route → FormRequest → controller → service → Eloquent/HTTP → Resource pattern; don't introduce fake repository layers, extra services or dependencies without need.

## Security and data handling

- Retain Sanctum first-party sessions, Firebase identity mapping, CSRF, role/status/verification gates, throttling and server-scoped owner IDs. No JWT/localStorage replacement or `VITE_*` secrets.
- All new public social surfaces require explicit projection and **private-by-default** migration of existing personal lists/activity. Enforce in SQL/backend, not only UI; test guest, owner, other user, restricted/banned cases.
- Preserve audit/moderation history and avoid destructive “hard delete” until policy approved. Test failed writes/races and cross-user data leakage.
- Use independent disposable test databases; **never** run `migrate:fresh`, `db:wipe`, hard resets or destructive SQL on shared/local-dev/Neon/prod data.
- Historical docs show MySQL, newer work supports PostgreSQL; inspect actual environment/CI/migrations before assuming a database engine.
- Do not commit `.env`, keys, tokens, DB backups, `node_modules`, `vendor` or generated logs.

## Frontend design (approved VYBE identity)

- Approved assets: `frontend/src/assets/logo.svg`, `symbol.svg`, `icon.svg` (overlapping violet ribbon V + clean Vybe wordmark). Don't replace branding.
- Colors: `#0B0D12` background, `#171B24` surface, `#8B5CF6` purple, `#EC4899` accent, `#F8F7FF` text, `#A1A1AA` muted. Reference the **existing semantic tokens**, not new isolated hex values.
- Premium cinematic, poster-first, calm hierarchy. Reuse existing `MovieCard`, `MovieGrid`, navigation/layout, UI primitives, rating widgets and React Bits motion; preserve reduced-motion, focus and accessible states.
- Never remove key animations/React Bits or degrade Home/Discover/FYP for a cosmetic optimization. Ensure full-width content alignment, normal flow (no overlapping panels), usable gaps, 2:3 posters, no horizontal overflow.
- UI change requires **actual visual/bounding-box verification** at 390, 768, 1024 and 1440 px, including expanded/closed panels and mobile. Lint/build/unit tests alone are insufficient evidence.

## Git and change policy

- Short-lived task branches → PR into `dev`; `main` is a separate reviewed release target. Verify dependencies are already merged **before creating a new branch**.
- **Check if a branch exists** before `git switch -c`. When it exists, switch to it (if safe) and update deliberately; do not delete/reset it to hide a history problem.
- No commits, pushes, branch switches, merges, history rewrites or force-pushes unless **explicitly requested** by the operator.
- One primary owner/reviewer per area; coordinate shared route/client/User/layout edits with teammates. Add PR link, acceptance evidence and roadmap update.

## Test and reporting expectations

- Core `cd backend; php artisan test --compact` and Catalog `cd services/movie-catalog; php artisan test --compact` using safe test DBs; run focused tests as needed.
- Frontend `cd frontend; npm test -- --reporter=dot; npm run lint; npx tsc -b --noEmit; npm run build`.
- Test provider HTTP with fakes; distinguish mocked benchmark from real TMDB. Verify authorization/validation/throttling/partial failure/privacy and accessible responsive UI as relevant.
- End report: changed files, test commands/results, API/migrations/config, performance/visual evidence, unverified gates, Git status and decisions. No invented test totals or “100% complete” claims.

**Detailed requirements and handoff checklists:** [`docs/AI_AGENT_PLAYBOOK.md`](docs/AI_AGENT_PLAYBOOK.md).  
**Current work priorities:** [`PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md).  
**Design contract:** [`docs/design/design-system.md`](docs/design/design-system.md).
