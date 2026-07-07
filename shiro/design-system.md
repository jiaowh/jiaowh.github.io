# 真昼の月 — The Midday Moon
### Design System & Experience Script — single source of truth
Digital experience built from 白身魚 (Shiromizakana / animator Yukiko Horiguchi)'s
self-selected illustration collection 『真昼の月』 (2020) and her 22/7 discography art.

**Thesis.** The midday moon is in the sky right now — pale, present, almost nobody
looks up. The book's obi reads: 「あなただけが いつも私を 見つけてくれる」
("Only you ever find me"). The site is built around *noticing*: a quiet, book-paced
experience that rewards attention with small discoveries, culminating in a hidden-moon
mechanic that pays off the thesis literally. This is not a portfolio and not a gallery.
It is one day spent inside the book.

**Hard bans:** no navbar-hero-features-footer anatomy, no cards with drop shadows,
no SaaS gradients, no bouncy easings, no carousel libraries, no cookie-cutter
"portfolio grid". Nothing snaps; everything blooms, settles, soaks.

---

## 1. The two visual registers

The entire site alternates between the artist's two hands. Every design decision
belongs to exactly one register — never blend them in one component.

**Register A — PAPER (the book).** Transparent watercolor + G-pen line on warm
yellowish Sirius watercolor paper. Generous white margins, plates sitting in space,
tiny letter-spaced captions, handwritten margin annotations in colored ink
(green / red / blue). Light, intimate, slow. Sections: Arrival, Ch.1, Ch.2, Ch.4, Finale.

**Register B — CINEMA (the 22/7 jackets).** Full-bleed cel-art scenes. Giant thin
Mincho kanji woven into pictorial depth. Handwritten yellow/white scrawl as emotional
counterpoint. Vertical type rails, sage-grey editorial frames, catalog numbers
(SRCL-XXXXX). Dark-capable, scene-scaled, slower and larger motion. Section: Ch.3.

The register handoff (paper → cinema at Ch.3 entry, cinema → paper at Ch.3 exit)
is itself a designed moment: the paper field "burns away" via an irregular
watercolor-edge mask reveal (SVG mask, not a straight wipe).

---

## 2. Color

All colors sampled from the plates. CSS custom properties.

### Foundation
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F5F1E6` | global background (yellowish Sirius paper) |
| `--paper-deep` | `#ECE6D6` | recessed areas, plate wells, postcard |
| `--ink` | `#38342E` | primary text (warm G-pen near-black) |
| `--ink-soft` | `#6B655B` | captions, secondary |
| `--sage` | `#A9B2A4` | editorial frames, rules, catalog chrome (Ch.3) |
| `--title-green` | `#8FAE9B` | handwritten title ink (matches cover lettering) |
| `--night` | `#151B27` | finale sky only |
| `--moon` | `#E9E4D8` | the moon on paper (≈3% contrast vs `--paper` — intentionally near-invisible) |

### Seasonal accents — ONE per section, never two
| Token | Hex | Season/source |
|---|---|---|
| `--sakura` | `#E5ADBB` | cherry blossom plates |
| `--mint` | `#BCDCD2` | 風は吹いてるか? sky |
| `--scrawl` | `#EFC337` | handwritten yellow title scrawl |
| `--accent-red` | `#BF2E2A` | red umbrella / randoseru — rarest, highest-value accent |
| `--snow` | `#B9CDDC` | snow + umbrella covers |
| `--storm` | `#7C6046` | 覚醒 storm beach |
| `--water` | `#6FA8A4` | underwater / standing-in-water plates |
| `--clover` | `#6E9A54` | clover field / margin-note green ink |

Margin-note ink colors (annotations): green `#4E8A62`, red `#C05043`, blue `#4A6FA5`
— rotate per note, as in the book.

Rule: desaturated field + exactly one saturated accent per viewport. If a plate
already carries its accent (red umbrella), the UI accent goes silent.

