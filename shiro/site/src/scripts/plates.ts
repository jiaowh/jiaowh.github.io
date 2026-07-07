/**
 * 真昼の月 — Wave 3 plate behavior: wires bloom-reveal to every plate figure
 * (§5) and dwell-reveal to every dwell-gated margin note (§6.2), plus the
 * S1 archive board's hover/tap interaction (§7 S1 — a direct interaction,
 * not the dwell mechanic, which Ch.2 introduces).
 *
 * Markup/CSS live in index.html + src/styles/plate.css; this module only
 * wires behavior, exactly like wash-title.ts and chapter-rail.ts do for
 * their own components.
 */

import { bloomReveal } from './bloom-reveal';
import { dwellReveal } from './dwell-reveal';
import { prefersReducedMotion } from './motion-gate';

/**
 * Every plate image: the site's signature ragged-edge entrance (§5).
 * Includes the archive board's nested <picture> — its bloom target is not
 * `.plate-block__figure` itself (that class lives on the interactive
 * <button>; see the index.html comment on `.archive-board__trigger`).
 */
function initPlateFigures(): void {
  const figures = document.querySelectorAll<HTMLElement>(
    '.plate-block__figure[data-bloom], .archive-board__trigger picture[data-bloom]',
  );
  figures.forEach((figure, index) => {
    // Cycle the organic-filter seed across plates so consecutive figures
    // don't bloom into the same silhouette (mirrors wash-title.ts).
    bloomReveal(figure, { seed: index, threshold: 0.15 });

    // Under reduced motion every plate settles to fully visible the instant
    // this runs (§5 "fully readable static document") — but the <img> itself
    // still carries `loading="lazy"`, so its bytes are only fetched once the
    // browser judges it near the viewport. A visitor who arrives at a deep
    // scroll position via an instant jump (chapter-rail click, a deep link,
    // or simply how prefers-reduced-motion visitors tend to navigate — no
    // gradual Lenis scroll to give the browser a running start) can land on
    // an already-"revealed" (opacity:1) plate whose image hasn't been
    // requested yet: a blank plate that isn't a reveal-state bug, only an
    // unstarted fetch. Full motion never hits this because Lenis's
    // continuous scroll keeps every upcoming image well inside the lazy-load
    // distance threshold long before it's actually reached. Switching to
    // eager here fetches every plate up front for reduced-motion visitors
    // only, so the document is truly complete at first paint.
    if (prefersReducedMotion()) {
      const img = figure.querySelector('img[loading="lazy"]');
      img?.setAttribute('loading', 'eager');
    }
  });
}

/**
 * Margin notes revealed by dwelling (§5, §6.2): "≥60% in-viewport for 1.2s
 * continuously." Reuses dwell-reveal.ts's defaults untouched. Scoped to
 * `.margin-note[data-dwell]` specifically so it never re-wires the S0
 * arrival line (already wired with its own custom timing by arrival.ts) or
 * the archive board's note (hover/tap-revealed, deliberately NOT dwell —
 * see initArchiveBoard below).
 */
function initMarginNoteDwell(): void {
  const notes = document.querySelectorAll<HTMLElement>('.margin-note[data-dwell]');
  notes.forEach((note) => dwellReveal(note));
}

/** The S2 interlude line: same dwell mechanic, default timing — "turning to a blank page and noticing" rewards a moment of stillness, just like a margin note does. */
function initInterlude(): void {
  const line = document.querySelector<HTMLElement>('.s2-interlude__line[data-dwell]');
  if (line) dwellReveal(line);
}

/**
 * S1 archive board (§7 S1): "hover/tap raises a cover slightly and reveals
 * one margin note." Implemented as a real <button> (always keyboard/tap
 * operable) toggling `aria-expanded`; CSS (plate.css) handles the actual
 * hover/focus-visible/expanded visual states. The note is additionally
 * always available to assistive tech via aria-describedby, regardless of
 * its visual reveal state — opacity-hidden content must not be hidden from
 * screen readers too (§8).
 */
function initArchiveBoard(): void {
  const trigger = document.querySelector<HTMLButtonElement>('[data-archive-trigger]');
  if (!trigger) return;

  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', String(!expanded));
  });
}

export function initPlates(): void {
  initPlateFigures();
  initMarginNoteDwell();
  initInterlude();
  initArchiveBoard();
}
