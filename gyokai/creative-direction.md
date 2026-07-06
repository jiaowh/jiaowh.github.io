# GYOKAI — ACID POP ARCHIVE
## Creative Direction (source: Phase 1 visual-language analysis)

A single-page interactive tribute to the illustrator **Gyokai (魚介)** — [@_himehajime](https://x.com/_himehajime) —
built from a curated set of 19 illustrations. The site must not *display* the art; it must *behave like* the art.

> **Content rule (non-negotiable):** Only the 19 files listed in `site/scripts/allowlist.json`
> may ever be processed, copied, or served. Nothing else from `gyokai/` is touched by any
> script or import. The asset pipeline works from an explicit allowlist, never a glob.

---

## 1. The Visual Language (extracted from the work)

**Color logic** — CMYK pushed to eleven. Flat, shadowless panels of shocking pink (#FE19A1),
acid yellow (#FEF501), cyan (#45D4D6), lime (#8DFE8B) sit *behind* fully rendered characters.
Ink-black anchors the noise; warm cream (#FFF3DC) plays the role of paper. Complementary
clash is the norm: magenta × cyan, yellow × purple. Hair carries prismatic multi-hue streaks.

**Line & shape** — crisp dark outlines with confident weight variation; figures get offset
"sticker" keylines in a contrasting color, like a misregistered screenprint. Shape language
is rounded-bold: chunky accessories, stars, plus-signs, skulls-with-ribbons, lightning bolts.

**Surface & texture** — halftone dot fields, checkerboards, caution stripes (yellow/black,
pink/black), spray splatter, barcode blocks, registration marks. Gloss: PVC/vinyl shine
rendered with hard cel shadow + soft airbrush blush.

**Composition** — diagonal thrust and Dutch angles; figures break the frame; negative space
is colonized by sticker collage; huge display katakana slammed diagonally across the image
with tiny utilitarian caption boxes as counterpoint (マスター / アップ!! poster is the canonical example).

**Mood** — *danger-cute*: Harajuku × arcade × screenprint zine. Hyper-energetic, mischievous,
celebratory. Density is the resting state; flat color fields are the breath between beats.

---

## 2. Concept — "The Print Floor"

The visitor walks through a **living screenprint studio at night**: ink plates slam, halftone
wipes open like an iris, posters hang in their own color-worlds, and the whole environment
re-inks itself to match whichever artwork you stand in front of.

**Big idea / signature mechanic — AMBIENT RE-INKING:**
every artwork's dominant + vivid colors were extracted at build time. As the visitor moves
through the gallery, the *entire site* (background, tickers, cursor, selection color, UI chrome)
tweens to that artwork's palette. The art literally paints the site.

**Interaction philosophy — "Everything is a sticker."**
Every interactive element behaves like a physical printed sticker: it *slaps* in with overshoot,
its print plates sit slightly misregistered (CMY offset), it lifts/peels on hover with a hard
offset shadow. Nothing fades politely; things arrive.

**Motion language — "Press, don't drift."**
- Entrances: slap (scale 1.15→1, rotate ±3°→resting angle, `back.out(2)`, 400–550ms)
- Transitions: halftone dot wipe (dots grow from 0 to overlap), hard-stepped, 600–800ms
- Hover: plate-split (magenta/cyan clones offset 2–4px), 150ms, snappy
- Ambient: marquee tapes scroll at constant speed; motif particles drift slowly
- Nothing eases with plain `power1.inOut`. Motion is either *snap* or *steady conveyor*.

---

## 3. Emotional Journey (scroll choreography)

| Beat | Section | Feeling | What happens |
|------|---------|---------|--------------|
| 0 | **INK CHECK** (loader) | anticipation | Black screen. Registration crosshair. C/M/Y logotype plates slam in one by one, misaligned → snap into register. Halftone iris opens. |
| 1 | **KANBAN** (hero) | impact | Giant vertical 魚介 + GYOKAI logotype. Hero artwork die-cut breaking the frame. Marquee tapes top & bottom. Motif particles (stars/plus/dots) magnetically repel the cursor. |
| 2 | **THE CODE** (style anatomy) | curiosity | The site dissects its own design language: interactive specimen board — palette chips that pop, halftone density demo, sticker-keyline demo. The visitor *learns the style* the site is built from. |
| 3 | **THE STREET** (gallery) | immersion | Horizontally scrolling poster street (pinned). Each poster hangs in its own color-world; ambient re-inking tweens the whole page per poster. Kinetic katakana labels slide with parallax. |
| 4 | **CLOSE-UP** (detail takeover) | intimacy | Click a poster → full-bleed takeover behind a halftone wipe; RGB-split settle; palette plate + title card; flick to next/prev. |
| 5 | **ENCORE** (finale) | celebration | Shrine to the artist. Giant 魚介 ticker, link to X, credits. Easter egg: **HYPE button** — mashing it slaps random stickers/confetti onto the screen with escalating intensity. |

Pacing: loader ≤ 2.5s (skippable instantly on any input). Hero settles within 1.2s.
Density crescendos toward THE STREET, breathes in CLOSE-UP, explodes at ENCORE.

---

## 4. Technology Selection (chosen for the experience)

| Need | Choice | Why |
|------|--------|-----|
| Build | **Vite + vanilla TypeScript** | total DOM control for collage layouts; zero framework tax; agents ship fast |
| Scroll | **Lenis** | buttery inertial scroll that GSAP can drive |
| Choreography | **GSAP + ScrollTrigger** | pinning, scrubbed horizontal street, palette tweens |
| Transitions | **Canvas 2D halftone engine** | dot-matrix iris wipes; reliable everywhere, GPU-composited |
| Particles | Canvas 2D layer | star/plus/dot motif field with cursor repulsion |
| Type | self-hosted **@fontsource**: Dela Gothic One (JP display), Archivo Black (Latin display), Space Grotesk (labels/UI) | Dela Gothic One is *the* Dohna-adjacent heavy gothic; no CDN dependency |
| Images | **sharp** at build time | allowlist → resized AVIF/WebP variants + extracted palettes → `manifest.json` |
| Sound (stretch) | WebAudio blips, off by default | cassette-style toggle; never autoplay |

No React, no Three.js — the aesthetic is *print*, not 3D. Flatness is the point.

---

## 5. Quality Bar & Guardrails

- The technology disappears; only the print-floor world remains.
- 60fps on a mid laptop; transforms/opacity only for animation; canvas layers capped at DPR 2.
- `prefers-reduced-motion`: kill Lenis smoothing, pin-scrub becomes plain vertical sections,
  slaps become simple fades, marquees stop. Everything remains reachable.
- Full keyboard path: gallery navigable with arrows/tab, takeover closes on Esc, focus rings
  styled as registration marks (visible, on-brand).
- Semantic HTML under the spectacle: `<main>`, `<section>`, `<figure>`, alt text for every artwork.
- Works at 360px wide: the street becomes a vertical poster stack; re-inking stays.
