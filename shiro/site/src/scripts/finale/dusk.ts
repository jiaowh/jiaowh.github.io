/**
 * 真昼の月 — Wave 5: the S5 dusk transition + moon payoff (§7 S5, §6.1
 * "Finale payoff"). Two jobs sharing one DOM subtree:
 *
 *  1. Dusk. `.s5-dusk__sky` is a CSS `position: sticky` panel — NOT a GSAP
 *     pin (§5 reserves ScrollTrigger pinning for Ch.3, max 4, and this
 *     isn't one of them). Its resting/no-JS/reduced-motion state is simply
 *     already `--night` with the payoff content already visible (this
 *     module's own progressive-enhancement baseline, mirrored in s5.css);
 *     full motion arms a paper-colored overlay (`.s5-dusk__paper`) and
 *     fades it OUT across a scrubbed (non-pinning) ScrollTrigger tied to
 *     the tall `.s5-dusk` container, revealing the night beneath as the
 *     payoff content fades/rises in alongside it — "not a hard section
 *     break — a slow dusk," across ~one viewport of scroll (the container
 *     is 200vh; the sticky child holds 100vh of it, leaving a 100vh scrub
 *     range). Only opacity/transform are tweened (§10).
 *
 *  2. Moon payoff. Subscribes directly to moon/state.ts — the same store
 *     the moon button (moon/moon.ts) and the chapter rail already read, so
 *     a moon found anywhere (including on this very section, since the
 *     wandering moon button stays live and clickable across all of S5)
 *     updates this instantly. Found count drives:
 *       - the hero moon's phase: a two-circle mask crescent-to-full trick
 *         (litFraction = count/total maps the shadow circle's offset from
 *         0, fully overlapping/dark at 0/6, to 2×R, fully clear/full moon
 *         at 6/6) — a permanent faint ring stays visible even at 0/6, so
 *         "the site forgives you" reads as "the moon is quietly still
 *         there", not "nothing rendered".
 *       - a small tick per section (found = filled, unfound = a bare dot).
 *       - the catalog-mono counter (state.ts's own `formatMoonCounter()`).
 *     Reaching 6/6 triggers ONE slow bloom (a scale pulse + bloomRipple,
 *     reusing the exact same "soft bloom" language as the moon button's
 *     own found-feedback) — guarded so it never replays mid-session.
 *     The obi line (`.s5-obi`) is unconditional: it renders regardless of
 *     count, per §6.1/§7's "0/6 visitors still get the line — gently."
 */

import { gsap } from 'gsap';
import { prefersReducedMotion } from '../motion-gate';
import { readCssSeconds } from '../css-vars';
import { bloomRipple } from '../bloom-reveal';
import { SECTION_ORDER, type SectionId } from '../active-section';
import {
  getFoundMoons,
  getMoonCount,
  getTotalMoons,
  formatMoonCounter,
  onMoonsChange,
} from '../moon/state';

const MOON_R = 46; // matches the SVG circles' r in index.html (viewBox -60..60)

function renderTicks(container: HTMLElement, found: ReadonlySet<SectionId>): void {
  // Rebuilt wholesale on every change — six tiny nodes, negligible cost,
  // and keeps this in perfect lockstep with SECTION_ORDER without a diffing
  // layer.
  container.innerHTML = '';
  SECTION_ORDER.forEach((id) => {
    const tick = document.createElement('span');
    tick.className = 's5-moon-tick';
    tick.dataset.found = String(found.has(id));
    container.appendChild(tick);
  });
}

export function initFinaleDusk(): void {
  const container = document.querySelector<HTMLElement>('[data-s5-dusk]');
  const sky = document.querySelector<HTMLElement>('[data-s5-sky]');
  const payoff = document.querySelector<HTMLElement>('[data-s5-payoff]');
  const heroMoon = document.querySelector<SVGSVGElement>('[data-s5-hero-moon]');
  const shadow = document.querySelector<SVGCircleElement>('[data-s5-moon-shadow]');
  const ticks = document.querySelector<HTMLElement>('[data-s5-ticks]');
  const counter = document.querySelector<HTMLElement>('[data-s5-counter]');
  const status = document.querySelector<HTMLElement>('[data-s5-status]');

  if (!container || !sky || !payoff || !heroMoon || !shadow || !ticks || !counter || !status) return;

  let bloomed = false;

  function applyPhase(animate: boolean): void {
    const count = getMoonCount();
    const total = getTotalMoons();
    const fraction = total > 0 ? count / total : 0;
    const cx = fraction * 2 * MOON_R;

    if (animate && !prefersReducedMotion()) {
      gsap.to(shadow!, { attr: { cx }, duration: readCssSeconds('--dur-scene', 1200), ease: 'soak' });
    } else {
      gsap.set(shadow!, { attr: { cx } });
    }

    counter!.textContent = formatMoonCounter(count, total);
    status!.textContent = `You have found ${count} of ${total} hidden moons.`;
    renderTicks(ticks!, getFoundMoons());

    if (fraction >= 1 && !bloomed) {
      bloomed = true;
      if (!prefersReducedMotion()) {
        gsap.fromTo(
          heroMoon!,
          { scale: 1 },
          {
            scale: 1.18,
            duration: readCssSeconds('--dur-bloom', 900),
            ease: 'soak',
            yoyo: true,
            repeat: 1,
            transformOrigin: '50% 50%',
          },
        );
        const rect = heroMoon!.getBoundingClientRect();
        bloomRipple(
          { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          { color: 'var(--moon)', size: rect.width, scale: 4 },
        );
      }
    }
  }

  // Correct initial phase always applies immediately, independent of
  // motion preference — this is state, not a reveal.
  applyPhase(false);
  onMoonsChange(() => applyPhase(true));

  if (prefersReducedMotion()) return; // resting CSS (already --night, content visible) is the whole experience.

  sky.dataset.armed = 'true';

  const paper = sky.querySelector<HTMLElement>('[data-s5-paper]');

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: container,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.3,
    },
  });

  if (paper) tl.fromTo(paper, { opacity: 1 }, { opacity: 0, ease: 'none' }, 0);
  tl.fromTo(payoff, { opacity: 0, y: 18 }, { opacity: 1, y: 0, ease: 'none' }, 0.45);
}
