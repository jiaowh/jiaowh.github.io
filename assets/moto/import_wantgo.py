r"""Import the rider's own Google-Maps 'want to go' saved list into assets/moto/wishlist.js.

Input: a CSV exported from the saved list (columns: name,address) — no coordinates.
For each place we:
  - detect the country from the address,
  - classify it into an explore.html category (nature/temple/vista/... ) by keyword,
  - geocode it with OpenStreetMap / Nominatim (address-aware, 1 req/s, cached+resumable).
These are the user's REAL picks, so they are tagged src="mine" and rendered as a distinct
starred layer in explore.html (separate from the AI recommendations in recs.js).

  python assets/moto/import_wantgo.py [path\to\want_to_go.csv]

Nothing is fabricated: an entry that cannot be geocoded is dropped and logged.
"""
import csv, json, re, sys, time, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import recs_build as rb  # reuse _get (retry/backoff), continent_of, slugify, norm

sys.stdout.reconfigure(encoding="utf-8")
CSV = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\Users\Jiaow\AppData\Local\Temp\want_to_go.csv")
OUT = ROOT / "wishlist.js"
SCRATCH = Path(r"C:\Users\Jiaow\AppData\Local\Temp\claude"
               r"\c--Users-Jiaow-Documents-github-jiaowh-github-io"
               r"\209e65e3-8285-46d0-8f18-4e14f96b63c7\scratchpad")
CACHE = SCRATCH / "wishlist_geocache.json"
MISSES = SCRATCH / "wishlist_misses.txt"
NOM = "https://nominatim.openstreetmap.org/search"

CN_PROVINCES = ["Beijing", "Tianjin", "Hebei", "Shanxi", "Shaanxi", "Inner Mongolia", "Ningxia",
                "Gansu", "Qinghai", "Xinjiang", "Tibet", "Sichuan", "Chongqing", "Yunnan", "Guizhou",
                "Guangxi", "Guangdong", "Hainan", "Hunan", "Hubei", "Henan", "Shandong", "Jiangsu",
                "Zhejiang", "Anhui", "Jiangxi", "Fujian", "Heilongjiang", "Jilin", "Liaoning"]
OTHER_COUNTRIES = ["Bolivia", "Mongolia", "Indonesia", "North Korea", "Brazil", "Nepal", "Vietnam",
                   "Laos", "Kazakhstan", "Kyrgyzstan", "Pakistan", "India", "Thailand", "Malaysia"]


def parse_country(name, addr):
    if "Kinmen" in addr:
        return "Taiwan"
    if name.strip() == "Cheung Chau" or "Hong Kong" in addr:
        return "Hong Kong"
    for c in OTHER_COUNTRIES + ["Taiwan", "Hong Kong", "Macau"]:
        if c in addr:
            return c
    return "China"  # dominant; addresses with CJK / "China" / bare place


def province_of(addr):
    for p in CN_PROVINCES:
        if p in addr:
            return p
    return None


# keyword -> category, checked in priority order
CAT_RULES = [
    ("onsen", ["温泉", "hot spring", "hotspring", "termales", "热海", "rehai"]),
    ("museum", ["museum", "博物", "纪念馆", "memorial", "gallery", "academy of fine art",
                "site museum", "underwater museum", "relic site", "battle museum"]),
    ("park", ["zoo", "ocean kingdom", "chimelong", "长隆", "safari", "度假区", "resort",
              "amusement", "paradise", "wildlife", "旅游度假"]),
    ("temple", ["temple", "寺", "monastery", "grotto", "石窟", "pagoda", "佛", "buddha", "guanyin",
                "宫", "palace", "陵", "mausoleum", "tomb", "古镇", "古城", "ancient town", "ancient city",
                "ancient grave", "rock art", "rock carving", "石刻", "tulou", "diaolou", "kaiping",
                "walled", "fort", "shanhaiguan", "jinshanling", "great wall", "pavilion", "shrine",
                "heritage", "ghost city", "guqiang", "military plant", "nuclear"]),
    ("vista", ["glass bridge", "skywalk", "观景", "tower", "finance centre", "finance center",
               "观光", "yellow crane"]),
    ("road", ["highway", "guoliang", "plank road", "挂壁"]),
    ("nature", ["mountain", " shan", "山", "lake", "湖", "waterfall", "瀑布", "falls", "desert",
                "沙漠", "沙坡", "沙湖", "dune", "danxia", "丹霞", "canyon", "gorge", "峡谷", "峡",
                "大峡谷", "cave", "洞", "glacier", "冰川", "volcano", "火山", "grassland", "prairie",
                "草原", "forest", "nature reserve", "geopark", "geological", "valley", "river",
                "画廊", "beach", "island", "peak", "snow mountain", "雪山", "national park", "scenic",
                "景区", "estuary", "wetland", "reserve", "stone forest", "石海", "石林", "prairies",
                "grand rift", "rift valley", "tunnel", "bridge", "桥", "梯田", "terrace", "spring",
                "泉", "gallery scenic", "geo park", "huyanglin", "customs", "old city", "prairie"]),
]


