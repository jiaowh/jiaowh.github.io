/**
 * 真昼の月 — GSAP ease registration from the design tokens (§5).
 *
 * GSAP core cannot parse a raw `cubic-bezier(x1,y1,x2,y2)` CSS string
 * directly (that syntax is only accepted by the paid-turned-free CustomEase
 * plugin's authoring format, which is close but not identical). Rather than
 * pull in another plugin file for two curves, this reads `--ease-soak` and
 * `--ease-ink` straight off `:root` (CSS stays the single source of truth)
 * and registers them as GSAP eases via the same cubic-bezier solve CSS
 * itself uses (Newton-Raphson on the bezier's x(t), then evaluate y(t)).
 *
 * `initCustomEases()` must run once before any GSAP tween uses `ease:
 * 'soak'` / `ease: 'ink'`. main.ts calls it first, ahead of every other
 * motion module.
 */

import { gsap } from 'gsap';

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const a = (aA1: number, aA2: number) => 1 - 3 * aA2 + 3 * aA1;
  const b = (aA1: number, aA2: number) => 3 * aA2 - 6 * aA1;
  const c = (aA1: number) => 3 * aA1;

  const bezier = (t: number, a1: number, a2: number) => ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;
  const slope = (t: number, a1: number, a2: number) => 3 * a(a1, a2) * t * t + 2 * b(a1, a2) * t + c(a1);

  function tForX(x: number): number {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const dx = bezier(t, x1, x2) - x;
      if (Math.abs(dx) < 1e-6) return t;
      const d = slope(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    return t;
  }

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return bezier(tForX(x), y1, y2);
  };
}

function parseCubicBezier(value: string): [number, number, number, number] | null {
  const match = value.trim().match(/cubic-bezier\(\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*\)/);
  if (!match) return null;
  const [, a, b, c, d] = match;
  return [Number(a), Number(b), Number(c), Number(d)];
}

let initialized = false;

/** Registers GSAP eases named 'soak' and 'ink' from the live CSS custom
 * properties `--ease-soak` / `--ease-ink`. Idempotent. */
export function initCustomEases(): void {
  if (initialized) return;
  initialized = true;

  const styles = getComputedStyle(document.documentElement);
  const fallbacks: Record<'soak' | 'ink', [number, number, number, number]> = {
    soak: [0.16, 1, 0.3, 1],
    ink: [0.65, 0, 0.35, 1],
  };

  (Object.keys(fallbacks) as Array<'soak' | 'ink'>).forEach((name) => {
    const raw = styles.getPropertyValue(`--ease-${name}`);
    const parsed = (raw && parseCubicBezier(raw)) || fallbacks[name];
    gsap.registerEase(name, cubicBezier(...parsed));
  });
}
