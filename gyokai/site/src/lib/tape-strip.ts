// GYOKAI — Acid Pop Archive
// Shared builder for caution-stripe tape strips (design-system.md §4 motif
// sprite: motif-caution-stripe-tile-{yellow,pink}). Used for THE STREET's
// per-room floor strip (design-system.md §7.4 dressing) and the cross-section
// caution-tape dividers (hero→code, code→street — creative-direction revision
// wave R5). Tiling is done with repeated flex-basis SVGs rather than a CSS
// background-image: the tile symbols live inline in the DOM sprite (never a
// standalone file), and `flex: 1 1 0` tiles stretch evenly to fill whatever
// width the strip actually renders at — no resize-triggered recompute needed.

export type TapeStripColor = "yellow" | "pink";

export function tapeStripMarkup(color: TapeStripColor, tiles = 48): string {
  const tile =
    `<svg viewBox="0 0 40 40" preserveAspectRatio="none" aria-hidden="true">` +
    `<use href="#motif-caution-stripe-tile-${color}" /></svg>`;
  return tile.repeat(tiles);
}
