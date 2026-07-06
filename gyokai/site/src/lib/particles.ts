// GYOKAI — Acid Pop Archive
// Canvas-2D motif particle field (stars / plus-signs / halftone dots)
// drifting slowly behind the hero, magnetically repelled by the cursor
// (creative-direction.md §3 beat 1, design-system.md §7.2).
//
// Revision wave R1c: fewer, bigger particles (~2-3× the prior size) with a
// thin ink outline so they read as floating printed stickers rather than
// confetti dust.
//
// §9 guardrails: DPR ≤ 2, paused via IntersectionObserver when the canvas
// is off-screen and on document.hidden. Reduced motion: a single static
// scatter is drawn once — no drift, no repulsion, no rAF loop.

import { prefersReducedMotion } from "./gsap-setup";

export interface ParticleFieldOptions {
  canvas: HTMLCanvasElement;
}

type Kind = 0 | 1 | 2; // 0 star-4pt · 1 plus · 2 dot

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Repulsion displacement (springs back to 0). */
  ox: number;
  oy: number;
  rot: number;
  vrot: number;
  size: number;
  kind: Kind;
  color: string;
}

const COLORS = ["#0A0A12", "#FE19A1", "#FEF501", "#45D4D6", "#8DFE8B", "#FA9735"];
const REPEL_RADIUS = 140;
const REPEL_FORCE = 900;
/** ~2px at DPR 1; canvas ctx is already DPR-scaled via setTransform. */
const INK_OUTLINE = 2;

function drawParticle(c: CanvasRenderingContext2D, p: Particle): void {
  c.save();
  c.translate(p.x + p.ox, p.y + p.oy);
  c.rotate(p.rot);
  c.fillStyle = p.color;
  c.lineWidth = INK_OUTLINE;
  c.strokeStyle = "#0A0A12";
  const s = p.size;
  if (p.kind === 0) {
    // 4-point star: two mirrored curves per quadrant, approximated with quads.
    c.beginPath();
    c.moveTo(0, -s);
    c.quadraticCurveTo(0.12 * s, -0.12 * s, s, 0);
    c.quadraticCurveTo(0.12 * s, 0.12 * s, 0, s);
    c.quadraticCurveTo(-0.12 * s, 0.12 * s, -s, 0);
    c.quadraticCurveTo(-0.12 * s, -0.12 * s, 0, -s);
    c.closePath();
    c.fill();
    c.stroke();
  } else if (p.kind === 1) {
    const t = s * 0.42; // arm thickness
    c.beginPath();
    c.rect(-t / 2, -s, t, s * 2);
    c.rect(-s, -t / 2, s * 2, t);
    c.fill();
    c.strokeRect(-t / 2, -s, t, s * 2);
    c.strokeRect(-s, -t / 2, s * 2, t);
  } else {
    c.beginPath();
    c.arc(0, 0, s * 0.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  c.restore();
}

export function initParticleField({ canvas }: ParticleFieldOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let particles: Particle[] = [];

  const spawn = (): void => {
    // Fewer, bigger (R1c): roughly a third of the previous density, each
    // particle ~2-3× the prior size — reads as floating stickers, not dust.
    const count = Math.max(6, Math.min(16, Math.round((w * h) / 95000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.5) * 14,
      ox: 0,
      oy: 0,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.5,
      size: 16 + Math.random() * 22,
      kind: ([0, 0, 1, 2, 2][Math.floor(Math.random() * 5)] ?? 0) as Kind,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? "#0A0A12",
    }));
  };

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (particles.length === 0) spawn();
  };

  const drawAll = (): void => {
    ctx.clearRect(0, 0, w, h);
    // Slightly more opaque than before — bigger, outlined shapes read as
    // stickers at this alpha; the prior 0.5 washed the ink outline out.
    ctx.globalAlpha = 0.62;
    for (const p of particles) drawParticle(ctx, p);
    ctx.globalAlpha = 1;
  };

  resize();
  window.addEventListener("resize", resize);

  if (prefersReducedMotion()) {
    drawAll(); // static scatter, nothing else
    return;
  }

  let px = -1e4;
  let py = -1e4;
  canvas.parentElement?.addEventListener(
    "pointermove",
    (e) => {
      const rect = canvas.getBoundingClientRect();
      px = e.clientX - rect.left;
      py = e.clientY - rect.top;
    },
    { passive: true },
  );
  canvas.parentElement?.addEventListener("pointerleave", () => {
    px = -1e4;
    py = -1e4;
  });

  let running = false;
  let inView = true;
  let raf = 0;
  let last = 0;

  const tick = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      // Cursor repulsion — push offset away, spring back.
      const dx = p.x + p.ox - px;
      const dy = p.y + p.oy - py;
      const dist = Math.hypot(dx, dy);
      if (dist < REPEL_RADIUS && dist > 0.001) {
        const f = (REPEL_FORCE * (1 - dist / REPEL_RADIUS) * dt) / dist;
        p.ox += dx * f;
        p.oy += dy * f;
      }
      p.ox *= 1 - Math.min(1, 2.4 * dt);
      p.oy *= 1 - Math.min(1, 2.4 * dt);
      // Wrap around edges (with margin).
      const m = p.size * 2;
      if (p.x < -m) p.x = w + m;
      if (p.x > w + m) p.x = -m;
      if (p.y < -m) p.y = h + m;
      if (p.y > h + m) p.y = -m;
    }
    drawAll();
    if (running) raf = requestAnimationFrame(tick);
  };

  const setRunning = (on: boolean): void => {
    if (on === running) return;
    running = on;
    if (on) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
    }
  };

  const evaluate = (): void => setRunning(inView && !document.hidden);

  new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.isIntersecting);
      evaluate();
    },
    { threshold: 0 },
  ).observe(canvas);

  document.addEventListener("visibilitychange", evaluate);
  evaluate();
}
