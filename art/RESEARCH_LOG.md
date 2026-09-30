# Research log

Research pass of 30 September 2026 (started 03:00 SGT, scheduled run, no stopping deadline
supplied → one bounded pass). Tables at the end are generated from the data by
`build/research_log_md.py`; this narrative is `build/research_log_narrative.md`.

## How works were chosen

1. **Candidates** came only from places that show the artist's own work: the artist's official
   site, their gallery's artist page, a museum open-access API, or the artist's own posts on
   Bluesky (accounts confirmed as official: they link the artist's site/pixiv/X, say they are
   the person — e.g. 「本人です」 — or post exhibition and shop announcements for their own
   work). Aggregators were used only as leads.
2. **Every candidate was fetched** (`verify.py`): status, content type, decodes, size,
   dimensions and a difference hash. Then **looked at**: numbered contact sheets were reviewed
   by eye, and installation shots, studio photos, merch, magazine covers, event photos,
   “SAMPLE”-watermarked product shots, crops that duplicate a full image, and other artists'
   works on shared gallery pages were left out.
3. **Attribution and captions** were taken from the source only: site captions and alt text,
   the artist's own file names (e.g. `basement-door-2022-oil-on-canvas-…` → “The basement door”,
   2022, oil on canvas), Bluesky post text when it names the work (“EGO - Id (2020)”), or
   museum records. When the source gives no title the title is blank; nothing was invented.
   Original-script names were only added when the source shows them; romanisations that
   would have been guesses were not used (e.g. 「コーラ」, 「すり餌」 stay in Japanese).
4. **In-browser check** (`browser_probe.js`): every image was loaded inside Chromium from a
   `file://` page, since some hosts serve scripts but refuse embedded images.

## Balance

The brief asked for roughly 60 % depth on established interests, 30 % adjacent discovery,
10 % wildcards. In practice:

- **Depth first.** Seed and earlier-suggested artists were deepened from their own portfolios
  (Nick Alm, Sprick, Monks, Frank, Silverman, Ferri, Assael, Lorca, Currie, Lipking, Mann,
  Fechin …) and, for illustrators, their own Bluesky posts (米山舞, Mika Pikazo, しぐれうい,
  カントク, 望月けい, さいとうなおき, しきみ, 竹花ノート, Hiten, Anmi, raemz). Study teachers
  gained their first images (Jordan Sokol, Aristides, Hernes, Byrnes, Adam Miller, Zin Lim,
  Gurpide, Blokhin's own site).
- **Adjacent discoveries** share one strong quality and differ elsewhere: luminous landscape
  illustration without the figure (mocha, ゆずききの, Mengxuan Li), luminous illustration from
  outside the Japanese idiom (Loish, James Jean, 白浜鴎), graphic designed colour (MANOdeMARINA,
  Sachin Teng, Yuko Shimizu), staged figuration (Chie Yoshii, Annie Stegg Gerard, Michael C
  Hayes, Henrik Aa. Uldalen), paint handling (Arthur Gain, Harding Meyer, Michael Carson).
- **Wildcards** stretch subject, era or medium on purpose: prints (吉田博's night canals,
  Whistler's etched nocturnes, Daniel Danger's screen prints, Mary Cassatt), a two-colour manga
  artist (ながべ), dogs as devotional icons (Canis Albus), sci-fi atmosphere in oil and print
  (Wayne Haag, Kilian Eng), a Romanian landscape painter of small figures (Șerban Savu), and a
  grey Hammershøi interior. Historical works live in a separate **Earlier** view rather than
  being mislabelled Contemporary.
- Not over-fitted: several additions have no woman, no realism, no Japanese idiom and no
  melancholy (Kilian Eng, Canis Albus, Daniel Danger, Winslow Homer's sea watercolours).
- The 48 painters the user cut earlier were not re-added.

## Sources that worked

- Artist sites (WordPress, Squarespace, Wix) and gallery artist pages (Arcadia Contemporary,
  Forum Gallery, Flowers, Nicodim, JD Malat, Bonner David, Galeries Bartoux).
- Bluesky public AppView API (`public.api.bsky.app`) for artists' own posts; images on
  `cdn.bsky.app` with API-provided thumbnails.
- Cleveland Museum of Art open-access API (CC0) for Zorn, Whistler, Homer, Sargent, 吉田博,
  Hammershøi, Cassatt.
- Wikimedia Commons (Fechin) — only with an identifying User-Agent, one request at a time.

## Sources that did not, and why (not worked around)

| source | problem |
|---|---|
| ArtStation | Cloudflare challenge for scripts |
| pixiv originals (`i.pximg.net`) | require a pixiv referer — fail when embedded |
| pixiv `embed.pixiv.net` card images | 1200×630 crops of the artwork; not used for new additions |
| Art Institute of Chicago IIIF images | Cloudflare challenge (API metadata works, images do not) |
| The Met image host | unreachable from this machine during the run |
| Hoki Museum WordPress API | 403; page crawl yielded one new captioned Morimoto |
| christies.com lot images | time out |
| Sotheby's brightspot CDN | fetches in a script, fails inside the browser |
| KADOKAWA product search | results rendered client-side; no reliable author-role listing |
| richardschmid.com, davidkassan.com, mia bergeron, nathanfowkes.com | 403 / challenge |
| Wikimedia upload host | rate-limited this IP after bursts; resumed later at low rate |

Domains rejected because they are **not the artist**: `michelledunaway.com` (a novelist),
`nicolasuribe.com` (a keynote speaker of the same name), `marshennikov.com` (parked domain).

## Attribution corrections

Four covers previously credited to LAM, さいとうなおき, 中央東口 and Nardack were manga
adaptations drawn by other artists (the listed artist had only the character-design credit;
KADOKAWA product pages name 杉基イクラ, 双葉陽, 九二枝 and 成瀬ちさと). They are kept out via
`build/data/exclusions.json`.

## New artists (40)

Classification is research metadata only — it is not shown on gallery cards.

| artist | tab | class | works on page | why it belongs |
|---|---|---|---:|---|
| Arthur Gain | cont | close | 12 | Alla prima portraits with visible, confident brushwork — the Schmid/Blokhin handling in the present tense, and a working teacher. |
| Casey Childs | cont | close | 14 | The hush in an American key — a figure alone in a room with one source of light, soft edges and a still, withheld mood. |
| Henrik Aa. Uldalen | cont | close | 3 | Staged, lit figures against darkness — the Currie/Lorca line — but with the figure literally breaking up into brushwork. |
| Quang Ho | cont | close | 16 | The Schmid/Lipking handling at full strength — shapes, edges and colour doing the work, with the same painterly ease across figures, snow and flowers. |
| mocha | illu | close | 14 | loundraw's atmosphere with the figure almost gone: skies, reflections and station platforms at dusk — light and air as the whole subject. |
| toi8 | illu | close | 10 | The Kantoku/深崎暮人 idiom with more air and less rendering — pale line, pale light, figures that sit quietly in the white of the page. |
| はねこと | illu | close | 12 | The backlit after-school idiom of カントク and 深崎暮人 — soft rim light, reflections, sunflowers — but with more sky and water around the figure. |
| ゆずききの | illu | close | 5 | The weightless, high-key light of loundraw and 白身魚 at its most distilled — cloud, moon and water in pale blues. |
| Anders Zorn | past | adjacent | 15 | The bravura-line ancestor of Fechin and Nick Alm, and bathers in moving water — the Monks/Mieno interest in figures seen through water, drawn with a needle instead of a brush. |
| Annie Stegg Gerard | cont | adjacent | 12 | Staged, lit figures in the Lorca/Ferri line, but pastoral rather than dark: folklore theatre in a Rococo palette. |
| Chie Yoshii | cont | adjacent | 12 | Theatrical, staged figuration (Lorca, Ferri) crossed with Japanese folk tales — ornament and invented colour in oil. |
| Harding Meyer | cont | adjacent | 8 | The face seen through something again — here the interference is the brushwork itself, like Mieno's water rebuilt as paint marks. |
| James Jean | illu/cont | adjacent | 8 | Sits on the line between the two tabs: painted on canvas, but with an illustrator's invented colour and ornament — luminous without being photographic. |
| James McNeill Whistler | past | adjacent | 9 | Haze and night as the whole subject — the atmosphere side of the collection (Baugh, Mieno) a century earlier, with almost nothing described. |
| John Singer Sargent | past | adjacent | 5 | The source Lipking and Schmid both point back to: alla prima confidence and light on white fabric. |
| Joseph Lorusso | cont | adjacent | 6 | Lamplight and interior warmth — the quiet-figure line with amber light instead of Morimoto's grey. |
| Kamome Shirahama (白浜鴎) | illu | adjacent | 8 | Luminous illustration by way of pen-and-ink: ornamental line and printed-looking colour, closer to golden-age book illustration than to anime rendering. |
| Loish | illu | adjacent | 16 | Luminous illustration from outside the Japanese idiom: backlit figures, water and starlight done as designed colour and flowing shape rather than rendered detail. |
| MANOdeMARINA (まのでまりな) | illu | adjacent | 12 | Designed colour reduced to two or three flat inks and a lot of white — the graphic-invention pole (Mika Pikazo, redjuice) crossed with poster design. |
| Mengxuan Li | illu | adjacent | 7 | Light and colour carrying the whole picture with the figure small or absent — the loundraw instinct applied to plants and water. |
| Michael C Hayes | cont/illu | adjacent | 12 | Theatrical figures lit against darkness, painted for fantasy illustration — illustration that is traditional oil and charcoal. |
| Michael Carson | cont | adjacent | 12 | Nick Alm's social scenes and Assael's caught-not-posed figures, with more graphic, flattened grounds and fashion-plate poise. |
| Sachin Teng (晴晴) | illu | adjacent | 7 | Graphic invention and pattern — cover work with the same designed-colour logic as redjuice and Mika Pikazo, drawn from a different tradition. |
| Vilhelm Hammershøi | past | adjacent | 1 | Sprick's 'air doing something' in a room, pushed to silence — the Morimoto hush without the figure. |
| Yuko Shimizu | illu | adjacent | 12 | Graphic invention in ink: the energy and designed colour of the Yoneyama/Mika Pikazo pole, but carried by a brush line with ukiyo-e ancestry. |
| すり餌 | illu | adjacent | 9 | Line-led, near-monochrome figures with a few spot colours — graphic restraint (redjuice) crossed with the delicacy of the hush cluster. |
| ときわた | illu | adjacent | 6 | Designed colour held to one palette — the LAM/redjuice discipline of a limited, artificial colour scheme. |
| ぶくろて | illu | adjacent | 8 | Graphic invention in character design: flat colour, sharp silhouettes and a lot of white — closer to fashion plates than to rendered anime. |
| わいっしゅ | illu | adjacent | 12 | Dense, lamplit cityscapes and towers in haze — atmosphere and light built as architecture, the background craft behind luminous illustration. |
| コーラ | illu | adjacent | 3 | Night reflections and low sun painted by someone whose job is atmosphere — the background-art craft behind the luminous-illustration idiom. |
| Canis Albus | illu | exploratory | 9 | Wildcard: staged, theatrical solemnity (the Kamoi/Ferri appetite for performed feeling) transposed onto dogs in the format of religious icons — deadpan, tender and odd. |
| Daniel Danger | illu | exploratory | 2 | Printmaking wildcard: night atmosphere from a few flat inks — Whistler's nocturnes as a screen print. |
| Hiroshi Yoshida (吉田博) | past | exploratory | 6 | Printmaking wildcard: lamplit canals and night streets built from flat, graded woodblock colour — atmosphere and light without a figure, from the same country as the hush cluster. |
| Kilian Eng | illu | exploratory | 9 | Wildcard: no figures to speak of, but atmosphere and designed colour at full strength — haze, scale and a strictly limited print palette. |
| Mary Cassatt | past | exploratory | 2 | Quiet domestic figures in printmaking — the hush cluster's subject in line and flat colour. |
| Wayne Haag | illu | exploratory | 10 | Wildcard: vast hazy landscapes and tiny figures — atmosphere and scale over portraiture, painted in oil by a film concept artist. |
| Winslow Homer | past | exploratory | 8 | Water and weather handled in transparent washes — light on the sea as the subject; also a painter who began as a magazine illustrator. |
| nagabe (ながべ) | illu | exploratory | 14 | Designed colour taken to its most economical: red, black and jade, hard graphic shadow, almost screen-print. Shares the graphic-invention pole (Mika Pikazo, redjuice) but with none of the luminous-girl idiom — a deliberate stretch in subject and palette. |
| Șerban Savu | cont | exploratory | 14 | Atmosphere and quiet at landscape scale: haze, muted light, small figures — the hush without a close-up face, in a subject the collection had never touched. |
| こまちみゆた | illu | exploratory | 12 | Traditional illustration with a light, patient brush — quiet like the hush cluster, but botanical, humorous and hand-painted rather than rendered. |

Balance of new artists: adjacent 22, exploratory 10, close 8.

## Additions by research batch

| batch file | artists | works on page |
|---|---:|---:|
| `works/b01_depth.json` | 33 | 449 |
| `works/b02_illus.json` | 13 | 157 |
| `works/b03_museums.json` | 7 | 46 |
| `works/b04_discover.json` | 35 | 335 |
| `works/b05_study.json` | 10 | 122 |