---

## 3. Typography

Four voices. Never introduce a fifth.

| Voice | Font | Role |
|---|---|---|
| **Display Mincho** | `Shippori Mincho B1` (Google Fonts) 400/500 | Giant kanji woven into scenes; chapter numerals. The thin elegant serif of the jacket titles. |
| **Hand** | `Klee One` (Google Fonts) 400/600 | Chapter wash-titles, margin annotations, moon microcopy, postcard handwriting. Closest web match to the artist's neat study-notebook hand. |
| **Caption serif** | `EB Garamond` 400 + Italic | Latin captions, letter-spaced small caps, the English cursive lines ("An eternal prime number named 11.") set in Italic. |
| **Catalog mono** | `IBM Plex Mono` 400 | Catalog numbers, dates, plate numbers, progress counter. Utilitarian jacket-spine flavor. |

JP body text: Shippori Mincho 400 at body size. Load JP fonts from Google Fonts CDN
(automatic unicode-range subsetting); `font-display: swap`.

### Scale (fluid)
```css
--type-display: clamp(4.5rem, 16vw, 15rem);   /* woven kanji */
--type-chapter: clamp(2.2rem, 6vw, 4.2rem);   /* wash titles */
--type-body:    1.0625rem; line-height: 1.95;
--type-caption: 0.8125rem; letter-spacing: 0.14em;
--type-catalog: 0.6875rem; letter-spacing: 0.08em;
```

### Rules
- Vertical text (`writing-mode: vertical-rl`) for: chapter rail, jacket title rails,
  member-name columns, the finale obi line.
- Display kanji may be split per-glyph (each glyph its own element) for depth
  choreography. Tracking tight (−0.02em); color white over imagery, `--ink` on paper.
- Captions: always letter-spaced, always small, always asymmetric placement
  (never centered under the plate — offset to a margin, as in the book).

---

## 4. Space, grid, layout

- **Margins:** `--margin: clamp(1.5rem, 7vw, 7rem)`. The paper margin is sacred —
  plates float inside it; only Register B may go full-bleed.
- **Grid:** 12 fluid columns inside margins, gap `clamp(1rem, 2vw, 2rem)`.
- **Plate layouts** (Register A) — alternate, never repeat twice:
  - *Plate solo:* image cols 3–9, caption in col 10–11 rotated or below-right.
  - *Plate pair:* images cols 2–6 / 7–11 with vertical offset ≥ 20vh.
  - *Plate intimate:* small image (≤ 420px) col 5–8, huge whitespace.
- **Vertical rhythm:** min 35vh whitespace between plates. The site must breathe;
  when in doubt, add space.
- **Chapter rail** (persistent nav): fixed left edge, vertical-rl, current chapter
  name in Hand voice + thin progress thread (1px, `--ink` 20%) that "stitches"
  downward as you scroll. Chapters clickable. On mobile: becomes a 2px top thread +
  chapter mark.

---

## 5. Motion system

Watercolor physics: fast attack, very long settle — pigment hitting wet paper.

```css
--ease-soak: cubic-bezier(0.16, 1, 0.3, 1);   /* default: reveals, blooms */
--ease-ink:  cubic-bezier(0.65, 0, 0.35, 1);  /* cinema moves, pinned scenes */
--dur-hover: 250ms;  --dur-caption: 500ms;
--dur-bloom: 900ms;  --dur-scene: 1200ms;
--stagger: 70ms;
```

- **Bloom reveal** (Register A signature): plates enter via an irregular organic mask
  (SVG `feTurbulence` + `feDisplacementMap` on a scaling circle mask, or a set of 4–5
  pre-made blob-mask PNGs alternated) + slight scale 1.02→1 + opacity. Edges must be
  ragged like a wet wash, never a geometric wipe.
- **Handwriting draw:** wash titles and the arrival title draw on via SVG
  `stroke-dashoffset` (600–900ms, staggered strokes). Klee One rendered as outlined
  SVG paths for the arrival title only; elsewhere plain text fading in is fine.
