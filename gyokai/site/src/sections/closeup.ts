// GYOKAI — Acid Pop Archive
// Beat 4 — "CLOSE-UP" (creative-direction.md §3, design-system.md §7.5).
// Native <dialog> takeover, focus-trapped: halftone wipeIn → artwork
// full-bleed (object-fit: contain on its room color) with RGB-split
// settle (two clones, mix-blend screen, converge 0.3s) → meta plate
// (title / titleJa / caption / palette swatches click-to-copy / artist
// link). Prev/next buttons + arrow keys; Esc and backdrop close via the
// halftone wipe. Focus returns to the opening poster.

import { gsap, EASE, prefersReducedMotion } from "../lib/gsap-setup";
import { lockScroll } from "../lib/lenis";
import { wipeIn, wipeOut } from "../lib/halftone";
import { reinkTo } from "../lib/reink";
import { buildPicture } from "../lib/art";
import type { ArtworkManifestEntry } from "../lib/types";

export interface CloseupHandle {
  open: (index: number, opener: HTMLElement) => void;
}

export function initCloseup(gallery: ArtworkManifestEntry[]): CloseupHandle {
  const dialogEl = document.getElementById("closeup") as HTMLDialogElement | null;
  if (!dialogEl || gallery.length === 0) return { open: () => undefined };
  // Alias with a narrowed type: hoisted inner functions below can't see
  // the null-guard on the original binding.
  const dialog: HTMLDialogElement = dialogEl;

  const stage = dialog.querySelector<HTMLElement>(".closeup__stage");
  const artFigure = document.getElementById("closeup-art");
  const titleEl = document.getElementById("closeup-title");
  const jaEl = document.getElementById("closeup-meta-ja");
  const idEl = document.getElementById("closeup-meta-id");
  const captionEl = document.getElementById("closeup-caption");
  const swatchesEl = document.getElementById("closeup-swatches");
  const prevBtn = document.getElementById("closeup-prev");
  const nextBtn = document.getElementById("closeup-next");
  const closeBtn = document.getElementById("closeup-close");

  let index = 0;
  let opener: HTMLElement | null = null;
  let busy = false;

  const artworkAt = (i: number): ArtworkManifestEntry => {
    const a = gallery[((i % gallery.length) + gallery.length) % gallery.length];
    if (!a) throw new Error("closeup: empty gallery");
    return a;
  };

  function populate(artwork: ArtworkManifestEntry): void {
    if (stage) stage.style.background = artwork.dominant;
    if (stage) stage.style.color = artwork.text;

    if (artFigure) {
      artFigure.innerHTML = "";
      const picture = buildPicture(artwork, { sizes: "92vw", eager: true });
      picture.classList.add("closeup__picture");
      artFigure.appendChild(picture);
    }
    if (titleEl) titleEl.textContent = artwork.title;
    if (jaEl) jaEl.textContent = artwork.titleJa;
    if (idEl) idEl.textContent = `№ ${String(gallery.indexOf(artwork) + 1).padStart(2, "0")} / ${gallery.length}`;
    if (captionEl) captionEl.textContent = artwork.alt;

    if (swatchesEl) {
      swatchesEl.innerHTML = "";
      const entries: ReadonlyArray<readonly [string, string]> = [
        ["ROOM", artwork.dominant],
        ["ACCENT", artwork.vivid],
        ["TEXT", artwork.text],
      ];
      for (const [label, hex] of entries) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "meta-plate__swatch";
        b.style.setProperty("--swatch", hex);
        b.setAttribute("aria-label", `Copy ${label} color ${hex}`);
        b.title = `${label} ${hex}`;
        b.addEventListener("click", () => {
          void navigator.clipboard?.writeText(hex).catch(() => undefined);
          b.classList.add("meta-plate__swatch--copied");
          window.setTimeout(() => b.classList.remove("meta-plate__swatch--copied"), 900);
        });
        swatchesEl.appendChild(b);
      }
    }
  }

  /** RGB-split settle: two hue-shifted clones, mix-blend screen, converge. */
  function splitSettle(): void {
    if (prefersReducedMotion() || !artFigure) return;
    const img = artFigure.querySelector("img");
    if (!img) return;
    for (const [cls, dx] of [
      ["closeup__split closeup__split--a", -9],
      ["closeup__split closeup__split--b", 9],
    ] as const) {
      const clone = img.cloneNode() as HTMLImageElement;
      clone.alt = "";
      clone.setAttribute("aria-hidden", "true");
      clone.className = cls;
      artFigure.appendChild(clone);
      gsap.fromTo(
        clone,
        { x: dx, opacity: 0.85 },
        { x: 0, opacity: 0, duration: 0.3, ease: EASE.snap, onComplete: () => clone.remove() },
      );
    }
  }

  async function open(i: number, openerEl: HTMLElement): Promise<void> {
    if (busy || dialog.open) return;
    busy = true;
    index = i;
    opener = openerEl;
    const artwork = artworkAt(index);
    reinkTo(artwork);
    await wipeIn(artwork.vivid);
    populate(artwork);
    dialog.showModal();
    lockScroll(true);
    closeBtn?.focus();
    await wipeOut(artwork.vivid);
    splitSettle();
    busy = false;
  }

  async function close(): Promise<void> {
    if (busy || !dialog.open) return;
    busy = true;
    const artwork = artworkAt(index);
    await wipeIn(artwork.vivid);
    dialog.close();
    lockScroll(false);
    opener?.focus();
    await wipeOut(artwork.vivid);
    busy = false;
  }

  /** Flick to a neighbor — light slide, no full wipe (§3 "flick"). */
  function step(dir: 1 | -1): void {
    if (busy || !dialog.open) return;
    index = (index + dir + gallery.length) % gallery.length;
    const artwork = artworkAt(index);
    reinkTo(artwork);
    if (prefersReducedMotion() || !stage) {
      populate(artwork);
      return;
    }
    busy = true;
    gsap.to(stage, {
      x: -36 * dir,
      opacity: 0,
      duration: 0.16,
      ease: EASE.snap,
      onComplete: () => {
        populate(artwork);
        gsap.fromTo(
          stage,
          { x: 36 * dir, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.3,
            ease: EASE.slap,
            onComplete: () => {
              splitSettle();
              busy = false;
            },
          },
        );
      },
    });
  }

  prevBtn?.addEventListener("click", () => step(-1));
  nextBtn?.addEventListener("click", () => step(1));
  closeBtn?.addEventListener("click", () => void close());

  // Esc → animated close (native cancel would snap it shut).
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    void close();
  });
  // Backdrop click (clicks on the dialog element itself, not its children).
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) void close();
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  });

  return {
    open: (i, openerEl) => void open(i, openerEl),
  };
}
