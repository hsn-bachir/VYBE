# Teammate onboarding — VYBE Milestone 1

1. Accept the invitation to `hsn-bachir/VYBE`, install Git, VS Code, compatible PHP/Composer, Node/npm and XAMPP. See [setup](setup.md).
2. Clone and check out up-to-date `dev`. Verify that initial setup PR #1 is merged; historical [repository audit](repository-audit.md) records the prior branch state, not the current state.
3. Read [architecture](../architecture/system-overview.md), [microservices](../architecture/microservices.md), [public/internal contracts](../api/contracts.md), [database ownership](../database/schema.md) and root [AGENTS.md](../../AGENTS.md).
4. Create `vybe_core` and `vybe_movies` locally, each with its own Laravel `.env`. Keep secrets outside Git. Run Core (:8000), Catalog (:8001), React (:5173) and confirm Catalog's internal health token gate.
5. Run Core and Catalog tests **separately** and frontend lint/type/build. Never run destructive migration commands on your working databases.
6. Agree on your owner area and another developer's PR reviewer; see [team plan](team-plan.md) and [Git workflow](git-workflow.md).
7. Branch from current `dev`; commit only scope-approved work. Open small PRs into `dev` with CI evidence, especially when internal API contracts change.

Any credentials (MySQL users, Catalog internal token, TMDB API token) are managed locally or as CI secrets, **never** committed, pasted into issues or bundled into React.
