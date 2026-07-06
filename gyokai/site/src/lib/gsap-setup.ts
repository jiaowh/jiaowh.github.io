// GYOKAI — Acid Pop Archive
// GSAP bootstrap: plugin registration + the shared named eases
// (design-system.md §5.1). Import EASE from here — never re-type ease
// strings in section modules.

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/** §5.1 — motion is either *snap* or *steady conveyor*. */
export const EASE = {
  /** Element entrances — slap with overshoot. */
  slap: "back.out(2)",
  /** Hovers, small UI. */
  snap: "power3.out",
  /** Print-plate / halftone stepping. */
  plate: "steps(6)",
  /** Ambient re-inking color tweens. */
  ink: "power2.out",
  /** Marquees, tickers — linear, constant. */
  convey: "none",
} as const;

let registered = false;

export function setupGsap(): typeof gsap {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return gsap;
}

/** Live query — not cached at module load (users can toggle mid-visit). */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * §5.3 — every entrance animation starts at "top 78%" and plays ONCE
 * (no popcorn on scroll-up). Shared helper so all sections behave alike.
 * Under reduced motion: a 0.3s opacity fade instead of a slap.
 */
export function slapIn(
  targets: gsap.TweenTarget,
  trigger: Element,
  vars: gsap.TweenVars = {},
): void {
  if (prefersReducedMotion()) {
    gsap.from(targets, {
      opacity: 0,
      duration: 0.3,
      scrollTrigger: { trigger, start: "top 78%", once: true },
    });
    return;
  }
  gsap.from(targets, {
    opacity: 0,
    scale: 1.15,
    rotation: () => gsap.utils.random(-3, 3),
    transformOrigin: "50% 50%",
    duration: 0.45,
    stagger: 0.06,
    ease: EASE.slap,
    scrollTrigger: { trigger, start: "top 78%", once: true },
    ...vars,
  });
}

export { gsap, ScrollTrigger };
