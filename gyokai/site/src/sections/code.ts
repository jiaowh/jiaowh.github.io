// GYOKAI — Acid Pop Archive
// Beat 2 — "THE CODE" (creative-direction.md §3, design-system.md §7.3).
// The site dissects its own design language: manifesto copy + three
// hands-on specimen cards that slap in on scroll —
//   PALETTE:  the 8 fixed ink chips; click → spray motif bits + copy hex.
//   HALFTONE: slider drives a live canvas dot-field.
//   STICKER:  hover/focus explodes a poster frame into labeled layers.

import { gsap, EASE, slapIn, prefersReducedMotion } from "../lib/gsap-setup";
import { buildPicture } from "../lib/art";
import type { ArtworkManifestEntry } from "../lib/types";

const INKS: ReadonlyArray<readonly [name: string, hex: string]> = [
  ["PINK", "#FE19A1"],
  ["MAGENTA", "#E901C6"],
  ["CYAN", "#45D4D6"],
  ["YELLOW", "#FEF501"],
  ["LIME", "#8DFE8B"],
  ["ORANGE", "#FA9735"],
  ["PURPLE", "#6549A8"],
  ["RED", "#E7477C"],
];

const SPRAY_MOTIFS = ["motif-star-4pt", "motif-plus", "motif-lightning"];

function copyToClipboard(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {
    /* clipboard unavailable (permissions/insecure ctx) — visual feedback still fires */
  });
}

/** Short-lived motif spray burst at (x, y) inside `host`. */
export function sprayAt(host: HTMLElement, x: number, y: number, color: string): void {
  const reduced = prefersReducedMotion();
  const count = reduced ? 0 : 9;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("span");
    bit.className = "spray-bit";
    bit.setAttribute("aria-hidden", "true");
    const motif = SPRAY_MOTIFS[i % SPRAY_MOTIFS.length];
    const size = gsap.utils.random(8, 18);
    bit.innerHTML = `<svg width="${size}" height="${size}"><use href="#${motif}" /></svg>`;
    bit.style.color = color;
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    host.appendChild(bit);
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.7;
    const dist = gsap.utils.random(36, 110);
    gsap.fromTo(
      bit,
      { x: 0, y: 0, scale: 1, opacity: 1, rotation: 0 },
      {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        rotation: gsap.utils.random(-180, 180),
        scale: 0.3,
        opacity: 0,
        duration: gsap.utils.random(0.5, 0.85),
        ease: EASE.snap,
        onComplete: () => bit.remove(),
      },
    );
  }
}

function buildPaletteSpecimen(): void {
  const body = document.querySelector<HTMLElement>("[data-specimen='palette']");
  const card = document.getElementById("specimen-palette");
  if (!body || !card) return;

  const grid = document.createElement("div");
  grid.className = "chip-grid";
  for (const [name, hex] of INKS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.style.setProperty("--chip-color", hex);
    chip.innerHTML = `<span class="chip__swatch" aria-hidden="true"></span><span class="chip__label">${name}<br>${hex}</span>`;
    chip.setAttribute("aria-label", `Copy ${name} ${hex}`);
    chip.addEventListener("click", (e) => {
      copyToClipboard(hex);
      const cardRect = card.getBoundingClientRect();
      const x = (e as MouseEvent).clientX
        ? (e as MouseEvent).clientX - cardRect.left
        : chip.offsetLeft + chip.offsetWidth / 2;
      const y = (e as MouseEvent).clientY
        ? (e as MouseEvent).clientY - cardRect.top
        : chip.offsetTop + chip.offsetHeight / 2;
      sprayAt(card, x, y, hex);
      // "COPIED" feedback beat.
      chip.classList.add("chip--copied");
      window.setTimeout(() => chip.classList.remove("chip--copied"), 900);
      if (!prefersReducedMotion()) {
        gsap.fromTo(chip, { scale: 0.92 }, { scale: 1, duration: 0.3, ease: EASE.slap });
      }
    });
    grid.appendChild(chip);
  }
  body.appendChild(grid);
  const hint = document.createElement("p");
  hint.className = "specimen-hint";
  hint.textContent = "Click a chip — it sprays, you get the hex.";
  body.appendChild(hint);
}

