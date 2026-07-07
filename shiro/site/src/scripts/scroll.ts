/**
 * 真昼の月 — Lenis + GSAP ScrollTrigger wiring (§5, §11).
 *
 * "Lenis smooth scroll (default wheel multiplier ≈1 — no scroll-hijack
 * feel). GSAP ScrollTrigger for pinning/scrubbing." and, per the wave brief,
 * Lenis drives ScrollTrigger via the gsap ticker (the integration recipe
 * Lenis' own docs recommend) rather than each running its own rAF loop.
 *
 * Under prefers-reduced-motion, Lenis is not instantiated at all — native
 * scroll takes over and ScrollTrigger reads that directly, which also
 * satisfies "no parallax" for anything driven purely by scroll position.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { prefersReducedMotion } from './motion-gate';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
let rafCallback: ((time: number) => void) | null = null;

/**
 * Fragment landings (deep links like /#s3) need to be owned by us, not
 * the UA, for two reasons observed in real Chrome:
 *
 *  1. The UA performs its anchor jump against the not-yet-styled layout
 *     (sections are a few hundred px tall pre-CSS), landing on the wrong
 *     document position once styles apply — the visitor gets blank paper.
 *  2. Lenis initializes its internal scroll at 0; while its dimensions
 *     are still measuring (ResizeObserver hasn't delivered → limit = 0),
 *     both its lerp loop and any early scrollTo() clamp toward 0 —
 *     fighting the UA jump and churning the scroll during first paint.
 *
 * So: pre-paint, cancel the UA's jump outright (scroll 0, restoration
 * manual — deterministic start, nothing to fight); then, two frames
 * after first paint, perform ONE instant native scroll to the target.
 * Native scrollTo is deliberate: idle Lenis adopts native scrolls via
 * its own reset path, and it cannot be limit-clamped the way an early
 * lenis.scrollTo() can. A deep link is a destination, not a journey —
 * the snap is instant in both motion modes. Re-applied on `load` (font
 * swap-in shifts offsets; skipped if the visitor has already scrolled
 * away) and on `hashchange` (address-bar edits).
 */
let lastSnapY: number | null = null;

/**
 * Deep-link target: `/#s3` (canonical) or `/?s=s3` (equivalent; exists
 * because some headless-capture pipelines mis-composite pages loaded
 * with a URL fragment — QA can use the query form to screenshot deep
 * states through a pure post-paint programmatic scroll).
 */
function getDeepLinkId(): string | null {
  const hash = window.location.hash;
  if (hash && hash.length >= 2) return decodeURIComponent(hash.slice(1));
  const param = new URLSearchParams(window.location.search).get('s');
  return param || null;
}

/**
 * F7 fix: `html.lenis-scrolling` was observed never clearing after a
 * deep-link landing (confirmed by direct reproduction: a plain `/` load
 * never sets the class at all, since nothing scrolls; every `/#s2`-style
 * load sets it and it stays set indefinitely — the class only ever
 * clears again on the visitor's next real wheel/touch scroll).
 *
 * Root cause traced into Lenis itself: its `onNativeScroll` handler only
 * re-arms its 400ms "settle" timeout `if (velocity !== 0)`. Our own
 * corrective jumps (this module's `window.scrollTo` calls fire from up to
 * three sites — the settle rAF, the `load` re-sync, `hashchange` — plus
 * GSAP ScrollTrigger's own scroll-and-restore it performs internally
 * while measuring pinned triggers on `refresh()`, which we also trigger
 * on font swap-in / `load`) can produce a same-position native 'scroll'
 * event once things have already settled. That event's computed velocity
 * is 0, so Lenis clears its pending timer (a duplicate-event guard) but
 * never schedules a replacement — `isScrolling` is left permanently
 * "native", and the class never clears.
 *
 * Rather than patch the vendored library, force it back to a clean
 * resting state a couple of frames after each of our own corrective
 * scrolls. `reset()` is typed `private` in Lenis's declarations (it is
 * not part of the supported public API) but is an ordinary method at
 * runtime that does exactly this — this is a narrow, intentional escape
 * hatch for one specific library edge case, not a pattern to reach for
 * elsewhere.
 */
function resyncLenisScrollState(): void {
  const instance = lenis;
  if (!instance) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      (instance as unknown as { reset?: () => void }).reset?.();
    });
  });
}

function snapToHash(): void {
  const id = getDeepLinkId();
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;

  const top = Math.round(target.getBoundingClientRect().top + window.scrollY);
  window.scrollTo({ top, behavior: 'auto' });
  lastSnapY = top;
  deepLinkResnapDisarmed = false; // every explicit snap re-arms the post-layout-shift correction below
  ScrollTrigger.update();
  resyncLenisScrollState();
}

