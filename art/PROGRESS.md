STATUS: COMPLETE

# Salon redesign — progress ledger

Run: 2026-09-30 03:00–06:50 SGT (scheduled; no stopping deadline was supplied, so this was one
bounded pass). The site is in a working, tested state; everything below is resumable.

## Current checkpoint (06:50)

- `explore.html` — redesigned image-first gallery, **1,804 verified unique works** from 183 artists
  (235 artists in total incl. study-only entries and artists without verified images).
  Snapshot: `build/snapshots/explore.final.html` (earlier: checkpoint1–4).
- Validation: `build/validation.txt` — 44/44 real-browser acceptance checks; `node build/smoke.js`
  clean. Screenshots: `build/screenshots/` (desktop, tablet, mobile, artist, viewer, study, panel).
- Reports: `COLLECTION_REPORT.md` (before/after, depth, verification), `RESEARCH_LOG.md` (sources,
  reasons, discoveries). Build docs: `build/README.md`.

## Blocked — needs user

Nothing blocked the run. Decisions taken without asking (all reversible):
- Historical artists (Zorn, Whistler, Sargent, Homer, 吉田博, Hammershøi, Cassatt) got a new
  **Earlier** view instead of being filed under Contemporary; Fechin, Koiso and Kamoi appear in
  both. Remove `past` from `app.js` VIEWS/TAB_ORDER to drop the tab.
- Study defaults to the “Where to study” guide; “Teachers’ work” is the image feed.
- Four “(character design)” covers were excluded as mis-attributed (`build/data/exclusions.json`).
- pixiv `embed.pixiv.net` images from earlier research (1200×630 crops) were kept but flagged.

## How to resume

    cd /home/jiaowh/art
    # add candidates → build/data/works/<batch>.json (see build/README.md, research tools)
    python3 build/build.py --verify && python3 build/thumbs.py && python3 build/build.py
    LD_LIBRARY_PATH=~/.local/chromelibs/root/usr/lib/x86_64-linux-gnu node build/browser_probe.js
    python3 build/build.py && node build/smoke.js
    LD_LIBRARY_PATH=~/.local/chromelibs/root/usr/lib/x86_64-linux-gnu \
      FONTCONFIG_FILE=~/.local/chromelibs/fonts.conf node build/browser_check.js
    python3 build/report_md.py && python3 build/research_log_md.py

## Continuation queue (next research, in priority order)

1. **Thin core illustrators** (covers only today): loundraw, 白身魚, 深崎暮人, LAM (1 work after the
   exclusion), redjuice, abec, よむ, ねこじら, DSマイル. No usable official feed found yet: ArtStation
   is behind Cloudflare, pixiv originals need a referer, KADOKAWA search renders client-side. Try:
   official exhibition sites / art-book publisher pages; rendering KADOKAWA author pages in the
   browser with the correct query (the `auth=` search returned nothing).
2. **Thin core painters**: 森本草介 5, 生島浩 4, 三重野慶 4, 岡靖知 6, 島村信之 6, Marshennikov 8,
   鴨居玲 8 (石川県立美術館 collection pages: crawl more `data_id` detail pages), 小磯良平 5 (神戸市立
   小磯記念美術館), Kassan 6 (davidkassan.com 403 — try galleries), Richard Schmid 7 (site 403),
   Casey Baugh 8 (official site is a single page).
