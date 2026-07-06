// GYOKAI — Acid Pop Archive — entry point
// Boot order matters: styles/fonts → sprite + JP strings → live tokens
// seeded from the hero palette → smooth scroll + cursor → sections.
// The loader owns the screen first; the hero entrance plays when it hands
// over. See creative-direction.md §3 for the beat structure.

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/sections.css";

// Self-hosted fonts (design-system.md §2, §9) — subset imports only, no
// CDN, no unused scripts/weights.
//
// Dela Gothic One (JP display) is NOT imported from @fontsource here: its
// "japanese" subset is ~922KB (the entire kanji repertoire) and doesn't
// even include the Latin glyphs the site also sets it in via
// `.section-heading`. scripts/subset-fonts.mjs builds a purpose-cut woff2
// containing only the strings the site actually renders (derived from
// src/data/strings.ts + allowlist titleJa), registered as a plain
// @font-face in styles/tokens.css instead.
import "@fontsource/archivo-black/latin-400.css"; // Latin display
import "@fontsource/space-grotesk/latin-400.css"; // UI/labels — regular
import "@fontsource/space-grotesk/latin-700.css"; // UI/labels — bold

import motifsSprite from "./motifs.svg?raw";
import manifestData from "./data/manifest.json";
import { JP } from "./data/strings";
import type { Manifest, ArtworkManifestEntry } from "./lib/types";

import { setupGsap, ScrollTrigger } from "./lib/gsap-setup";
import { initLenis } from "./lib/lenis";
import { initCursor } from "./lib/cursor";
import { reinkTo } from "./lib/reink";
import { tapeStripMarkup, type TapeStripColor } from "./lib/tape-strip";

import { initLoader } from "./sections/loader";
import { initHero } from "./sections/hero";
import { initCode } from "./sections/code";
import { initStreet } from "./sections/street";
import { initCloseup } from "./sections/closeup";
import { initEncore } from "./sections/encore";

const manifest = manifestData as unknown as Manifest;

/** Inline the shared motif sprite so `currentColor` + `<use href="#…">` work. */
function mountMotifSprite(): void {
  document.body.insertAdjacentHTML("afterbegin", motifsSprite);
}

/**
 * Fill every [data-jp] span from src/data/strings.ts — the single source
 * of truth the Dela Gothic One subset is derived from. JP text is never
 * hand-typed in index.html or section modules.
 */
function mountJpStrings(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-jp]")) {
    const key = el.dataset["jp"] as keyof typeof JP | undefined;
    if (key && key in JP) el.textContent = JP[key];
  }
}

function pickHero(entries: Manifest): ArtworkManifestEntry {
  const hero = entries.find((e) => e.role === "hero") ?? entries[0];
  if (!hero) throw new Error("manifest is empty — run `npm run assets`");
  return hero;
}

/**
 * R5 — caution-tape divider strips punctuating section boundaries (hero and
 * THE CODE share the same cream and would otherwise read as one monotone
 * stretch before THE STREET). Inserted as siblings directly before the
 * target section, so they sit in normal flow between the two sections.
 */
function mountSectionDivider(beforeSectionId: string, color: TapeStripColor): void {
  const target = document.getElementById(beforeSectionId);
  if (!target) return;
  const divider = document.createElement("div");
  divider.className = "section-divider";
  divider.setAttribute("aria-hidden", "true");
  divider.innerHTML = `<div class="section-divider__strip">${tapeStripMarkup(color)}</div>`;
  target.before(divider);
}

function main(): void {
  setupGsap();
  mountMotifSprite();
  mountJpStrings();
  mountSectionDivider("the-code", "yellow"); // hero → code
  mountSectionDivider("the-street", "pink"); // code → street

  const hero = pickHero(manifest);
  // Seed --live-* before anything paints animated content (§1.2).
  reinkTo(hero, { instant: true });

  initLenis();
  initCursor();

  // Sections. Hero DOM is built immediately (its artwork is the LCP and
  // loads while the loader plays); its entrance waits for the handover.
  const heroHandle = initHero(hero);
  // Sticker-anatomy specimen dissects an allowlisted poster (hazard-jacket
  // reads best exploded; falls back to the hero piece).
  const anatomyArt = manifest.find((e) => e.id === "hazard-jacket") ?? hero;
  initCode(anatomyArt);
  const street = initStreet(manifest);
  const closeup = initCloseup(manifest);
  street.openTakeover = closeup.open;
  initEncore();

  void initLoader(hero).then(() => {
    heroHandle.playEntrance();
    // Pin distances depend on post-loader layout.
    ScrollTrigger.refresh();
  });

  // Re-measure once fonts and full load settle (image heights → pin math).
  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
  window.addEventListener("load", () => ScrollTrigger.refresh());

  console.log("ready");
}

main();
