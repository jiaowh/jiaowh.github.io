// GYOKAI — Acid Pop Archive
// Custom registration-crosshair cursor (design-system.md §6 "Cursor"):
// 24px registration mark in --live-accent, mix-blend-mode: difference;
// grows + rotates 45° over interactive elements. Touch devices are
// excluded entirely; `cursor: none` is applied only once the custom
// cursor is confirmed mounted (never removed "on spec"), and reduced
// motion keeps the plain system cursor.

import { gsap, EASE, prefersReducedMotion } from "./gsap-setup";

const INTERACTIVE = "a, button, [role='button'], input, select, textarea, summary, [data-cursor]";

export function initCursor(): void {
  // Touch / coarse pointers keep the system experience untouched.
  if (!window.matchMedia("(pointer: fine)").matches) return;
  if (prefersReducedMotion()) return;

  const el = document.createElement("div");
  el.className = "cursor z-cursor";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <span class="cursor__core">
      <svg width="24" height="24"><use href="#motif-registration-mark" /></svg>
    </span>`;
  document.body.appendChild(el);

  // Only now that the replacement exists do we hide the system cursor.
  document.documentElement.classList.add("has-custom-cursor");

  const xTo = gsap.quickTo(el, "x", { duration: 0.12, ease: EASE.snap });
  const yTo = gsap.quickTo(el, "y", { duration: 0.12, ease: EASE.snap });

  let visible = false;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!visible) {
        visible = true;
        gsap.set(el, { x: e.clientX, y: e.clientY });
        el.classList.add("cursor--visible");
      }
      xTo(e.clientX);
      yTo(e.clientY);
    },
    { passive: true },
  );

  document.documentElement.addEventListener("pointerleave", () => {
    visible = false;
    el.classList.remove("cursor--visible");
  });

  // Grow + rotate over anything interactive (event delegation).
  const hit = (t: EventTarget | null): boolean =>
    t instanceof Element && t.closest(INTERACTIVE) !== null;
  window.addEventListener("pointerover", (e) => {
    if (hit(e.target)) el.classList.add("cursor--active");
  });
  window.addEventListener("pointerout", (e) => {
    if (hit(e.target) && !hit(e.relatedTarget)) el.classList.remove("cursor--active");
  });
}