3. **Enrich painters with 0–2 works**: Li Guijun, He Duoling, Chen Yifei, Wang Yidong (Christie's/
   Sotheby's images fail — look for museum or artist pages), Mao Yan 1, Ruriko Matsunaga 2,
   Eloy Morales 2, Gaia Yoel 2, Nicolás Fasolino 2, Tomás Ortolani 2, Alon Martsiano 2.
4. **Study teachers without images** (48 of 70, many are schools): Vincent Desiderio, Michael Van
   Zeyl (site shows only installation photos), Kerry Dunn, Lea Colie Wight, Jeff Watts, Daniel
   Gerhartz and Michelle Dunaway (official sites behind Cloudflare), Vanessa Lemen (Cloudflare),
   Stephen Bauman (site shows course material only), Divya Marie Kato (workshop photos).
5. **Fechin via Wikimedia**: ~18 more Commons files were not yet reviewed (portraits of
   Sapozhnikova, Medvedev, Ovsyannikov, Popova, sketches) — re-run
   `python3 build/research.py commons "Category:Paintings by Nikolai Fechin"` and sheet them slowly
   (Wikimedia rate-limits bursts; the tools already send an identifying UA and space requests).
6. **More discovery** (the Bluesky route works well): 白浜鴎's feed has more; candidates seen but
   not yet reviewed: Rosuuri, Katherine Lam, いとうのいぢ, 咲良ゆき (skipped: mostly fan/moe work),
   Ryan Pancoast, Arthur Baron-Clément, houndsaint (lino prints), 麗しの空 (sky paintings).
7. Stretch target 2,500 not reached (1,804); ~700 more would need items 1–6.

## Rejected / not worked around

ArtStation, AIC IIIF images (Cloudflare), Hoki Museum WP API (403), christies.com (timeouts),
Sotheby's brightspot (fails in browser), richardschmid.com / davidkassan.com / susanlyon.com /
scottburdick.com / gallery1261.com / abendgallery.com (403). Wrong-person domains:
michelledunaway.com, nicolasuribe.com, marshennikov.com (parked).

## Log
- 03:05 Baseline confirmed. Headless Chromium set up (local libs in ~/.local/chromelibs; see build/README).
- 03:20 **Checkpoint 1 — redesign live on existing data.** New sources: build/template.html,
  build/app.js, build/build.py (rewritten), build/verify.py (fetch+dims+dhash cache),
  build/browser_probe.js (in-browser image gate), build/browser_check.js (44 acceptance
  checks, all passing), build/smoke.js (data invariants). Seed lists moved from block.js to
  data/seed_*.json; block.js + swaputil.py kept in build/legacy/ (no longer used).
  Existing 725 records → 699 usable (16 fetch failures: 10 christies.com timeouts, 3 too-small
  thumbs, 3 other; 10 sothebys brightspot URLs pass fetch but fail inside the browser).
  Snapshot: build/snapshots/explore.checkpoint1.html.
- 04:10 Research batch b01_depth (official portfolios): Nick Alm +28, Sprick +22, Monks +28,
  Zoey Frank +25, Silverman +26, Ferri +26, Davidson +10, Wylie +9, Drukker +12, Klingspor +9,
  Knoop +15. Titles from the sites' own captions/file names; unknown left blank.
- 04:25 Found usable illustrator source: artists' own Bluesky posts (public API; official
  accounts confirmed by self-links/“本人”). b02_illus: Yoneyama +28, Mika Pikazo +21,
  Shigure Ui +12, Kantoku +8, Mochizuki +6, Naoki Saito +18.
  Blocked/unsuitable: ArtStation (Cloudflare challenge — not bypassed); pixiv originals need a
  referer (fail embedded); pixiv embed.pixiv.net images are 1200×630 crops (existing ones kept,
  flagged); Wikimedia upload host rate-limited this IP after bursts (Commons queue deferred);
  christies.com times out; sothebys brightspot fails inside the browser.
- Attribution fix: 4 “(character design)” covers were manga adaptations drawn by others →
  data/exclusions.json.
- 05:05 Checkpoint 2 (1,214 works; 44/44 browser checks) → build/snapshots/explore.checkpoint2.html.
- 05:20 Thumbnails: build/thumbs.py records source-published smaller renditions (Squarespace
  ?format=750w, WordPress sizes from the page's own srcset), hash-matched → avg feed image
  294 KB → ~200 KB.
- 05:30 b01_depth second pass: Assael +28, Lorca +13, Currie +15, Lipking +12, Frantzen +7,
  Ceylan +10, Mann +14, Bilmes +9, Escofet +5, Liberace/Malherbe/Perlmutter/French/Zener/
  Emrich/Samuels-Davis/Ortiz/Carbonell/Nakajima/Motoki +6–13 each.
  b02_illus: shikimi/Takehana/Hiten/Anmi/raemz +9–10 each (own Bluesky), nagabe +14 (new,
  exploratory). b03_museums (Cleveland Museum of Art CC0 API): Zorn 15, Whistler 9, Homer 8,
  Sargent 5, 吉田博 7, Hammershøi 1, Cassatt 2 → new “Earlier” view (also Fechin/Koiso/Kamoi).
  Blocked: AIC IIIF images (Cloudflare challenge); Met image host unreachable from here;
  marshennikov.com is a parked domain; richardschmid.com 403; davidkassan.com 403.
- 06:04 **Checkpoint 3 — 1,521 verified unique works, 164 artists with images (218 total).**
  44/44 browser checks, smoke clean. Snapshot build/snapshots/explore.checkpoint3.html.
  New this stretch: discovery illustrators via own Bluesky (toi8, Loish, Yuko Shimizu,
  James Jean, Kilian Eng, Sachin Teng, MANOdeMARINA, Canis Albus, Mengxuan Li), discovery
  painters via official/gallery pages (Henrik Aa. Uldalen, Șerban Savu, Harding Meyer,
  Michael Carson, Chie Yoshii, Joseph Lorusso), Fechin +11 (Commons, slow/identified UA),
  Study teachers: Jordan Sokol 12, Aristides 5, Hernes 5, Zin Lim 3, Adam Miller 2, Byrnes 1,
  Gurpide 1. Study aliases: “David Kassan”→David Jon Kassan, “三重野慶 Mieno Kei”→Kei Mieno.
  Rejected domains (not the artist): michelledunaway.com (a novelist), nicolasuribe.com (a
  speaker), marshennikov.com (parked). Hoki Museum WP API is 403 → only 1 new Morimoto.
- 06:25 **Checkpoint 4 — 1,725 verified unique works, 176 artists with images (230 total), 35 new
  artists (5 close / 20 adjacent / 10 exploratory).** 44/44 browser checks; smoke clean.
  Cards restructured: link and favourite button are now siblings (no button inside a link).
  Reports generated: COLLECTION_REPORT.md (build/report_md.py), RESEARCH_LOG.md
  (build/research_log_md.py + build/research_log_narrative.md). README rewritten.
