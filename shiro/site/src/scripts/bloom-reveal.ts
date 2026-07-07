/**
 * 真昼の月 — bloom-reveal, the Register A signature entrance (§5).
 *
 * "plates/elements enter via an irregular organic mask (SVG feTurbulence +
 * feDisplacementMap on a scaling circle mask...) + slight scale 1.02 → 1 +
 * opacity. Edges must be ragged like a wet wash, never a geometric wipe."
 *
 * Two modes:
 *
 * `mask: true` (default — plates, headings, opaque content): a runtime
 * SVG mask (feTurbulence + feDisplacementMap on a growing circle) sweeps
 * the element in with a ragged edge, then unmasks. The element's resting
 * presentation is its own content (text, an <img>...), so full coverage
 * and unmasking at the end is correct — the mask exists only during the
 * entrance. `primitiveUnits="objectBoundingBox"` lets one filter serve any
 * element size.
 *
 * `mask: false` (washes): wash elements carry a PERMANENT organic
 * silhouette in CSS (.wash-blob — pre-generated ragged paths; see
 * motion.css). Their resting shape must never be the element box, so the
 * runtime box-covering mask is wrong for them; instead the bloom is
 * expressed as pigment spreading — scale from ~0.72 up to 1 (with an
 * off-center transform-origin set in CSS) + opacity soak. The ragged
 * edge is present at literally every frame, including rest.
 *
 * Reduced motion (§5 via motion-gate.ts): reveals settle to their final
 * state instantly at call time — no delays, no observers, no tweens. The
 * page is a fully readable static document from first paint.
 *
 * Fragment landings (deep links): if an element is already in view when
 * bloomReveal() is called, it settles instantly instead of animating — a
 * mid-document landing must show revealed content, not blank paper.
 *
 * `bloomRipple()` reuses the same "soft bloom" language for the moon's
 * found-feedback (§6.1) as a small expanding-circle pulse.
 */

import { gsap } from 'gsap';
import { prefersReducedMotion, REDUCED_MOTION_FADE_MS } from './motion-gate';
import { readCssSeconds } from './css-vars';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FILTER_VARIANTS = 3;
const FINAL_RADIUS = 1.05; // objectBoundingBox units; >0.71 (box corner distance) with margin for displacement

let defsEl: SVGSVGElement | null = null;
let maskCounter = 0;

function ensureBloomDefs(): SVGSVGElement {
  if (defsEl) return defsEl;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bloom-defs');
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(SVG_NS, 'defs');

  for (let i = 0; i < FILTER_VARIANTS; i += 1) {
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', `bloom-organic-filter-${i}`);
    filter.setAttribute('x', '-40%');
    filter.setAttribute('y', '-40%');
    filter.setAttribute('width', '180%');
    filter.setAttribute('height', '180%');
    filter.setAttribute('primitiveUnits', 'objectBoundingBox');

    const turbulence = document.createElementNS(SVG_NS, 'feTurbulence');
    turbulence.setAttribute('type', 'fractalNoise');
    // Slightly different frequency/seed per variant so alternating plates
    // don't all bloom into the same silhouette.
    turbulence.setAttribute('baseFrequency', `${4.5 + i * 1.1} ${6 + i * 1.4}`);
    turbulence.setAttribute('numOctaves', '2');
    turbulence.setAttribute('seed', String(3 + i * 5));
    turbulence.setAttribute('result', 'noise');

    const displace = document.createElementNS(SVG_NS, 'feDisplacementMap');
    displace.setAttribute('in', 'SourceGraphic');
    displace.setAttribute('in2', 'noise');
    displace.setAttribute('scale', '0.3');
    displace.setAttribute('xChannelSelector', 'R');
    displace.setAttribute('yChannelSelector', 'G');

    filter.append(turbulence, displace);
    defs.appendChild(filter);
  }

  svg.appendChild(defs);
  document.body.appendChild(svg);
  defsEl = svg;
  return svg;
}

interface MaskHandle {
  id: string;
  circle: SVGCircleElement;
  cleanup: () => void;
}

function createOrganicMask(seed: number): MaskHandle {
  const svg = ensureBloomDefs();
  const defs = svg.querySelector('defs')!;
  const id = `bloom-mask-${maskCounter}`;
  maskCounter += 1;

  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', id);
  mask.setAttribute('maskUnits', 'objectBoundingBox');
  mask.setAttribute('maskContentUnits', 'objectBoundingBox');

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '0.5');
  circle.setAttribute('cy', '0.5');
  circle.setAttribute('r', '0');
  circle.setAttribute('fill', '#fff');
  circle.setAttribute('filter', `url(#bloom-organic-filter-${Math.abs(seed) % FILTER_VARIANTS})`);

  mask.appendChild(circle);
  defs.appendChild(mask);

  return {
    id,
    circle,
    cleanup: () => mask.remove(),
  };
}

export interface BloomOptions {
  /** Fire on scroll-into-view (default) or immediately when called. */
  trigger: 'inView' | 'immediate';
  /** IntersectionObserver threshold for the 'inView' trigger. */
  threshold: number;
  /** IntersectionObserver rootMargin for the 'inView' trigger. */
  rootMargin: string;
  /**
   * Use the runtime ragged-sweep mask entrance (default). Set false for
   * wash-blob elements, whose organic silhouette is permanent CSS — they
   * bloom by scaling up + soaking in instead (see module docblock).
   */
  mask: boolean;
  /** Starting scale before the reveal (§5 plates: 1.02 → 1; washes: ~0.72 → 1). */
  scaleFrom: number;
  /** Resting opacity once revealed (default 1 — wash swatches use 0.2 per §6.3). */
  opacityTo: number;
  /** Seed selecting which organic filter variant to use (cycled). */
  seed: number;
  /** Reveal only once (default true) — set false to allow repeat plays. */
  once: boolean;
  /** Extra delay (seconds) before the reveal starts. Ignored under reduced motion. */
  delay: number;
  onComplete?: () => void;
}