function buildHalftoneSpecimen(): void {
  const body = document.querySelector<HTMLElement>("[data-specimen='halftone']");
  if (!body) return;

  const canvas = document.createElement("canvas");
  canvas.className = "halftone-demo";
  canvas.setAttribute("aria-hidden", "true");
  body.appendChild(canvas);

  const label = document.createElement("label");
  label.className = "specimen-hint";
  label.innerHTML = `Dot gain <input type="range" min="5" max="95" value="42" step="1" aria-label="Halftone dot size">`;
  body.appendChild(label);
  const slider = label.querySelector("input");
  if (!slider) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const draw = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0A0A12";
    ctx.fillRect(0, 0, w, h);
    const spacing = 18;
    const t = Number(slider.value) / 100;
    const maxR = spacing * 0.72;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--live-accent").trim() || "#FE19A1";
    for (let y = spacing / 2; y < h; y += spacing) {
      for (let x = spacing / 2; x < w; x += spacing) {
        // Horizontal gradient ramp — classic halftone tint sweep.
        const ramp = 0.25 + 0.75 * (x / w);
        const r = maxR * t * ramp;
        if (r <= 0.4) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  slider.addEventListener("input", draw);
  window.addEventListener("resize", draw);
  // Redraw once fonts/layout settle, and when re-inking recolors the accent.
  requestAnimationFrame(draw);
  document.addEventListener("gyokai:reink", draw);
}

function buildStickerSpecimen(anatomyArt: ArtworkManifestEntry): void {
  const body = document.querySelector<HTMLElement>("[data-specimen='sticker']");
  if (!body) return;

  const stage = document.createElement("button");
  stage.type = "button";
  stage.className = "anatomy";
  stage.setAttribute("aria-label", "Explode the sticker anatomy layers");
  stage.innerHTML = `
    <span class="anatomy__layer anatomy__shadow" aria-hidden="true"></span>
    <span class="anatomy__layer anatomy__keyline" aria-hidden="true"></span>
    <span class="anatomy__layer anatomy__art"></span>
    <span class="anatomy__layer anatomy__caption caption-box" aria-hidden="true">${anatomyArt.title}</span>
    <span class="anatomy__tag anatomy__tag--shadow caption-box" aria-hidden="true">SHADOW</span>
    <span class="anatomy__tag anatomy__tag--keyline caption-box" aria-hidden="true">KEYLINE</span>
    <span class="anatomy__tag anatomy__tag--art caption-box" aria-hidden="true">ART</span>
    <span class="anatomy__tag anatomy__tag--caption caption-box" aria-hidden="true">CAPTION</span>
  `;
  const artHost = stage.querySelector<HTMLElement>(".anatomy__art");
  artHost?.appendChild(
    buildPicture(anatomyArt, { sizes: "(max-width: 768px) 60vw, 220px", alt: anatomyArt.alt }),
  );
  body.appendChild(stage);

  const hint = document.createElement("p");
  hint.className = "specimen-hint";
  hint.textContent = "Hover / focus to pull the print apart.";
  body.appendChild(hint);

  const reduced = prefersReducedMotion();
  const dur = reduced ? 0 : 0.3;
  const spread = (on: boolean): void => {
    const s = on ? 1 : 0;
    gsap.to(stage.querySelector(".anatomy__shadow"), { x: 22 * s, y: 26 * s, duration: dur, ease: EASE.snap });
    gsap.to(stage.querySelector(".anatomy__keyline"), { x: -16 * s, y: -14 * s, duration: dur, ease: EASE.snap });
    gsap.to(stage.querySelector(".anatomy__caption"), { x: 26 * s, y: 34 * s, duration: dur, ease: EASE.snap });
    gsap.to(stage.querySelectorAll(".anatomy__tag"), {
      opacity: s,
      duration: reduced ? 0 : 0.2,
      stagger: on ? 0.05 : 0,
    });
    stage.classList.toggle("anatomy--open", on);
  };

  stage.addEventListener("pointerenter", () => spread(true));
  stage.addEventListener("pointerleave", () => spread(false));
  stage.addEventListener("focus", () => spread(true));
  stage.addEventListener("blur", () => spread(false));
  // Touch/keyboard toggle.
  stage.addEventListener("click", () => spread(!stage.classList.contains("anatomy--open")));
}

export function initCode(anatomyArt: ArtworkManifestEntry): void {
  buildPaletteSpecimen();
  buildHalftoneSpecimen();
  buildStickerSpecimen(anatomyArt);

  // Cards slap in on scroll — §5.3: top 78%, plays once.
  const section = document.getElementById("the-code");
  if (section) {
    slapIn(".specimen-card", section);
    slapIn(["#the-code .caption-box.section-caption", "#code-heading", ".the-code__lead", ".the-code__manifesto"], section, {
      stagger: 0.08,
    });
  }
}
