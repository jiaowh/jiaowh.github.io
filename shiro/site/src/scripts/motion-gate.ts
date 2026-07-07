/**
 * 真昼の月 — the single reduced-motion gate (§5).
 *
 * "if prefers-reduced-motion, Lenis disabled, all reveals become ≤200ms
 * opacity fades, no pinning." This module is the one source of truth for
 * that check — every other motion module (scroll.ts, bloom-reveal.ts,
 * dwell-reveal.ts, chapter-rail.ts, moon/moon.ts, title/arrival-title.ts)
 * consults `prefersReducedMotion()` rather than re-querying matchMedia.
 *
 * Note: this governs *JS-driven* motion (GSAP tweens, rAF loops), which do
 * not go through CSS transitions at all. A CSS-level backstop for plain
 * transitions/animations also exists in base.css's own
 * `@media (prefers-reduced-motion: reduce)` block; the two are
 * complementary, not redundant.
 */

export const REDUCED_MOTION_FADE_MS = 200;

type Listener = (reduced: boolean) => void;

const query = typeof window !== 'undefined' && 'matchMedia' in window
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

let reduced = query?.matches ?? false;

const listeners = new Set<Listener>();

function applyDocumentClass(): void {
  document.documentElement.classList.toggle('is-reduced-motion', reduced);
}

function handleChange(event: MediaQueryListEvent): void {
  reduced = event.matches;
  applyDocumentClass();
  listeners.forEach((fn) => fn(reduced));
}

if (query) {
  // addEventListener is broadly supported; the deprecated addListener
  // fallback is only needed for Safari < 14, acceptable to skip for v1.
  query.addEventListener?.('change', handleChange);
}

if (typeof document !== 'undefined') {
  applyDocumentClass();
}

/** Current reduced-motion preference. Safe to call at any time. */
export function prefersReducedMotion(): boolean {
  return reduced;
}

/** Subscribe to live changes (user toggles the OS setting mid-session). */
export function onReducedMotionChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
