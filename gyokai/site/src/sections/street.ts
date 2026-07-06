// GYOKAI — Acid Pop Archive
// Beat 3 — "THE STREET" (creative-direction.md §3, design-system.md §7.4).
// Pinned horizontal poster street (desktop): all 19 posters, each hanging
// in a full-viewport color room (bg = its dominant). Ambient re-inking
// fires as each poster crosses viewport center. Parallax: bg motifs 0.4×,
// poster 1×, caption 1.15×. Keyboard: ←/→ step posters. Mobile (<768px)
// and reduced motion: vertical stack, re-ink via IntersectionObserver.
// Posters are buttons that open the CLOSE-UP takeover.

import { gsap, EASE, prefersReducedMotion } from "../lib/gsap-setup";
import { scrollToTarget } from "../lib/lenis";
import { reinkTo } from "../lib/reink";
import { buildPicture } from "../lib/art";
import { tapeStripMarkup } from "../lib/tape-strip";
import type { ArtworkManifestEntry } from "../lib/types";

// R2b: room background dressing uses only star/plus/lightning, rendered as
// outlined (stroke, no fill) shapes so they read as line-art motifs rather
// than the soft halo-dot artifact the old single halftone-dot-tile/checker
// motif produced at large size. The "-outline" symbols are stroke-only
// (fill="none") variants in motifs.svg — a <use>'s referenced content lives
// in an inaccessible shadow tree, so CSS on this side can't repaint a solid
// symbol's fill; the outline has to be baked into the symbol itself.
const ROOM_MOTIFS = ["motif-star-4pt-outline", "motif-plus-outline", "motif-lightning-outline"];

/** Deterministic pseudo-random scatter for the 3 background motif shapes. */
const MOTIF_LAYOUT = [
  { top: "9%", left: "6%", size: 150 },
  { top: "62%", left: "78%", size: 200 },
  { top: "18%", left: "68%", size: 120 },
] as const;

export interface StreetHandle {
  openTakeover: ((index: number, opener: HTMLElement) => void) | null;
}

function isHorizontalMode(): boolean {
  return window.innerWidth >= 768 && !prefersReducedMotion();
}

function buildRoom(artwork: ArtworkManifestEntry, i: number, total: number): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "street__room";
  li.style.setProperty("--room-bg", artwork.dominant);
  li.style.setProperty("--room-accent", artwork.vivid);
  li.style.setProperty("--room-text", artwork.text);

  const rot = ((i * 47) % 13) - 6; // deterministic pseudo-random tilt
  const index = String(i + 1).padStart(2, "0");
  const orientation = artwork.aspect >= 1 ? "landscape" : "portrait"; // R2a sizing
  const tapeColor = i % 2 === 0 ? "yellow" : "pink"; // R2c: alternate per room parity

  // R2b: 2-3 outlined (stroke-only) motif shapes, cycling through
  // star/plus/lightning per room so the low-opacity background dressing
  // varies without falling back to the old halo-dot artifact.
  const motifShapes = MOTIF_LAYOUT.map((slot, slotIndex) => {
    const motif = ROOM_MOTIFS[(i + slotIndex) % ROOM_MOTIFS.length];
    const shapeRot = ((i + slotIndex) * 29) % 24;
    return `<svg class="street__motif-shape" aria-hidden="true" width="${slot.size}" height="${slot.size}"
        style="top:${slot.top}; left:${slot.left}; transform: rotate(${shapeRot - 12}deg)">
      <use href="#${motif}" />
    </svg>`;
  }).join("");

  li.innerHTML = `
    <div class="street__numeral" aria-hidden="true">${index}</div>
    <div class="street__motif" aria-hidden="true">${motifShapes}</div>
    <div class="street__kinetic" aria-hidden="true" lang="ja">${artwork.titleJa}</div>
    <button type="button" class="street__poster poster-frame registration-focus"
            data-index="${i}" data-orientation="${orientation}" style="--frame-rotate: ${rot * 0.45}deg"
            aria-label="Open close-up: ${artwork.title} (${artwork.titleJa})"
            aria-haspopup="dialog">
      <span class="poster-frame__art"></span>
      <span class="poster-frame__caption caption-box">${artwork.title}</span>
    </button>
    <p class="street__index caption-box">${index} / ${total}</p>
    <div class="street__tape-strip" aria-hidden="true">${tapeStripMarkup(tapeColor)}</div>
  `;

  const artHost = li.querySelector<HTMLElement>(".poster-frame__art");
  // sizes must roughly match the CSS 72vh/58vh caps: with `width: auto` the
  // browser lays the img out at its srcset-derived intrinsic width, so an
  // undersized value here visually shrinks the poster regardless of CSS.
  artHost?.appendChild(
    buildPicture(artwork, {
      sizes:
        orientation === "landscape"
          ? "(max-width: 768px) 90vw, 980px"
          : "(max-width: 768px) 78vw, 640px",
      alt: artwork.alt,
    }),
  );

  return li;
}

