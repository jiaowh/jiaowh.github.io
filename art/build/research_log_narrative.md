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
