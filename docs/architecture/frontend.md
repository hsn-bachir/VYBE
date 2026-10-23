# React frontend architecture — Milestone 1

**Status:** Approved design target. Initial integrated scaffold has stock React/Vite TypeScript app; routing, Tailwind, Axios and TanStack Query packages have not yet been installed as of the audit.

## Boundaries

- Browser calls **only Core Laravel API** (`http://localhost:8000/api/v1`); it never queries Catalog (`:8001`), MySQL, or TMDB directly. The Core façade owns the public movie routes.
- Axios client in `src/lib/api/` handles common base URL, JSON headers, credentials, CSRF support and normalized error extraction.
- TanStack Query caches **remote API response state**; local UI state remains in components/hooks. React Router handles navigation.
- Auth state must be resolved from `GET /api/v1/auth/me`, not a local storage token.
- Shared layouts/navigation and design tokens live outside domain modules.

## Proposed source tree

```text
frontend/src/
  app/                  # router and providers
  components/ui/        # accessible Button, Input, Skeleton, Toast, etc.
  layouts/              # AppLayout and AuthLayout
  features/
    auth/               # screens, forms, queries, API, types
    movies/             # popular, search, detail, MovieCard, APIs, types
  lib/api/              # Axios instance, CSRF helper, error normalization
  styles/               # CSS + Tailwind theme tokens
  types/                # truly shared contracts
```

Avoid turning every primitive into an abstract component. No global Redux store without concrete justification.

## Routes

| Path | Screen | Auth |
| --- | --- | --- |
| `/` | Movie home / popular | Public |
| `/discover` | Search and results | Public |
| `/movies/:tmdbId` | Details | Public |
| `/login` | Email/password sign in | Guest-friendly |
| `/register` | Email/password registration | Guest-friendly |
| `*` | Not found | Public |

Display disabled OAuth options labelled **Coming soon**; they must not initiate fake login.

## Data flow

`screen → feature hook (useQuery/useMutation) → typed API function → shared Axios → Laravel JSON`. Use query keys with parameters: `['movies','popular',page]`, `['movies','search',query,page]`, `['movies','detail',tmdbId]` (exact keys may evolve). Debounce user typing; reset page to 1 when query changes; ignore stale responses rather than allowing them to overwrite newer queries.

Client-side stale-time improves UX but is not a replacement for server metadata and provider ranking caches. Local UI may render stale results with appropriate refetch behavior.

### SPA authentication

Initialize `/sanctum/csrf-cookie` before registration/login/logout state-changing requests. Axios `withCredentials: true` and `withXSRFToken: true` with matching domain/CORS setup. Recheck `/auth/me` on initial load. Clear relevant cached auth query on logout and handle 401/419 respectfully; do not cause endless redirect/refetch loops. No session bearer tokens in localStorage.

## UI foundation

`AppLayout` provides consistent responsive navigation, content width and footer/About credits. `AuthLayout` provides consistent registration/login flow. `MovieCard`, posters, section titles, forms, feedback, loading skeletons, empty/error/retry states share tokens from [design system](../design/design-system.md). Accessible labels, semantic roles, visible keyboard focus, meaningful poster alt text and reduced-motion behavior are required.

## Quality gates

Current scaffold uses Oxlint (`npm run lint`), TypeScript check (`npx tsc -b --noEmit`) and `npm run build`; there is no frontend test runner yet. Before complicated interactions, select a small component test stack (proposal: Vitest + Testing Library) with documented ownership. All delivered pages must use real API calls; local mocks are permissible only in isolated tests or design previews explicitly marked as such.
