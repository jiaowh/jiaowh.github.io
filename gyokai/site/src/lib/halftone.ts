// GYOKAI — Acid Pop Archive
// Fullscreen Canvas-2D halftone dot-matrix wipe engine
// (creative-direction.md §4, design-system.md §5.2 / §7). One lazily
// created fixed canvas at z-wipe (50); dots grow in a stepped (6-step,
// EASE.plate feel) radial cascade from the screen centre.
//
// Promise API:
//   wipeIn(color)   — dots grow until the screen is covered; resolves covered.
//   wipeOut(color)  — from covered, dots shrink open (iris); resolves clear.
//   primeCovered(c) — instantly cover (used before revealing under the loader).
//   flash(color)    — quick in+out pulse (ENCORE hype overload).
//
// Reduced motion (§5.3): wipes become a plain 0.25s opacity crossfade of a
// solid plate — no dot animation. DPR capped at 2.

import { prefersReducedMotion } from "./gsap-setup";

const SPACING = 44; // css px between dot centers
const MAX_R = SPACING * 0.76; // ≥ spacing/√2 → full coverage with margin
const STEPS = 6; // §5.1 EASE.plate = steps(6)
const SPREAD = 0.55; // fraction of timeline given to the radial cascade

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;

function ensureCanvas(): CanvasRenderingContext2D {
  if (canvas && ctx) return ctx;
  canvas = document.createElement("canvas");
  canvas.className = "halftone-wipe z-wipe";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("halftone: no 2d context");
  ctx = context;
  resize();
  window.addEventListener("resize", resize);
  return ctx;
}

function resize(): void {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // §9 cap
  canvas.width = Math.ceil(window.innerWidth * dpr);
  canvas.height = Math.ceil(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function show(): void {
  canvas?.classList.add("halftone-wipe--on");
}

function hide(): void {
  canvas?.classList.remove("halftone-wipe--on");
  if (canvas) canvas.style.opacity = "";
}

function quantize(v: number): number {
  return Math.min(1, Math.ceil(v * STEPS) / STEPS);
}

/** Paint the dot field for a global progress p (0 → clear, 1 → covered). */
function paint(color: string, p: number, mode: "grow" | "shrink"): void {
  const c = ensureCanvas();
  const w = window.innerWidth;
  const h = window.innerHeight;
  c.clearRect(0, 0, w, h);

  // Fully covered → solid plate (avoids sub-pixel gaps between dots).
  if ((mode === "grow" && p >= 1) || (mode === "shrink" && p <= 0)) {
    if (mode === "grow") {
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
    }
    return;
  }

  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.hypot(cx, cy) || 1;
  c.fillStyle = color;

  for (let y = SPACING / 2; y < h + SPACING; y += SPACING) {
    for (let x = SPACING / 2; x < w + SPACING; x += SPACING) {
      const d = Math.hypot(x - cx, y - cy) / maxDist; // 0 center → 1 corner
      // Radial cascade: center dots lead, corners lag by SPREAD.
      const local = Math.min(1, Math.max(0, (p * (1 + SPREAD) - d * SPREAD) / 1));
      const grown = quantize(local);
      const r = mode === "grow" ? MAX_R * grown : MAX_R * (1 - grown);
      if (r <= 0.5) continue;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function animate(color: string, mode: "grow" | "shrink", duration: number): Promise<void> {
  return new Promise((resolve) => {
    cancelAnimationFrame(raf);
    ensureCanvas();
    show();
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // For "shrink", p runs 1 → 0 (covered → clear).
      paint(color, mode === "grow" ? t : 1 - t, mode);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        if (mode === "shrink") hide();
        resolve();
      }
    };
    raf = requestAnimationFrame(tick);
  });
}

function fade(color: string, to: 0 | 1): Promise<void> {
  // Reduced-motion path: solid plate crossfade, 0.25s (§5.3).
  return new Promise((resolve) => {
    const c = ensureCanvas();
    if (!canvas) return resolve();
    c.fillStyle = color;
    c.fillRect(0, 0, window.innerWidth, window.innerHeight);
    show();
    canvas.style.transition = "opacity 0.25s linear";
    canvas.style.opacity = to === 1 ? "0" : "1";
    // Force a style flush so the transition actually runs.
    void canvas.offsetWidth;
    canvas.style.opacity = to === 1 ? "1" : "0";
    window.setTimeout(() => {
      if (!canvas) return resolve();
      canvas.style.transition = "";
      if (to === 0) hide();
      else canvas.style.opacity = "";
      resolve();
    }, 280);
  });
}

/** Dots grow from clear until the screen is fully covered. */
export function wipeIn(color: string, duration = 0.7): Promise<void> {
  if (prefersReducedMotion()) return fade(color, 1);
  return animate(color, "grow", duration);
}

/** From covered, dots shrink open — the halftone iris. */
export function wipeOut(color: string, duration = 0.7): Promise<void> {
  if (prefersReducedMotion()) return fade(color, 0);
  return animate(color, "shrink", duration);
}

/** Instantly cover the screen (used while the loader still hides the page). */
export function primeCovered(color: string): void {
  ensureCanvas();
  show();
  paint(color, 1, "grow");
}

/** Quick pulse: cover then immediately iris open (ENCORE overload flash). */
export async function flash(color: string, duration = 0.3): Promise<void> {
  await wipeIn(color, duration);
  await wipeOut(color, duration);
}
