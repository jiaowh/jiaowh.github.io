r"""Harvest every notable, photographed place on Earth from Wikidata -> places.json.

Why this exists
---------------
recs.js was built from hand-written "famous places per region" seed lists. Curation by
recall has a blind spot: anything the curator never thought of is invisible. Ch'iyar Quta
(Q94803) -- a photographed Andean lake with a 5-language Wikipedia article and exact
coordinates -- was simply never on such a list, so the map never knew it existed.

This script inverts that. It enumerates places from Wikidata *systematically*, country by
country, and removes what is clearly not a destination (settlements, admin units, airports,
schools...). Nothing is included because someone remembered it, and nothing is excluded
because someone forgot it.

Gate (chosen with the site owner): >= 5 Wikipedia language versions AND a photo (P18) AND
exact coordinates (P625) AND an English Wikipedia article. Ch'iyar Quta clears it at 6.

Pipeline (each stage cached to --work, so any run is resumable and re-runs are cheap):
  1 geo    SPARQL per country: item, coords, image, sitelink count. Splits the sitelink
           range in half and retries on failure, so big countries shard themselves.
  2 types  SPARQL per country: item -> P31 type QIDs, used to classify and to throw out
           everything that is not a destination.
  3 names  SPARQL per country: item -> en-wiki article title. One query per country rather
           than wbgetentities 50-at-a-time, which the API throttled to a crawl.
  4 emit   classify into explore.html's 8 categories, drop non-destinations, write
           places.json. Descriptions and photos are deliberately NOT stored: the page
           fetches both from the article-summary endpoint when a place is opened, which is
           what keeps ~90k places down to a few MB.

  python assets/moto/wiki_harvest.py --countries <countries.json> --work <dir>
  python assets/moto/wiki_harvest.py ... --only Q750,Q711     # a few countries
  python assets/moto/wiki_harvest.py ... --stage emit         # re-emit from cache only

Not missing anything is the whole point, and the thing most likely to break it is that
WDQS does not fail loudly. Past its internal time limit it returns 200 OK with only the
rows it managed to produce, appending a Java stack trace to the body (or sending nothing
at all) -- indistinguishable from success to an HTTP client. That alone had quietly cost
Poland ~18k places, the United States ~35k, and Russia all but 198 of 21,624 type rows.
So completeness is defended in layers:
  - sparql_csv treats an empty body or an appended stack trace as an error, so truncation
    raises instead of passing as data;
  - a band that fails is halved and retried, and every band that succeeds is cached on its
    own, so the largest countries converge across several interrupted runs;
  - a country whose bands did not ALL succeed is never cached, so it is retried rather than
    keeping whatever subset arrived first;
  - each country is checked against a COUNT query (cached, since it is the expensive part),
    and one that disagrees has its shards discarded and is refetched;
  - where COUNT is itself too expensive to answer, geo and types are cross-checked against
    each other, since types is a superset of geo by construction;
  - a country that yields zero places is reported at the end instead of passing silently.
"""
import argparse, csv, io, json, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

UA = "moto-vault-travel/1.0 (https://jiaowh.github.io; personal travel map)"
WDQS = "https://query.wikidata.org/sparql"
WDAPI = "https://www.wikidata.org/w/api.php"
MIN_SITELINKS = 5
SL_CAP = 600  # upper bound when halving an open-ended sitelink range

GEO_Q = """
SELECT ?item ?coord ?img ?sl WHERE {
  ?item wdt:P17 wd:%(c)s ; wdt:P625 ?coord ; wdt:P18 ?img ; wikibase:sitelinks ?sl .
  FILTER(?sl >= %(lo)d && ?sl <= %(hi)d)
  %(extra)s
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}
"""

# No en-wiki join here on purpose. The geo query already applies that gate, and types are
# only ever read for items geo returned, so re-joining the article here bought nothing and
# made the query so expensive that WDQS answered 200 OK with an empty body for France.
# The result is a superset of geo, which the intersection at emit time discards.
TYPE_Q = """
SELECT ?item ?type WHERE {
  ?item wdt:P17 wd:%(c)s ; wdt:P625 ?coord ; wdt:P18 ?img ; wikibase:sitelinks ?sl ; wdt:P31 ?type .
  FILTER(?sl >= %(lo)d && ?sl <= %(hi)d)
  %(extra)s
}
"""

POINT = re.compile(r"Point\(([-\d.eE]+)\s+([-\d.eE]+)\)")

