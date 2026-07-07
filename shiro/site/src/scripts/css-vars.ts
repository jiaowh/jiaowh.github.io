/**
 * 真昼の月 — tiny helper for reading numeric design tokens straight off
 * `:root` at runtime, so JS-driven (GSAP) motion never hard-codes a
 * duration that could drift from src/styles/tokens.css. Mirrors the same
 * idea as ease.ts (which does this for the two custom eases).
 */

let rootStyles: CSSStyleDeclaration | null = null;

function styles(): CSSStyleDeclaration {
  if (!rootStyles) rootStyles = getComputedStyle(document.documentElement);
  return rootStyles;
}

/** Reads a `<name>ms` custom property (e.g. `--dur-bloom: 900ms`) as seconds, for GSAP's `duration`. */
export function readCssSeconds(name: string, fallbackMs: number): number {
  const raw = styles().getPropertyValue(name).trim();
  const ms = raw.endsWith('ms') ? parseFloat(raw) : raw.endsWith('s') ? parseFloat(raw) * 1000 : NaN;
  return (Number.isFinite(ms) ? ms : fallbackMs) / 1000;
}
