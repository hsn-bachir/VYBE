# Teammate onboarding

This guide applies to new VYBE team members. Complete it once, then use [Git workflow](git-workflow.md) for daily work.

## Checklist

1. Accept the GitHub invite and confirm `hsn-bachir/VYBE` is visible.
2. Install VS Code, Git, PHP, Composer, Node.js, npm and XAMPP; check versions from [setup](setup.md).
3. Clone the repository, check `dev`, and confirm the setup PR has merged. Read [audit](repository-audit.md) to understand branch snapshots.
4. Follow [setup](setup.md); create your own local `backend/.env`, never share credentials through Git.
5. Run `php artisan migrate` on your **own** development DB and `php artisan test` on the configured test DB. Start backend/front end independently and confirm both respond.
6. Read [system overview](../architecture/system-overview.md), [Milestone 1 checklist](milestone-1-checklist.md), [API contracts](../api/contracts.md), [design system](../design/design-system.md) and root [AGENTS.md](../../AGENTS.md).
7. Configure Git author info and open a small docs-only practice PR against `dev` if you are new to reviews.
8. Agree with the team on task owner and interface dependencies before touching shared files.

## Ownership and communication

Split work by end-to-end deliverables (e.g. auth API + auth UI or movie backend + integration), not just random files; declare any shared API contract change in the PR. One teammate reviews another's PR. Document decisions in ADRs instead of making incompatible assumptions in chat.

## First-day commands

```powershell
git clone https://github.com/hsn-bachir/VYBE.git
cd VYBE
git switch dev
git pull --ff-only origin dev
git status
```

See [setup](setup.md) for Composer/npm/database commands and troubleshooting. Never run `migrate:fresh` on `vybe` or another non-disposable database.

## Definition of ready

A task is ready only when its scope, acceptance criteria, branch base, API/design dependencies and reviewer are clear. If it changes architecture, resolve open microservices/instructor requirements first.