# Names come from SPARQL, one query per country, NOT from wbgetentities. Fetching them
# 50 ids at a time needed ~1900 calls and the API throttled it down to a few thousand
# labels per run -- hours of work. This returns a whole country in one response, and the
# en-wiki article title is exactly what the page needs anyway: it doubles as the display
# name and as the key for the article-summary request made when a place is opened.
NAME_Q = """
SELECT ?item ?name WHERE {
  ?item wdt:P17 wd:%(c)s ; wdt:P625 ?coord ; wdt:P18 ?img ; wikibase:sitelinks ?sl .
  FILTER(?sl >= %(lo)d && ?sl <= %(hi)d)
  %(extra)s
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?name .
}
"""

# Wikipedia's trailing disambiguator -- "Ch'iyar Quta (La Paz)" is displayed as
# "Ch'iyar Quta", while the full title is kept for the article URL.
DISAMBIG = re.compile(r"\s*\([^()]{1,40}\)\s*$")

# Same trick as TYPE_Q, for the few countries where even a single-sitelink band is too big
# for the standard query (France). The en-wiki join is what makes it expensive; the gate is
# enforced at emit time instead, using the sitelink the labels stage already returns. The
# result is a superset, so this is safe to mix with countries fetched the normal way.
GEO_Q_NOWIKI = """
SELECT ?item ?coord ?img ?sl WHERE {
  ?item wdt:P17 wd:%(c)s ; wdt:P625 ?coord ; wdt:P18 ?img ; wikibase:sitelinks ?sl .
  FILTER(?sl >= %(lo)d && ?sl <= %(hi)d)
  %(extra)s
}
"""




# ---- HTTP -------------------------------------------------------------------
def _fetch(url, accept, timeout, tries=4, backoff=5):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    last = None
    for a in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            last = e
            code = getattr(e, "code", None)
            if code in (400,):           # malformed query -- retrying cannot help
                raise
            time.sleep(min(60, backoff * (2 ** a)))
    raise last


class Truncated(RuntimeError):
    """WDQS returned 200 OK but the result set is incomplete."""


def sparql_csv(query, timeout=300):
    """Run a query, refusing to accept a partial answer as if it were the whole thing.

    When WDQS exceeds its internal time limit mid-stream it does NOT fail the request: it
    returns 200 with whatever rows it had produced, and appends a Java stack trace to the
    body (or sends an empty body). Both look like ordinary success to an HTTP client, which
    is how ~18k Polish and ~35k American places quietly went missing. Detecting it here
    turns truncation into an exception, which makes the caller split the range and retry.
    """
    url = WDQS + "?" + urllib.parse.urlencode({"query": query})
    text = _fetch(url, "text/csv", timeout).decode("utf-8", errors="replace")
    if not text.strip():
        raise Truncated("empty body")
    tail = text[-4000:]
    if "java." in tail or "\tat " in tail or "org.eclipse" in tail:
        raise Truncated("stack trace appended to results")
    if not text.endswith("\n"):
        # A complete CSV ends with a line terminator. Some responses are instead cut at a
        # hard 512 KB boundary with no error and no stack trace -- the only evidence is a
        # half-written final row, which is what this catches.
        raise Truncated(f"body ends mid-row ({len(text)} chars)")
    return list(csv.DictReader(io.StringIO(text)))


