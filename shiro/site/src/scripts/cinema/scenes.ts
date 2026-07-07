/**
 * 真昼の月 — Wave 4: S3 scene choreography (design-system.md §5 "Kanji
 * depth", §7 S3). Source of truth for exactly what each scene's kanji does;
 * cinema/switcher.ts reuses `playKanjiExit` / `playKanjiEnter` from here for
 * the §6.5 variant-switch re-choreograph so the two systems never drift.
 *
 * Pin budget (design-system.md §5: "Pinned scenes only in Ch.3, max 4"):
 * scenes s3-1..s3-4 each get exactly one pinned ScrollTrigger — brief,
 * scrubbed, never a scroll-hijack (a bounded '+=NN%' distance, not an
 * indefinite hold). s3-5 (the album) is the Creative Director's resolution:
 * it flows UNPINNED — a normal scroll-linked parallax instead, calmer, the
 * chapter settling rather than performing.
 *
 * Every scene's kanji baseline is §5's general rule — "enters by sliding
 * along its vertical axis" — implemented as a scrubbed yPercent+opacity
 * tween, staggered per glyph. Three scenes layer a per-scene flavor on top
 * (all still satisfying the baseline, per the brief's per-scene script):
 *   s3-1 "kanji drifts across"    → added continuous xPercent drift for the
 *                                   whole pin, at a different rate than the
 *                                   scene's own subtle Ken Burns scale — the
 *                                   literal "parallax at different scroll
 *                                   rates than the scene" the spec asks for.
 *   s3-2 "glyphs slide on the diagonal" → the glyph group sits pre-rotated
 *                                   (CSS) and the entrance vector adds an
 *                                   xPercent component alongside yPercent.
 *   s3-4 覚醒 hero moment          → same baseline slide, both glyphs simply
 *                                   start from opposite screen edges (CSS
 *                                   position, not JS); 醒's manual
 *                                   clip-path silhouette (cinema.css) is
 *                                   permanent CSS, independent of motion
 *                                   state, so it holds under reduced motion
 *                                   too.
 * s3-3's "ribbon-title... like a handwritten signature" is deliberately NOT
 * this system — see animateSignature() below.
 *
 * Reduced motion (§5, non-negotiable): no pin, no parallax, no scrub. Every
 * scene settles to its resting state at call time — kanji visible, scrim
 * visible, silhouette clip-path (pure CSS) unaffected — and every scene
 * image is switched to eager loading (mirrors plates.ts's Wave 3 fix: a
 * visitor who lands mid-document via an instant jump must not find a blank
 * full-bleed scene whose fetch never started).
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../motion-gate';
import { readCssSeconds } from '../css-vars';
import { initCinemaBurn } from './burn';

const PIN_END: Record<string, string> = {
  's3-1': '+=130%', // longest — shares its leading ~35% with burn.ts's own reveal window
  's3-2': '+=90%',
  's3-3': '+=90%',
  's3-4': '+=100%', // a touch longer: the hero moment earns an extra beat
};

/** Exported for cinema/switcher.ts — the §6.5 re-choreograph reuses the exact same glyph query so the two systems can never drift apart. */
export function glyphsOf(scene: HTMLElement): HTMLElement[] {
  return Array.from(scene.querySelectorAll<HTMLElement>('.s3-kanji__glyph'));
}

/** Baseline §5 entrance ("slides along its vertical axis") + optional per-scene flavor, added to `tl` at `position`. */
function addKanjiEntrance(tl: gsap.core.Timeline, scene: HTMLElement, position: number): void {
  const glyphs = glyphsOf(scene);
  if (glyphs.length === 0) return;

  const isDiagonal = scene.dataset.s3Scene === 's3-2';
  const from: gsap.TweenVars = { yPercent: 55, opacity: 0 };
  if (isDiagonal) from.xPercent = -22;

  tl.fromTo(
    glyphs,
    from,
    { yPercent: 0, xPercent: 0, opacity: 1, stagger: 0.06, ease: 'ink' },
    position,
  );
}

