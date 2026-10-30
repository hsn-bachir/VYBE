# Frontend-specific agent instructions

Follow root `AGENTS.md` first, [frontend architecture](../docs/architecture/frontend.md), [API contracts](../docs/api/contracts.md) and [design system](../docs/design/design-system.md).

- Use React + TypeScript function components, React Router, one Axios instance, TanStack Query for server data and query invalidation, Tailwind with global design tokens.
- Organize domain modules under `src/features/auth` and `src/features/movies`; share only genuinely reusable primitives/layouts/hooks in `src/components`, `src/layouts`, `src/lib`, `src/styles`, `src/types`.
- Keep API paths and DTO types consistent with the approved contracts. No direct TMDB calls from browser code. No mock movie grids in completed pages.
- Sanctum SPA: call `/sanctum/csrf-cookie` before state-changing authentication calls, `withCredentials: true` and `withXSRFToken: true`, server-truth `/auth/me`; never persist auth tokens in localStorage.
- Use shared `AppLayout` and `AuthLayout`; implement accessible forms, keyboard focus, descriptive alt text, responsive grids and loading/empty/error/retry states.
- Approved colors: #0B0D12, #171B24, #8B5CF6, #EC4899, #F8F7FF, #A1A1AA. Other token values are proposals until approved. Use the supplied SVG assets in `src/assets/` for VYBE branding.
- Keep feature-specific state local; don't introduce Redux or other global state infrastructure without need.
- Report lint, typecheck and build output. Add component tests once a test runner is intentionally selected.

## Feature-Based Organization

- Every substantial frontend feature lives under `src/features/<feature-name>/` from its first implementation. Group files by responsibility in `api/`, `components/`, `hooks/`, `pages/`, `types/`, and `guards/` where applicable; do not put all feature files in the feature root.
- Put route-level screens in `pages/`. Keep genuinely shared UI under `src/components/`, layouts under `src/layouts/`, and HTTP clients/infrastructure under `src/lib/`.
- Keep tests close to their feature, follow existing naming and import conventions, and avoid empty folders or unnecessary abstractions.
