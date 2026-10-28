# React frontend architecture — Milestone 1

**Status:** Authentication and the full movie discovery vertical slice are implemented.

## Boundaries

Authentication is implemented with React Router, Axios, TanStack Query and Tailwind. `src/features/auth` owns API calls, hooks, forms and guards; shared inputs/buttons and layouts live outside the feature. Vitest API/rendering tests run with `npm test`. The movie feature supplies popular, search and detail routes using the public Core API.

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

### Cinematic homepage refinement

Home is now three sections: `BrandHero` uses the supplied `hero.png` artwork via a full-resolution WebP derivative, `Spotlight` features up to five suitable movies from the first popular response, and the existing cards form a Load More feed. The headline, description and title-only search remain HTML. Enter and the search button navigate to Discover with the query encoded in the URL. No movie metadata request is made to construct the brand hero.

`popularFeedOptions` uses TanStack `useInfiniteQuery`, starts at page 1, stops at the provider's last page/500-page boundary or an empty response, and deduplicates appended IDs without reordering movies. It can reuse an existing page-one query. Loaded pages remain cached for ten minutes after leaving; remounting does not refetch the whole feed. Next-page errors retain existing cards and expose a retry. Appending preserves the current viewport, and detail return navigation restores the cached feed and its browsing position.

The sticky navigation retains the supplied logo and only available destinations. `MovieNavigation` measures link positions and moves a single underline with transform/scale rather than mounting a new indicator. Resize measurement snaps; route changes tween over the shared 550ms navigation token. Discover page changes preserve the query and scroll/focus the results region below the sticky header, including browser back/forward; typing does not move focus.

Spotlight uses no detail requests. It prefers valid backdrops, titles, ratings and overviews, with graceful sparse-data fallback. Playback advances at the current 10-second interval with a 1100ms overlapping backdrop crossfade and a small vertical copy reveal. Its stage fills the entire carousel, including the controls and progress line. The controls overlay the image; a continuous bottom gradient supplies contrast without a separate footer. `prepareBackdrop` matches responsive image sources and waits for decoding before committing a scene; an eight-second bound or failed request preserves the current scene. The outgoing image remains opaque underneath until the fade finishes, then is released. Only the next backdrop is warmed. Latest-request guards ignore superseded/unmounted work; cached readiness distinguishes image resolutions. Hover, focus, hidden tabs, explicit pause, image preparation and reduced motion suspend playback. A hidden tab resets progress and gives the returning viewer a full interval. Only manual changes update polite screen-reader status. Controls remain accessible; one movie disables unnecessary rotation.

Discover's empty-query presentation shows six real popular picks through `useDiscoveryPicks`, reusing the first cached infinite page or fetching the existing popular endpoint. It never calls search with an empty query and does not create a recommendation algorithm. Search results replace those picks while the search panel and heading wrappers remain mounted, preventing entrance replay on pagination/query updates.

Official React Bits `AnimatedContent` and `SpotlightCard` adaptations live in `src/components/react-bits`, with revision/license notes. GSAP/ScrollTrigger powers once-only 900ms, 18px entrances on section introductions and detail information; keyboard focus completes a reveal immediately. Discover search mounts the smoothed low-intensity violet pointer light. Touch/coarse pointers and reduced motion disable it. No continuous ambient effect is enabled. Shared preferences live in `src/hooks`, and `src/styles/motion.css` centralizes timings. React Bits MCP was unavailable, so the official source repository supplied the components.

### Movie discovery implementation

`src/features/movies/` contains typed API functions, image helpers, TanStack Query hooks/options, reusable cards/grids/images/pagination/search/states, and the popular/search/detail pages. All metadata requests use the existing credentialed Axios client and Core's public API. Only credential-free image CDN requests reach TMDB from the browser. Client queries remain fresh for 60 seconds, cancel obsolete requests and disable automatic retries; the server owns metadata/ranking freshness. Invalid IDs/pages and empty queries do not trigger movie calls.

Search debounces edits for 350 ms, normalizes whitespace, resets pagination on query changes and stores `query`/`page` in the URL. Pagination retains the query; browser back/forward restores input and results. Detail links retain discovery context. A safe generic error/retry state distinguishes an unknown movie from service unavailability; hydrated stale detail remains usable with a discreet notice.

The existing AppLayout provides Home/Discover/account navigation, focus/scroll handling, a skip link and an accessible About & credits section with official TMDB attribution. Existing guards preserve guest access and verification redirects. The full approved SVG logo, compact symbol and favicon are retained. Motion follows the installed transitions-dev/transitions-polish guidance, tuned to the requested calmer pacing: 240ms feedback, 360ms card motion, 550ms navigation, 900ms entrances and 1100ms scene fades. Reduced-motion removes animation and transforms. The existing symbol loader remains; the signature ribbon animation is postponed. GSAP is the sole added animation dependency; Lottie is not used.

Vitest tests API parameters, cancellation, query caching, page/ID boundaries, rendering and auth coexistence. `frontend/tests/movie-discovery.browser.mjs` exports reusable isolated Playwright acceptance checks; import `runMovieDiscoveryChecks` in an available Playwright host and pass its `page` and optional Vite URL. It intercepts only test HTTP responses, never seeds application data. Browser checks cover debounce, navigation/history, responsive overflow, image failures, error retry and guards. Its fixture data is test-only.

Frontend uses Oxlint (`npm run lint`), TypeScript (`npx tsc -b --noEmit`), Vite (`npm run build`) and Vitest (`npm test`). API/rendering tests and reusable Playwright acceptance checks are implemented; live provider/email acceptance remains manual. All delivered pages must use real API calls; local mocks are permissible only in isolated tests or design previews explicitly marked as such.
