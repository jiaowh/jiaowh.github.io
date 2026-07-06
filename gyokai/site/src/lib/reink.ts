// GYOKAI — Acid Pop Archive
// Ambient re-inking (creative-direction.md §2 "signature mechanic",
// design-system.md §1.2): tweens --live-bg / --live-accent / --live-text
// on :root to the given artwork's palette. 0.6s, EASE.ink (power2.out).
//
// The contrast-safe pairing (text vs bg ≥ 4.5:1) was computed at build
// time by scripts/build-assets.mjs and lives in the manifest — this module
// never re-derives colors, it just applies the manifest triple.

import { gsap, EASE, prefersReducedMotion } from "./gsap-setup";
import type { ArtworkManifestEntry } from "./types";

export interface InkPalette {
  bg: string;
  accent: string;
  text: string;
}

/** The contrast-safe palette triple the manifest stores per artwork. */
export function paletteOf(artwork: ArtworkManifestEntry): InkPalette {
  return { bg: artwork.dominant, accent: artwork.vivid, text: artwork.text };
}

let currentKey: string | null = null;

export function applyPalette(palette: InkPalette, opts: { instant?: boolean } = {}): void {
  const root = document.documentElement;
  const announce = (): void => {
    // Consumers that paint with the live tokens on canvas (e.g. the
    // halftone specimen) re-render on this.
    document.dispatchEvent(new CustomEvent("gyokai:reink", { detail: palette }));
  };
  if (opts.instant || prefersReducedMotion()) {
    gsap.killTweensOf(root);
    root.style.setProperty("--live-bg", palette.bg);
    root.style.setProperty("--live-accent", palette.accent);
    root.style.setProperty("--live-text", palette.text);
    announce();
    return;
  }
  gsap.to(root, {
    "--live-bg": palette.bg,
    "--live-accent": palette.accent,
    "--live-text": palette.text,
    duration: 0.6,
    ease: EASE.ink,
    overwrite: "auto",
    onComplete: announce,
  });
}

/** Re-ink the whole site to an artwork's color-world. Deduped by id. */
export function reinkTo(artwork: ArtworkManifestEntry, opts: { instant?: boolean } = {}): void {
  if (currentKey === artwork.id && !opts.instant) return;
  currentKey = artwork.id;
  applyPalette(paletteOf(artwork), opts);
}