/** s3-1 "kanji drifts across": a slow continuous pan for the whole pin, plus a barely-there Ken Burns on the image at a different rate — the felt parallax. */
function addDriftFlavor(tl: gsap.core.Timeline, scene: HTMLElement): void {
  const wrapper = scene.querySelector<HTMLElement>('[data-s3-kanji]');
  const media = scene.querySelector<HTMLElement>('.s3-scene__media.is-active img');
  if (wrapper) tl.to(wrapper, { xPercent: -10, ease: 'none' }, 0);
  if (media) tl.fromTo(media, { scale: 1 }, { scale: 1.05, ease: 'none' }, 0);
}

function addScrim(tl: gsap.core.Timeline, scene: HTMLElement, position: number): void {
  const scrim = scene.querySelector<HTMLElement>('.s3-scene__scrim');
  if (scrim) tl.fromTo(scrim, { opacity: 0 }, { opacity: 1, ease: 'none' }, position);
}

/** s3-3: the Hand-voice ribbon title draws on "like a handwritten signature" — an ink-sweep clip reveal in --scrawl rather than the Display Mincho glyph system (§5 grants "plain text fading in is fine" outside the arrival title's true stroke-draw; a directional wipe is this scene's version of that same allowance). */
function animateSignature(scene: HTMLElement): void {
  const signature = scene.querySelector<HTMLElement>('[data-s3-signature]');
  if (!signature) return;

  ScrollTrigger.create({
    trigger: scene,
    start: 'top top',
    end: '+=90%',
    scrub: 0.3,
    onUpdate: (self) => {
      gsap.set(signature, { clipPath: `inset(0 ${(1 - self.progress) * 100}% 0 0)`, opacity: self.progress > 0.02 ? 1 : 0 });
    },
  });
}

function isMobileViewport(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
}

function pinScene(scene: HTMLElement): void {
  const id = scene.dataset.s3Scene ?? '';
  const end = PIN_END[id] ?? '+=90%';

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: scene,
      start: 'top top',
      end,
      scrub: 0.35,
      pin: true,
      anticipatePin: 1,
    },
  });

  if (id === 's3-3') {
    // No Display Mincho kanji timeline for this scene — the signature has
    // its own independent ScrollTrigger (animateSignature, called by the
    // caller loop below) since it isn't part of this pin's tween set.
    addScrim(tl, scene, 0);
    return;
  }

  addScrim(tl, scene, 0.1);
  addKanjiEntrance(tl, scene, 0.15);
  if (id === 's3-1') addDriftFlavor(tl, scene);
}

/**
 * §9: "Mobile: ... pins become normal scroll (scrub only)." A first pass
 * at this literally kept `pinScene`'s scrub timeline but with `pin: false`
 * — technically "scrub only", but WRONG: every `PIN_END` distance (90–130%
 * of viewport) was tuned assuming the scene stays on screen for that whole
 * scrub, which is what pinning provides. Without it the scene scrolls past
 * at 1:1 with input, and a real headless render caught the result: s3-1's
 * kanji only reached full opacity after ~600px of scroll, by which point
 * its own glyph box had already scrolled ~500px above the viewport — it
 * was never visible AND opaque at the same time, effectively invisible
 * the whole way through.
 *
 * Fix: below 768px, every pinned scene instead gets a ONE-SHOT reveal
 * (mirrors animateAlbumScene's own already-unpinned pattern below,
 * `start: 'top %'` + `once: true` + a fixed-duration tween) triggered
 * while the scene is still scrolling into view from below, so it settles
 * to fully visible well before it would scroll back out the top. The
 * continuous s3-1 drift flavor (a parallax meant to run for an entire
 * held pin) is deliberately dropped at this width rather than retimed —
 * one fewer moving layer here also happens to satisfy §9's "kanji depth
 * reduces to ≤2 layers."
 */