def sparql_range(tmpl, kind, qid, lo, hi, work, depth=0, log=print, extra="", tag=""):
    """Run one sitelink band, halving it on failure so big countries shard themselves.

    Every band that succeeds is cached on its own. The largest countries need more
    sub-queries than fit in one sitting, so without per-band caching an interrupted run
    threw away everything and the country could never finish; with it, each run only
    pays for the bands still missing and the country converges across runs.

    Returns (rows, complete). `complete` is False if any sub-range was abandoned -- the
    caller must NOT cache a partial country, or it silently keeps whatever subset
    happened to survive and never gets retried.
    """
    cf = work / "shards" / f"{kind}_{qid}_{lo}_{hi}{tag}.json"
    if cf.exists():
        try:
            return json.loads(cf.read_text(encoding="utf-8")), True
        except Exception:
            cf.unlink()
    try:
        rows = sparql_csv(tmpl % {"c": qid, "lo": lo, "hi": hi, "extra": extra})
        cf.parent.mkdir(parents=True, exist_ok=True)
        cf.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        return rows, True
    except Exception as e:
        if lo >= hi and not tag:
            # Out of sitelink granularity but still too big (France's sl=5 alone exceeds the
            # response cap). Partition by the last digit of the QID instead -- a cheap filter
            # that splits the set ten ways without needing ORDER BY.
            log(f"      . {qid} sl {lo} too large; splitting by QID last digit")
            out, ok = [], True
            for d in "0123456789":
                r, o = sparql_range(tmpl, kind, qid, lo, hi, work, depth + 1, log,
                                    extra=f'FILTER(STRENDS(STR(?item), "{d}"))', tag=f"_d{d}")
                out += r
                ok = ok and o
                time.sleep(1)
            return out, ok
        if lo >= hi or depth >= 12:
            log(f"      ! {qid} sl {lo}-{hi}{tag} giving up: {type(e).__name__}")
            return [], False
        mid = lo + (hi - lo) // 2
        log(f"      . {qid} sl {lo}-{hi} failed ({type(e).__name__}); splitting")
        time.sleep(3)
        a, oka = sparql_range(tmpl, kind, qid, lo, mid, work, depth + 1, log, extra, tag)
        time.sleep(1)
        b, okb = sparql_range(tmpl, kind, qid, mid + 1, hi, work, depth + 1, log, extra, tag)
        return a + b, (oka and okb)


def _qid(url):
    """Last path segment of an entity URI; None when the cell is missing/empty."""
    return url.rsplit("/", 1)[-1] if url else None


# ---- completeness ------------------------------------------------------------
# WDQS sometimes answers 200 OK with a *silently truncated* result set (one run returned
# 198 of Russia's 21,624 type rows, ending on a clean row boundary, so nothing about the
# response looked wrong). Row counts alone therefore cannot be trusted. Every country is
# checked against a COUNT query, whose answer is cached forever since it is the expensive
# part; a country that disagrees has its shards discarded and is refetched next run.
COUNT_Q = {
    "geo": """SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE {
      ?item wdt:P17 wd:%s ; wdt:P625 ?c ; wdt:P18 ?i ; wikibase:sitelinks ?sl .
      FILTER(?sl >= 5) ?a schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }""",
    "typ": """SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE {
      ?item wdt:P17 wd:%s ; wdt:P625 ?c ; wdt:P18 ?i ; wikibase:sitelinks ?sl ; wdt:P31 ?t .
      FILTER(?sl >= 5) }""",
}
COUNT_TOL = 0.02
_count_lock = __import__("threading").Lock()


def expected_count(kind, qid, work, log):
    """COUNT of what this country should yield, cached on disk (None if unobtainable)."""
    f = work / "expected.json"
    with _count_lock:
        cache = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    key = f"{kind}_{qid}"
    if key in cache:
        return cache[key]
    try:
        rows = sparql_csv(COUNT_Q[kind] % qid, timeout=300)
        n = int(rows[0]["n"])
    except Exception as e:
        log(f"      ? {qid} {kind} COUNT unavailable ({type(e).__name__})")
        return None
    with _count_lock:
        cache = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
        cache[key] = n
        f.write_text(json.dumps(cache), encoding="utf-8")
    return n


def _drop_shards(kind, qid, work):
    for p in (work / "shards").glob(f"{kind}_{qid}_*.json"):
        p.unlink()


def verify(kind, qid, got, work, log):
    """True when `got` matches the COUNT (or the COUNT could not be obtained)."""
    exp = expected_count(kind, qid, work, log)
    if exp is None:
        return True
    if abs(got - exp) <= max(3, exp * COUNT_TOL):
        return True
    log(f"      ! {qid} {kind} got {got} but COUNT says {exp} — discarding shards, will refetch")
    _drop_shards(kind, qid, work)
    return False


# Narrow fixed bands, used with --bands. The adaptive halving only splits when a query
# *errors*; a query that returns silently truncated data looks like success, so retrying
# the same wide range reproduces the same truncation forever. Asking for a few sitelinks
# at a time keeps every response small enough to arrive whole. Most countries never need
# this -- it is for the handful (France, Spain) big enough to hit the limit.
BANDS = [(5, 5), (6, 6), (7, 7), (8, 8), (9, 9), (10, 11), (12, 14), (15, 19),
         (20, 29), (30, 49), (50, 99), (100, SL_CAP)]


