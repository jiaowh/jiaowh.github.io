r"""Build assets/moto/recs.js — the personal travel-recommendation dataset for explore.html.

Merges the curated region seed files (scratchpad/recs_*.py, each a `DATA=[...]` list),
dedupes (against itself and against the places already visited in journeys.js), then
enriches every place from Wikipedia's REST API:
  - exact coordinates      (page.coordinates)
  - a real thumbnail photo (page.thumbnail, upscaled to ~500px, hotlinked)
  - a real description     (page.extract, trimmed to ~2 sentences)
  - the Wikipedia URL

Nothing is fabricated: a place with no Wikipedia coordinates is DROPPED (and logged),
because the whole point is exact placement on the map.

  python assets/moto/recs_build.py            # reads scratchpad seeds -> recs.js
  python assets/moto/recs_build.py <seeddir>  # override seed dir

Resumable: every Wikipedia response is cached to <seeddir>/recs_cache.json, so a rerun
only fetches new/failed places. Misses are written to <seeddir>/recs_misses.txt.
"""
import json, re, sys, time, glob, os, unicodedata, urllib.request, urllib.parse, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "recs.js"
JOURNEYS = ROOT / "journeys.js"
SEEDDIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    r"C:\Users\Jiaow\AppData\Local\Temp\claude\c--Users-Jiaow-Documents-github-jiaowh-github-io"
    r"\209e65e3-8285-46d0-8f18-4e14f96b63c7\scratchpad")
CACHE = SEEDDIR / "recs_cache.json"
MISSES = SEEDDIR / "recs_misses.txt"
UA = "moto-vault-travel/1.0 (https://jiaowh.github.io; personal hobby project)"

# ---- country -> continent (tourist-sense buckets; 6 continents) -------------
_CONT = {
 "Asia": """Japan;South Korea;North Korea;China;Taiwan;Hong Kong;Macau;Mongolia;Thailand;
  Vietnam;Cambodia;Laos;Myanmar;Malaysia;Singapore;Indonesia;Philippines;Brunei;Timor-Leste;
  India;Nepal;Bhutan;Sri Lanka;Bangladesh;Pakistan;Maldives;Afghanistan;
  Uzbekistan;Kazakhstan;Kyrgyzstan;Turkmenistan;Tajikistan;
  Turkey;Iran;Iraq;Israel;Palestine;Jordan;Lebanon;Syria;
  United Arab Emirates;UAE;Oman;Saudi Arabia;Qatar;Bahrain;Kuwait;Yemen;
  Georgia;Armenia;Azerbaijan""",
 "Europe": """United Kingdom;UK;Ireland;France;Spain;Portugal;Italy;Germany;Switzerland;Austria;
  Netherlands;Belgium;Luxembourg;Malta;Norway;Sweden;Finland;Denmark;Iceland;
  Estonia;Latvia;Lithuania;Poland;Czechia;Czech Republic;Slovakia;Hungary;Romania;Bulgaria;
  Croatia;Slovenia;Bosnia and Herzegovina;Bosnia;Serbia;Montenegro;Albania;North Macedonia;Kosovo;
  Greece;Cyprus;Ukraine;Belarus;Moldova;Russia;
  Monaco;Vatican City;San Marino;Liechtenstein;Andorra;
  Isle of Man;Gibraltar;Faroe Islands;Jersey;Guernsey;Greenland""",
 "Africa": """Morocco;Egypt;Tunisia;Algeria;Libya;Ethiopia;Kenya;Tanzania;Uganda;Rwanda;Burundi;
  South Africa;Namibia;Botswana;Zimbabwe;Zambia;Mozambique;Malawi;Madagascar;Mauritius;Seychelles;
  Ghana;Senegal;Nigeria;Ivory Coast;Cote d'Ivoire;Mali;Sudan;Eswatini;Lesotho;Cameroon;Gabon;Benin;
  Angola;Djibouti;Democratic Republic of the Congo;DR Congo;Republic of the Congo;Congo;Chad;Niger;
  Mauritania;Somalia;Somaliland;South Sudan;Eritrea;Guinea;Guinea-Bissau;Burkina Faso;Togo;Sierra Leone;
  Liberia;Gambia;The Gambia;Cape Verde;Cabo Verde;Comoros;Equatorial Guinea;Central African Republic;Reunion""",
 "North America": """United States;USA;United States of America;Canada;Mexico;
  Guatemala;Belize;Honduras;El Salvador;Nicaragua;Costa Rica;Panama;
  Cuba;Jamaica;Dominican Republic;Haiti;Bahamas;Puerto Rico;Trinidad and Tobago;Barbados;
  Aruba;Curacao;Saint Lucia;Grenada;Antigua and Barbuda;Dominica;Martinique;Guadeloupe""",
 "South America": """Colombia;Ecuador;Peru;Bolivia;Chile;Argentina;Brazil;Uruguay;Paraguay;
  Venezuela;Guyana;Suriname;French Guiana""",
 "Oceania": """Australia;New Zealand;Fiji;French Polynesia;Papua New Guinea;Samoa;Tonga;Vanuatu;
  Solomon Islands;Palau;Micronesia;Kiribati;New Caledonia;Cook Islands;Guam;Marshall Islands""",
}
COUNTRY2CONT, COUNTRY_CANON = {}, {}
for cont, blob in _CONT.items():
    for c in re.split(r"[;\n]", blob):
        c = c.strip()
        if c:
            COUNTRY2CONT[c.lower()] = cont
