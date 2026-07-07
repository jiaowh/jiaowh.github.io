/**
 * 真昼の月 — Wave 5: S4 behavior.
 *
 * The intimate rough (plate_p002) and closing (plate_p142) plates reuse
 * plate.css's `.plate-block__figure` shape untouched, so plates.ts's
 * existing `initPlateFigures()` already wires their bloom-reveal for free
 * (its selector — `.plate-block__figure[data-bloom]` — is global, not
 * scoped to S1/S2). The materials table's per-entry hand-voice notes reuse
 * `.margin-note[data-dwell]` the same way (plates.ts's
 * `initMarginNoteDwell()` is also a document-wide selector), so neither
 * needs any new code here either.
 *
 * The one genuinely new component this chapter introduces — the
 * materials-as-typography table itself — gets its own single bloom-reveal,
 * exactly like a wash-title heading does.
 */

import { bloomReveal } from './bloom-reveal';

export function initS4(): void {
  const table = document.querySelector<HTMLElement>('.materials-table[data-bloom]');
  if (table) bloomReveal(table, { threshold: 0.15 });
}