def fetch_bands(tmpl, kind, qid, work, log, bands, jobs=4):
    """Bands run concurrently, not in sequence: one stubborn band (France's sl=9, which has
    to be split ten ways by QID) would otherwise eat an entire run on its own and the small
    high-sitelink bands after it would never even be attempted."""
    if not bands:
        return sparql_range(tmpl, kind, qid, MIN_SITELINKS, SL_CAP, work, log=log)
    rows, ok = [], True
    with ThreadPoolExecutor(max_workers=jobs) as ex:
        futs = [ex.submit(sparql_range, tmpl, kind, qid, lo, hi, work, 0, log)
                for lo, hi in BANDS]
        for fut in as_completed(futs):
            try:
                r, o = fut.result()
            except Exception as e:
                log(f"      ! {qid} band failed: {type(e).__name__}")
                r, o = [], False
            rows += r
        ok = ok and o
    return rows, ok


# ---- stages -----------------------------------------------------------------
def stage_geo(qid, work, log, bands=False, nowiki=False):
    f = work / "geo" / f"{qid}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    tmpl = GEO_Q_NOWIKI if nowiki else GEO_Q
    rows, complete = fetch_bands(tmpl, 'geo', qid, work, log, bands)
    out = {}
    for r in rows:
        m = POINT.match(r.get("coord") or "")
        item = _qid(r.get("item"))
        if not m or not item:
            continue
        out[item] = {"lng": round(float(m.group(1)), 5), "lat": round(float(m.group(2)), 5),
                     "img": (r.get("img") or "").rsplit("/", 1)[-1],
                     "sl": int(r.get("sl") or 0)}
    if not complete:
        log(f"      ! {qid} geo INCOMPLETE ({len(out)} rows) — not cached, will retry")
        return out
    if not nowiki and not verify("geo", qid, len(out), work, log):
        return out
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def stage_types(qid, work, log, bands=False):
    f = work / "types" / f"{qid}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    rows, complete = fetch_bands(TYPE_Q, 'typ', qid, work, log, bands)
    out = defaultdict(list)
    for r in rows:
        item, ty = _qid(r.get("item")), _qid(r.get("type"))
        if item and ty:
            out[item].append(ty)
    out = {k: sorted(set(v)) for k, v in out.items()}
    if not complete:
        log(f"      ! {qid} types INCOMPLETE ({len(out)} rows) — not cached, will retry")
        return out
    if not verify("typ", qid, len(out), work, log):
        return out
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


NAME_BATCH_Q = """
SELECT ?item ?name WHERE {
  VALUES ?item { %s }
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?name .
}
"""


