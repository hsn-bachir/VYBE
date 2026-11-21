# VYBE React Frontend — Scoped Agent Rules

**Mandatory first reads:** [`../AGENTS.md`](../AGENTS.md), [`../PROJECT_ROADMAP.md`](../PROJECT_ROADMAP.md), [`../docs/AI_AGENT_PLAYBOOK.md`](../docs/AI_AGENT_PLAYBOOK.md), [`../docs/architecture/frontend.md`](../docs/architecture/frontend.md), [`../docs/design/design-system.md`](../docs/design/design-system.md), `src/App.tsx`, matching `src/features/*` pages/hooks/tests.

## Architecture

- React + Vite + TypeScript, Tailwind/semantic CSS variables, React Router, one shared Axios Core client, TanStack Query for remote data. No React calls to TMDB/Catalog/DB or localStorage bearer auth; keep Firebase session exchange and Sanctum cookie/CSRF patterns as currently implemented.
- Every feature belongs under `src/features/<domain>/`, grouped by `api`, `pages`, `components`, `hooks`, `types`, `guards` when needed. Shared UI belongs under `src/components`; layouts under `src/layouts`; infrastructure under `src/lib`. Do not duplicate common movie cards, navigation, permissions or movie-library state.
- Add new social/movie-night screens and navigation within existing route/guard conventions. Do not leak private profile activity through public routes; handle guest/verified/restricted states according to backend truth. React hiding a control is not authorization.
- Query keys must be scoped correctly by authenticated owner where needed, and cleared or invalidated after logout/account changes, library writes, visibility changes or relevant mutations. Cancel obsolete requests, use loading/empty/error/retry states, and avoid per-card API requests.

## Preserve the approved VYBE identity

- Use `src/assets/logo.svg`, `symbol.svg`, `icon.svg` unchanged: official premium ribbon-V brand. Approved colors: background `#0B0D12`, surface `#171B24`, violet `#8B5CF6`, pink `#EC4899`, text `#F8F7FF`, muted `#A1A1AA` **through existing tokens**.
- Premium, spacious but not wasteful, poster-forward; reuse `AppLayout`, movie navigation, MovieCard/MovieGrid/MovieState, Button/Input/Dialog/Avatar, existing collection/rating components and React Bits AnimatedContent/SpotlightCard/PeekRating. Respect their licenses and reduced-motion/focus behavior. Do not remove core animations as an unmeasured optimization.
- **Never make a page look like an admin cockpit.** Use a single consistent content-width/gutter system; no arbitrary filter `max-width`, sticky filters, overlapping panels, off-grid toolbar or useless empty space. Expanded controls remain in normal flow. Reuse the Discover filter UX lessons rather than recreating them.
- Movie posters 2:3, stable skeleton geometry and missing-image fallbacks. New features need accessible labels, focus, keyboard navigation, meaningful error messages, hover states and touch targets.
- UI change is incomplete until inspected at **390, 768, 1024, 1440 px** with collapsed/expanded and mobile states as appropriate, with no horizontal overflow. Unit tests alone don't establish good design; verify screenshots/bounding boxes if browser tools available. Never claim visual inspection without it.

## Verification

Run `npm test -- --reporter=dot`, `npm run lint`, `npx tsc -b --noEmit`, `npm run build` and relevant browser acceptance modules. Test safe API DTO typing, URL/back-forward, server errors, query invalidation, owner/cache isolation, responsive UI and reduced motion. Report exactly which checks passed and which integration/provider/visual checks remain unverified. No unauthorized branch/commit/push/merge.
