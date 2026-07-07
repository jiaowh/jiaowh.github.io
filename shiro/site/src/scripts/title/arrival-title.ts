/**
 * 真昼の月 — S0 arrival title stroke-draw (§5, §7 S0).
 *
 * "Title 「真昼の月」 draws itself in --title-green (SVG stroke)... the
 * strokes must read as handwriting, 600–900ms staggered."
 *
 * The real Klee One 600 glyph outlines are already baked into index.html
 * as static <path> elements (see title-paths.generated.ts for how they
 * were extracted) — filled solid green by default, so a no-JS visitor
 * simply sees the finished title. This module re-purposes those same
 * paths for the stroke-draw: at runtime it measures each glyph's real
 * outline length, switches it from "filled" to "stroked, undrawn", plays
 * the classic logo draw-on (stroke-dashoffset → 0), then crossfades back
 * to a solid fill so the resting state matches the no-JS baseline exactly.
 *
 * Each glyph is one multi-subpath `<path>` (opentype.js emits one contour
 * per visual stroke). Animating a single path's stroke-dashoffset draws
 * its subpaths in sequence automatically (dash length accumulates
 * continuously across subpaths) — that alone reads as "strokes drawn one
 * after another" within a glyph. Stagger is applied per *glyph* (character
 * by character, like real handwriting) on top of that.
 */

import { gsap } from 'gsap';
import { prefersReducedMotion } from '../motion-gate';
import { readCssSeconds } from '../css-vars';

export function playArrivalTitle(): void {
  const svg = document.querySelector<SVGSVGElement>('.arrival-title__svg');
  if (!svg) return;

  const reveal = () => {
    svg.style.opacity = '1';
  };

  if (prefersReducedMotion()) {
    // Fully visible immediately — the solid-fill baseline IS the resting
    // state, so under reduced motion there is nothing to animate at all.
    reveal();
    return;
  }

  try {
    const glyphs = Array.from(svg.querySelectorAll<SVGPathElement>('.glyph-path'));
    if (glyphs.length === 0) {
      reveal();
      return;
    }

    // Arm every glyph as an undrawn stroke *before* revealing the SVG, so
    // there is no flash of the solid-fill no-JS baseline.
    glyphs.forEach((path) => {
      const length = path.getTotalLength();
      gsap.set(path, {
        fillOpacity: 0,
        strokeOpacity: 1,
        strokeDasharray: length,
        strokeDashoffset: length,
      });
    });

    reveal();

    const glyphDuration = readCssSeconds('--dur-bloom', 900); // §5: "600–900ms" per glyph
    const glyphStagger = readCssSeconds('--stagger', 70) * 5; // character-by-character pacing, derived from the base --stagger unit
    const crossfade = Math.min(0.18, glyphDuration * 0.2);

    const tl = gsap.timeline();
    glyphs.forEach((path, i) => {
      const start = i * glyphStagger;
      tl.to(path, { strokeDashoffset: 0, duration: glyphDuration, ease: 'soak' }, start);
      tl.to(
        path,
        { fillOpacity: 1, strokeOpacity: 0, duration: crossfade, ease: 'none' },
        start + glyphDuration - crossfade,
      );
    });
  } catch {
    // If anything about the SVG measurement fails, fall back to the
    // already-solid-filled baseline rather than leaving the title hidden.
    reveal();
  }
}