def names_for(qids, work, log, batch=400, jobs=2):
    """Look up en-wiki titles for an explicit list of QIDs.

    Scanning a whole country for names re-derives the same set the geo stage already has,
    and for the large countries it is slow enough to need band-splitting. Only about a
    quarter of those rows survive classification, so this asks for exactly the survivors:
    a VALUES lookup is an index hit rather than a scan, and ~90k places fit in a couple of
    hundred queries. Append-only cache, so interrupted runs keep their progress.
    """
    cache_f = work / "names.jsonl"
    cache = {}
    if cache_f.exists():
        with cache_f.open(encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                cache[r["q"]] = r["n"]
    todo = [q for q in qids if q not in cache]
    if not todo:
        return cache
    log(f"  names: {len(cache)} cached, looking up {len(todo)}")
    batches = [todo[i:i + batch] for i in range(0, len(todo), batch)]
    lock = __import__("threading").Lock()
    sink = cache_f.open("a", encoding="utf-8")
    done = [0]

    def run(b):
        try:
            rows = sparql_csv(NAME_BATCH_Q % " ".join("wd:" + q for q in b), timeout=180)
        except Exception as e:
            return b, None, e
        return b, rows, None

    try:
        with ThreadPoolExecutor(max_workers=jobs) as ex:
            for fut in as_completed([ex.submit(run, b) for b in batches]):
                b, rows, err = fut.result()
                with lock:
                    done[0] += 1
                    if err is not None:
                        if done[0] % 20 == 0:
                            log(f"      ! batch failed: {type(err).__name__}")
                        continue
                    got = {}
                    for r in rows:
                        it, nm = _qid(r.get("item")), (r.get("name") or "").strip()
                        if it and nm:
                            got[it] = nm
                    for q, nm in got.items():
                        sink.write(json.dumps({"q": q, "n": nm}, ensure_ascii=False) + "\n")
                    cache.update(got)
                    if done[0] % 20 == 0:
                        sink.flush()
                        log(f"      names {len(cache)} cached ({done[0]}/{len(batches)} batches)")
    finally:
        sink.close()
    return cache


def stage_names(qid, work, log, bands=False):
    """{item_qid: en-wiki article title} for one country."""
    f = work / "names" / f"{qid}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    rows, complete = fetch_bands(NAME_Q, 'nam', qid, work, log, bands)
    out = {}
    for r in rows:
        item, nm = _qid(r.get("item")), (r.get("name") or "").strip()
        if item and nm:
            out[item] = nm
    if not complete:
        log(f"      ! {qid} names INCOMPLETE ({len(out)}) — not cached, will retry")
        return out
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def _load_jsonl(path):
    """Read an append-only cache, tolerating a half-written final line."""
    out = {}
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except Exception:
                continue                      # torn last line from a killed run
            out[r.pop("q")] = r
    return out


def stage_labels(qids, work, log, kind="label", jobs=12):
    """wbgetentities in batches of 50. Returns {qid: {lab, desc, w}}.

    The cache is append-only JSONL, not a rewritten JSON blob. This stage needs far more
    calls than fit in one uninterrupted run, and rewriting the whole file on every flush
    meant a run killed mid-write could roll the cache *backwards* -- tens of thousands of
    already-fetched labels lost, repeatedly. Appending can only ever add.
    """
    cache_f = work / f"{kind}s.jsonl"
    legacy = work / f"{kind}s.json"
    cache = _load_jsonl(cache_f)
    if legacy.exists():                       # one-time migration of the old blob cache
        try:
            old = json.loads(legacy.read_text(encoding="utf-8"))
            new = {q: v for q, v in old.items() if q not in cache}
            if new:
                with cache_f.open("a", encoding="utf-8") as f:
                    for q, v in new.items():
                        f.write(json.dumps({"q": q, **v}, ensure_ascii=False) + "\n")
                cache.update(new)
                log(f"  migrated {len(new)} {kind}s from {legacy.name}")
        except Exception as e:
            log(f"  ! could not migrate {legacy.name}: {type(e).__name__}")
    todo = [q for q in qids if q not in cache]
    if not todo:
        return cache
    log(f"  {kind}s: {len(cache)} cached, fetching {len(todo)}")
    batches = [todo[i:i + 50] for i in range(0, len(todo), 50)]
    lock = __import__("threading").Lock()
    done = [0]

    def fetch(batch):
        url = WDAPI + "?" + urllib.parse.urlencode({
            "action": "wbgetentities", "format": "json", "languages": "en",
            "sitefilter": "enwiki", "props": "labels|descriptions|sitelinks",
            "ids": "|".join(batch)})
        try:
            d = json.loads(_fetch(url, "application/json", 45, tries=2, backoff=1).decode())
        except Exception as e:
            return batch, None, e
        return batch, d, None

    sink = cache_f.open("a", encoding="utf-8")
    try:
        with ThreadPoolExecutor(max_workers=jobs) as ex:
            for fut in as_completed([ex.submit(fetch, b) for b in batches]):
                batch, d, err = fut.result()
                if err is not None:
                    continue
                with lock:
                    done[0] += 1
                    fresh = {}
                    for q, e in (d.get("entities") or {}).items():
                        fresh[q] = {} if "missing" in e else {
                            "lab": (e.get("labels", {}).get("en") or {}).get("value", ""),
                            "desc": (e.get("descriptions", {}).get("en") or {}).get("value", ""),
                            "w": (e.get("sitelinks", {}).get("enwiki") or {}).get("title", "")}
                    for q in batch:
                        fresh.setdefault(q, {})
                    for q, v in fresh.items():
                        sink.write(json.dumps({"q": q, **v}, ensure_ascii=False) + "\n")
                    cache.update(fresh)
                    if done[0] % 40 == 0:
                        sink.flush()
                        log(f"      {kind}s {len(cache)} cached ({done[0]*50}/{len(todo)})")
    finally:
        sink.close()
    return cache


# ---- classification ---------------------------------------------------------
# Each of a place's P31 type labels is judged on its OWN, never on the concatenation:
# joining them lets one label's text bleed into another's match (and a substring of a
# country name can masquerade as a keyword -- "Boli/via/" once turned 148 Bolivian
# administrative units into scenic roads).

# Always a destination, even when another of its types says "settlement".
KEEP_RE = re.compile(r"world\ heritage|national\ park|national\ monument|"
                     r"nature\ reserve|biosphere|geopark|archaeolog", re.I)

# Not a destination. Substrings, so subclasses ("commune of France", "district of
# Mongolia") fall out without enumerating every one.
DROP_RE = re.compile(r"""
 sovereign\ state|island\ country|\bcountry\b|\bnation\b|microstate|city-state|
 dependent\ territory|special\ administrative\ region|\bcontinent\b|
 human\ settlement|\bcity\b|\btown\b|village|hamlet|municipalit|commune|borough|parish|
 administrative|territorial\ entity|subdivision|district|county|province|prefecture|
 department|canton|\bregion\b|state\ of|federal\ subject|oblast|raion|voivodeship|
 census|unincorporated|locality|neighbou?rhood|quarter|suburb|\bward\b|capital|
 airport|aerodrome|airfield|air\ base|railway\ station|metro\ station|bus\ station|
 railway\ line|rail\ line|metro\ line|tram|underground\ line|
 university|college|school|hospital|clinic|prison|courthouse|embassy|
 business|enterprise|company|corporation|\bbank\b|hotel|restaurant|shopping|
 football|soccer|sports\ (club|team|venue)|stadium|arena|
 election|battle|\bwar\b|treaty|\bevent\b|conflict|massacre|
 ecoregion|circle\ of\ latitude|meridian|parallel|land\ boundary|border|
 taxon|species|\bperson\b|\bhuman\b|family\ name|given\ name|language|
 power\ station|factory|\bmine\b|quarry|\bfarm\b|
 newspaper|television|radio|\bband\b|album|\bfilm\b|\bbook\b
""", re.X | re.I)

# label keyword -> explore.html category, first match wins (road before nature so
# "mountain pass" is a road, not a mountain)
CAT_RULES = [
    ("onsen", r"hot\ spring|thermal\ (spring|bath)|geyser|onsen|spa\ town"),
    ("museum", r"museum|art\ gallery|memorial|library|archive|monument\ to"),
    ("park", r"\bzoo\b|aquarium|amusement\ park|theme\ park|botanical|arboretum|"
             r"safari|wildlife\ park|water\ park"),
    ("temple", r"temple|church|cathedral|basilica|chapel|abbey|monaster|convent|priory|"
               r"mosque|synagogue|shrine|pagoda|stupa|gurdwara|sanctuar|"
               r"castle|palace|\bfort|citadel|chateau|\bmanor|\bruin|archaeolog|"
               r"megalith|dolmen|menhir|pyramid|\btomb|mausoleum|necropolis|burial|"
               r"cemetery|heritage\ site|historic|petroglyph|rock\ art|hillfort|"
               r"city\ gate|city\ wall|amphitheat|aqueduct|\bwall\b"),
    ("vista", r"tower|skyscraper|lighthouse|observation|viewpoint|bridge|"
              r"cable\ car|funicular|ferris|obelisk|statue|\bdam\b"),
    ("geek", r"observator|telescope|planetarium|launch|spaceport|nuclear|reactor|"
             r"research\ station|laborator|wind\ farm|solar\ (power|farm)|"
             r"tunnel|shipwreck|submarine|aircraft|locomotive"),
    ("road", r"mountain\ pass|\bpass\b|scenic\ (route|road)|\btrail\b|pilgrimage\ route|"
             r"long-distance\ path|\broad\b|highway|motorway|\bautobahn\b|\bvia\b"),
    ("nature", r"\blake|lagoon|\bloch\b|\bpond\b|reservoir|\bsea\b|\bbay\b|fjord|strait|"
               r"volcano|mountain|\bpeak\b|summit|\bhill|massif|\brange\b|ridge|plateau|mesa|"
               r"waterfall|cascade|\briver|stream|\bcreek\b|\bspring|delta|estuary|marsh|swamp|"
               r"wetland|glacier|icefield|ice\ cap|\bcave|cavern|grotto|karst|sinkhole|"
               r"canyon|gorge|ravine|valley|\bdune|desert|oasis|badlands|"
               r"beach|coast|cliff|\bcape\b|headland|peninsula|isthmus|island|islet|"
               r"archipelago|atoll|\breef\b|national\ park|nature\ reserve|protected|"
               r"wilderness|forest|woodland|jungle|grassland|steppe|savanna|tundra|"
               r"geological|rock\ formation|crater|caldera|hoodoo|natural\ arch|geopark|"
               r"garden|\bpark\b|meadow|pasture|\blava\b|salt\ flat|salar|butte"),
]
CAT_RE = [(c, re.compile(p, re.X | re.I)) for c, p in CAT_RULES]


def _cat_of(label):
    for cat, rx in CAT_RE:
        if rx.search(label):
            return cat
    return None


def classify(type_labels):
    """Return a category, or None if no type marks this as a destination.

    Judged per label: an always-keep type wins outright, a drop-listed label is skipped,
    and the first remaining label that maps to a category decides. So
    "village ; archaeological site" is kept as a temple, while "municipality of Bolivia"
    is dropped.
    """
    best = None
    for lab in type_labels:
        if not lab:
            continue
        if KEEP_RE.search(lab):
            return _cat_of(lab) or "nature"
        if DROP_RE.search(lab):
            continue
        if best is None:
            best = _cat_of(lab)
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--only", default="")
    ap.add_argument("--stage", default="all", choices=["all", "geo", "types", "labels", "emit"])
    ap.add_argument("--nowiki", action="store_true",
                    help="omit the en-wiki join from the geo query (gate applied at emit instead)")
    ap.add_argument("--bands", action="store_true",
                    help="query a few sitelinks at a time; slower but immune to silent truncation")
    ap.add_argument("--jobs", type=int, default=3,
                    help="countries fetched concurrently (keep small; WDQS is a shared service)")
    a = ap.parse_args()

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    work = Path(a.work); work.mkdir(parents=True, exist_ok=True)
    countries = json.loads(Path(a.countries).read_text(encoding="utf-8"))
    if a.only:
        keep = set(a.only.split(","))
        countries = {k: v for k, v in countries.items() if k in keep}
    out_path = Path(a.out) if a.out else Path(__file__).resolve().parent / "places.json"

    def log(*m):
        print(*m, flush=True)

    order = sorted(countries.items(), key=lambda kv: kv[1]["name"])
    geo_all, type_all, owner, names_all = {}, {}, {}, {}
    empty = []

    cached_only = a.stage == "emit"

    def read_cached(kind, qid):
        f = work / kind / f"{qid}.json"
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}

    def one(qid):
        if cached_only:
            return (read_cached("geo", qid), read_cached("types", qid),
                    read_cached("names", qid))
        g = stage_geo(qid, work, log, a.bands, a.nowiki)
        t = stage_types(qid, work, log, a.bands)
        n = read_cached("names", qid)      # per-country scans retired; see names_for()
        # Free cross-check for the countries whose COUNT query is itself too expensive to
        # answer (France, chiefly): the types query is the geo query plus P31, so its result
        # is a near-subset of geo. A large shortfall either way means that side came back
        # silently truncated, so drop it and let the next run refetch.
        if len(g) > 50 and len(t) < len(g) * 0.9:
            log(f"      ! {qid} types {len(t)} << geo {len(g)} — dropping types, will refetch")
            (work / "types" / f"{qid}.json").unlink(missing_ok=True)
            _drop_shards("typ", qid, work)
        return g, t, n

    # A few countries in flight at once: most of each country's wall time is WDQS thinking,
    # and the big ones shard into many sequential sub-queries. Results are merged in
    # completion order, which is fine -- ownership is decided by sitelink count, not arrival.
    done = 0

    def absorb(qid, g, t, n):
        nonlocal done
        done += 1
        names_all.update(n)
        meta = countries[qid]
        if not g:
            empty.append(meta["name"])
        for k, v in g.items():
            if k not in geo_all or v["sl"] > geo_all[k]["sl"]:
                geo_all[k] = v
                owner[k] = qid
        for k, v in t.items():
            type_all.setdefault(k, []).extend(v)
        log(f"[{done:3d}/{len(order)}] {meta['name']:38s} geo={len(g):6d} types={len(t):6d} "
            f"(total {len(geo_all)})")

    if cached_only or a.jobs <= 1:
        for qid, _ in order:
            g, t, n = one(qid)
            absorb(qid, g, t, n)
    else:
        with ThreadPoolExecutor(max_workers=a.jobs) as ex:
            futs = {ex.submit(one, qid): qid for qid, _ in order}
            for fut in as_completed(futs):
                qid = futs[fut]
                try:
                    g, t, n = fut.result()
                except Exception as e:
                    log(f"      ! {qid} failed: {type(e).__name__}: {e}")
                    g, t, n = {}, {}, {}
                absorb(qid, g, t, n)
        log(f"\nDISTINCT PLACES (pre-filter): {len(geo_all)}")

    # type labels
    type_qids = sorted({t for v in type_all.values() for t in v})
    log(f"distinct P31 types: {len(type_qids)}")
    tlab = stage_labels(type_qids, work, log, kind="typelabel")

    # ---- classify BEFORE fetching place labels ----
    # Classification needs only the P31 type labels (a couple of hundred of them, already
    # cached). Doing it first means we never fetch names for the ~60% of rows that are
    # settlements and administrative units and get discarded anyway -- that is hundreds of
    # thousands of API calls saved.
    cats, dropped, no_type, no_enwiki = Counter(), Counter(), 0, 0
    keepers = {}
    for q in geo_all:
        if q in countries:
            # The country item itself matches its own P17 query. Type-based rules keep
            # missing the island states (Bahrain, Sao Tome) because "island country" reads
            # as an island; excluding by identity is exact.
            dropped["(the country itself)"] += 1
            continue
        tl = [tlab.get(t, {}).get("lab", "") for t in set(type_all.get(q, []))]
        tl = [x for x in tl if x]
        if not tl:
            no_type += 1
            continue
        cat = classify(tl)
        if not cat:
            dropped[tl[0]] += 1
            continue
        keepers[q] = cat
    log(f"classified as destinations: {len(keepers)} of {len(geo_all)}")

    if not cached_only or True:
        # names_all holds whatever the retired per-country scans cached; fill the rest by
        # direct lookup of the survivors.
        missing = [q for q in keepers if q not in names_all]
        if missing:
            names_all.update(names_for(sorted(missing), work, log))

    rows = []
    for q, cat in keepers.items():
        g = geo_all[q]
        # The en-wiki gate lands here rather than in SPARQL: countries fetched with --nowiki
        # were never filtered on it, and the page needs this title to request the article
        # summary on click, so a place without one is unusable anyway.
        title = names_all.get(q)
        if not title:
            no_enwiki += 1
            continue
        name = DISAMBIG.sub("", title) or title
        meta = countries[owner[q]]
        cats[cat] += 1
        rows.append([int(q[1:]), name, g["lat"], g["lng"], cat, meta["name"], meta["cont"],
                     title, g["sl"]])

    rows.sort(key=lambda r: (-r[8], r[1]))
    log(f"\nKEPT     : {len(rows)}")
    log(f"dropped  : {sum(dropped.values())} (non-destination types)")
    log(f"no type  : {no_type}")
    log(f"no enwiki: {no_enwiki}")
    log(f"by cat   : {dict(cats)}")
    log(f"top dropped types: {dict(dropped.most_common(20))}")

    by_country = Counter(r[5] for r in rows)
    zero = [m["name"] for m in countries.values() if by_country.get(m["name"], 0) == 0]
    log(f"\ncountries with >=1 place: {len(by_country)} / {len(countries)}")
    if zero:
        log(f"COUNTRIES WITH ZERO PLACES ({len(zero)}): {', '.join(sorted(zero))}")

    # Compact, indexed payload. Description and photo are deliberately NOT stored: the
    # REST summary endpoint returns both when a place is opened, and at this row count
    # they would have cost more than the rest of the file put together. The enwiki title
    # is stored only when it differs from the label (disambiguated titles like
    # "Ch'iyar Quta (La Paz)"); otherwise the name doubles as the title.
    cat_list = sorted({r[4] for r in rows})
    ctry_list = sorted({(r[5], r[6]) for r in rows})
    ci = {c: i for i, c in enumerate(ctry_list)}
    ki = {c: i for i, c in enumerate(cat_list)}
    places = [[r[0], r[1], r[2], r[3], ki[r[4]], ci[(r[5], r[6])], r[8],
               ("" if r[7] == r[1] else r[7])] for r in rows]
    payload = {"fields": ["id", "n", "lat", "lng", "k", "ci", "sl", "w"],
               "cats": cat_list,
               "countries": [list(c) for c in ctry_list],
               "places": places}
    out_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
    mb = out_path.stat().st_size / 1e6
    log(f"\nwrote {out_path}  ({mb:.1f} MB, {mb*1e6/max(1,len(places)):.0f} bytes/place)")


if __name__ == "__main__":
    main()
