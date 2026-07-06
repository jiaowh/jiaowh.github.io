# GYOKAI — ACID POP ARCHIVE · Design System
Source of truth for all implementation. When in doubt, this file wins.
Read `creative-direction.md` first for the concept ("The Print Floor", ambient re-inking,
"everything is a sticker", "press don't drift").

---

## 1. Color

### 1.1 Fixed ink tokens (CSS custom properties on `:root`)
```css
--ink:        #0A0A12;  /* near-black, blue-cast — panels, outlines, text on light */
--paper:      #FFF3DC;  /* warm cream — "paper" surfaces, text on dark */
--white:      #FDFCFA;
--pink:       #FE19A1;  /* shocking pink — primary brand accent */
--magenta:    #E901C6;
--cyan:       #45D4D6;
--cyan-hot:   #00E5FF;
--yellow:     #FEF501;  /* acid yellow — caution, highlights */
--lime:       #8DFE8B;
--orange:     #FA9735;
--purple:     #6549A8;
--red:        #E7477C;
```

### 1.2 Ambient re-inking tokens (LIVE — tweened by GSAP, never hand-set)
```css
--live-bg:      /* current artwork's dominant color */
--live-accent:  /* current artwork's vivid color   */
--live-text:    /* #0A0A12 or #FFF3DC, chosen by contrast against --live-bg */
```
Everything themable (section bg, ticker text, cursor, ::selection, borders) consumes the
`--live-*` tokens. GSAP tweens them (0.6s, `power2.out`) on gallery focus change.
Contrast rule: `--live-text` must always hit ≥ 4.5:1 against `--live-bg`
(compute per palette at build time, store in manifest).

### 1.3 Usage rules
- Flat panels only. **No soft gradients** except prismatic hair-style iridescent strips
  (linear, hard multi-stop) used sparingly as decorative edges.
- Complementary clash is encouraged: pink×cyan, yellow×purple, lime×magenta.
- Black is an active color (panels, tape), not just text.
- Shadows are **hard offsets** (`box-shadow: 6px 6px 0 var(--ink)`), never blurred.

## 2. Typography

| Role | Face | Usage |
|------|------|-------|
| JP display | **Dela Gothic One** (@fontsource/dela-gothic-one) | 魚介, katakana banners, section titles |
| Latin display | **Archivo Black** (@fontsource/archivo-black) | GYOKAI, big English words |
| UI / labels | **Space Grotesk** (@fontsource/space-grotesk) | captions, meta plates, buttons, tickers |

- Scale (clamp-based): `--fs-hero: clamp(64px, 14vw, 220px)` · `--fs-h2: clamp(40px, 7vw, 112px)`
  · `--fs-label: clamp(11px, 1.1vw, 14px)` · `--fs-body: clamp(15px, 1.4vw, 18px)`.
- Display type is *placed like a sticker*: slight rotation (−4° to +4°), keyline
  (`-webkit-text-stroke` or layered text-shadow in a clash color), often clipped by the section edge.
- Labels live in bordered caption boxes: `border: 2px solid currentColor; padding: 2px 8px;`
  uppercase, letter-spacing 0.12em.
- Body text max-width 60ch, line-height 1.6. Body is never rotated.

## 3. Spacing, Grid, Layers

- Base unit **8px**; spacing steps: 8 / 16 / 24 / 40 / 64 / 104 / 168 (fibonacci-ish).
- Layout: full-bleed sections; internal 12-col grid, `gap: 24px`, margin `clamp(16px, 4vw, 64px)`.
  Collage elements deliberately break the grid — but each section keeps ONE dominant alignment axis.
- z-layers: `0 bg-canvas (particles) · 10 section content · 20 tapes/marquees ·
  30 die-cut overflow art · 40 takeover · 50 halftone wipe canvas · 60 cursor`.

## 4. Motifs (shared SVG sprite: `motifs.svg`)
star-4pt, star-sparkle, plus, skull-ribbon, lightning, arrow-chunky, registration-mark,
halftone-dot-tile, checker-tile, caution-stripe-tile (yellow/black + pink/black variants).
Rules: motifs are decorative (`aria-hidden="true"`), colored via `currentColor`, reused everywhere.

## 5. Motion

### 5.1 Easings (register once in GSAP)
```js
EASE.slap   = "back.out(2)"        // element entrances
EASE.snap   = "power3.out"         // hovers, small UI
EASE.plate  = "steps(6)"           // print-plate/halftone stepping
EASE.ink    = "power2.out"         // ambient re-inking color tweens
EASE.convey = "none"               // marquees, tickers (linear, constant)
```

### 5.2 Timing
| Action | Duration | Ease |
|---|---|---|
| Sticker entrance (slap) | 0.45s, stagger 0.06 | slap |
| Hover plate-split | 0.15s in / 0.25s out | snap |
| Halftone wipe (full screen) | 0.7s | plate |
| Ambient re-ink | 0.6s | ink |
| Takeover open/close | 0.7s wipe + 0.3s settle | plate, then snap |
| Marquee | 60–90 px/s constant | convey |

### 5.3 Rules
- Animate **only** `transform`, `opacity`, `clip-path`, and canvas — never layout properties.
- Every entrance animation has a scroll-trigger start of `top 78%` and plays **once**; leaving
  and returning must not replay slaps (no popcorn).
