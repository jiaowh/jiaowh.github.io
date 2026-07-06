// GYOKAI — Acid Pop Archive
// Beat 1 — "KANBAN" (creative-direction.md §3, design-system.md §7.2).
// Vertical 魚介 (vertical-rl, Dela Gothic One) crossing horizontal GYOKAI
// (Archivo Black); hero artwork die-cut breaking the section edge with
// paper border + hard ink shadow + offset accent keyline; marquee tapes
// top+bottom; particle canvas behind; bouncing chunky arrow scroll cue.
// Hero settles within 1.2s of the loader ending.

import { gsap, EASE, prefersReducedMotion } from "../lib/gsap-setup";
import { scrollToTarget } from "../lib/lenis";
import { initMarquee } from "../lib/marquee";
import { initParticleField } from "../lib/particles";
import { buildPicture } from "../lib/art";
import { JP } from "../data/strings";
import type { ArtworkManifestEntry } from "../lib/types";

export interface HeroHandle {
  /** Called by main.ts once the loader resolves. */
  playEntrance: () => void;
}

function tapeItems(): string {
  const star = `<svg class="tape__star" width="14" height="14" aria-hidden="true"><use href="#motif-star-4pt" /></svg>`;
  return [
    `<span class="tape__item">GYOKAI</span>`,
    star,
    `<span class="tape__item" lang="ja">${JP.artist}</span>`,
    star,
    `<span class="tape__item">ACID POP ARCHIVE</span>`,
    star,
    `<span class="tape__item" lang="ja">${JP.acidPop}</span>`,
    star,
  ].join("");
}

export function initHero(heroArtwork: ArtworkManifestEntry): HeroHandle {
  // Die-cut hero art — the LCP: eager, high priority (preloaded in <head>).
  const artFigure = document.getElementById("hero-art");
  if (artFigure) {
    const picture = buildPicture(heroArtwork, {
      sizes: "(max-width: 768px) 72vw, 34vw",
      eager: true,
    });
    artFigure.appendChild(picture);
  }

  // Tapes (top scrolls left, bottom scrolls right).
  for (const [id, reverse] of [
    ["hero-tape-top", false],
    ["hero-tape-bottom", true],
  ] as const) {
    const track = document.getElementById(id);
    if (track) {
      track.innerHTML = tapeItems();
      initMarquee({ track, pxPerSecond: 72, reverse });
    }
  }

  // Particle field behind everything.
  const canvas = document.getElementById("hero-particles");
  if (canvas instanceof HTMLCanvasElement) initParticleField({ canvas });

  // Scroll cue: constant chunky bounce; click glides to THE CODE.
  const cue = document.getElementById("hero-scroll-cue");
  if (cue) {
    cue.addEventListener("click", () => {
      const target = document.getElementById("the-code");
      if (target) scrollToTarget(target);
    });
    if (!prefersReducedMotion()) {
      gsap.to(cue.querySelector("svg"), {
        y: 7,
        duration: 0.45,
        ease: "power1.inOut",
        yoyo: true,
        repeat: -1,
      });
    }
  }

  const entranceTargets = [
    "#hero .hero__stage .caption-box",
    ".hero__wordmark-jp",
    ".hero__wordmark-latin",
    "#hero-art",
    ".hero__tagline",
    "#hero-scroll-cue",
  ];

  // Hidden until the loader hands over (skip flag prevents double-hiding
  // if the entrance ends up never running, e.g. hot reload edge cases).
  gsap.set(entranceTargets, { opacity: 0 });

  const playEntrance = (): void => {
    if (prefersReducedMotion()) {
      gsap.to(entranceTargets, { opacity: 1, duration: 0.3 });
      return;
    }
    // Everything settles within 1.2s (§7 pacing).
    const tl = gsap.timeline();
    tl.fromTo(
      entranceTargets,
      { opacity: 0, scale: 1.15, rotation: (i: number) => [1, -2, 2, -3, 0, 0][i] ?? 0 },
      {
        opacity: 1,
        scale: 1,
        rotation: (i: number) => [0, 0, -1, -2.5, 0, 0][i] ?? 0,
        duration: 0.45,
        stagger: 0.06,
        ease: EASE.slap,
        clearProps: "scale",
      },
      0.05,
    );
  };

  return { playEntrance };
}
