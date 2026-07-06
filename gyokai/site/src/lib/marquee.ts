// GYOKAI — Acid Pop Archive
// Tape/marquee driver (design-system.md §6): duplicates the track's
// content for a seamless loop and conveys it at a constant speed
// (EASE.convey = linear, 60–90 px/s). Reduced motion: the tape stands
// still (styles/components.css also zeroes any transform as a belt).

import { gsap, EASE, prefersReducedMotion } from "./gsap-setup";

export interface MarqueeOptions {
  track: HTMLElement;
  /** §5.2: 60–90 px/s. */
  pxPerSecond?: number;
  reverse?: boolean;
}

export function initMarquee({ track, pxPerSecond = 75, reverse = false }: MarqueeOptions): void {
  const parent = track.parentElement;
  if (!parent || track.children.length === 0) return;

  // Duplicate content until one copy-run spans at least the container,
  // then double the whole thing so translating by exactly one run loops
  // seamlessly.
  const original = track.innerHTML;
  let guard = 0;
  while (track.scrollWidth < Math.max(parent.clientWidth, 320) && guard < 10) {
    track.innerHTML += original;
    guard++;
  }
  const childrenPerRun = track.children.length;
  track.innerHTML += track.innerHTML;

  if (prefersReducedMotion()) return;

  // Exact run width = distance between the first child of each half
  // (accounts for flex gap, so the loop point is seam-free).
  const first = track.children[0] as HTMLElement | undefined;
  const mirror = track.children[childrenPerRun] as HTMLElement | undefined;
  if (!first || !mirror) return;
  const run = mirror.offsetLeft - first.offsetLeft;
  if (run <= 0) return;

  const duration = run / pxPerSecond;
  gsap.fromTo(
    track,
    { x: reverse ? -run : 0 },
    { x: reverse ? 0 : -run, duration, ease: EASE.convey, repeat: -1 },
  );
}
