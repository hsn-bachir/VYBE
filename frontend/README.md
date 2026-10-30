# VYBE frontend

React/TypeScript movie discovery and existing Sanctum authentication, using the shared Axios client, TanStack Query, React Router and centralized Tailwind/CSS tokens.

## Local startup

Install locked dependencies with `npm ci`. If needed, copy `.env.example` to `.env` without overwriting an existing file. Set `VITE_API_URL=http://localhost:8000`, then:

```powershell
npm run dev -- --host localhost
```

Start Core on port 8000 and Catalog on port 8001 in separate terminals. Full configuration and walkthrough: [development setup](../docs/development/setup.md). Never put a service token or TMDB token in `VITE_*` variables.

## Movie experience

- `/`: supplied filmstrip brand hero with functional title search, rotating Spotlight and a popular poster grid with Load More.
- `/discover?query=...&page=...`: 350 ms debounced title search, URL/history support, empty/loading/error/no-results states.
- `/movies/:tmdbId`: metadata, safe image fallbacks and a discreet stale-detail notice.
- Guest movie browsing stays public; existing unverified-account redirects and all auth routes remain intact.
- The footer's About & credits contains the official TMDB logo and required notice.

API functions, types, query options/hooks, components and pages live under `src/features/movies`. Metadata travels only through Core; browser requests to TMDB are limited to credential-free image CDN URLs. The UI does not ship movie datasets.

The existing full logo, symbol and favicon are reused. Shared motion tokens provide 240ms feedback, 360ms card hovers, a 550ms navigation indicator, 900ms entrances and 1100ms scene crossfades. CSS movement uses `cubic-bezier(.22,1,.36,1)`; GSAP entrances use `power3.out`. Reduced-motion shows content immediately and disables decorative movement.

The homepage uses `hero.webp`, an optimized full-resolution derivative of the supplied `hero.png`; the desired-homepage reference remains a design reference only. The static artwork sits behind an HTML hero whose 1200ms entrance staggers the eyebrow, headline, description and search over 80/180/320/440ms. Spotlight selects up to five first-page movies, rotates at the current 10-second interval and overlaps decoded backdrops over 1100ms. The image fills one frame behind transparent overlay controls, with a smooth bottom gradient and a restrained one-pixel progress line. The outgoing image stays opaque underneath until the incoming scene finishes; failed images retain the usable scene. Spacious copy keeps its action clear of the controls on mobile. Playback pauses for hover/focus, hidden tabs, explicit pause and reduced-motion; returning from a hidden tab starts a full interval. Infinite popular pages remain deduplicated, cached for ten minutes after leaving and restored on return.

Discover adds an editorial introduction and an interactive search surface. Copy and search enter over 1200ms with gentle 12px movement and 80/200/320/440ms staggered starts; results headings reveal once over 1100ms. Reduced-motion skips these animations, and keyboard focus completes a reveal immediately. With no query, six real popular movies provide a starting point, reusing the Home feed cache when available. Query results take priority. The existing 350ms debounce, URL/history, pagination, loading/errors and results-region scroll/focus behavior are preserved.

Official React Bits TypeScript implementations are vendored under [`src/components/react-bits`](src/components/react-bits/README.md), with their source revision and MIT + Commons Clause license retained. `AnimatedContent` uses GSAP/ScrollTrigger for Home section introductions, Discover headings and movie detail information. `SpotlightCard` is mounted around Discover search, using a restrained violet pointer light with no ambient animation, grain or flare. Coarse/touch pointers and reduced-motion use a static surface. GSAP is the only new runtime dependency. React Bits MCP was not exposed; implementations came from the official repository. The installed transitions-dev and transitions-polish skills guided timing, distance and easing.

`tests/homepage-refinement.browser.mjs` exports `runHomepageRefinementChecks(page, baseUrl)`. It checks hero search, navigation, playback/pause, Load More, caching, pagination and responsive proportions. `tests/motion-discovery.browser.mjs` exports `runMotionDiscoveryChecks(page, baseUrl)` and checks actual GSAP entrances, pointer lighting, cached discovery picks, delayed/failed images, overlapping fades, long titles and reduced motion. Both run in an available Playwright host against Vite, with fixtures confined to the tests.

## Checks

```powershell
npm run test
npm run lint
npx tsc -b --noEmit
npm run build
```

Vitest covers API calls, cancellation/cache behavior, boundaries, rendered screens and existing authentication. For an available Playwright host, import `runMovieDiscoveryChecks` from `tests/movie-discovery.browser.mjs`, pass its `page` and optional Vite base URL, and await the result. The function installs isolated test response intercepts and checks debounce/history, navigation, errors, images, guest/verification behavior, responsive overflow and reduced motion. It requires a running Vite server; no additional browser dependency is installed into this project.

Browser fixtures are synthetic and confined to tests. The 2026-10-28 refinement passed 56 Vitest tests and 36 grouped browser checks across the three suites. Live Core-backed Home/Discover/Arrival details were also inspected, including desktop/mobile screenshots and a 390px touch context. This does not establish provider freshness or real email delivery. The production build succeeds with a 505KB main-chunk warning (170KB gzip); existing Axios/follow-redirects audit advisories remain outside this visual change.

The 2026-10-29 follow-up passed 59 Vitest tests, lint, `tsc -b --noEmit`, production build and 39 grouped Playwright checks. Coverage includes session server/network failure and retry recovery, full-bleed Spotlight controls, overlapping scene fades, slower staggered Home/Discover entrances and reduced motion. Home/Discover screenshots were inspected at 1440px and 390px; browser assertions also cover 360/768/1024px. These runs used isolated API fixtures: live session verification was blocked by the stopped local MySQL service, whose restart requires Windows administrator access. See [session troubleshooting](../docs/development/setup.md#we-couldnt-check-your-session). The build retains its approximately 506KB main-chunk warning.

TMDB logo source, downloaded unmodified: [official blue square logo](https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228cf3ded904ef09b136fe3fec72548ebc1fea3fbbd1ad9e36364db38b.svg). See [TMDB attribution requirements](https://developer.themoviedb.org/docs/faq).