def classify(name):
    s = name.lower()
    for cat, kws in CAT_RULES:
        for kw in kws:
            if kw.lower() in s:
                return cat
    return "nature"  # list is scenery-dominated


def clean_name(name):
    n = re.sub(r"[（(][^）)]*[Gg]ate[）)]", "", name)      # drop "(Northwest Gate)"
    n = re.sub(r"[（(][^）)]*[门門][）)]", "", n)
    return n.strip(" ，,")


ISO2 = {"China": "cn", "Taiwan": "tw", "Hong Kong": "hk", "Macau": "mo", "Bolivia": "bo",
        "Mongolia": "mn", "Indonesia": "id", "North Korea": "kp", "Brazil": "br", "Nepal": "np",
        "Vietnam": "vn", "Laos": "la", "Kazakhstan": "kz", "Kyrgyzstan": "kg", "Pakistan": "pk",
        "India": "in", "Thailand": "th", "Malaysia": "my"}

# ---- Open Location Code (Plus Code) decode + short-code recovery ------------
_OLC = "23456789CFGHJMPQRVWX"
PLUS_RE = re.compile(r"\b([" + _OLC + r"]{4,8}\+[" + _OLC + r"]{2,3})\b")


def _olc_decode_center(code):
    code = code.replace("+", "").replace("0", "").upper()
    lat, lng, latr, lngr, i = -90.0, -180.0, 20.0, 20.0, 0
    while i < len(code) and i < 10:
        lat += _OLC.index(code[i]) * latr
        lng += _OLC.index(code[i + 1]) * lngr
        i += 2
        if i < 10:
            latr /= 20; lngr /= 20
    for d in code[10:15]:
        v = _OLC.index(d); latr /= 5; lngr /= 4
        lat += (v // 4) * latr; lng += (v % 4) * lngr
    return lat + latr / 2, lng + lngr / 2


def _olc_prefix(lat, lng, pad):
    latv, lngv, res, out = lat + 90.0, lng + 180.0, 20.0, ""
    for _ in range(pad // 2):
        out += _OLC[int(latv / res) % 20] + _OLC[int(lngv / res) % 20]
        latv -= int(latv / res) * res; lngv -= int(lngv / res) * res; res /= 20
    return out


def refine_pluscode(addr, ref):
    """If the address carries a (short) Plus Code, recover exact coords anchored at ref."""
    if not ref:
        return ref
    m = PLUS_RE.search(addr)
    if not m:
        return ref
    code = m.group(1).upper(); sep = code.index("+")
    try:
        if sep == 8:
            lat, lng = _olc_decode_center(code)
        else:
            pad = 8 - sep
            lat, lng = _olc_decode_center(_olc_prefix(ref[0], ref[1], pad) + code)
            resolution = 20 ** (2 - pad // 2); half = resolution / 2.0
            if lat - ref[0] > half: lat -= resolution
            elif lat - ref[0] < -half: lat += resolution
            if lng - ref[1] > half: lng -= resolution
            elif lng - ref[1] < -half: lng += resolution
    except Exception:
        return ref
    if abs(lat - ref[0]) > 1.2 or abs(lng - ref[1]) > 1.2:  # sanity vs a bad anchor
        return ref
    return [round(lat, 6), round(lng, 6)]


def _nom(q, cc, cache):
    key = "G::" + (cc or "-") + "::" + q
    if key in cache:
        return cache[key]
    params = {"format": "json", "limit": 1, "accept-language": "en", "q": q}
    if cc:
        params["countrycodes"] = cc
    try:
        d = rb._get(NOM + "?" + urllib.parse.urlencode(params))
        res = [round(float(d[0]["lat"]), 6), round(float(d[0]["lon"]), 6)] if d else None
    except Exception:
        res = None
    cache[key] = res
    time.sleep(1.1)  # Nominatim policy: <= 1 req/s
    return res


def clean_addr(addr):
    a = PLUS_RE.sub("", addr)
    a = re.sub(r"邮政编码[:：]?\s*\d+", "", a)
    a = re.sub(r"\b\d{5,6}\b", "", a)
    return [p.strip() for p in re.split(r"[,，]", a) if p.strip()]


def _first(tries, cc, cache):
    seen = set()
    for q in tries:
        q = q.strip(" ,")
        if not q or q in seen:
            continue
        seen.add(q)
        res = _nom(q, cc, cache)
        if res:
            return res
    return None


def geocode_locality(addr, country, cache):
    """Correct-REGION anchor from the address (coarsen to city/county/province)."""
    cc = ISO2.get(country)
    prov = province_of(addr)
    tries = []
    parts = clean_addr(addr)
    for start in range(len(parts)):          # drop leading (street) parts -> locality
        q = ", ".join(parts[start:])
        if len(q) > 3:
            tries.append(q)
    if prov:
        tries.append(f"{prov}, {country}")
    tries.append(country)
    return _first(tries, cc, cache)


def geocode_name(name, addr, country, cache):
    """Precise POI by attraction name (can be wrong-region for ambiguous names)."""
    cc = ISO2.get(country)
    prov = province_of(addr)
    cn = clean_name(name)
    tries = []
    if prov and country == "China":
        tries += [f"{cn}, {prov}, China", f"{name}, {prov}, China"]
    tries += [f"{cn}, {country}"]
    return _first(tries, cc, cache)


# hand-placed coords for the rare entry Nominatim can't resolve at all
OVERRIDES = {"cheung chau": [22.208806, 114.028611],
             # Aymara "black lake"; three lakes share the name, this is the La Paz /
             # Cordillera Real one. Unknown to Nominatim -> coords from Wikipedia.
             "ch'iyar quta": [-16.195, -68.243889]}

# Picks added by hand that are NOT in the Google Maps list. Appended after the CSV
# rows so a rebuild keeps them instead of silently dropping them. (name, addr, country)
EXTRA = [("Ch'iyar Quta",
          "Cordillera Real, Pucarani, Los Andes Province, La Paz Department, Bolivia",
          "Bolivia")]


def place(name, addr, country, cache):
    """Locality anchor (right region) + Plus Code (exact) + name (precise, region-validated).
    Never drops unless even the country fails to geocode."""
    if name.strip().lower() in OVERRIDES:
        return OVERRIDES[name.strip().lower()]
    anchor = geocode_locality(addr, country, cache)
    if PLUS_RE.search(addr):
        exact = refine_pluscode(addr, anchor or geocode_name(name, addr, country, cache))
        if exact:
            return exact
    nm = geocode_name(name, addr, country, cache)
    if nm and (not anchor or (abs(nm[0] - anchor[0]) < 0.8 and abs(nm[1] - anchor[1]) < 0.8)):
        return nm
    return anchor or nm


def main():
    rows = []
    with open(CSV, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            nm = (r.get("name") or "").strip()
            if nm:
                rows.append((nm, (r.get("address") or "").strip()))
    print(f"csv rows: {len(rows)}")

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    out, misses, seen = [], [], set()

    def wnorm(s):  # CJK-preserving key (rb.norm strips to ASCII -> all Chinese names collide to "")
        return re.sub(r"[\W_]+", "", (s or "").lower())

    for i, (name, addr) in enumerate(rows, 1):
        nk = wnorm(name)
        if nk in seen:
            continue
        seen.add(nk)
        country = parse_country(name, addr)
        cat = classify(name)
        coord = place(name, addr, country, cache)
        if i % 20 == 0:
            print(f"  geocoded {i}/{len(rows)} ... (placed {len(out)})")
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        if not coord:
            misses.append(f"{name}  |  {addr}")
            continue
        out.append({"n": name, "c": country, "cont": rb.continent_of(country), "k": cat,
                    "lat": coord[0], "lng": coord[1], "addr": addr, "src": "mine"})

    for name, addr, country in EXTRA:  # hand-added picks, not in the Google list
        if wnorm(name) in seen:
            continue
        seen.add(wnorm(name))
        coord = place(name, addr, country, cache)
        if not coord:
            misses.append(f"{name}  |  {addr}")
            continue
        out.append({"n": name, "c": country, "cont": rb.continent_of(country),
                    "k": classify(name), "lat": coord[0], "lng": coord[1],
                    "addr": addr, "src": "mine"})
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    # stable ids
    used = {}
    for x in out:
        base = "my-" + rb.slugify(x["n"])
        s = base
        while s in used:
            used[base] = used.get(base, 1) + 1
            s = f"{base}-{used[base]}"
        used.setdefault(s, 1)
        x["id"] = s
    order = ["id", "n", "c", "cont", "k", "lat", "lng", "addr", "src"]
    out2 = [{k: x[k] for k in order} for x in out]

    body = "[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in out2) + "\n]"
    header = ("/* ================================================================\n"
              "   EXPLORE — the rider's OWN 'want to go' saved list (from Google Maps).\n"
              "   Built by assets/moto/import_wantgo.py: geocoded via OpenStreetMap/Nominatim.\n"
              "   Rendered as the starred 'my list' layer in explore.html, distinct from the\n"
              "   AI recommendations in recs.js. Each: {id,n,c,cont,k,lat,lng,addr,src}\n"
              "   ================================================================ */\n")
    OUT.write_text(header + "const WISHLIST =\n" + body + "\n;\n", encoding="utf-8")
    if misses:
        MISSES.write_text("\n".join(misses), encoding="utf-8")

    from collections import Counter
    print(f"\nwrote {OUT}")
    print(f"  placed: {len(out2)}   missed (no geocode, dropped): {len(misses)}")
    print("  by country :", dict(Counter(x["c"] for x in out2)))
    print("  by category:", dict(Counter(x["k"] for x in out2)))
    if misses:
        print(f"  misses logged to {MISSES}")


if __name__ == "__main__":
    main()