- Hover states must also exist for keyboard focus (`:focus-visible` triggers the same split).
- `prefers-reduced-motion: reduce` → Lenis disabled, horizontal street becomes vertical stack,
  slaps → 0.3s opacity fades, marquees paused, halftone wipe → 0.25s crossfade, particles static.

## 6. Components

- **Tape/Marquee** — full-width strip, `background: var(--ink)`, repeated text
  `GYOKAI ★ 魚介 ★ ACID POP ★` in `--live-accent`, 2 directions, seamless loop (duplicate content, translateX −50%).
- **Sticker button** — paper bg, 3px ink border, hard shadow 4px 4px 0 ink; hover: translate(−2px,−2px), shadow 6px, plate-split pseudo-elements in magenta/cyan; active: translate(2px,2px), shadow 0.
- **Poster frame** (gallery) — artwork with 6px paper border + hard ink shadow + offset accent keyline; caption box bottom-left overlapping the frame; rotation ±2°.
- **Meta plate** (takeover) — Space Grotesk table: title / year-ish / palette swatches (clickable = copies hex) / link to source tweet if known.
- **Cursor** — custom registration-crosshair (24px circle + cross) in `--live-accent`, mix-blend-mode: difference; grows + rotates 45° over interactive elements. Hidden on touch devices; system cursor never fully removed for a11y (`cursor: none` only when custom cursor active).
- **HYPE button** (finale) — oversized sticker button; each press slaps a random motif sticker at a random position/rotation + tiny confetti burst; 10+ presses trigger full-screen halftone flash + giant 最高!!! banner.

## 7. Section specs (implementation order)

1. **Loader "INK CHECK"** — ≤2.5s, skip on any input. C/M/Y logotype plates slam (0.12s apart, misregistered ±8px) → snap into register → halftone iris opens. Sets `--live-*` to hero palette.
2. **Hero "KANBAN"** — vertical 魚介 (writing-mode: vertical-rl) + horizontal GYOKAI overlapping; hero artwork (`GmEvkHQbcAALLM1` — white/lemon sparkle piece) die-cut, breaking section edge; tapes top+bottom; particle canvas behind; scroll cue = bouncing chunky arrow.
3. **The Code** — 3 interactive specimen cards (Palette / Halftone / Sticker anatomy) + manifesto copy. Cards slap in on scroll; each card is a hands-on toy (click chips to spray color; drag slider to grow halftone dots; hover anatomy to explode keyline layers).
4. **The Street** — pinned horizontal scroll (desktop): N poster frames, each in a full-viewport color-room using its `dominant` as room bg. Re-ink fires when a poster crosses viewport center. Parallax: bg motifs 0.4×, poster 1×, caption 1.15×. Mobile/reduced-motion: vertical stack, re-ink on intersection.
5. **Close-up** — dialog takeover (native `<dialog>` or ARIA modal, focus-trapped): halftone wipe in, artwork full-bleed `object-fit: contain` on its dominant color, RGB-split settle (two clones, mix-blend screen, converge 0.3s), meta plate, prev/next (arrows + buttons), Esc/backdrop closes.
6. **Encore** — dark ink room; giant two-row opposing tickers (魚介 / GYOKAI); credit card "All artwork © Gyokai (魚介) — twitter/X @_himehajime · Site is a fan tribute"; HYPE button; sticker chaos layer.

## 8. Assets pipeline (`site/scripts/build-assets.mjs`)
- Input: **only** `site/scripts/allowlist.json` (19 files, absolute source names from `../gyokai/`).
- Output per image → `site/public/art/`: AVIF+WebP at widths 480/960/1600 (fit inside, quality 62/75), plus 24px blurred placeholder inline in manifest (base64 webp).
- Extract per image: dominant hex, vivid hex, chosen text color (contrast-computed), aspect ratio, alt text (from `allowlist.json` `alt` field, hand-written).
- Emit `site/src/data/manifest.json`. Build fails loudly if any allowlist file is missing. **Never glob the source dir.**

## 9. Accessibility & performance budgets
- Lighthouse (desktop): Perf ≥ 90, A11y ≥ 95. LCP < 2.0s (hero art is the LCP: preload highest-priority variant).
- Total JS < 180KB gzip; fonts subset (JP display face: load only glyphs used — use `unicode-range` subsets from fontsource, or a `glyphhanger`-style manual subset with the exact strings if size explodes).
- All interactive elements ≥ 44×44px hit area; visible focus everywhere; heading order sane; `lang="ja"` spans on Japanese runs inside `lang="en"` doc.
- Canvas layers: cap at `devicePixelRatio ≤ 2`, pause via `IntersectionObserver` when off-screen, and on `document.hidden`.

## 10. File layout
```
site/
  index.html
  package.json  vite.config.ts  tsconfig.json
  scripts/allowlist.json  scripts/build-assets.mjs
  public/art/            (generated, git-ignorable)
  src/
    main.ts  styles/{tokens,base,components,sections}.css
    data/manifest.json    (generated)
    lib/{lenis,gsap-setup,reink,cursor,halftone,particles,marquee}.ts
    sections/{loader,hero,code,street,closeup,encore}.ts
    motifs.svg
```
