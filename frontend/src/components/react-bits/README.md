# React Bits adaptations for VYBE

Vendored from [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits), commit `e12c22192ac7b4b452c5e2feb9b586d74765d696`:

- `src/ts-default/Animations/AnimatedContent/AnimatedContent.tsx`
- `src/ts-default/Components/SpotlightCard/SpotlightCard.tsx` and its stylesheet

The upstream **MIT + Commons Clause** license is retained in [LICENSE.md](./LICENSE.md). These components are incorporated into VYBE, not distributed as a standalone component product. The React Bits MCP was unavailable during implementation, so the official repository supplied the implementations.

`AnimatedContent` retains GSAP timelines, context cleanup and ScrollTrigger. VYBE defaults to an 18px rise and the centralized 900ms entrance token. Completed entrances do not replay on query updates or ordinary scrolling. Reduced motion shows content immediately; keyboard focus completes an in-progress entrance. The initial markup remains visible if JavaScript does not initialize. It is mounted on Home's Spotlight/Popular introductions, Discover's introduction/results heading, and movie detail information.

`SpotlightCard` retains the official smoothed pointer tracking and radial light. The Discover search panel uses VYBE surface/border tokens, violet light at 9% intensity, no ambient animation, flare or grain, and no effect on touch/coarse pointers or reduced motion. Its effects clean up listeners, observers and animation frames. It is separate from the movie Spotlight carousel.

GSAP is the sole added runtime dependency. Shared motion preferences live in `src/hooks/useMotionPreference.ts`; CSS timings live in `src/styles/motion.css`.
