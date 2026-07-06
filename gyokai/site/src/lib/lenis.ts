// GYOKAI — Acid Pop Archive
// Inertial scroll driver (creative-direction.md §4 "Scroll: Lenis").
// Lenis feeds ScrollTrigger and is driven from the GSAP ticker so both
// share one rAF. Fully disabled under prefers-reduced-motion (§5.3):
// native scrolling everywhere, ScrollTrigger still works off the window.

import Lenis from "lenis";
import { gsap, ScrollTrigger, prefersReducedMotion } from "./gsap-setup";

let lenis: Lenis | null = null;

export function initLenis(): Lenis | null {
  if (prefersReducedMotion()) return null;

  lenis = new Lenis({ lerp: 0.12 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis?.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function getLenis(): Lenis | null {
  return lenis;
}

/**
 * Hard scroll lock (loader, close-up takeover). Pauses Lenis AND clips the
 * document so native scroll (keyboard, touch, reduced-motion mode) is
 * locked too. `.scroll-locked` lives in styles/base.css.
 */
export function lockScroll(lock: boolean): void {
  document.documentElement.classList.toggle("scroll-locked", lock);
  if (lock) lenis?.stop();
  else lenis?.start();
}

// Programmatic scrolls are driven as a GSAP tween writing NATIVE scroll
// each frame (Lenis observes native scroll and stays in sync). Driving
// them through lenis.scrollTo() instead can animate from a desynced
// internal position when the last scroll came from outside Lenis
// (keyboard paging, tests, anchors) — observed sending the page to 0.
const scrollProxy = { v: 0 };

/** Smooth-scroll helper; instant under reduced motion / immediate. */
export function scrollToTarget(target: number | HTMLElement, immediate = false): void {
  const y =
    typeof target === "number"
      ? target
      : target.getBoundingClientRect().top + window.scrollY;
  gsap.killTweensOf(scrollProxy);
  if (immediate || prefersReducedMotion()) {
    window.scrollTo({ top: y, behavior: "auto" });
    return;
  }
  scrollProxy.v = window.scrollY;
  gsap.to(scrollProxy, {
    v: y,
    duration: 0.8,
    ease: "power2.out",
    onUpdate: () => window.scrollTo(0, scrollProxy.v),
  });
}
