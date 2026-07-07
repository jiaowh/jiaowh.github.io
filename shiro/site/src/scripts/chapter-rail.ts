/**
 * 真昼の月 — chapter rail behavior (§4).
 *
 * Current chapter (aria-current + expanded Hand-voice name), the 1px
 * progress thread stitching downward with scroll, click-to-scroll, and the
 * moon-found phase marks (§6.1). Positioning/markup live in index.html +
 * chapter-rail.css; this module only wires behavior.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './motion-gate';
import { readCssSeconds } from './css-vars';
import { getLenis } from './scroll';
import { onSectionChange, getCurrentSection, SECTION_ORDER, type SectionId } from './active-section';
import { getFoundMoons, onMoonsChange } from './moon/state';

function isSectionId(value: string | undefined): value is SectionId {
  return !!value && (SECTION_ORDER as string[]).includes(value);
}

function setActiveLink(links: HTMLAnchorElement[], id: SectionId): void {
  links.forEach((link) => {
    if (link.dataset.railLink === id) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}

/**
 * Wave 4, task item 6: "chapter rail keeps working over dark scenes — it
 * may need a mode/contrast treatment when over cinema." S3's full-bleed
 * scenes and --cinema-dim gaps both sit far from the rail's default
 * paper-native --ink-soft/--ink palette, so the rail switches to a
 * white-on-dark-backing scheme (cinema.css) whenever s3 is current.
 */
function setRailMode(nav: HTMLElement, id: SectionId): void {
  nav.dataset.railMode = id === 's3' ? 'cinema' : 'paper';
}

function refreshMoonTicks(items: HTMLLIElement[]): void {
  const found = getFoundMoons();
  items.forEach((item) => {
    const id = item.dataset.railItem;
    if (isSectionId(id)) item.dataset.moonFound = String(found.has(id));
  });
}

function scrollToSection(target: HTMLElement): void {
  const lenis = getLenis();
  if (lenis) {
    lenis.scrollTo(target, { offset: 0 });
  } else {
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
}

export function initChapterRail(): void {
  const nav = document.querySelector<HTMLElement>('[data-chapter-rail]');
  if (!nav) return;

  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('[data-rail-link]'));
  const items = Array.from(nav.querySelectorAll<HTMLLIElement>('[data-rail-item]'));
  const progressEl = nav.querySelector<HTMLElement>('[data-rail-progress]');

  setActiveLink(links, getCurrentSection());
  onSectionChange((id) => setActiveLink(links, id));

  setRailMode(nav, getCurrentSection());
  onSectionChange((id) => setRailMode(nav, id));

  refreshMoonTicks(items);
  onMoonsChange(() => refreshMoonTicks(items));

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.dataset.railLink;
      if (!isSectionId(id)) return;
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      scrollToSection(target);
    });
  });

  if (progressEl) {
    ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        progressEl.style.setProperty('--rail-progress', String(self.progress));
      },
    });
  }
}

/**
 * §7 S0: "no scroll hint — the progress thread's first stitch animates
 * downward instead." Plays once, on load, independent of real scroll
 * position (real progress tracking starts at 0 regardless and only grows
 * once the visitor actually scrolls, so there is no conflict between the
 * two — see chapter-rail.css for how the base thread and the progress
 * overlay are kept as separate elements for exactly this reason).
 *
 * Below 1080px the rail is a horizontal top bar (chapter-rail.css) — the
 * thread grows left-to-right there instead of top-to-bottom, so the one
 * axis this module hardcodes (the continuous scroll-progress fill is a
 * CSS custom property, orientation-agnostic) needs to follow suit. Read
 * once per call rather than cached, since a visitor can load at desktop
 * width or narrow — matches the ad hoc width checks already used
 * elsewhere (e.g. moon.ts's resize handler recomputing in place).
 */
export function playInitialStitch(): void {
  const thread = document.querySelector<HTMLElement>('[data-rail-thread]');
  if (!thread) return;

  const isTopBar = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1079px)').matches;
  const axis = isTopBar ? 'scaleX' : 'scaleY';

  if (prefersReducedMotion()) {
    gsap.set(thread, { [axis]: 1 });
    return;
  }

  const duration = readCssSeconds('--dur-scene', 1200);
  gsap.to(thread, { [axis]: 1, duration, delay: 0.4, ease: 'soak' });
}
