# GYOKAI — Reusable Design System & Field Notes

A portable distillation of the "Acid Pop" design language extracted from the illustration
work of **Gyokai (魚介)** — [x.com/_himehajime](https://x.com/_himehajime) — plus everything
learned building the tribute site (July 2026). This file is self-contained: you can lift it
into any project and rebuild the language without the original repo.

Companion docs in this repo: `creative-direction.md` (site concept), `design-system.md`
(site-specific source of truth), `site/README.md` (implementation details).

---

## 1. The Visual Language

### 1.1 Color logic — "CMYK pushed to eleven"
- **Flat, shadowless panels** of saturated color sit *behind* fully rendered subjects.
  The background is never a gradient wash; it is a print plate.
- **Complementary clash is the norm**: magenta × cyan, yellow × purple, lime × magenta.
  Colors are chosen to argue, then anchored by ink black and warm cream ("paper").
- Hair/edges carry **prismatic multi-hue streaks** (pink→yellow→cyan in one braid) —
  the one place hard multi-stop gradients are allowed.
- Black is an **active color** (panels, tape, keylines), not just for text.

### 1.2 Line & shape
- Crisp dark outlines with confident weight variation; thinner interior lines.
- Figures get **offset "sticker" keylines** in a contrasting color — like a misregistered
  screenprint. Duplicated/offset silhouettes (CMY plate-split) are a core motif.
- Shape language is **rounded-bold**: chunky accessories, 4-point stars, sparkles,
  plus-signs, skulls-with-ribbons, lightning bolts, fat arrows.

### 1.3 Surface & texture
Halftone dot fields · checkerboards · caution stripes (yellow/black and pink/black) ·
spray splatter · barcode blocks · registration marks · tiny utilitarian caption boxes.
Material shine is **PVC/vinyl gloss**: hard cel shadow + soft airbrush blush.

### 1.4 Composition
- Diagonal thrust, Dutch angles; subjects **break the frame**.
- Negative space is colonized by sticker collage; density is the resting state, flat
  color fields are the breath between beats.
- Huge display katakana slammed diagonally + tiny caption boxes as counterpoint.
- Each composition keeps ONE dominant alignment axis even while collage breaks the grid.

### 1.5 Mood
**Danger-cute**: Harajuku × arcade × screenprint zine. Hyper-energetic, mischievous,
celebratory. Nothing is polite; everything is having fun.

---

## 2. Design Tokens (portable)

### 2.1 Fixed ink palette
```css
--ink:      #0A0A12;  /* near-black, blue-cast — panels, outlines, text on light */
--paper:    #FFF3DC;  /* warm cream — "paper" surfaces, text on dark */
--white:    #FDFCFA;
--pink:     #FE19A1;  /* shocking pink — primary accent */
--magenta:  #E901C6;
--cyan:     #45D4D6;
--cyan-hot: #00E5FF;
--yellow:   #FEF501;  /* acid yellow — caution, highlights */
--lime:     #8DFE8B;
--orange:   #FA9735;
--purple:   #6549A8;
--red:      #E7477C;
```

### 2.2 Live theming tokens (the "ambient re-inking" mechanic)
```css
--live-bg:     /* current artwork's room color   */
--live-accent: /* current artwork's clash accent */
--live-text:   /* #0A0A12 or #FFF3DC, whichever clears 4.5:1 vs --live-bg */
```
Everything themable (section bg, tickers, cursor, `::selection`, borders) consumes
`--live-*`; a 0.6s `power2.out` tween re-inks the whole page when the focal artwork
changes. Compute the contrast-safe `--live-text` **at build time**, not runtime.

### 2.3 Hand-tuned artwork rooms (19 curated pieces)
Extraction gets you 80% — these were hand-corrected (see lesson 5.1):

| id | room | accent | text |
|---|---|---|---|
| sparkle-plaid (hero) | #FBFBEC | #E9EC3F | ink |
| lime-rabbit | #8DFE8B | #FD8A49 | ink |
| captain-teal | #45D4D6 | #E6396A | ink |
| checker-idol | #0A0A12 | #15FE9D | paper |
| acid-noise | #FEF501 | #F838FE | ink |
| bandage-red | #E43C84 | #FFD34C | ink |
| new-year-twins | #FE19A1 | #45D4D6 | ink |
| candy-crown | #FFC0FE | #FE19A1 | ink |
| bubblegum-wink | #141019 | #FD68E9 | paper |
| pastel-dragon | #FFE6B5 | #F782B5 | ink |
| hazard-jacket | #FCDCE4 | #E9E930 | ink |
| crimson-grin | #C0C0C0 | #D52B65 | ink |
| kimono-rabbit | #3E3E46 | #FE61EE | paper |
| prism-specs | #0A0A12 | #F5306D | paper |
| magenta-runner | #EB60DA | #FEF501 | ink |
| tangerine-suit | #0A0A12 | #FD9330 | paper |
| cherry-maid | #61D9DD | #ED4864 | ink |
| frill-sniper | #1C1630 | #F5306D | paper |
| master-up (finale) | #EA01C5 | #45D4D6 | ink |

### 2.4 Typography
| Role | Face | Notes |
|---|---|---|
| JP display | **Dela Gothic One** | the Dohna-adjacent heavy gothic; MUST be subset (see 5.4) |
| Latin display | **Archivo Black** | GYOKAI-style big words |
| UI / labels | **Space Grotesk** 400/700 | caption boxes, meta plates, tickers |

- Scale: `--fs-hero: clamp(64px,14vw,220px)` · `--fs-h2: clamp(40px,7vw,112px)` ·
  `--fs-label: clamp(11px,1.1vw,14px)` · `--fs-body: clamp(15px,1.4vw,18px)`.
- Display type is **placed like a sticker**: rotated −4°…+4°, contrast keyline
  (text-stroke or layered text-shadow), often clipped by the section edge (clipping = energy).
- Labels live in bordered caption boxes: `border: 2px solid currentColor; padding: 2px 8px`,
  uppercase, letter-spacing 0.12em. Body text is never rotated (max-width 60ch, lh 1.6).

### 2.5 Space, shadow, layers
- Base unit 8px; steps 8/16/24/40/64/104/168. 12-col grid, gap 24px,
  margins `clamp(16px, 4vw, 64px)`; collage elements deliberately break it.
- **Shadows are hard offsets, never blurred**: `box-shadow: 6px 6px 0 var(--ink)`.
- z-layers: `0 bg-canvas · 10 content · 20 tapes · 30 die-cut overflow art ·
  40 takeover · 50 wipe canvas · 60 cursor`.

---

## 3. Motion Language — "Press, don't drift"

Nothing eases with a polite `power1.inOut`. Motion is either **snap** or **steady conveyor**.

### 3.1 Easings
```js
EASE.slap   = "back.out(2)"   // entrances (scale 1.15→1, rotate ±3°→rest)
EASE.snap   = "power3.out"    // hovers, small UI
EASE.plate  = "steps(6)"      // halftone / print-plate stepping
EASE.ink    = "power2.out"    // ambient re-ink color tweens
EASE.convey = "none"          // marquees & tickers, constant px/s
```

### 3.2 Timing table
| Action | Duration | Ease |
|---|---|---|
| Sticker entrance (slap) | 0.45s, stagger 0.06 | slap |
| Hover plate-split | 0.15s in / 0.25s out | snap |
| Full-screen halftone wipe | 0.7s | plate |
| Ambient re-ink | 0.6s | ink |
| Takeover open/close | 0.7s wipe + 0.3s settle | plate → snap |
| Marquee | 60–90 px/s constant | convey |

### 3.3 Rules that held up
- Animate only `transform` / `opacity` / `clip-path` / canvas.
- Entrances play **once** (trigger `top 78%`); returning to a section must not replay
  slaps — replays read as popcorn, not craft.
- Every hover state also fires on `:focus-visible`.
- `prefers-reduced-motion: reduce` is a **first-class parallel design**, not an
  afterthought: smooth-scroll off, pinned horizontal → vertical stack, slaps → 0.3s
  fades, marquees paused, halftone wipe → 0.25s crossfade, particles static.

### 3.4 Signature mechanics (the memorable stuff)
1. **Ambient re-inking** — artwork palettes re-theme the whole page as you browse.
   This single mechanic did more for "the artwork and site feel inseparable" than any
   other decision.
2. **Everything is a sticker** — a single entrance/hover/shadow grammar applied to
   every element makes disparate sections feel like one hand made them.
3. **Halftone iris wipes** — Canvas 2D dot-matrix (radial grow, 6 steps, DPR≤2) is
   reliable everywhere and reads unmistakably "print". No WebGL needed; flatness is
   the point — this aesthetic wants 2D.
4. **C/M/Y plate-slam loader** — misregistered logotype plates (±8px, 0.12s apart)
   snapping into register. ≤2.5s, ANY input skips instantly.
5. **HYPE button** — mash → sticker chaos (cap DOM nodes ~80, recycle oldest; give the
   credit/legal card an exclusion zone so chaos never covers what must stay readable).

---

## 4. Component Recipes
- **Sticker button** — paper bg, 3px ink border, `4px 4px 0` ink shadow. Hover:
  translate(−2,−2), shadow 6px, CMY pseudo-element plate-split. Active: translate(2,2),
  shadow 0 (it "presses").
- **Poster frame** — art + 6px paper border + hard ink shadow + offset accent
  `outline` (keyline), caption box overlapping the frame corner, rotation ±2°.
- **Tape/marquee** — ink strip, repeated content duplicated once, translateX −50% loop,
  measured for seamlessness; two directions in opposition when stacked.
- **Cursor** — registration crosshair in `--live-accent`, `mix-blend-mode: difference`,
  grows + rotates 45° over interactives. Fine-pointer devices only.
- **Caution-tape divider** — full-width stripe tile, slight rotation, hard shadow;
  the cheapest way to punctuate same-colored adjacent sections.

---

## 5. Lessons Learned (what I'd tell the next project)

### 5.1 Art direction
1. **Palette extraction lands on skin/paper tones.** Whole-image dominant-color
   extraction picked cream/skin for several posters (character fills the frame).
   Edge-frame sampling (outer ~10%) helps but isn't universal. The answer: **extraction
   proposes, a human/director disposes** — hand-tune room/accent per artwork and store
   the overrides in data (allowlist), with extraction only as fallback.
2. **Pale hero syndrome.** A light artwork on a light room made the first screen
   forgettable. Fix: one giant ink-outlined accent plate behind the lockup + ink-filled
   wordmark with colored keyline. If beat 1 doesn't hit, nothing after it matters.
3. **Big art or no art.** Gallery pieces floating small in flat rooms read as a template.
   Portrait ~72vh / landscape ~58vh gave them billboard presence. Dress the room
   (giant index numeral, outlined motifs at low alpha, floor tape) so emptiness reads
   as *staging*, not absence.
4. **Soft = artifact.** Blurred/soft shapes anywhere in this language read as rendering
   bugs. If it isn't hard-edged and outlined, cut it.
5. **Screenshot-driven review is non-negotiable.** Every real issue above was invisible
   in code review and obvious in a 1440×900 PNG. Build `npm run review` (headless shots
   of every beat, desktop + mobile) on day one; regenerate after every wave; and
   **rebuild `dist/` before shooting** — two review rounds were confused by stale builds.

### 5.2 Engineering traps (each cost real time)
1. **`srcset`/`sizes` beats your CSS.** With `width: auto`, an `<img>` lays out at its
   srcset-derived *intrinsic* size — which comes from the `sizes` attribute, not your
   `max-height`. If you scale images with CSS caps, keep `sizes` in sync or the caps
   silently never engage. (Posters rendered 42vh against a 58vh rule for two rounds.)
2. **Lenis `scrollTo` desyncs** after programmatic/keyboard jumps: it animated from a
   stale internal position (toward 0). Drive programmatic scrolls through a GSAP proxy
   tween that writes native scroll — Lenis stays in sync.
3. **Cascade order vs `[lang=ja]`**: a later utility font class beat the JP-face rule
   and katakana rendered as tofu. Give the JP-face rule specificity headroom.
4. **JP display fonts must be subset from a single source of truth.** Dela Gothic One's
   "japanese" subset is ~922KB. Keep every display string in one `strings.ts` (plus data
   titles), derive the glyph set programmatically (`subset-font`/harfbuzz) → ~8KB woff2.
   Rule: never hand-type JP in markup; add to `strings.ts` and re-subset.
5. **Chaos needs exclusion zones.** Randomly-placed decorations WILL cover your most
   important link. Rejection-sample spawn positions against protected rects, with a
   deterministic fallback corner.
6. **Pin this environment**: Node 18 → `sharp@0.32.x`, `vite@^5`. Headless Chrome on
   bare WSL without sudo: install puppeteer, extract `libnss3/libnspr4/libasound2` debs
   locally and run with `LD_LIBRARY_PATH=~/.cache/puppeteer/extra-libs`.
7. **Budgets held easily** because the stack was boring: Vite + vanilla TS + GSAP +
   Lenis + Canvas 2D = 67.7KB gzip JS total. The aesthetic is print — WebGL/React would
   have added risk, not wow.

### 5.3 Process
1. **Docs before delegation.** Writing `creative-direction.md` + `design-system.md`
   first meant implementation agents needed goals, not micromanagement — and reviews
   had an objective standard ("the doc wins").
2. **Verify agent work independently.** The best agent report still shipped one
   invisible bug (the `sizes` trap) and one died mid-verification. Probe the live DOM
   yourself (computed styles, rects, focus state) before calling anything done.
3. **Hand-write the editorial layer** (titles, alt text, palette overrides) as data the
   pipeline consumes. Creative judgment belongs in data files agents must respect, not
   in prompts they might drift from.

### 5.4 Content curation (non-negotiable, and load-bearing)
The source folder mixes publishable poster work with explicit adult material that must
never be processed or served. The rule that made this safe *by construction*:
**the pipeline consumes an explicit allowlist (19 files) and never lists, globs, or
filters the source directory** — a missing file fails the build loudly. Curation is a
creative-director decision recorded in `site/scripts/allowlist.json`; no code path can
widen it by accident. Every derivative use of this artwork must credit Gyokai (魚介)
and link the artist: **x.com/_himehajime** — the site is an unofficial fan tribute.

---

## 6. Experience Blueprint (reusable skeleton)

| Beat | Pattern | Feeling |
|---|---|---|
| 0 Loader | plate-slam + halftone iris, ≤2.5s, any-input skip | anticipation |
| 1 Hero | crossing wordmarks, die-cut art breaking frame, opposing tapes | impact |
| 2 Anatomy | the site dissects its own design language with hands-on toys | curiosity |
| 3 Gallery | pinned horizontal color-rooms + ambient re-inking (vertical stack on mobile/RM) | immersion |
| 4 Close-up | dialog takeover: wipe in, RGB-split settle, meta plate, flick nav | intimacy |
| 5 Finale | dark room, opposing tickers, credit, mashable easter egg | celebration |

Pacing rule: density crescendos into the gallery, breathes in close-up, explodes at the
finale. Loader ≤2.5s; hero settles within 1.2s; a11y path (keyboard, focus return,
44px targets, alt text, sane headings) is part of the definition of done, not polish.