- **Dwell reveals** (Ch.2 signature): margin annotations appear only after the plate
  has been ≥ 60% in-viewport for 1.2s — rewarding slowness. Not scroll-scrubbed.
- **Kanji depth** (Ch.3 signature): glyphs parallax at different scroll rates than the
  scene; `mix-blend-mode: soft-light` at 85–100% white; enters by sliding along its
  vertical axis. ONE handcrafted hero moment: the 覚醒 storm-beach scene gets a
  manual `clip-path` silhouette so the glyph 醒 passes visibly *behind* the figures.
  Only that scene — one perfect moment beats five approximate ones.
- **Scroll:** Lenis smooth scroll (default wheel multiplier ≈1 — no scroll-hijack feel).
  GSAP ScrollTrigger for pinning/scrubbing. Pinned scenes only in Ch.3 (max 4 pins).
- **Never:** bounces, elastic, spinners, parallax on text body, autoplaying carousels.
- **`prefers-reduced-motion`:** all reveals become ≤200ms opacity fades, no pinning,
  no parallax, Lenis disabled. Fully readable static document.

---

## 6. Signature systems

### 6.1 The Moon (site-defining interaction)
- A small crescent (~26px SVG), color `--moon`, fixed-position, drifting very slowly
  against scroll (0.03 parallax factor). Present from the first screen. On paper
  sections it is genuinely hard to notice; in Ch.3 scenes it hides *inside* the
  artwork frame (in a puddle-reflection position, near a convex mirror, inside the
  counter of a giant glyph). It relocates per section (position keyframes).
- There are **6 findable moons** (one per section). Click/tap/Enter → soft bloom
  ripple + Hand-voice microcopy 「月を見つけた」 + a moon phase appears in the
  progress thread. Counter in catalog mono: `MOON 03/06`.
- It is an accessible `<button>` with `aria-label="真昼の月"`, visible focus ring,
  reachable in tab order. Accessibility beats secret purity.
- Finale payoff: found phases assemble in the night sky; 6/6 completes the obi line
  in full. 0/6 visitors still get the line — gently, as if the site forgives you.
- State in `localStorage` (`mahiru.moons`).

### 6.2 Margin notes
Hand voice, 0.9375rem, one of the three ink colors, small rotation (−2°…2°),
positioned in true margins beside plates. Content: the artist's actual commentary
(translated excerpts) or plate facts. Dwell-revealed (§5).

### 6.3 Wash titles
Chapter openers: a soft watercolor swatch (pre-made PNG wash in the chapter's accent
at 20% opacity, big organic edge) + `Chapter.N` in catalog mono + title in Hand voice
drawing on. Exactly like the book's chapter pages.

### 6.4 Catalog chrome (Ch.3 only)
Sage 1px frames inset 12px from scene edges; catalog number bottom-left
(`SRCL-XXXXX` in mono); vertical title rail right edge; English cursive line
(EB Garamond Italic) breaking the bottom frame line, as on the album jackets.

### 6.5 Variant switcher (Ch.3)
Singles with multiple covers get edition tabs styled as catalog labels
(通常盤 / Type-A / Type-B…). Switching crossfades scene + re-choreographs its kanji
(exit up, enter from below, 600ms `--ease-ink`). Keyboard: arrow keys, `role="tablist"`.

