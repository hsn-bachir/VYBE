# React Bits adaptations for VYBE

Vendored from [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits), commit `e12c22192ac7b4b452c5e2feb9b586d74765d696`:

- `src/ts-default/Animations/AnimatedContent/AnimatedContent.tsx`
- `src/ts-default/Components/SpotlightCard/SpotlightCard.tsx` and its stylesheet

The upstream **MIT + Commons Clause** license is retained in [LICENSE.md](./LICENSE.md). These components are incorporated into VYBE, not distributed as a standalone component product. The React Bits MCP was unavailable during implementation, so the official repository supplied the implementations.

`AnimatedContent` retains GSAP timelines, context cleanup and ScrollTrigger. VYBE defaults to an 18px rise and the centralized 900ms entrance token. Completed entrances do not replay on query updates or ordinary scrolling. Reduced motion shows content immediately; keyboard focus completes an in-progress entrance. The initial markup remains visible if JavaScript does not initialize. It is mounted on Home's Spotlight/Popular introductions, Discover's introduction/results heading, and movie detail information.

`SpotlightCard` retains the official smoothed pointer tracking and radial light. The Discover search panel uses VYBE surface/border tokens, violet light at 9% intensity, no ambient animation, flare or grain, and no effect on touch/coarse pointers or reduced motion. Its effects clean up listeners, observers and animation frames. It is separate from the movie Spotlight carousel.

GSAP is the sole added runtime dependency. Shared motion preferences live in `src/hooks/useMotionPreference.ts`; CSS timings live in `src/styles/motion.css`.

M2.1 reuses AnimatedContent for the details story section and adds no dependency. Official PulseHeart, SpecularButton, SwipeToast, Carousel and SwipeRow sources were evaluated at `4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4`. Their larger runtimes were not vendored: server-confirmed bookmark feedback and the trailer highlight use small original CSS interactions; feedback uses accessible inline/dismissible status, and cast uses native horizontal scrolling. These are design adaptations, not claims that the upstream components were installed. See the [M2.1 report](../../../../docs/development/m2.1-report.md#d-react-bits-evaluation) for selection reasons.

M2.2 inspected the official TypeScript FolderFloat and SpringCheck implementations on 2026-11-01. FolderFloat imports matter-js for interactive physics; SpringCheck imports motion/react and a Hugeicons icon. Neither dependency is justified for private collection organization. Collection cards use a small inline SVG collection mark; Save uses labelled native checkboxes reflecting confirmed API state. No fake poster previews, continuous physics, new toast system or copied upstream code was introduced. Flip Card is deferred because actions must remain visible on touch/keyboard. See the [M2.2 report](../../../../docs/development/m2.2-report.md) for source links and validation.

M2.3 adapts the official [Peek Rating source](https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Micro/PeekRating), inspected on 2026-11-03. Controlled five-star preview, a restrained lift/magnification and a numeric tip are preserved. Native radio inputs and inline star SVG replace the upstream pointer-capture/imperative painting and Hugeicons imports. Confirmation pop occurs only after API success; clearing is the explicit Remove Rating action. It has no new runtime dependency, supports keyboard and reduced motion, and retains upstream attribution with [PeekRating.LICENSE.md](PeekRating.LICENSE.md) (MIT + Commons Clause). It is integrated into VYBE, not redistributed as a component library. See the [M2.3 report](../../../../docs/development/m2.3-report.md).