function settleSceneOnEnter(scene: HTMLElement): void {
  const id = scene.dataset.s3Scene ?? '';
  const glyphs = glyphsOf(scene);
  const scrim = scene.querySelector<HTMLElement>('.s3-scene__scrim');
  const signature = scene.querySelector<HTMLElement>('[data-s3-signature]');
  const isDiagonal = id === 's3-2';

  if (scrim) gsap.set(scrim, { opacity: 0 });
  if (glyphs.length > 0) gsap.set(glyphs, { yPercent: 55, xPercent: isDiagonal ? -22 : 0, opacity: 0 });
  if (signature) gsap.set(signature, { clipPath: 'inset(0 100% 0 0)', opacity: 0 });

  ScrollTrigger.create({
    trigger: scene,
    start: 'top 75%',
    once: true,
    onEnter: () => {
      const duration = readCssSeconds('--dur-scene', 1200);
      if (scrim) gsap.to(scrim, { opacity: 1, duration, ease: 'soak' });
      if (glyphs.length > 0) {
        gsap.to(glyphs, { yPercent: 0, xPercent: 0, opacity: 1, duration, stagger: 0.06, ease: 'soak' });
      }
      if (signature) gsap.to(signature, { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration, ease: 'soak' });
    },
  });
}

/**
 * s3-5 (album): unpinned. One settle-in on first approach, plus a
 * continuous scroll-rate parallax on the vertical rail for as long as the
 * scene is in view — the chapter's resolution, calmer than the four pins
 * before it. Entrance and parallax deliberately target two DIFFERENT
 * nested elements (outer `[data-s3-kanji]` fade/slide-in vs. inner
 * `[data-s3-parallax]` continuous drift) — both are expressed as GSAP
 * `yPercent` on the same *element* would fight (a scrub onUpdate firing on
 * every scroll tick would stomp the one-shot entrance tween's value the
 * instant it also runs); splitting the target sidesteps that entirely
 * since nested transforms simply compose.
 */
function animateAlbumScene(scene: HTMLElement): void {
  const rail = scene.querySelector<HTMLElement>('[data-s3-kanji]');
  const parallaxTarget = scene.querySelector<HTMLElement>('[data-s3-parallax]');
  if (!rail) return;

  gsap.set(rail, { yPercent: 30, opacity: 0 });
  ScrollTrigger.create({
    trigger: scene,
    start: 'top 85%',
    once: true,
    onEnter: () => {
      gsap.to(rail, { yPercent: 0, opacity: 1, duration: readCssSeconds('--dur-scene', 1200), ease: 'soak' });
    },
  });

  if (parallaxTarget) {
    ScrollTrigger.create({
      trigger: scene,
      start: 'top bottom',
      end: 'bottom top',
      scrub: 0.4,
      onUpdate: (self) => {
        gsap.set(parallaxTarget, { yPercent: (self.progress - 0.5) * 14 });
      },
    });
  }
}

function settleReducedMotion(scenes: HTMLElement[]): void {
  scenes.forEach((scene) => {
    glyphsOf(scene).forEach((g) => gsap.set(g, { opacity: 1, x: 0, y: 0, clearProps: 'transform' }));
    const scrim = scene.querySelector<HTMLElement>('.s3-scene__scrim');
    if (scrim) gsap.set(scrim, { opacity: 1 });
    const signature = scene.querySelector<HTMLElement>('[data-s3-signature]');
    if (signature) gsap.set(signature, { clipPath: 'none', opacity: 1 });

    scene.querySelectorAll('img[loading="lazy"]').forEach((img) => img.setAttribute('loading', 'eager'));
  });
}

export function initCinemaScenes(): void {
  const scenes = Array.from(document.querySelectorAll<HTMLElement>('[data-s3-scene]'));
  if (scenes.length === 0) return;

  if (prefersReducedMotion()) {
    settleReducedMotion(scenes);
    return;
  }

  const mobile = isMobileViewport();

  scenes.forEach((scene) => {
    const id = scene.dataset.s3Scene;
    if (id === 's3-5') {
      animateAlbumScene(scene);
    } else if (scene.dataset.pin === 'true') {
      if (mobile) {
        settleSceneOnEnter(scene);
      } else {
        pinScene(scene);
        if (id === 's3-3') animateSignature(scene);
      }
    }
  });

  initCinemaBurn();
}
