/**
 * 真昼の月 — wash-title wiring for S1–S5 (§6.3).
 *
 * §5 grants an explicit escape hatch for every wash title except the
 * arrival one: "Klee One rendered as outlined SVG paths for the arrival
 * title only; elsewhere plain text fading in is fine." So the heading here
 * gets the site's signature bloomReveal() (organic mask + scale + opacity)
 * rather than a second stroke-draw system — that reveal *is* "plain text
 * fading in", just using the house style. The swatch blooms first, the
 * heading settles in shortly after, so each chapter opener reads as
 * "wash appears, title settles on top of it".
 *
 * Wave 3 (S1/S2): the CSS-only `.wash-title__swatch` gradient is replaced
 * by `.wash-title__art` — the actual book chapter page (plate_p004 /
 * plate_p018) — per §7's "use the actual book chapter page as the wash."
 * Both still bloom the same way (mask: false — see bloom-reveal.ts's
 * docblock on why a permanent organic silhouette blooms via spread+soak
 * rather than a runtime sweep mask); only the resting opacity differs
 * (0.2 for the abstract gradient swatch vs. a near-opaque reading of the
 * real page content).
 *
 * F9 fix (CD browser review): S1/S2's <h2> was previously shipped
 * `visually-hidden` on the theory that the wash art alone carried the
 * chapter identity — but the CD's real-browser pass called this out as a
 * missing opener (the Hand-voice title simply never appeared). The
 * heading is visible again here, `data-bloom`-armed like every other
 * chapter's, and its text now carries ONLY the title (the "Chapter.N"
 * prefix was dropped from the hand line across every chapter — the mono
 * kicker right above it already says that).
 */

import { bloomReveal } from './bloom-reveal';

export function initWashTitles(): void {
  const washTitles = document.querySelectorAll<HTMLElement>('.wash-title');

  washTitles.forEach((section, index) => {
    const swatch = section.querySelector<HTMLElement>('.wash-title__swatch');
    const art = section.querySelector<HTMLElement>('.wash-title__art');
    const heading = section.querySelector<HTMLElement>('.wash-title__heading');

    if (swatch) {
      // Swatches are .wash-blob elements: permanent organic silhouette in
      // CSS, bloom = pigment spread (mask: false). Resting 20% per §6.3.
      bloomReveal(swatch, { mask: false, scaleFrom: 0.72, opacityTo: 0.2, threshold: 0.2 });
    }
    if (art) {
      // Photographed chapter page: same spread+soak bloom, but the resting
      // opacity (0.92, set in plate.css's .wash-title__art rule) must be
      // read from that CSS rather than hardcoded here — it's a Wave 3
      // per-chapter value, not the universal §6.3 wash constant.
      const opacityTo = Number(getComputedStyle(art).getPropertyValue('--art-opacity')) || 0.92;
      bloomReveal(art, { mask: false, scaleFrom: 0.72, opacityTo, threshold: 0.2 });
    }
    // S1/S2 (Wave 3): the heading is visually-hidden (the wash art now
    // carries the chapter identity), so it has no `data-bloom` and needs no
    // entrance — animating a 1×1 clipped element would be pure waste.
    // S3–S5 placeholders keep their visible, `data-bloom`-marked heading.
    if (heading?.hasAttribute('data-bloom')) {
      bloomReveal(heading, { seed: index + 2, threshold: 0.2, delay: 0.15, scaleFrom: 1.01 });
    }
  });
}
