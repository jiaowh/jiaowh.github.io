/**
 * 真昼の月 — moon per-section position keyframes (§6.1).
 *
 * "It relocates per section (position keyframes)." Data-driven on purpose:
 * these are wave-2 placements (S0 is the one the brief calls "live now" —
 * top-right, nearly invisible on paper; S1–S5 are reasonable starting
 * guesses), everything else is tuned by a later wave once real plate
 * imagery exists to hide the moon inside (a puddle reflection, a mirror, a
 * glyph counter — per §6.1). Positions are fractions of the viewport
 * (0–1), converted to pixels by moon.ts so the continuous parallax drift
 * can be expressed purely as a transform.
 */

import type { SectionId } from '../active-section';

export interface MoonPosition {
  /** Fraction of viewport height (0 = top, 1 = bottom). */
  top: number;
  /** Fraction of viewport width (0 = left, 1 = right). */
  left: number;
}

export const MOON_POSITIONS: Record<SectionId, MoonPosition> = {
  // "the moon is already on screen (top-right area, nearly invisible)" — §7 S0
  s0: { top: 0.1, left: 0.86 },
  // Wave 3 retune: S1/S2 now have real plate content (§4's 12-col grid
  // lives inside `--margin`, so the ONLY horizontal band guaranteed clear
  // of every plate/caption/note for the section's whole scroll length is
  // the true outer margin gutter itself — roughly the outer ~7% of the
  // viewport at desktop widths, shrinking toward ~4% only past ~1600px
  // where `--margin` hits its 7rem cap). S1's archive board in particular
  // spans nearly edge-to-edge (cols 2/12), so any position inside the
  // grid — including the old s1 (left: 0.14) and s2 (left: 0.82), both of
  // which fall inside plate column ranges — will eventually scroll a plate
  // under the moon. Parking both in the RIGHT gutter (no rail to collide
  // with there, unlike the left gutter which is too narrow to share with
  // the rail at any desktop width) keeps them beside the content, never on
  // it, for the section's entire height. Differing `top` gives each
  // section its own resting spot.
  s1: { top: 0.16, left: 0.965 },
  s2: { top: 0.6, left: 0.96 },
  // Wave 4 retune: S3's per-section granularity is a single fraction for
  // the whole chapter (five full-bleed scenes + gaps), not per-scene — so
  // rather than chase a spot that's clear inside every scene's own kanji
  // placement (s3-1 top-center band, s3-2 upper-left diagonal, s3-4's
  // edge-to-edge 覚/醒, s3-5's right-edge catalog rail all differ), the one
  // viewport fraction that stays clear of text/chrome across all five is a
  // bottom-right corner — every scene's switcher sits top-aligned, every
  // title/rail lives elsewhere, and it reads as "hiding in the dark" over
  // both the --cinema-dim gaps and the scene imagery's usually-quieter
  // corners (§6.1: "the moon may hide within artwork-adjacent space but
  // never on text").
  s3: { top: 0.9, left: 0.94 },
  // Wave 5 retune: S4/S5 now have real content (materials table, colophon,
  // the dusk/payoff stack, the postcard), so the same "true margin gutter
  // stays clear across the whole section regardless of which sub-content
  // is currently in view" reasoning from the S1/S2 retune above applies
  // here too — parked in the right gutter, differing only in `top`.
  s4: { top: 0.5, left: 0.965 },
  s5: { top: 0.72, left: 0.965 },
};

export const TOTAL_MOONS = Object.keys(MOON_POSITIONS).length;

/** §6.1: "drifting very slowly against scroll (0.03 parallax factor)". */
export const MOON_DRIFT_FACTOR = 0.03;
