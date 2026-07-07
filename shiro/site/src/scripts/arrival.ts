/**
 * 真昼の月 — S0 Arrival orchestration (§7 S0).
 *
 * Ties together the title stroke-draw, the single watercolor bloom behind
 * it, the Hand-voice line (dwell-reveal reused with a 2.5s wait instead of
 * margin-notes' 1.2s — see dwell-reveal.ts), and the rail's first-stitch
 * affordance that stands in for a scroll hint.
 */

import { bloomReveal } from './bloom-reveal';
import { dwellReveal } from './dwell-reveal';
import { playArrivalTitle } from './title/arrival-title';
import { playInitialStitch } from './chapter-rail';

export function initArrival(): void {
  playArrivalTitle();

  const wash = document.querySelector('.arrival-wash');
  if (wash) {
    // The wash is a .wash-blob: permanent organic silhouette in CSS, so
    // the bloom is the pigment spreading (scale-up + soak), not a runtime
    // sweep mask. Resting opacity 0.2 = §6.3's 20%, matching the CSS
    // no-JS resting value in arrival.css.
    bloomReveal(wash, { trigger: 'immediate', mask: false, scaleFrom: 0.72, opacityTo: 0.2, delay: 0.1 });
  }

  const line = document.querySelector('[data-arrival-line]');
  if (line) {
    // §7 S0: "fades in after 2.5s" — the element is fully in view from
    // load (S0 has no scroll), so a near-1 threshold + dwellMs 2500
    // reproduces that exactly via the same mechanism §6.2's margin notes
    // use. Threshold is 0.9 rather than a strict 1 so a sub-pixel reflow
    // from a late web-font swap can't spuriously reset the timer.
    dwellReveal(line, { threshold: 0.9, dwellMs: 2500 });
  }

  playInitialStitch();
}
