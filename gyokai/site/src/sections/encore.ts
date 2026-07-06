// GYOKAI — Acid Pop Archive
// Beat 5 — "ENCORE" (creative-direction.md §3, design-system.md §7.6).
// Ink-black room; two opposing giant tickers (魚介 row / GYOKAI row);
// credit sticker card; HYPE button: every press slaps a random motif
// sticker at a random position/rotation + a small confetti burst; 10+
// presses in a session → full-screen halftone flash + giant 最高!!!
// banner. Sticker layer capped at ~80 nodes (oldest recycled).

import { gsap, EASE, slapIn, prefersReducedMotion } from "../lib/gsap-setup";
import { initMarquee } from "../lib/marquee";
import { flash } from "../lib/halftone";
import { sprayAt } from "./code";
import { JP } from "../data/strings";

const STICKER_MOTIFS = [
  "motif-star-4pt",
  "motif-star-sparkle",
  "motif-plus",
  "motif-lightning",
  "motif-skull-ribbon",
  "motif-arrow-chunky",
];

const STICKER_COLORS = ["#FE19A1", "#FEF501", "#45D4D6", "#8DFE8B", "#FA9735", "#E901C6", "#FFF3DC"];
const MAX_STICKERS = 80;

function tickerItems(text: string, jp: boolean): string {
  const cls = jp ? `class="tape__item tape__item--giant" lang="ja"` : `class="tape__item tape__item--giant tape__item--latin"`;
  return `<span ${cls}>${text}</span>`.repeat(3);
}

