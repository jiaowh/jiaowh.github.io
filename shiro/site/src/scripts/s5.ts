/**
 * 真昼の月 — Wave 5: S5 奥付 / Finale entry point.
 *
 * Wires the one plain bloom-reveal the colophon needs (plate_p001, the
 * tiny cover artifact — it doesn't use plate.css's `.plate-block__figure`
 * shape, since the colophon is its own two-column layout rather than the
 * standard plate-block grid, so it isn't picked up by plates.ts's existing
 * selector), then boots the two systems this finale is actually about:
 * src/scripts/finale/dusk.ts (the paper→night scroll transition + the
 * moon payoff) and src/scripts/finale/postcard.ts (§6.6).
 */

import { bloomReveal } from './bloom-reveal';
import { initFinaleDusk } from './finale/dusk';
import { initPostcard } from './finale/postcard';

export function initS5(): void {
  const artifact = document.querySelector<HTMLElement>('.colophon__artifact[data-bloom]');
  if (artifact) bloomReveal(artifact, { threshold: 0.2 });

  initFinaleDusk();
  initPostcard();
}
