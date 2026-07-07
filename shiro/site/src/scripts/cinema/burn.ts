/**
 * 真昼の月 — Wave 4: the S3 register handoff (design-system.md §1, task item 1).
 *
 * "At S3 entry the paper burns away via an irregular watercolor-edge SVG
 * mask reveal (NOT a straight wipe) into the full-bleed cinema register; at
 * S3 exit the paper un-burns back."
 *
 * Mechanism: a fixed, full-viewport `--paper`-colored overlay
 * ([data-s3-burn], z-index --z-cinema-burn — above section content, below
 * the rail/moon chrome so navigation stays usable through the transition)
 * carries an SVG luminance mask: a circle, distorted by the same
 * feTurbulence + feDisplacementMap technique bloom-reveal.ts uses for
 * plates (kept as an independent, self-contained copy here rather than an
 * import — this is a chapter-level, bidirectional, scroll-scrubbed effect,
 * not a one-shot per-element reveal, and the two have different lifecycle
 * needs). White circle area = overlay HIDDEN (a "hole" letting the cinema
 * scene underneath show through); everywhere else = overlay fully opaque
 * paper. Growing the circle 0 → full therefore reads as paper burning away
 * to reveal the scene beneath; shrinking it back reads as the paper
 * reforming.
 *
 * Both directions are driven by ONE ScrollTrigger each (scrub, no pin —
 * the register handoff spends none of Ch.3's 4-pin budget, which is
 * reserved entirely for the five scenes per the wave brief):
 *   - entry: trigger = scene s3-1, 'top top' → '+=45%' (the first scene's
 *     own pin — see scenes.ts — spans a longer range; the burn only owns
 *     this leading slice of it, then holds fully revealed).
 *   - exit: trigger = scene s3-5, 'bottom bottom' → 'bottom top' (exactly
 *     one viewport-height of natural scroll as the unpinned album scene
 *     scrolls out — brief, no extra empty scroll track needed).
 *
 * Outside both zones the overlay is hidden outright (onEnter/onLeave/
 * onEnterBack/onLeaveBack toggle display) — without this, an inactive
 * ScrollTrigger still reports a clamped progress of 0 (nearer zero than one
 * at any position above its start), which would otherwise paint a
 * permanent opaque-paper sheet fixed over the ENTIRE site from first paint.
 *
 * Reduced motion: this module is never called (see cinema/scenes.ts /
 * main.ts) — the paper→cinema shift is then just an ordinary
 * background-color change between sections, no animated mask, per §5's
 * "no blend tricks that require animation".
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FINAL_RADIUS = 0.82; // objectBoundingBox units — covers a 100vw x 100vh box corner-to-corner with margin for the organic displacement

function buildBurnDefs(): SVGCircleElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bloom-defs'); // reuses the existing 0×0-hidden utility class (motion.css)
  svg.setAttribute('aria-hidden', 'true');

  const defs = document.createElementNS(SVG_NS, 'defs');

  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', 's3-burn-filter');
  filter.setAttribute('x', '-60%');
  filter.setAttribute('y', '-60%');
  filter.setAttribute('width', '220%');
  filter.setAttribute('height', '220%');
  filter.setAttribute('primitiveUnits', 'objectBoundingBox');

  const turbulence = document.createElementNS(SVG_NS, 'feTurbulence');
  turbulence.setAttribute('type', 'fractalNoise');
  turbulence.setAttribute('baseFrequency', '2.2 3.1');
  turbulence.setAttribute('numOctaves', '3');
  turbulence.setAttribute('seed', '17');
  turbulence.setAttribute('result', 'noise');

  const displace = document.createElementNS(SVG_NS, 'feDisplacementMap');
  displace.setAttribute('in', 'SourceGraphic');
  displace.setAttribute('in2', 'noise');
  displace.setAttribute('scale', '0.42'); // rougher, wetter edge than a plate bloom — this is a whole paper field tearing away
  displace.setAttribute('xChannelSelector', 'R');
  displace.setAttribute('yChannelSelector', 'G');

  filter.append(turbulence, displace);

  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', 's3-burn-mask');
  mask.setAttribute('maskUnits', 'objectBoundingBox');
  mask.setAttribute('maskContentUnits', 'objectBoundingBox');

  // Full-cover white base: without it, the mask's un-painted area defaults
  // to transparent (=hidden) everywhere the circle *isn't* — inverted from
  // what we want (opaque paper by default, a hole where the circle grows).
  const base = document.createElementNS(SVG_NS, 'rect');
  base.setAttribute('x', '-1');
  base.setAttribute('y', '-1');
  base.setAttribute('width', '3');
  base.setAttribute('height', '3');
  base.setAttribute('fill', '#fff');

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '0.5');
  circle.setAttribute('cy', '0.45');
  circle.setAttribute('r', '0');
  circle.setAttribute('fill', '#000'); // black = hidden = the burned-through hole
  circle.setAttribute('filter', 'url(#s3-burn-filter)');

  mask.append(base, circle);
  defs.append(filter, mask);
  svg.appendChild(defs);
  document.body.appendChild(svg);

  return circle;
}

/**
 * Wires the register handoff. Full-motion only — caller (main.ts) must gate
 * on `!prefersReducedMotion()` (mirrors the pattern in scenes.ts).
 */
export function initCinemaBurn(): void {
  const overlay = document.querySelector<HTMLElement>('[data-s3-burn]');
  const sceneIn = document.querySelector<HTMLElement>('[data-s3-scene="s3-1"]');
  const sceneOut = document.querySelector<HTMLElement>('[data-s3-scene="s3-5"]');
  if (!overlay || !sceneIn || !sceneOut) return;

  const circle = buildBurnDefs();
  overlay.style.setProperty('mask', 'url(#s3-burn-mask)');
  overlay.style.setProperty('-webkit-mask', 'url(#s3-burn-mask)');

  const setHole = (progress: number) => {
    gsap.set(circle, { attr: { r: gsap.utils.clamp(0, 1, progress) * FINAL_RADIUS } });
  };
  setHole(0); // start state: fully opaque paper, matching S2 right up to the boundary

  const show = () => overlay.style.setProperty('display', 'block');
  const hide = () => overlay.style.setProperty('display', 'none');
  hide();

  const entry = ScrollTrigger.create({
    trigger: sceneIn,
    start: 'top top',
    end: '+=45%',
    scrub: 0.3,
    onUpdate: (self) => setHole(self.progress),
    onEnter: show,
    onEnterBack: show,
    onLeave: hide,
    onLeaveBack: hide,
  });

  const exit = ScrollTrigger.create({
    trigger: sceneOut,
    start: 'bottom bottom',
    end: 'bottom top',
    scrub: 0.3,
    onUpdate: (self) => setHole(1 - self.progress),
    onEnter: show,
    onEnterBack: show,
    onLeave: hide,
    onLeaveBack: hide,
  });

  // onEnter/onLeave are edge-triggered (fire on a crossing) — a deep link
  // (?at=s3, or a fragment landing on a scene id) can put the very FIRST
  // paint statically at a trigger's exact start/end boundary with no
  // scroll delta ever occurring, so neither callback fires and the overlay
  // would incorrectly stay hidden even though `progress` is a legitimate
  // in-zone value (0 counts as "the very start of the burn", not "not
  // burning"). `isActive` reflects the true current state regardless of
  // how we got here, so a one-time explicit sync after creation covers the
  // static-landing case that the edge callbacks alone cannot.
  if (entry.isActive) {
    show();
    setHole(entry.progress);
  }
  if (exit.isActive) {
    show();
    setHole(1 - exit.progress);
  }
}