const defaultOptions: BloomOptions = {
  trigger: 'inView',
  threshold: 0.2,
  rootMargin: '0px 0px -10% 0px',
  mask: true,
  scaleFrom: 1.02,
  opacityTo: 1,
  seed: 0,
  once: true,
  delay: 0,
};

/** Snap an element straight to its revealed resting state (no animation). */
function settleInstant(element: Element, options: BloomOptions): void {
  gsap.set(element, { opacity: options.opacityTo, clearProps: 'transform' });
  options.onComplete?.();
}

/**
 * Fraction-of-element-visible right now — used to decide whether a
 * fragment landing already put the element on screen at init time.
 */
function visibleFraction(element: Element): number {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const iw = Math.min(rect.right, vw) - Math.max(rect.left, 0);
  const ih = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
  if (iw <= 0 || ih <= 0) return 0;
  return (iw * ih) / (rect.width * rect.height);
}

function playReveal(element: Element, options: BloomOptions): void {
  const target = element as HTMLElement | SVGElement;
  const durationBloom = readCssSeconds('--dur-bloom', 900);

  if (prefersReducedMotion()) {
    settleInstant(target, options);
    return;
  }

  if (!options.mask) {
    // Wash mode: permanent CSS silhouette; bloom = spread + soak.
    gsap.set(target, { scale: options.scaleFrom, opacity: 0 });
    gsap.to(target, {
      opacity: options.opacityTo,
      scale: 1,
      duration: durationBloom,
      delay: options.delay,
      ease: 'soak',
      onComplete: options.onComplete,
    });
    return;
  }

  const { id: maskId, circle, cleanup } = createOrganicMask(options.seed);

  gsap.set(target, {
    scale: options.scaleFrom,
    opacity: 0,
  });
  (target as HTMLElement).style.setProperty('mask', `url(#${maskId})`);
  (target as HTMLElement).style.setProperty('-webkit-mask', `url(#${maskId})`);

  const tl = gsap.timeline({
    delay: options.delay,
    onComplete: () => {
      // Coverage is guaranteed ≥ box corners; drop the mask afterwards so
      // later transforms/effects on the element aren't stuck compositing
      // through an SVG mask forever. (Only correct because mask-mode
      // resting presentation is the element's own content — washes never
      // take this path.)
      (target as HTMLElement).style.removeProperty('mask');
      (target as HTMLElement).style.removeProperty('-webkit-mask');
      cleanup();
      options.onComplete?.();
    },
  });

  tl.to(circle, { attr: { r: FINAL_RADIUS }, duration: durationBloom, ease: 'soak' }, 0);
  tl.to(target, { opacity: options.opacityTo, scale: 1, duration: durationBloom, ease: 'soak' }, 0);
}

/**
 * Reveals `element` with the site's signature ragged-edge bloom, timed
 * with `--dur-bloom` / `--ease-soak`. Respects prefers-reduced-motion
 * (instant settle) and fragment landings (already-in-view elements settle
 * instantly instead of animating).
 */
export function bloomReveal(element: Element, options: Partial<BloomOptions> = {}): void {
  const merged: BloomOptions = { ...defaultOptions, ...options };

  if (prefersReducedMotion()) {
    // §5 + reduced-motion rule: no delays, no waiting on triggers — the
    // document is simply readable, in both trigger modes.
    settleInstant(element, merged);
    return;
  }

  if (merged.trigger === 'immediate') {
    playReveal(element, merged);
    return;
  }

  // Fragment landing (/#s3 etc.): anything already on screen at init time
  // must be readable content, not blank paper waiting for an entrance.
  if (visibleFraction(element) >= merged.threshold) {
    settleInstant(element, merged);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        playReveal(entry.target, merged);
        if (merged.once) observer.unobserve(entry.target);
      });
    },
    { threshold: merged.threshold, rootMargin: merged.rootMargin },
  );

  observer.observe(element);
}

export interface RippleOptions {
  color: string;
  size: number;
  scale: number;
}

const defaultRippleOptions: RippleOptions = {
  color: 'var(--title-green)',
  size: 24,
  scale: 7,
};

/** A small transient "soft bloom ripple" at a point — used by the moon's found feedback (§6.1). */
export function bloomRipple(origin: { x: number; y: number }, options: Partial<RippleOptions> = {}): void {
  const { color, size, scale } = { ...defaultRippleOptions, ...options };

  const el = document.createElement('div');
  el.className = 'bloom-ripple';
  el.setAttribute('aria-hidden', 'true');
  el.style.left = `${origin.x - size / 2}px`;
  el.style.top = `${origin.y - size / 2}px`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.background = color;
  document.body.appendChild(el);

  if (prefersReducedMotion()) {
    gsap.fromTo(
      el,
      { opacity: 0.9 },
      { opacity: 0, duration: REDUCED_MOTION_FADE_MS / 1000, ease: 'none', onComplete: () => el.remove() },
    );
    return;
  }

  const duration = readCssSeconds('--dur-bloom', 900);
  gsap.fromTo(
    el,
    { scale: 0.4, opacity: 0.85 },
    { scale, opacity: 0, duration, ease: 'soak', onComplete: () => el.remove() },
  );
}
