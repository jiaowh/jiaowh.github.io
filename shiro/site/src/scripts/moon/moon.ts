/**
 * 真昼の月 — the moon system (§6.1), wiring the DOM button to positions,
 * scroll drift, found-state, and the click feedback (ripple + microcopy +
 * counter). The button itself lives in index.html (a real <button
 * aria-label="真昼の月">, always in the tab order); this module only
 * enhances it.
 *
 * Positioning is 100% `transform: translate3d(...)` — base per-section
 * placement plus the continuous 0.03 counter-scroll drift are summed into
 * one vector every frame, so nothing here touches layout (§10).
 */

import { gsap } from 'gsap';
import { prefersReducedMotion } from '../motion-gate';
import { readCssSeconds } from '../css-vars';
import { bloomRipple } from '../bloom-reveal';
import { onSectionChange, getCurrentSection, type SectionId } from '../active-section';
import { copyDeck } from '../copy';
import { MOON_POSITIONS, MOON_DRIFT_FACTOR } from './positions';
import { markMoonFound, isMoonFound, getMoonCount, getTotalMoons, formatMoonCounter } from './state';

const base = { x: 0, y: 0 }; // current base (pre-drift) position, in px — GSAP tweens this object directly
let drift = 0; // continuous scroll-parallax offset, in px

function computeBase(id: SectionId, button: HTMLElement): { x: number; y: number } {
  const pos = MOON_POSITIONS[id];
  const w = button.offsetWidth || 68;
  const h = button.offsetHeight || 68;
  return {
    x: pos.left * window.innerWidth - w / 2,
    y: pos.top * window.innerHeight - h / 2,
  };
}

function applyTransform(button: HTMLElement): void {
  button.style.transform = `translate3d(${base.x}px, ${base.y + drift}px, 0)`;
}

let toastHideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * F8: the toast used to dock at a fixed bottom-center position; now it
 * floats directly beside wherever the moon actually was when clicked, so
 * it reads as the moon's own reply rather than a UI notification. Flips
 * to whichever side/direction keeps it fully on-screen (the moon can sit
 * in any corner depending on section — §6.1 position keyframes).
 */
function positionToast(toast: HTMLElement, origin: { x: number; y: number }): void {
  const GAP = 20;
  const EDGE = 16;

  // Toast is already in the DOM (opacity: 0, not display:none) so its
  // natural size is measurable before we reveal it.
  const { width, height } = toast.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const overflowsRight = origin.x + GAP + width > vw - EDGE;
  const overflowsTop = origin.y - GAP - height < EDGE;

  const x = overflowsRight ? origin.x - GAP - width : origin.x + GAP;
  const y = overflowsTop ? origin.y + GAP : origin.y - GAP - height;

  toast.style.left = `${gsap.utils.clamp(EDGE, Math.max(EDGE, vw - width - EDGE), x)}px`;
  toast.style.top = `${gsap.utils.clamp(EDGE, Math.max(EDGE, vh - height - EDGE), y)}px`;
}

function showToast(
  toast: HTMLElement,
  lineEl: HTMLElement,
  counterEl: HTMLElement,
  announcer: HTMLElement,
  origin: { x: number; y: number },
  isCinema: boolean,
): void {
  lineEl.textContent = copyDeck.moonFound.jp;
  const counter = formatMoonCounter();
  counterEl.textContent = counter;
  announcer.textContent = `${copyDeck.moonFound.jp} — ${copyDeck.moonFound.en ?? ''} — ${counter}`;
  toast.dataset.cinema = String(isCinema);

  positionToast(toast, origin);
  toast.classList.add('is-visible');
  if (toastHideTimer !== null) clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    toastHideTimer = null;
  }, 2400);
}

export function initMoon(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-moon-button]');
  const toast = document.querySelector<HTMLElement>('[data-moon-toast]');
  const toastLine = document.querySelector<HTMLElement>('[data-moon-toast-line]');
  const toastCounter = document.querySelector<HTMLElement>('[data-moon-toast-counter]');
  const announcer = document.querySelector<HTMLElement>('[data-moon-announcer]');
  if (!button || !toast || !toastLine || !toastCounter || !announcer) return;

  const setFoundAttr = (id: SectionId) => {
    button.dataset.found = String(isMoonFound(id));
  };

  const snapTo = (id: SectionId) => {
    const target = computeBase(id, button);
    base.x = target.x;
    base.y = target.y;
    applyTransform(button);
    setFoundAttr(id);
  };

  const glideTo = (id: SectionId) => {
    if (prefersReducedMotion()) {
      snapTo(id);
      return;
    }
    const target = computeBase(id, button);
    const duration = readCssSeconds('--dur-scene', 1200);
    gsap.to(base, {
      x: target.x,
      y: target.y,
      duration,
      ease: 'soak',
      overwrite: 'auto',
      onUpdate: () => applyTransform(button),
    });
    setFoundAttr(id);
  };

  // Initial placement (no animation — the moon is just "already there" on load).
  snapTo(getCurrentSection());

  onSectionChange(glideTo);

  window.addEventListener('resize', () => {
    // A resize is not a motion cue to animate through; recompute in place.
    const target = computeBase(getCurrentSection(), button);
    base.x = target.x;
    base.y = target.y;
    applyTransform(button);
  });

  // Continuous 0.03 counter-scroll drift — full motion only (§5: "no parallax" under reduced motion).
  if (!prefersReducedMotion()) {
    window.addEventListener(
      'scroll',
      () => {
        drift = -window.scrollY * MOON_DRIFT_FACTOR;
        applyTransform(button);
      },
      { passive: true },
    );
  }

  button.addEventListener('click', () => {
    const id = getCurrentSection();
    const rect = button.getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    markMoonFound(id); // no-op if already found; toast still replays as acknowledgement
    setFoundAttr(id);
    bloomRipple(origin, { color: 'var(--title-green)' });
    showToast(toast, toastLine, toastCounter, announcer, origin, id === 's3');
  });
}

export { getMoonCount, getTotalMoons };