/**
 * Wave 5 fix (CD review, BLOCKING): deep links to sections BELOW the
 * cinema chapter (#s4, #s5) landed ~2 viewports early — S3's four pinned
 * ScrollTriggers insert pin-spacers that inflate the document AFTER the
 * initial double-rAF snap has already run (pins are created inside
 * `onSettled`, i.e. after `snapToHash()`), and every later
 * `ScrollTrigger.refresh()` (fonts swap-in, `load`) can shift offsets
 * again. Landing at /#s4 actually showed the 覚醒 scene.
 *
 * Correction: re-snap (instant jump, no glide — identical to the F6
 * behavior above) whenever the hash target's real position has drifted
 * from where we last pinned it, until the two agree. Wired to run (a)
 * right after `onSettled` returns — the pins now exist — and (b) after
 * every global ScrollTrigger refresh. Guarded the same way as the `load`
 * re-sync: the moment the visitor scrolls away from the landing position
 * on their own, the correction disarms permanently — a layout shift is
 * ours to fix, but the scroll position belongs to the visitor.
 */
let deepLinkResnapDisarmed = false;

function resnapAfterLayoutShift(): void {
  if (deepLinkResnapDisarmed || lastSnapY === null) return;
  const id = getDeepLinkId();
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;

  if (Math.abs(window.scrollY - lastSnapY) >= 2) {
    deepLinkResnapDisarmed = true; // the visitor has moved on — never yank
    return;
  }

  const top = Math.round(target.getBoundingClientRect().top + window.scrollY);
  if (Math.abs(top - window.scrollY) > 1) snapToHash();
}

function scheduleHashSnap(onSettled: () => void): void {
  const hasDeepLink = getDeepLinkId() !== null;
  const hasHash = !!window.location.hash && window.location.hash.length >= 2;

  if (hasHash) {
    // Deterministic start: kill the UA's unstyled-layout anchor jump and
    // any scroll restoration before first paint.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

  }

  if (hasDeepLink) {
    window.addEventListener('load', () => {
      // Font swap may have shifted offsets — re-pin, but never yank the
      // scroll away from a visitor who has already moved on.
      if (lastSnapY === null || Math.abs(window.scrollY - lastSnapY) < 2) {
        snapToHash();
      }
    });
  }

  // Two frames later: first paint has happened, CSS layout is final
  // (module init already runs post-stylesheet), and Lenis's dimensions
  // have been delivered. One clean programmatic jump, then the rest of
  // the app boots against the *correct* scroll position — so reveal
  // in-view checks settle deep-linked content instantly instead of
  // playing entrances at the visitor.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (hasDeepLink) snapToHash();
      onSettled();
      if (hasDeepLink) {
        // onSettled just created S3's pinned ScrollTriggers, whose
        // pin-spacers inflate the document above a #s4/#s5 landing — the
        // snap two lines up is already stale. Two frames later (layout
        // committed), correct it. Later shifts (fonts/load refreshes) are
        // caught by the ScrollTrigger 'refresh' listener in initScroll.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resnapAfterLayoutShift());
        });
      }
    });
  });
}

/**
 * Boots the scroll system. `onSettled` runs two frames later, after any
 * deep-link position has been pinned — scroll-position-sensitive systems
 * (reveals, section tracker, rail, moon) must init inside it.
 */
export function initScroll(onSettled: () => void = () => {}): Lenis | null {
  if (!prefersReducedMotion()) {
    lenis = new Lenis({
      wheelMultiplier: 1, // §5: "default wheel multiplier ≈1 — no scroll-hijack feel"
      autoRaf: false, // gsap.ticker drives raf below, not Lenis' own loop
    });

    lenis.on('scroll', ScrollTrigger.update);

    rafCallback = (time: number) => {
      lenis?.raf(time * 1000);
    };
    gsap.ticker.add(rafCallback);
    gsap.ticker.lagSmoothing(0);
  }

  scheduleHashSnap(onSettled);
  window.addEventListener('hashchange', snapToHash);

  // Every global refresh (fonts.ready / load via refreshScrollTriggers, or
  // any future caller) can move the hash target — re-correct until stable.
  ScrollTrigger.addEventListener('refresh', resnapAfterLayoutShift);

  ScrollTrigger.refresh();
  return lenis;
}

export function getLenis(): Lenis | null {
  return lenis;
}

/**
 * Recalculate every ScrollTrigger's start/end positions. Called after
 * late layout shifts — web-font swap-in and full window load — so trigger
 * positions (and the rail's progress mapping) match the settled document,
 * including on fragment-URL landings.
 */
export function refreshScrollTriggers(): void {
  ScrollTrigger.refresh();
  // F7: refresh() measures every pinned trigger by scrolling to it and
  // back, which can trip the same Lenis re-entrancy gap snapToHash() hits
  // — see resyncLenisScrollState()'s docblock.
  resyncLenisScrollState();
}

/** True whenever Lenis is the active scroller (i.e. full motion is on). */
export function isSmoothScrollActive(): boolean {
  return lenis !== null;
}

export function destroyScroll(): void {
  if (rafCallback) {
    gsap.ticker.remove(rafCallback);
    rafCallback = null;
  }
  lenis?.destroy();
  lenis = null;
}
