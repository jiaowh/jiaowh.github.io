/**
 * 真昼の月 — dwell-reveal (§5, §6.2).
 *
 * "fires a reveal only after an element has been ≥60% in-viewport for
 * 1.2s continuously... rewarding slowness. Not scroll-scrubbed."
 *
 * IntersectionObserver + a plain timer: entering the threshold arms a
 * setTimeout; leaving it before the timer fires cancels the timer outright
 * (the dwell must be continuous, per spec — a scroll-past-and-back does
 * not accumulate). Designed for §6.2 margin notes (default 60% / 1.2s),
 * and reused as-is by S0's Hand-voice line (§7), which is the same
 * mechanism at different numbers (visible ~100% on load, 2.5s) rather than
 * a one-off setTimeout.
 *
 * Under prefers-reduced-motion the dwell mechanic is disabled entirely:
 * the element is revealed at full target opacity immediately at call time
 * — no timers, no observers, no fade. §5's reduced-motion contract is
 * "fully readable static document", and a reveal that appears only after
 * the visitor holds still is a motion-reward pattern, not static content.
 */

import { gsap } from 'gsap';
import { prefersReducedMotion } from './motion-gate';
import { readCssSeconds } from './css-vars';

export interface DwellOptions {
  /** Fraction of the element that must be visible (default 0.6, §5). */
  threshold: number;
  /** Continuous ms required before the reveal fires (default 1200, §5). */
  dwellMs: number;
  /** Reveal only once (default true). */
  once: boolean;
  onReveal?: () => void;
}

const defaultOptions: DwellOptions = {
  threshold: 0.6,
  dwellMs: 1200,
  once: true,
};

function reveal(element: Element, options: DwellOptions): void {
  element.classList.add('is-revealed');
  const target = element as HTMLElement;

  const duration = readCssSeconds('--dur-caption', 500);
  gsap.fromTo(
    target,
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration, ease: 'soak', onComplete: options.onReveal },
  );
}

/**
 * Watches `element`; once it has been ≥`threshold` in-viewport for
 * `dwellMs` continuously, reveals it (opacity + slight rise) and adds
 * `.is-revealed`. Under reduced motion the element is revealed instantly
 * at call time instead.
 */
export function dwellReveal(element: Element, options: Partial<DwellOptions> = {}): void {
  const merged: DwellOptions = { ...defaultOptions, ...options };

  if (prefersReducedMotion()) {
    element.classList.add('is-revealed');
    gsap.set(element, { opacity: 1, y: 0 });
    merged.onReveal?.();
    return;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (done) return;

        if (entry.isIntersecting) {
          if (timer !== null) return; // already dwelling
          timer = setTimeout(() => {
            timer = null;
            done = true;
            reveal(entry.target, merged);
            if (merged.once) observer.unobserve(entry.target);
          }, merged.dwellMs);
        } else if (timer !== null) {
          // Left before the dwell completed — the wait must be continuous.
          clearTimeout(timer);
          timer = null;
        }
      });
    },
    { threshold: merged.threshold },
  );

  observer.observe(element);
}
