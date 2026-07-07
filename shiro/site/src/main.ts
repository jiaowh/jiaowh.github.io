/**
 * 真昼の月 — app entry point (Wave 2: type, systems, motion infrastructure).
 *
 * Order matters here and is deliberate:
 *   1. Styles.
 *   2. initCustomEases() — every later GSAP call using ease: 'soak' / 'ink'
 *      depends on these being registered first.
 *   3. initScroll() — Lenis + ScrollTrigger, before anything that scrubs
 *      or measures scroll position.
 *   4. initActiveSectionTracker() — the shared scrollspy the rail and moon
 *      both subscribe to.
 *   5. Chapter rail, moon, arrival sequence, wash-title reveals.
 *
 * Each init is isolated in a try/catch: the html.js class (set in <head>)
 * arms reveal targets hidden, so one module throwing must never take the
 * rest of the boot sequence — and the visitor's content — down with it.
 *
 * S1/S2 (Wave 3), S3 (Wave 4), and S4/S5 (Wave 5) are fully built per
 * design-system.md §7.
 */

import './styles/base.css';
import './styles/chapter-rail.css';
import './styles/moon.css';
import './styles/arrival.css';
import './styles/motion.css';
import './styles/plate.css';
import './styles/cinema.css';
import './styles/s4.css';
import './styles/s5.css';

import { initCustomEases } from './scripts/ease';
import { initScroll, refreshScrollTriggers } from './scripts/scroll';
import { initActiveSectionTracker } from './scripts/active-section';
import { initChapterRail } from './scripts/chapter-rail';
import { initMoon } from './scripts/moon/moon';
import { initArrival } from './scripts/arrival';
import { initWashTitles } from './scripts/wash-title';
import { initPlates } from './scripts/plates';
import { initCinemaScenes } from './scripts/cinema/scenes';
import { initCinemaSwitchers } from './scripts/cinema/switcher';
import { initS4 } from './scripts/s4';
import { initS5 } from './scripts/s5';

function boot(name: string, init: () => void): void {
  try {
    init();
  } catch (error) {
    // Surface loudly in dev, but never cascade — later systems must still boot.
    console.error(`[mahiru] ${name} failed to initialize`, error);
  }
}

boot('eases', initCustomEases);
boot('scroll', () =>
  initScroll(() => {
    // Runs two frames after init, once any deep-link (/#s3) position has
    // been pinned — so every in-view check below sees the real landing
    // position and settles already-visible content instantly.
    boot('active-section', initActiveSectionTracker);
    boot('chapter-rail', initChapterRail);
    boot('moon', initMoon);
    boot('arrival', initArrival);
    boot('wash-titles', initWashTitles);
    boot('plates', initPlates);
    boot('cinema-scenes', initCinemaScenes); // wires cinema/burn.ts internally, full-motion only
    boot('cinema-switchers', initCinemaSwitchers);
    boot('s4', initS4);
    boot('s5', initS5); // wires finale/dusk.ts + finale/postcard.ts internally
  }),
);

// Late layout settles (web-font swap-in, images in later waves, fragment
// landings): recalculate ScrollTrigger positions once fonts are in and
// again on full load, so the rail's progress thread and every future
// pin/scrub maps to the settled document.
document.fonts?.ready.then(() => refreshScrollTriggers()).catch(() => {});
window.addEventListener('load', () => refreshScrollTriggers());