### 6.6 The Postcard (finale)
Faithful reimagining of the book's 読者カード: dashed-border card on `--paper-deep`,
mono POST CARD header, fields ペンネーム (P.N.) + 感想 (textarea, Hand voice input
styling), a 料金受取人払 stamp block. "送る" → stamp thunks on (single 300ms
transform, the site's only hard motion — a stamp should thunk) → opens `mailto:`
with the message prefilled. No backend. Honest microcopy: 「切手は不要なので送ってね!」

---

## 7. Experience script (build order = scroll order)

### S0 — 表紙 / Arrival (Register A)
Pure `--paper` with subtle grain (CSS noise or tiled texture ≤10KB, opacity 4%).
Title 「真昼の月」 draws itself in `--title-green` handwriting (SVG stroke).
Below, caption voice: 「白身魚 自選イラスト集」 + EB Garamond Italic
"The Midday Moon". A single watercolor bloom spreads behind the title on load.
The moon is already on screen (top-right area, nearly invisible). A thin Hand-voice
line fades in after 2.5s: 「空にはいつも、見えない月がある。」 Scroll hint: none —
the progress thread's first stitch animates downward instead.

### S1 — Chapter.1 girl meets girl (Yuri Hime) — accent `--snow`→`--sakura`
Wash title. 3–4 solo/pair plates (snow + yellow umbrella cover as centerpiece —
hi-res JPG exists). Then the **2019 archive board**: the 12-cover grid plate shown
whole; hovering/tapping a cover raises it slightly and reveals one margin note.
Cover design credit "BALCOLONY." in catalog mono.

### S2 — Chapter.2 Novel illustration — accent `--clover`
Wash title (the book's own Chapter.2 exists — mirror it). ツァラトゥストラへの階段
and ジャナ研 plates in alternating layouts; season shifts sakura→autumn inside the
section (autumn ジャナ研 pinups). This is the margin-note-dense chapter; dwell
mechanic teaches itself here. One poem-fragment interlude: a near-empty viewport,
one Hand-voice line, huge whitespace.

### S3 — Chapter.3 22/7 (Register B) — CINEMA
Paper burns away (mask reveal) into full-bleed. 5 scenes, each pinned briefly:
1. **シャンプーの匂いがした** — overhead sakura circle; `--sakura`; kanji drifts across.
2. **風は吹いてるか?** — mint sky diagonals; `--mint`; glyphs slide on the diagonal.
3. **僕が持ってるものなら** — blue-sky jump, ribbons; `--scrawl` yellow scribble
   accent animates on like a signature.
4. **覚醒** — storm beach; `--storm`; THE hero moment: 覚/醒 at `--type-display`,
   醒 passes behind the figures (manual clip-path). Variant switcher demo here or on 5.
5. **11という名の永遠の素数** — the album; full catalog chrome (§6.4); sage frame;
   "An eternal prime number named 11." cursive; variant switcher across the 3 covers.
Between scenes: brief `--night`-dimmed gaps with a single vertical title rail.
Exit: cinema fades, paper mask un-burns.

### S4 — Chapter.4 Rough & Materials — accent `--storm` (sepia register)
Pencil roughs as intimate small plates. Then the materials still-life as typography:
the actual colophon list (呉竹漫画ブラック・Gペン / ドクターマーチン ピグメント /
シリウス水彩紙…) set as a catalog-mono table with Hand-voice notes. The paper
background here gets 2% warmer (`#F6F0E2`) — you're touching the raw sheet.

### S5 — 奥付 / Finale
Colophon-style credits (mono + caption voices, generous spacing). Then the sky
slowly deepens to `--night` across one viewport of scroll; found moon phases drift
into place; the obi line sets itself vertically (vertical-rl, Display Mincho,
white): 「あなただけが、いつも私を見つけてくれる。」 If 6/6: the crescent completes
to a full moon with a slow bloom. The Postcard (§6.6) waits below, back on paper.
Footer line: "All artwork © 白身魚 (堀口悠紀子) — unofficial tribute to
『真昼の月』 (復刊ドットコム, 2020)."

---

## 8. Accessibility
- Semantic sections + h1–h3 document outline; skip link; full keyboard traversal.
- Every plate: descriptive `alt` (JP scene description); decorative washes `alt=""`.
- Contrast: `--ink` on `--paper` = 9.4:1; captions `--ink-soft` = 4.6:1. White text
  in Ch.3 always over a 25% ink scrim gradient at text position.
- Focus states: 2px `--accent-red` offset ring (the rare red accent doubles as focus).
- `prefers-reduced-motion` per §5. Variant switcher = proper tabs. Moon = §6.1.
- Language: `lang="ja"` on JP nodes inside `lang="en"` shell (or ja shell — pick ja).

## 9. Responsive
- Breakpoints: 480 / 768 / 1080 / 1440.
- Mobile: chapter rail → top thread; plate layouts collapse to single column but
  KEEP asymmetry (alternate left/right margins, never centered feed); kanji depth
  reduces to 2 layers; pins become normal scroll (scrub only); dwell → first-tap
  reveals annotation, second tap follows link if any; hover states all have tap
  equivalents.
- Full-bleed Ch.3 scenes: `object-fit: cover` with per-scene `object-position` set
  to protect faces (manifest carries a `focus` field).

## 10. Performance budget
- JS ≤ 130KB gz total (GSAP core+ScrollTrigger ~80, Lenis ~10, app ≤40). No React,
  no Three.js in v1.
- Images: AVIF + WebP + JPEG fallback via `<picture>`; `loading="lazy"` below fold;
  LCP target < 2.5s (arrival is type-only → LCP is the title SVG, trivially fast).
- Fonts: Google CDN (JP auto-subset), `display:swap`, preconnect.
- 60fps: transforms/opacity only; `will-change` applied by GSAP; no layout thrash.

## 11. Tech stack & implementation notes
- **Vite 5 + vanilla TypeScript** (Node 18 compatible — do NOT use Vite 6+).
- **GSAP + ScrollTrigger**, **Lenis**. Hand-rolled CSS (custom properties, no Tailwind).
- Asset pipeline (Node 18, no system ImageMagick/poppler available):
  - PDF page rasterization: `pdfjs-dist@3.11.174` (legacy build) + `@napi-rs/canvas`.
  - Derivatives: `sharp` (prebuilt binaries fine on this WSL).
- Assets live in `site/public/assets/`; a generated `manifest.json` records
  `{ id, src variants, width, height, role, chapter, focus, alt, accent }`.
- Source art: `/home/jiaowh/shiro/白身魚/` — 44 jacket PNGs
  (`Screenshot 2025-06-03 2XXXXX.png`, ignore `*Zone.Identifier`), 6 JPGs
  (the album jacket JPG 2632×1950 is the only hi-res raster), and the 172MB PDF
  (split into 4-page chunks at `/tmp/pdfwork/chunk_*.pdf`, named by start page —
  if /tmp was cleared, re-run `/tmp/pdfwork/split.mjs` with
  `node --max-old-space-size=4096`).

## 12. Copy deck (do not invent Japanese beyond this)
| Key | JP | EN |
|---|---|---|
| title | 真昼の月 | The Midday Moon |
| subtitle | 白身魚 自選イラスト集 | Selected illustrations by Shiromizakana |
| arrival-line | 空にはいつも、見えない月がある。 | There is always an unseen moon in the sky. |
| ch1 | Chapter.1 girl meets girl | — |
| ch2 | Chapter.2 Novel illustration | — |
| ch3 | Chapter.3 ナナブンノニジュウニ | 22/7 |
| ch4 | Chapter.4 ラフと画材 | Rough & materials |
| finale-obi | あなただけが、いつも私を見つけてくれる。 | Only you ever find me. |
| moon-found | 月を見つけた | you found the moon |
| moon-counter | MOON N/6 | — |
| postcard-title | 読者カード | POST CARD |
| postcard-note | 切手は不要なので送ってね! | no stamp needed |
| postcard-send | 送る | send |
| album-cursive | — | An eternal prime number named 11. |
| credit | All artwork © 白身魚(堀口悠紀子)/『真昼の月』復刊ドットコム 2020 — unofficial tribute | — |