_CANON = {"uk": "United Kingdom", "usa": "United States", "united states of america": "United States",
          "uae": "United Arab Emirates", "czech republic": "Czechia", "bosnia": "Bosnia and Herzegovina",
          "cote d'ivoire": "Ivory Coast", "s. korea": "South Korea", "korea": "South Korea"}

# home countries the rider has already thoroughly toured -> not recommended back to them.
# (edit this set to re-include a country.)
EXCLUDE_COUNTRIES = {"japan", "south korea"}


def canon_country(c):
    c = (c or "").strip()
    return _CANON.get(c.lower(), c)


def continent_of(country):
    return COUNTRY2CONT.get(canon_country(country).lower(), "Other")


# ---- load seeds -------------------------------------------------------------
def load_seeds():
    recs = []
    files = sorted(glob.glob(str(SEEDDIR / "recs_*.py")))
    for f in files:
        ns = {}
        try:
            exec(Path(f).read_text(encoding="utf-8"), ns)
        except Exception as e:
            print(f"  ! {Path(f).name}: parse error {e}")
            continue
        data = ns.get("DATA") or []
        print(f"  {Path(f).name}: {len(data)} entries")
        for d in data:
            if isinstance(d, dict) and d.get("n"):
                recs.append(d)
    return recs


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def slugify(s):
    s = unicodedata.normalize("NFKD", (s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"


def visited_names():
    if not JOURNEYS.exists():
        return set()
    t = JOURNEYS.read_text(encoding="utf-8")
    body = t.split("const JOURNEYS =", 1)[1].strip().rstrip(";")
    J = json.loads(body)
    return {norm(s["name"]) for j in J for s in j.get("stops", []) if s.get("name")}


# ---- Wikipedia --------------------------------------------------------------
def _get(url, tries=5):
    """GET JSON with backoff. Raises HTTPError(404) immediately (real miss);
    retries 429/5xx/timeouts; raises the last error only after all tries fail."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            last = e
        except Exception as e:
            last = e
        time.sleep(1.0 * (i + 1))  # 1s,2s,3s,4s backoff
    raise last if last else RuntimeError("fetch failed")


def wiki_summary(title):
    u = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(
        title.replace(" ", "_"), safe="")
    return _get(u)


def wiki_search_title(q):
    u = ("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch="
         + urllib.parse.quote(q))
    d = _get(u)
    hits = d.get("query", {}).get("search", [])
    return hits[0]["title"] if hits else None


def upscale(thumb):
    # https://upload.wikimedia.org/.../thumb/x/xx/Name.jpg/330px-Name.jpg  -> 500px
    if thumb and "/thumb/" in thumb:
        return re.sub(r"/\d+px-", "/500px-", thumb)
    return thumb


def trim(extract, n=270):
    e = (extract or "").strip()
    if len(e) <= n:
        return e
    cut = e[:n]
    dot = cut.rfind(". ")
    return (cut[:dot + 1] if dot > 120 else cut.rstrip() + "…")


def summary_ok(d):
    """A usable summary = has coordinates and isn't a disambiguation page."""
    return d and d.get("type") != "disambiguation" and d.get("coordinates")


def cached_summary(cand, cache):
    """Cache-aware Wikipedia summary. Stores dict on success, sentinel '404' for a real
    miss, and — crucially — caches NOTHING on a transient error (so a rerun retries it)."""
    key = "S::" + cand
    v = cache.get(key, "MISS")
    if v != "MISS":
        return None if v == "404" else v
    try:
        d = wiki_summary(cand)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            cache[key] = "404"
            return None
        raise
    cache[key] = d
    return d


def cached_search(sq, cache):
    key = "Q::" + sq
    v = cache.get(key, "MISS")
    if v != "MISS":
        return None if v == "none" else v
    st = wiki_search_title(sq)          # may raise on transient -> not cached
    cache[key] = st if st else "none"
    return st


def resolve(rec, cache):
    """Return enriched fields for one rec, using/refreshing the cache. None if unplaceable."""
    country = canon_country(rec.get("c", ""))
    for cand in [rec.get("w"), rec["n"]]:
        if not cand:
            continue
        try:
            d = cached_summary(cand, cache)
        except Exception:
            d = None
        if summary_ok(d):
            return _fields(rec, d)
    # search fallback: "<name> <country>"
    sq = (rec["n"] + " " + country).strip()
    try:
        st = cached_search(sq, cache)
    except Exception:
        st = None
    if st:
        try:
            d = cached_summary(st, cache)
        except Exception:
            d = None
        if summary_ok(d):
            return _fields(rec, d)
    return None


def _fields(rec, d):
    c = d["coordinates"]
    thumb = (d.get("thumbnail") or {}).get("source")
    return {
        "n": rec["n"].strip(),
        "c": canon_country(rec.get("c", "")),
        "cont": continent_of(rec.get("c", "")),
        "k": rec.get("k", "nature"),
        "lat": round(c["lat"], 6), "lng": round(c["lon"], 6),
        "why": (rec.get("why") or "").strip().rstrip("."),
        "desc": trim(d.get("extract")),
        "img": upscale(thumb) or "",
        "wiki": (d.get("content_urls", {}).get("desktop", {}) or {}).get("page", ""),
    }


# ---- main -------------------------------------------------------------------
def main():
    print("loading seeds from", SEEDDIR)
    raw = load_seeds()
    print(f"  total raw: {len(raw)}")
    visited = visited_names()
    print(f"  visited names to avoid: {len(visited)}")

    # dedupe by normalized name; drop places already visited or in excluded home countries
    seen, recs, skipped_visited, skipped_excluded = set(), [], 0, 0
    for r in raw:
        if canon_country(r.get("c", "")).lower() in EXCLUDE_COUNTRIES:
            skipped_excluded += 1
            continue
        nk = norm(r["n"])
        if nk in visited:
            skipped_visited += 1
            continue
        if nk in seen:
            continue
        seen.add(nk)
        recs.append(r)
    print(f"  after dedupe: {len(recs)}  (dropped {skipped_visited} already-visited, "
          f"{skipped_excluded} in excluded countries {sorted(EXCLUDE_COUNTRIES)})")

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    before = len(cache)
    cache = {k: v for k, v in cache.items() if v is not None}  # drop legacy transient failures -> retry
    if before != len(cache):
        print(f"  cache: purged {before-len(cache)} prior failed fetches to retry; {len(cache)} kept")
    out, misses = [], []
    done = 0

    def dump():
        try:
            CACHE.write_text(json.dumps(dict(cache), ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass

    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(resolve, r, cache): r for r in recs}
        for fut in as_completed(futs):
            r = futs[fut]
            done += 1
            try:
                f = fut.result()
            except Exception:
                f = None
            if f:
                out.append(f)
            else:
                misses.append(f"{r['n']}  ({r.get('c','?')}, k={r.get('k','?')}, w={r.get('w','')})")
            if done % 80 == 0:
                print(f"    enriched {done}/{len(recs)} ... (placed {len(out)})")
                dump()
    dump()

    # stable unique ids + sort by continent, country, name
    out.sort(key=lambda x: (x["cont"], x["c"], x["n"].lower()))
    used = {}
    for x in out:
        base = slugify(x["n"])
        s = base
        while s in used:
            used[base] = used.get(base, 1) + 1
            s = f"{base}-{used[base]}"
        used.setdefault(s, 1)
        x["id"] = s
    # reorder keys for readability
    order = ["id", "n", "c", "cont", "k", "lat", "lng", "why", "desc", "img", "wiki"]
    out2 = [{k: x[k] for k in order} for x in out]

    body = "[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in out2) + "\n]"
    header = ("/* ================================================================\n"
              "   EXPLORE — personal worldwide travel recommendations for explore.html.\n"
              "   Auto-built by assets/moto/recs_build.py from region seed lists +\n"
              "   Wikipedia (real coords / photo / description; nothing fabricated).\n"
              "   Re-run that script to regenerate. Each rec:\n"
              "     {id,n(ame),c(ountry),cont(inent),k(category),lat,lng,why,desc,img,wiki}\n"
              "   categories: geek nature vista temple road museum park onsen\n"
              "   ================================================================ */\n")
    OUT.write_text(header + "const RECS =\n" + body + "\n;\n", encoding="utf-8")

    if misses:
        MISSES.write_text("\n".join(sorted(misses)), encoding="utf-8")

    # report
    from collections import Counter
    bycont = Counter(x["cont"] for x in out2)
    bycat = Counter(x["k"] for x in out2)
    noimg = sum(1 for x in out2 if not x["img"])
    print(f"\nwrote {OUT}")
    print(f"  placed: {len(out2)}   missed (no wiki coords, dropped): {len(misses)}   no-image: {noimg}")
    print("  by continent:", dict(bycont))
    print("  by category :", dict(bycat))
    if misses:
        print(f"  misses logged to {MISSES}")


if __name__ == "__main__":
    main()
