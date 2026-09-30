# art/index.html build

`../index.html` is **generated** and served at https://jiaowh.github.io/art/ (the old
`explore.html` is a redirect stub). Edit the sources here, then rebuild. Open the result
directly in a browser (`file://…/index.html`); no server is needed.

    python3 build/build.py             # rebuild from sources (offline; uses cached checks)
    python3 build/build.py --verify    # also fetch-check any image URL not yet verified
    python3 build/thumbs.py            # find lighter feed images published by the same sources
    node    build/browser_probe.js     # load every used image inside Chromium; failures drop out
    node    build/smoke.js             # fast data invariants on the generated file
    node    build/browser_check.js --shots DIR   # 44 real-browser acceptance checks (+ screenshots)
    python3 build/report_md.py         # regenerate ../COLLECTION_REPORT.md
    python3 build/meta.py              # per-work details (size, medium, collection, notes) → data/work_meta.json
    python3 build/motif_sheets.py DIR  # numbered contact sheets for works without a Subject line

Typical full cycle after adding research data:

    python3 build/build.py --verify && python3 build/thumbs.py && python3 build/build.py \
      && node build/browser_probe.js && python3 build/build.py && node build/smoke.js \
      && python3 build/report_md.py

## Sources of truth

| file | what it is |
|---|---|
| `template.html` | page shell + all CSS. `/*DATA*/` and `/*APP*/` are the injection points. |
| `app.js` | the whole runtime: feeds, masonry, routes, artist pages, viewer, favourites, settings |
| `data/seed_painters.json`, `data/seed_illus.json` | the original hand-written lists (moved out of the old `block.js`) |
| `data/enrich_*.json`, `data/works_*.json` | earlier research, unchanged |
| `data/study.json` | Study tab groups (unchanged); `data/study_alias.json` merges study names that are the same person as an existing artist |
| `data/artists_new.json` | artists added in later research, each with `disc` (close / adjacent / exploratory) and a one-line `reason` |
| `data/artist_meta.json` | per-artist extras: official links, aliases, extra tabs |
| `data/works/*.json` | research batches `[{"n": artist, "works": [{img, th?, src, t?, ten?, y?, med?, lic?}]}]` |
| `data/work_meta.json` | written by `meta.py`: per-image details from the work's own source — museum API (CMA), Wikimedia Commons, the artist's Bluesky post / pixiv caption, publisher page (KADOKAWA/honto), or the portfolio caption / file name. Never guessed; unknown stays absent |
| `data/work_motifs.json` | `{image URL: subject line}` — what the picture visibly shows, written by looking at each work (motif_sheets.py) |
| `data/exclusions.json` | image URLs deliberately kept off the page, with the reason (e.g. wrong attribution) |
| `data/thumbs.json` | written by `thumbs.py`: `{full image URL: lighter rendition}` |
| `cache/verify.json` | one record per image URL: status, type, final URL, bytes, w×h, dHash, time |
| `cache/browser.json` | in-browser load result per image URL |
| `legacy/` | the old `block.js` + `swaputil.py` splice pipeline, kept for reference only |

Only works whose image has an OK record in **both** caches reach the page. Nothing is
truncated: every verified work of an artist is published (the old 8-per-artist cap is gone).

## Rules

- **Never add an artwork URL that has not been fetched.** `verify.py` records HTTP 200,
  `image/*`, a decodable image with a short side ≥ 160 px, its dimensions and a difference hash.
- **A URL that works in a script can still fail on the page** (bot checks, hotlink rules,
  ORB). `browser_probe.js` loads each image in Chromium the way the page does and the build
  drops failures. Test browsers must not announce `HeadlessChrome` — some CDNs refuse it.
- **Attribution is checked separately from the image.** Titles, years and media come only from
  the source (its captions, alt text or the artist's own file names); unknown stays blank.
  Cover images credited as “character design” only are excluded.
- Be polite: ≤ 2 concurrent requests per host (1 for Wikimedia, with an identifying
  User-Agent and spacing), timeouts, backoff on 429/5xx. Do not work around access controls
  (ArtStation, the Art Institute of Chicago image server and the Hoki Museum API are behind
  challenges or 403 and are not used).
- Thumbnails are only renditions the source itself publishes (Squarespace `?format=750w`,
  WordPress sizes found in the page's own srcset, Bluesky/Wikimedia/museum API thumbnails),
  and each must match the full image's hash.

## Research tools (development only — the published page never crawls)

- `research.py page URL…` / `commons CATEGORY` / `sheet cands.json out.jpg` — candidate images,
  Wikimedia categories, numbered contact sheets for visual review.
- `gather.py plan.json OUTDIR` — pull candidates from official pages (optionally a bounded
  same-site crawl), verify, de-duplicate against the collection, make contact sheets.
- `bsky.py find NAME` / `feed HANDLE OUT` — an artist's own posts from Bluesky's public API
  (reposts skipped; the account must be confirmed as official first).
- `museum.py cma|aic|met NAME OUT` — museum open-access APIs (public-domain only).
- `curate.py` / `bsky_curate.py` — copy chosen candidates into `data/works/<batch>.json`.
- `clean_titles.py` — split gallery captions ("Title, 36x48", oil on canvas, 2025") into fields.

The headless browser used here is Playwright's `chromium_headless_shell`; on this machine its
missing system libraries (nss, nspr, asound) and CJK fonts were unpacked without root into
`~/.local/chromelibs` — run with
`LD_LIBRARY_PATH=~/.local/chromelibs/root/usr/lib/x86_64-linux-gnu FONTCONFIG_FILE=~/.local/chromelibs/fonts.conf`.

## Page behaviour worth knowing

- Tabs: Painters (`cont`, includes the historical masters), Illustrators (`illu`), Study. The All and
  Earlier tabs were removed 2026-09-30; `#/all` and `#/past` land on Painters.
- Clicking a work opens its artist page: the work large with a details panel (year, medium, size,
  subject, collection, notes, source), the artist's info beside it, and all their works below —
  clicking one of those swaps the details in place (URL follows); the viewer shows the same details.
- Routes: `#/cont #/illu #/study` (guide) `#/study/works #/favs #/artists
  #/artist/<id>[/w/<workId>]`. Artist and work ids are stable slugs/hashes.
- Each feed is a balanced shuffle (per-artist spacing, no long runs), seeded per visit;
  scrolling appends batches and never reorders; the end of the pool offers another shuffled
  pass marked with a divider. Back/forward restore order, loaded count and scroll.
- localStorage: `salon:favs` (favourite work ids), `salon:hidden` (artist ids; the legacy
  `salon:hiddenDir` names are read and kept in sync), `salon:density`. sessionStorage keeps
  feed state for back/forward reloads. All storage access is guarded.