export function initStreet(gallery: ArtworkManifestEntry[]): StreetHandle {
  const handle: StreetHandle = { openTakeover: null };
  const section = document.getElementById("the-street");
  const track = document.getElementById("street-track");
  if (!section || !track || gallery.length === 0) return handle;

  const total = gallery.length;
  const rooms: HTMLLIElement[] = gallery.map((artwork, i) => buildRoom(artwork, i, total));
  for (const room of rooms) track.appendChild(room);

  // Poster click → takeover (wired late by main.ts via handle).
  track.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest<HTMLElement>(".street__poster") : null;
    if (!btn || !handle.openTakeover) return;
    const index = Number(btn.dataset["index"]);
    if (Number.isFinite(index)) handle.openTakeover(index, btn);
  });

  let activeIndex = -1;
  const activate = (i: number): void => {
    if (i === activeIndex || i < 0 || i >= total) return;
    activeIndex = i;
    const artwork = gallery[i];
    if (artwork) reinkTo(artwork);
  };

  if (isHorizontalMode()) {
    initHorizontal(section, track, rooms, activate, () => activeIndex, total);
  } else {
    initStacked(rooms, activate);
  }

  return handle;
}

// ---------------------------------------------------------------------------
// Desktop: pinned horizontal scrub
// ---------------------------------------------------------------------------

function initHorizontal(
  section: HTMLElement,
  track: HTMLElement,
  rooms: HTMLLIElement[],
  activate: (i: number) => void,
  getActive: () => number,
  total: number,
): void {
  const distance = (): number => Math.max(0, track.scrollWidth - window.innerWidth);

  const horiz = gsap.to(track, {
    x: () => -distance(),
    ease: EASE.convey,
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: () => `+=${distance()}`,
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      onUpdate(self) {
        activate(Math.round(self.progress * (total - 1)));
      },
    },
  });

  // Per-room parallax driven by the horizontal container animation:
  // motifs lag (0.4×), kinetic captions lead (1.15×), poster rides at 1×.
  for (const room of rooms) {
    const motif = room.querySelector(".street__motif");
    const kinetic = room.querySelector(".street__kinetic");
    if (motif) {
      gsap.fromTo(
        motif,
        { x: -window.innerWidth * 0.6 * 0.4 },
        {
          x: window.innerWidth * 0.6 * 0.4,
          ease: EASE.convey,
          scrollTrigger: {
            trigger: room,
            containerAnimation: horiz,
            start: "left right",
            end: "right left",
            scrub: true,
          },
        },
      );
    }
    if (kinetic) {
      gsap.fromTo(
        kinetic,
        { x: window.innerWidth * 0.15 },
        {
          x: -window.innerWidth * 0.15,
          ease: EASE.convey,
          scrollTrigger: {
            trigger: room,
            containerAnimation: horiz,
            start: "left right",
            end: "right left",
            scrub: true,
          },
        },
      );
    }
    // Poster slaps in the first time its room enters (once — no popcorn).
    const poster = room.querySelector(".street__poster");
    if (poster) {
      gsap.from(poster, {
        opacity: 0,
        scale: 1.15,
        rotation: 4,
        duration: 0.45,
        ease: EASE.slap,
        scrollTrigger: {
          trigger: room,
          containerAnimation: horiz,
          start: "left 78%",
          once: true,
        },
      });
    }
  }

  // Keyboard: ←/→ step posters while the street is pinned on screen.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (document.querySelector<HTMLDialogElement>("#closeup[open]")) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const st = horiz.scrollTrigger;
    if (!st || st.progress <= 0 || st.progress >= 1) {
      // Not inside the street run — let the browser have the keys.
      return;
    }
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    const next = Math.min(total - 1, Math.max(0, getActive() + step));
    const y = st.start + (next / (total - 1)) * (st.end - st.start);
    scrollToTarget(y);
  });
}

// ---------------------------------------------------------------------------
// Mobile / reduced motion: vertical stack + IntersectionObserver re-inking
// ---------------------------------------------------------------------------

function initStacked(rooms: HTMLLIElement[], activate: (i: number) => void): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const i = rooms.indexOf(entry.target as HTMLLIElement);
        if (i >= 0) activate(i);
      }
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
  );
  for (const room of rooms) observer.observe(room);

  // Poster entrances in stack mode: simple §5.3-compliant reveal.
  for (const room of rooms) {
    const poster = room.querySelector(".street__poster");
    if (!poster) continue;
    gsap.from(poster, {
      opacity: 0,
      duration: 0.3,
      scrollTrigger: { trigger: room, start: "top 78%", once: true },
    });
  }
}
