/**
 * 真昼の月 — Wave 4: the §6.5 variant switcher, wired for every S3 scene
 * that has editions (all five). Markup/ARIA baseline lives in index.html —
 * `role="tablist"` on the container, `role="tab"` + `aria-selected` +
 * `aria-controls` (pointing at the scene's own id) on each button — this
 * module only adds the roving-tabindex keyboard pattern, activation, the
 * image crossfade, and the kanji re-choreograph.
 *
 * "Switching crossfades scene + re-choreographs its kanji (exit up, enter
 * from below, 600ms --ease-ink)." The crossfade is a plain CSS opacity
 * transition on `.s3-scene__media` (cinema.css, `--dur-switch` = 600ms) —
 * simplest correct implementation, no need for GSAP there. The kanji
 * re-choreograph IS GSAP (a timeline, not a transition) because it is a
 * two-phase exit-then-enter, not a single crossfade; it targets whichever
 * title system the scene actually uses — the Display Mincho glyphs
 * (scenes.ts's `glyphsOf`) for every scene except s3-3, whose ribbon title
 * is the Hand-voice signature element instead (see scenes.ts's
 * `animateSignature` docblock for why that scene never got glyph spans).
 *
 * Reduced motion: switcher stays fully functional (§5: "switcher still
 * functional") — the crossfade clamps to the ≤200ms reduced-motion fade via
 * an inline `transition-duration` override, and the kanji re-choreograph is
 * skipped outright (glyphs are already at rest; there is nothing to exit/
 * re-enter under a static-document contract).
 */

import { gsap } from 'gsap';
import { prefersReducedMotion, REDUCED_MOTION_FADE_MS } from '../motion-gate';
import { readCssSeconds } from '../css-vars';
import { glyphsOf } from './scenes';

function reChoreograph(scene: HTMLElement): void {
  if (prefersReducedMotion()) return;

  const duration = readCssSeconds('--dur-switch', 600);
  const glyphs = glyphsOf(scene);
  const signature = scene.querySelector<HTMLElement>('[data-s3-signature]');

  if (glyphs.length > 0) {
    gsap.killTweensOf(glyphs);
    const tl = gsap.timeline();
    tl.to(glyphs, { yPercent: -35, opacity: 0, duration: duration * 0.4, ease: 'ink', stagger: 0.02 })
      .set(glyphs, { yPercent: 35 })
      .to(glyphs, { yPercent: 0, opacity: 1, duration: duration * 0.6, ease: 'ink', stagger: 0.02 });
    return;
  }

  if (signature) {
    gsap.killTweensOf(signature);
    const tl = gsap.timeline();
    tl.to(signature, { opacity: 0, duration: duration * 0.35, ease: 'ink' })
      .to(signature, { opacity: 1, duration: duration * 0.65, ease: 'ink' });
  }
}

function setActiveVariant(scene: HTMLElement, variantId: string): void {
  const layers = scene.querySelectorAll<HTMLElement>('.s3-scene__media');
  layers.forEach((layer) => {
    const active = layer.dataset.variant === variantId;
    layer.classList.toggle('is-active', active);
    layer.setAttribute('aria-hidden', String(!active));
    if (prefersReducedMotion()) {
      // Clamp to the reduced-motion fade ceiling rather than the full 600ms
      // cinematic crossfade (§5).
      layer.style.transitionDuration = `${REDUCED_MOTION_FADE_MS}ms`;
    }
  });
}

function activate(tabs: HTMLButtonElement[], index: number, scene: HTMLElement, { animate }: { animate: boolean }): void {
  const target = tabs[index];
  tabs.forEach((tab, i) => {
    const selected = i === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });

  const variantId = target.dataset.variant;
  if (!variantId) return;

  setActiveVariant(scene, variantId);
  if (animate) reChoreograph(scene);
}

function wireSwitcher(list: HTMLElement): void {
  const scene = list.closest<HTMLElement>('[data-s3-scene]');
  if (!scene) return;

  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) return;

  let current = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  if (current < 0) current = 0;

  tabs.forEach((tab, i) => {
    tab.tabIndex = i === current ? 0 : -1;

    tab.addEventListener('click', () => {
      if (i === current) return;
      current = i;
      activate(tabs, current, scene, { animate: true });
    });

    tab.addEventListener('keydown', (event) => {
      let next = -1;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = (i + 1) % tabs.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = (i - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      current = next;
      tabs[next].focus();
      activate(tabs, current, scene, { animate: true });
    });
  });
}

export function initCinemaSwitchers(): void {
  const lists = document.querySelectorAll<HTMLElement>('[data-s3-switcher]');
  lists.forEach(wireSwitcher);
}