export function initEncore(): void {
  const section = document.getElementById("encore");
  if (!section) return;

  // Opposing giant tickers.
  const tapeA = document.getElementById("encore-tape-a");
  const tapeB = document.getElementById("encore-tape-b");
  if (tapeA) {
    tapeA.innerHTML = tickerItems(JP.artist, true);
    initMarquee({ track: tapeA, pxPerSecond: 88, reverse: false });
  }
  if (tapeB) {
    tapeB.innerHTML = tickerItems("GYOKAI", false);
    initMarquee({ track: tapeB, pxPerSecond: 88, reverse: true });
  }

  // Entrances.
  slapIn(["#encore .section-caption", "#encore-heading", "#encore .encore__credit", "#hype-button"], section, {
    stagger: 0.08,
  });

  // ── HYPE ─────────────────────────────────────────────────────────────
  const hype = document.getElementById("hype-button");
  const chaos = document.getElementById("encore-chaos");
  if (!hype || !chaos) return;

  // R3a: chaos stickers used to spawn anywhere in the layer, including on
  // top of the credit card — obscuring the artist link (x.com/_himehajime)
  // mid-mash. Reject candidate spawn positions whose footprint would
  // intersect the credit card's rect; fall back to a safe corner if every
  // attempt collides (e.g. a very short/wide viewport).
  const creditCard = document.querySelector<HTMLElement>(".encore__credit");
  const EXCLUSION_PAD = 18;
  const EXCLUSION_ATTEMPTS = 14;

  function pickStickerPosition(size: number): { leftPct: number; topPct: number } {
    const chaosRect = chaos!.getBoundingClientRect();
    const cardRect = creditCard?.getBoundingClientRect();
    for (let attempt = 0; attempt < EXCLUSION_ATTEMPTS; attempt++) {
      const leftPct = gsap.utils.random(4, 92);
      const topPct = gsap.utils.random(4, 88);
      if (!cardRect || chaosRect.width === 0) return { leftPct, topPct };
      const left = chaosRect.left + (leftPct / 100) * chaosRect.width;
      const top = chaosRect.top + (topPct / 100) * chaosRect.height;
      const intersects =
        left - EXCLUSION_PAD < cardRect.right &&
        left + size + EXCLUSION_PAD > cardRect.left &&
        top - EXCLUSION_PAD < cardRect.bottom &&
        top + size + EXCLUSION_PAD > cardRect.top;
      if (!intersects) return { leftPct, topPct };
    }
    // Every attempt collided — park it in the top-right corner, clear of
    // the (left-aligned, vertically-centered) credit card in all layouts.
    return { leftPct: 90, topPct: 5 };
  }

  const reduced = prefersReducedMotion();
  const stickers: HTMLElement[] = [];
  let presses = 0;
  let overloadBusy = false;

  const slapSticker = (): void => {
    const sticker = document.createElement("span");
    sticker.className = "chaos-sticker";
    sticker.setAttribute("aria-hidden", "true");
    const motif = STICKER_MOTIFS[Math.floor(Math.random() * STICKER_MOTIFS.length)];
    const color = STICKER_COLORS[Math.floor(Math.random() * STICKER_COLORS.length)] ?? "#FEF501";
    const size = Math.round(gsap.utils.random(36, 120));
    const { leftPct, topPct } = pickStickerPosition(size);
    sticker.innerHTML = `<svg width="${size}" height="${size}"><use href="#${motif}" /></svg>`;
    sticker.style.color = color;
    sticker.style.left = `${leftPct}%`;
    sticker.style.top = `${topPct}%`;
    chaos.appendChild(sticker);
    stickers.push(sticker);

    if (reduced) {
      gsap.fromTo(sticker, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    } else {
      gsap.fromTo(
        sticker,
        { scale: 1.6, opacity: 0, rotation: gsap.utils.random(-40, 40) },
        { scale: 1, opacity: 1, rotation: gsap.utils.random(-25, 25), duration: 0.4, ease: EASE.slap },
      );
    }

    // Recycle oldest beyond the cap.
    while (stickers.length > MAX_STICKERS) {
      const oldest = stickers.shift();
      if (oldest) {
        gsap.to(oldest, { opacity: 0, scale: 0.6, duration: 0.2, onComplete: () => oldest.remove() });
      }
    }
  };

  const overload = async (): Promise<void> => {
    if (overloadBusy) return;
    overloadBusy = true;

    const banner = document.createElement("div");
    banner.className = "saikou-banner";
    banner.setAttribute("aria-hidden", "true");
    banner.innerHTML = `<span lang="ja">${JP.saikou}</span>`;
    document.body.appendChild(banner);

    if (reduced) {
      gsap.fromTo(banner, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      await new Promise((r) => window.setTimeout(r, 1400));
      gsap.to(banner, { opacity: 0, duration: 0.25, onComplete: () => banner.remove() });
      overloadBusy = false;
      return;
    }

    await flash("#FEF501", 0.3);
    gsap.fromTo(
      banner,
      { scale: 1.5, opacity: 0, rotation: -6 },
      { scale: 1, opacity: 1, rotation: -3, duration: 0.45, ease: EASE.slap },
    );
    window.setTimeout(() => {
      gsap.to(banner, {
        scale: 1.2,
        opacity: 0,
        duration: 0.25,
        ease: EASE.snap,
        onComplete: () => banner.remove(),
      });
      overloadBusy = false;
    }, 1600);
  };

  hype.addEventListener("click", (e) => {
    presses++;

    // Escalating intensity: more stickers per press as the mash goes on.
    const burst = 1 + Math.min(3, Math.floor(presses / 5));
    for (let i = 0; i < burst; i++) slapSticker();

    // Confetti burst at the button.
    if (!reduced) {
      const rect = chaos.getBoundingClientRect();
      const x = (e as MouseEvent).clientX ? (e as MouseEvent).clientX - rect.left : rect.width / 2;
      const y = (e as MouseEvent).clientY ? (e as MouseEvent).clientY - rect.top : rect.height * 0.7;
      const color = STICKER_COLORS[presses % STICKER_COLORS.length] ?? "#FEF501";
      sprayAt(chaos, x, y, color);
      gsap.fromTo(hype, { scale: 0.94 }, { scale: 1, duration: 0.25, ease: EASE.slap });
    }

    // 10+ presses → overload.
    if (presses >= 10 && presses % 10 === 0) void overload();
  });
}
