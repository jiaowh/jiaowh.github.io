# GYOKAI — Acid Pop Archive

An interactive, single-page fan tribute to illustrator **Gyokai (魚介)** —
[@_himehajime](https://x.com/_himehajime). See `../creative-direction.md` for
the concept and `../design-system.md` for the full design system — that file
is the source of truth for every token, component, and section spec below.

The full experience is implemented: INK CHECK loader (C/M/Y plate slam +
halftone iris, any input skips), KANBAN hero (die-cut art, marquee tapes,
particle field), THE CODE specimen board (palette chips / halftone slider /
sticker anatomy), THE STREET pinned horizontal gallery with ambient
re-inking + ←/→ stepping, the CLOSE-UP dialog takeover (halftone wipes,
RGB-split settle, meta plate, full keyboard path), and the ENCORE finale
(opposing giant tickers + HYPE button chaos with the 最高!!! overload).
Reduced motion gets the full §5.3 fallback path (vertical street stack,
fades instead of slaps, paused tapes, crossfade wipes).

## The content rule (non-negotiable)

Only the 19 files listed in `scripts/allowlist.json` may ever be read,
processed, or served. The asset pipeline (`scripts/build-assets.mjs`)
resolves each entry's `src` by exact filename against `allowlist.sourceDir`
— it never lists, globs, or filters the source directory (`../gyokai/` at
the repo root, sibling of `site/`). It fails loudly (non-zero exit, clear
error) if any allowlisted file is missing. **Never** modify
`scripts/allowlist.json` or add files to it outside of a request from the
creative director, and never write code that reads `../gyokai/` any other
way.

## Requirements

- Node **18.19.x** (not 20+ — `sharp@0.32.6` is pinned for Node 18 compat).
- No network access needed at runtime — every font and image is self-hosted
  under `public/`; nothing loads from a CDN.

## Setup

```sh
npm install
npm run assets   # generates public/art/, public/fonts/, src/data/manifest.json
npm run dev      # http://localhost:5173
```

`public/art/`, `public/fonts/`, and `src/data/manifest.json` are generated,
git-ignored, and must exist before `dev`/`build`/`preview` will work — run
`npm run assets` first (and again any time `scripts/allowlist.json` or the
source images change).

## Commands

| Command | What it does |
|---|---|
| `npm run assets` | Runs the image pipeline (`scripts/build-assets.mjs`) then font subsetting (`scripts/subset-fonts.mjs`). Deterministic and idempotent — safe to re-run; wipes and regenerates `public/art/` and `public/fonts/` each time. |
| `npm run dev` | Vite dev server with HMR. |
| `npm run build` | `tsc --noEmit` then `vite build` → `dist/`. |
| `npm run preview` | Serves the built `dist/` locally. |
| `npm run review` | Builds nothing — drives the already-built `dist/` with puppeteer and captures the key beats to `review/*.png`. On systems missing Chromium's shared libs (e.g. bare WSL), prefix with `LD_LIBRARY_PATH` pointing at a dir containing libnss3/libnspr4/libasound (see `~/.cache/puppeteer/extra-libs`). |

## Asset pipeline (`scripts/build-assets.mjs`)

Per artwork in `scripts/allowlist.json` (in order):

- Resizes to AVIF + WebP at **480 / 960 / 1600px** wide (fit inside, never
  upscaled; quality 62/75) → `public/art/<id>-<width>.<ext>`.
- Colors, at build time:
  - **`dominant`** (drives `--live-bg`) — the allowlist's hand-tuned `room`
    hex when present, otherwise the most frequent quantized color extracted
    from the image.
  - **`vivid`** (drives `--live-accent`) — the allowlist's hand-tuned
    `accent` hex when present, otherwise the highest-saturation,
    mid-lightness extracted color that's still meaningfully present (≥1% of
    sampled pixels).
  - **`text`** — whichever of `#0A0A12` / `#FFF3DC` clears a 4.5:1 WCAG
    contrast ratio against the FINAL `dominant` (picks the higher ratio if
    both clear it; if *neither* clears it, picks the higher of the two
    anyway and adds a `textContrastNote` field + a build-log warning, per
    design-system.md §1.2).
  - `aspect` (width / height) and a ~24px-wide blurred base64 WebP
    `placeholder`.
- Writes `src/data/manifest.json` — an array, in allowlist order, of
  `{ id, title, titleJa, alt, role?, aspect, dominant, vivid, text,
  textContrastNote?, placeholder, sources: { avif: number[], webp: number[] } }`.
  `sources.avif`/`webp` are the widths generated, not paths — consumers
  build the URL as `/art/${id}-${width}.${ext}`.
