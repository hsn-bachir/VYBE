# VYBE design system — Milestone 1

**Status:** Base brand palette **approved**; additional scale values below are **proposals**. The supplied `logo.svg`, `symbol.svg` and `icon.svg` are approved VYBE branding assets and are reused by the application.

## Visual direction

Premium cinematic, contemporary and readable: deep dark surfaces, restrained violet/pink accents, strong poster imagery, clean hierarchy, subtle rather than heavy 3D effects. Consistent layouts matter more than page-specific decoration. Branded V-shaped icons remain an exploration, not a mandatory replacement for accessible universally understood controls.

## Foundation tokens

| Token | Value | Status / use |
| --- | --- | --- |
| `background` | `#0B0D12` | Approved page background |
| `surface` | `#171B24` | Approved raised cards and panels |
| `primary` | `#8B5CF6` | Approved primary purple |
| `secondary` | `#EC4899` | Approved pink accent |
| `foreground` | `#F8F7FF` | Approved main text |
| `muted` | `#A1A1AA` | Approved secondary text |
| `border` | `#303443` | Proposed divider and outline |
| `surface-hover` | `#212637` | Proposed interactive surface |
| `danger` | `#F87171` | Proposed destructive/error color |
| `success` | `#34D399` | Proposed positive feedback |

Map into semantic Tailwind theme/CSS variables, ideally `:root` + a single theme definition. Avoid scattered literal colors; UI should reference semantic names (e.g. `bg-surface`, `text-muted`) rather than directly hardcode hex.

### Additional scale proposals

- Typography: modern sans-serif with locally supported fallbacks; heading 2rem–3rem responsive, body 1rem, captions 0.875rem. Choose a licensed display font later; no font files bundled here.
- Spacing: 4px base (`1,2,3,4,6,8,12,16` steps), max content width around 1280px.
- Radius: 8px controls, 12px panels, 16px hero cards; pills only for tags/chips.
- Shadow: understated on near-black background; use border + luminance separation primarily.
- Motion: centralized, purpose-specific timing in `frontend/src/styles/motion.css`; honor `prefers-reduced-motion`.
- Gradient: occasional violet→pink for hero/highlight, not every surface. Poster art should remain focal.

## Shared layout contracts

The shared `VybeLogo` component uses the approved full SVG in navigation/authentication and the symbol in compact contexts. `icon.svg` remains the favicon. Discovery uses cinematic backdrops, readable gradients, poster grids and shared loading/error states; no alternate logo or design system is introduced.

**AppLayout:** responsive header/navigation, branding, discovery/search access, account affordance, main content and footer. Use one reusable spacing/container system on Home, Discover, Details and 404 pages. About/Credits area must include the approved TMDB logo/notice before provider-backed public release.

**AuthLayout:** focused accessible content column/card, VYBE identity, consistent form labels, inline error messages and links between Login/Register. Disabled Google/GitHub options display "Coming soon", visually and semantically disabled without misleading interactions.

## Core UI primitives and states

| Component | Expected behavior |
| --- | --- |
| Buttons | Primary, secondary, ghost, destructive where needed; visible focus/disabled/loading state; no double submit |
| Inputs | Explicit labels, hint/error text, accessible validation, password reveal with clear semantics |
| MovieCard | Poster aspect 2:3, title, optional release year/rating, stable height, fallback when poster missing; whole-card navigation accessible |
| MovieGrid | Responsive from 2 columns small screens to 4–6 on wide; no layout jump after imagery loads |
| Skeleton | Match content geometry, avoid rapid flashing or false data |
| Empty/Error | Explain no matches vs network failure; offer retry where meaningful |
| Toast | Reserved for transient action confirmation; meaningful error content should remain on page |
| Dialog | Focus trapping/restoration, Escape close, labelled title; use only if required |

## Page specifications

1. **Login/Register:** email/password fields, validation, disabled OAuth placeholders, clear 401/422 feedback, mobile-friendly.
2. **Home/Popular:** heading, curated provider-ranked grid, skeletons, page controls, network-error state.
3. **Discover/Search:** accessible input, debounce, URL state for search/page if appropriate, no-results feedback, pagination.
4. **Movie Details:** backdrop/hero/poster, overview, genres, runtime, rating and release date, data gaps handled gracefully.
5. **404:** branded clear recovery link without pretending data exists.

## Accessibility and responsive behavior

The supplied `hero.png` and `desigeredHomapage.png` guide the homepage composition. The original filmstrip is preserved and a 124 KB WebP derivative is served at its original 1774×887 dimensions. Navbar, headline, description and search are HTML; the reference screenshot is never used as a page background. The hero artwork stays still. Home continues with a smaller editorial Spotlight and the existing poster cards.

The navigation underline is one measured element animated with transform/scale over 550ms. Spotlight uses a 1100ms crossfade with the decoded incoming image over an opaque outgoing scene; copy exits sooner and gently rises into the next scene. Automatic changes currently happen at 10-second intervals and stop for hover, focus, explicit pause, hidden tabs, image preparation and reduced-motion. Returning from a hidden tab receives a full interval. Reduced-motion keeps manual controls and removes transitions. One uninterrupted backdrop extends behind the controls, with a gradual dark lower gradient and a subtle one-pixel progress line. The static filmstrip hero uses a 1200ms, 8px rise with a quieter ease and 80/180/320/440ms entrance delays; reduced-motion reveals its content immediately.

The motion vocabulary is 240ms control feedback, 360ms card/poster hover, 550ms navigation, 900ms content entrances and 1100ms scene changes. CSS uses `cubic-bezier(.22,1,.36,1)` for movement and `ease-in-out` for scene opacity; GSAP uses `power3.out` for entrances. Entrances rise 14–18px once, with no card-by-card stagger or interference with query updates. Official React Bits Animated Content uses GSAP/ScrollTrigger; its adaptation and license are retained with the source. Keyboard focus completes reveals, and reduced-motion immediately shows content. Skeleton and symbol pulses remain bounded. No parallax or layout animation is introduced.

Discover uses an editorial introduction, a layered search surface and six real popular picks before a query is entered. The mounted React Bits Spotlight Card applies a soft violet radial light at 9% intensity only on fine-pointer interaction. No ambient motion, flare or grain is enabled; touch/coarse pointers and reduced-motion receive the static surface. This treatment is confined to search, keeping movie artwork in focus. The approved logo, typography and palette remain unchanged.

Movie grids use two/three/four/six columns according to available width. Poster slots retain a 2:3 ratio, including missing/broken-image fallbacks. The supplied filmstrip remains Home's primary brand hero; the smaller movie Spotlight uses popular API summaries without extra detail requests.

- Meet WCAG AA contrast where practical; check actual text/button combinations, especially purple/pink foreground and muted text.
- Visible focus indicator; all controls keyboard accessible; semantic form and heading structure.
- Meaningful alt text for informational imagery, empty alt for decorative assets.
- Do not rely on color alone for form status. Disable animations per OS reduced-motion preference.
- Design/test widths approximately 360, 768, 1024 and 1440px. Navigation must not disappear without an accessible replacement.

## Approval and asset rules

The supplied VYBE SVGs are approved. Additional branded icon families, fonts and illustrations require review. Do not generate/lookalike-copyright a logo or claim official artwork final. Never use TMDB's logo as VYBE's own. TMDB assets require attribution and approved branding.
