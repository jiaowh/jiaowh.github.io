// GYOKAI — Acid Pop Archive
// Beat 0 — "INK CHECK" (creative-direction.md §3, design-system.md §7.1).
// Black screen; C/M/Y plates of the GYOKAI logotype slam in misregistered
// (±8px, 0.12s apart) → snap into register → halftone iris opens onto the
// hero. ≤2.5s total; ANY input skips instantly. Body scroll is locked for
// the loader's lifetime only. Seeds --live-* from the hero artwork.

import { gsap, EASE, prefersReducedMotion } from "../lib/gsap-setup";
import { lockScroll } from "../lib/lenis";
import { primeCovered, wipeOut } from "../lib/halftone";
import { reinkTo } from "../lib/reink";
import type { ArtworkManifestEntry } from "../lib/types";

const SKIP_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

export function initLoader(heroArtwork: ArtworkManifestEntry): Promise<void> {
  const loader = document.getElementById("loader");
  if (!loader) return Promise.resolve();

  // First paint is already in-world: hero palette behind the loader.
  reinkTo(heroArtwork, { instant: true });
  lockScroll(true);

  return new Promise<void>((resolve) => {
    let finished = false;
    let tl: gsap.core.Timeline | null = null;

    const teardownSkip = (): void => {
      for (const type of SKIP_EVENTS) window.removeEventListener(type, skip, true);
    };

    const finish = (skipped: boolean): void => {
      if (finished) return;
      finished = true;
      teardownSkip();
      tl?.kill();
      const done = (): void => {
        loader.remove();
        lockScroll(false);
        resolve();
      };
      if (skipped) {
        // Any input skips instantly — no wipe, straight to the hero.
        done();
      } else {
        // Cover with ink above the loader, drop the loader, iris open.
        primeCovered("#0A0A12");
        loader.remove();
        void wipeOut("#0A0A12").then(() => {
          lockScroll(false);
          resolve();
        });
      }
    };

    const skip = (): void => finish(true);
    for (const type of SKIP_EVENTS) window.addEventListener(type, skip, true);

    if (prefersReducedMotion()) {
      // §5.3: no slam, no iris — brief brand beat, then a plain fade.
      gsap.set(".loader__plate", { opacity: 1 });
      window.setTimeout(() => {
        if (finished) return;
        finished = true;
        teardownSkip();
        gsap.to(loader, {
          opacity: 0,
          duration: 0.3,
          onComplete: () => {
            loader.remove();
            lockScroll(false);
            resolve();
          },
        });
      }, 700);
      return;
    }

    const plates = Array.from(loader.querySelectorAll<HTMLElement>(".loader__plate"));
    // Misregistration offsets per plate (±8px), snapped away later.
    const offsets = [
      { x: -8, y: 6, rotation: -1.5 },
      { x: 8, y: -7, rotation: 1 },
      { x: -6, y: -8, rotation: 0.8 },
    ];

    tl = gsap.timeline();
    plates.forEach((plate, i) => {
      const off = offsets[i % offsets.length] ?? { x: 8, y: 8, rotation: 1 };
      tl?.fromTo(
        plate,
        { opacity: 0, scale: 1.15, x: off.x * 2.2, y: off.y * 2.2, rotation: off.rotation },
        {
          opacity: 1,
          scale: 1,
          x: off.x,
          y: off.y,
          rotation: off.rotation,
          duration: 0.4,
          ease: EASE.slap,
        },
        0.15 + i * 0.12, // plates slam 0.12s apart
      );
    });
    // Snap into register.
    tl.to(plates, { x: 0, y: 0, rotation: 0, duration: 0.22, ease: EASE.snap }, 1.05);
    // Registration mark + caption confirm the pass.
    tl.fromTo(
      ".loader__reg",
      { opacity: 0, rotation: -90 },
      { opacity: 1, rotation: 0, duration: 0.3, ease: EASE.snap },
      1.15,
    );
    // Iris open — total runtime lands ≈ 2.2s, under the 2.5s cap.
    tl.call(() => finish(false), [], 1.55);
  });
}
