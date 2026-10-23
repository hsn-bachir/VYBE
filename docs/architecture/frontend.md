# React frontend architecture — Milestone 1

**Status:** Authentication and shared UI foundation implemented. Movie discovery remains a separate Milestone 1 task.

## Boundaries

Authentication is implemented with React Router, Axios, TanStack Query and Tailwind. `src/features/auth` owns API calls, hooks, forms and guards; shared inputs/buttons and layouts live outside the feature. Vitest API/rendering tests run with `npm test`. Movie pages remain unimplemented; the initial scaffold contained no movie routes.

`GuestOnly` directs an unverified signed-in user to `/verify-email`, and `PublicOrVerified` allows guests on public pages while redirecting unverified sessions to the verification experience. `RequireAuth` is the reusable guard for future verified-only account pages. Success is shown only after `/auth/me` confirms a verification timestamp; focus refreshes status without polling. The shared `VybeLogo` component uses the supplied full logo in authentication layouts and the symbol in compact navigation. The supplied icon is the favicon.

- Browser calls **only Core Laravel API** (`http://localhost:8000/api/v1`); it never queries Catalog (`:8001`), MySQL, or TMDB directly. The Core façade owns the public movie routes.
- Axios client in `src/lib/api/` handles common base URL, JSON headers, credentials, CSRF support and normalized error extraction.
- TanStack Query caches **remote API response state**; local UI state remains in components/hooks. React Router handles navigation.
- Auth state must be resolved from `GET /api/v1/auth/me`, not a local storage token.
- Shared layouts/navigation and design tokens live outside domain modules.

## Feature-Based Organization

Every substantial feature starts under `src/features/<feature-name>/` and groups files by responsibility. Use `api/`, `components/`, `hooks/`, `pages/`, `types/`, and `guards/` where they contain real code. Keep route-level screens in `pages/`; place shared UI in `src/components/`, shared layouts in `src/layouts/`, and shared HTTP infrastructure in `src/lib/`. Avoid root-level feature-file piles, empty folders, and abstractions without a concrete use. Follow existing naming and relative import conventions.

## Representative source tree

```text
frontend/src/
  components/
    branding/VybeLogo.tsx
    ui/                 # shared Button and Input
  layouts/              # AppLayout and AuthLayout
  features/
    auth/
      api/authApi.ts
      components/AuthForm.tsx
      guards/AuthGuards.tsx
      hooks/useAuth.ts
      pages/            # LoginPage, RegisterPage, VerificationPage
      types/auth.types.ts
      tests/Auth.test.tsx
  lib/api/client.ts      # single Axios instance and error normalization
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

Frontend uses Oxlint (`npm run lint`), TypeScript (`npx tsc -b --noEmit`), Vite (`npm run build`) and Vitest (`npm test`). API and server-rendered form tests are implemented; interactive browser acceptance remains manual. All delivered pages must use real API calls; local mocks are permissible only in isolated tests or design previews explicitly marked as such.