- Cleans `public/art/` before writing (idempotent: stale output from a
  previous allowlist never lingers) and does a **pre-flight existence
  check on all 19 files before processing any of them**, so a missing
  source fails immediately with every missing filename listed, not a
  partial/confusing build.

`scripts/subset-fonts.mjs` then builds a manually-subset Dela Gothic One
woff2 (see below).

## Fonts

Self-hosted via `@fontsource`, imported only where actually needed
(`src/main.ts`):

- **Archivo Black** (`latin-400`) — Latin display (GYOKAI, big English words).
- **Space Grotesk** (`latin-400` + `latin-700`) — UI/labels/buttons/tickers.
- **Dela Gothic One** — JP display (魚介, katakana banners, section titles)
  — **not** loaded from `@fontsource` directly. Its "japanese" subset is
  ~922KB (the entire kanji repertoire) and still lacks the Latin glyphs the
  site also sets it in via `.section-heading` ("THE CODE", "THE STREET").
  `scripts/subset-fonts.mjs` cuts a purpose-built woff2 (harfbuzz via
  `subset-font`, ≈8KB) and registers it as a plain `@font-face` in
  `src/styles/tokens.css`. The glyph set is derived programmatically as the
  union of **every double-quoted literal in `src/data/strings.ts`** (the
  single source of truth for JP/display strings — sections import from it,
  `index.html` fills `[data-jp]` spans from it) and **every `titleJa` in
  `scripts/allowlist.json`**, plus digits/display punctuation. To render
  new JP text anywhere: add it to `src/data/strings.ts` (never hand-type
  JP in markup/sections) and re-run `npm run assets`.

## File layout

```
site/
  index.html                  semantic page skeleton (6 section shells + dialog)
  package.json / vite.config.ts / tsconfig.json
  scripts/
    allowlist.json             the only list of files the pipeline may touch — do not edit
    build-assets.mjs           image pipeline → public/art/ + src/data/manifest.json
    subset-fonts.mjs           JP display font subsetting → public/fonts/
  public/
    art/                       generated (git-ignored)
    fonts/                     generated (git-ignored)
  review/                      puppeteer screenshots (npm run review)
  src/
    main.ts                    boot: styles/fonts/sprite/JP strings → live tokens → lenis/cursor → sections
    vite-env.d.ts
    motifs.svg                 shared motif sprite (inlined into the DOM by main.ts)
    styles/
      tokens.css               design tokens (§1-3), Dela Gothic One @font-face
      base.css                 reset, selection, focus rings, [lang=ja] face, reduced-motion guards
      components.css           sticker button / caption box / tapes / poster frame / meta plate / cursor / chips / chaos
      sections.css             loader, hero, code, street, closeup, encore layouts + z-layer utilities
    data/
      manifest.json            generated (git-ignored)
      strings.ts               SINGLE SOURCE for JP display strings (font subset derives from it)
    lib/
      types.ts                 ArtworkManifestEntry / Manifest
      art.ts                   responsive <picture> builder from manifest entries
      gsap-setup.ts            plugin registration, EASE table, slapIn() entrance helper
      lenis.ts                 smooth scroll + scroll lock + programmatic scroll helper
      reink.ts                 ambient re-inking of --live-* (0.6s power2.out)
      cursor.ts                registration-crosshair custom cursor (fine pointers only)
      halftone.ts              fullscreen dot-matrix wipe engine (wipeIn/wipeOut/flash, promise API)
      particles.ts             hero motif particle field (drift + cursor repulsion, auto-pausing)
      marquee.ts               seamless constant-speed tape loops
    sections/
      loader.ts  hero.ts  code.ts  street.ts  closeup.ts  encore.ts
```

## Verification run in this pass

```sh
npm run assets        # 19/19 artworks (room/accent overrides honored); manifest + 114 variants + 7.6KB font subset
npx tsc --noEmit      # clean
npm run build         # clean; dist JS 177.6KB raw / 66.9KB gzip (budget: <180KB gzip), CSS 20.2KB
npm run review        # 8 screenshots in review/ — hero, the-code, street room (pink + dark), takeover, encore, mobile ×2
```

Also verified with puppeteer: loader completes ≤2.5s and skips on any input;
keyboard path (Tab→poster→Enter opens takeover, ←/→ flick artworks, Esc
closes with focus returned to the opening poster); ←/→ step the pinned
street with correct re-inking; `prefers-reduced-motion` yields the vertical
street stack with no pinning and zero page errors.
