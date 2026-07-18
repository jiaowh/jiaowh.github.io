"""Bulk-ingest the `touring/` trip folders into the moto vault.

For each subfolder of  <repo>/touring/<trip>/ :
  * read every image's capture time (filename YYYYMMDD_HHMMSS -> EXIF -> mtime)
    and GPS. Images WITHOUT GPS are ignored (per the owner's instruction).
  * cluster the geolocated photos by time (>45 min gap = new stop)
  * name each stop by snapping to a known curated place (existing journeys)
    within 0.6 km, else OpenStreetMap reverse geocoding
  * keep up to CAP representative photos per stop (spread across its timespan)
  * pick a few short videos per trip, assign each to the nearest stop by time
  * fetch a real road leg (OSRM) between consecutive stops (dashed arc fallback)
  * compress media into the committed web derivatives and rewrite journeys.js

The `touring/` folder is only read at build time -> the published page needs
only  assets/moto/web + assets/moto/video + journeys.js.  Delete touring/ after.

    python assets/moto/import_touring.py --plan   # dry run: counts + size estimate, no network/media
    python assets/moto/import_touring.py          # the real thing (writes files)

Network results (reverse-geocode, OSRM) are cached in scratchpad so re-runs resume.
"""
import sys, os, re, json, math, time, threading, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build as pipeline
import data_io

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent            # assets/moto
REPO = ROOT.parent.parent                          # repo root
TOURING = REPO / "touring"
CACHE = Path(os.environ.get("TOURING_CACHE",
        r"C:/Users/Jiaow/AppData/Local/Temp/claude/c--Users-Jiaow-Documents-github-jiaowh-github-io/209e65e3-8285-46d0-8f18-4e14f96b63c7/scratchpad/touring_cache.json"))

# ---- tunables ----
GAP_MIN        = 60          # minutes between photos -> new stop
MERGE_KM       = 0.35        # merge adjacent stops this close (same spot, paused a while)
CAP            = 5           # max photos kept per stop
LARGE, LARGE_Q = 1280, 82    # committed "large" webp (lightbox)
THUMBP, THUMB_Q = 600, 80    # committed "thumb" webp (polaroid grid)
VIDEO_BUDGET_MB = 80         # total encoded video added across all trips
VIDEO_PER_TRIP  = 2          # max clips per trip
VIDEO_SRC_MAX_MB = 45        # ignore huge source clips (long riding dumps)
VIDEO_ENC_CAP_MB = 12        # per-clip encoded cap
SNAP_KM        = 0.6         # reuse a curated stop name within this distance
FLIGHT_KM      = 250         # legs longer than this (unroutable) don't count toward km

# folder, id, title, color   — chronological so the shelf reads in order
TRIPS = [
    ("北海道夏",        "hokkaido24",  "北海道 夏 2024",          "#3f7d5a"),
    ("nintendo museum", "nintendo",    "ニンテンドーミュージアム", "#d0862e"),
    ("酷道",           "kokudo",      "酷道をゆく",              "#7a5a9b"),
    ("雪まつり２０２５",  "yukimatsuri", "さっぽろ雪まつり 2025",    "#2f7fbf"),
    ("korea",          "korea",       "韓国",                   "#5fb4ae"),
    ("雪の回廊",        "yukikairo",   "雪の回廊",                "#5b8c9e"),
    ("万博",           "expo",        "大阪・関西万博 2025",      "#c0392b"),
    ("sado",           "sado",        "佐渡島",                  "#8e5aa8"),
    ("四国",           "shikoku",     "四国",                   "#4a8c3f"),
    ("japan_final",    "japan25",     "日本 2025秋",             "#c77d3e"),
    ("china",          "china",       "中国 2025冬",             "#c4477d"),
    ("重庆成都",        "chongqing",   "重慶・成都",              "#a0522d"),
]

UA = {"User-Agent": "moto-vault-studio/1.0 (personal touring journal, contact: site owner)"}

# ----------------------------------------------------------------- cache + net
_cache = json.loads(CACHE.read_text("utf-8")) if CACHE.exists() else {}
_cache_lock = threading.Lock()

def _save_cache():
    with _cache_lock:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(_cache, ensure_ascii=False), "utf-8")

class Throttle:
    """One host, >=1.1 s between requests, with retry/backoff."""
    def __init__(self): self.lock = threading.Lock(); self.last = 0.0
    def get(self, url, tries=4):
        for k in range(tries):
            with self.lock:
                w = 1.15 - (time.time() - self.last)
                if w > 0: time.sleep(w)
                try:
                    req = urllib.request.Request(url, headers=UA)
                    with urllib.request.urlopen(req, timeout=40) as r:
                        return json.load(r)
                except Exception as e:
                    self.last = time.time()
                    if k == tries - 1:
                        raise
                    time.sleep(1.5 * (k + 1))
                finally:
                    self.last = time.time()

NOM = Throttle()     # nominatim.openstreetmap.org
OSRM = Throttle()    # router.project-osrm.org

def hav(a, b):
    R = 6371.0088
    dlat = math.radians(b[0]-a[0]); dlng = math.radians(b[1]-a[1])
    x = math.sin(dlat/2)**2 + math.cos(math.radians(a[0]))*math.cos(math.radians(b[0]))*math.sin(dlng/2)**2
    return 2*R*math.asin(math.sqrt(x))

# ----------------------------------------------------------------- scan/cluster
def cap_time(p):
    m = re.search(r"(20\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})", p.name)
    if m:
        try: return datetime(*[int(x) for x in m.groups()])
        except ValueError: pass
    m = re.search(r"(20\d{2})(\d{2})(\d{2})", p.name)   # date only (e.g. WA images)
    if m:
        try: return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), 12, 0)
        except ValueError: pass
    s = pipeline.exif_datetime(p)
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")

def has_gps(g):
    return bool(g) and not (abs(g[0]) < 0.001 and abs(g[1]) < 0.001)

def scan_trip(folder):
    imgs, vids = [], []
    for p in sorted(folder.iterdir()):
        ext = p.suffix.lower()
        if ext in pipeline.IMG_EXT:
            g = pipeline.exif_gps(p)
            if has_gps(g):
                imgs.append({"path": p, "t": cap_time(p), "gps": g})
        elif ext in pipeline.VID_EXT:
            vids.append({"path": p, "t": cap_time(p), "mb": p.stat().st_size/1e6})
    imgs.sort(key=lambda x: x["t"])
    vids.sort(key=lambda x: x["t"])
    clusters, cur = [], None
    for it in imgs:
        if cur and (it["t"] - cur[-1]["t"]).total_seconds() <= GAP_MIN*60:
            cur.append(it)
        else:
            cur = [it]; clusters.append(cur)
    # merge adjacent clusters that sit at the same spot (paused >gap but didn't move)
    def cent(cl): return (sum(i["gps"][0] for i in cl)/len(cl), sum(i["gps"][1] for i in cl)/len(cl))
    merged = []
    for cl in clusters:
        if merged and hav(cent(merged[-1]), cent(cl)) <= MERGE_KM:
            merged[-1].extend(cl)
        else:
            merged.append(list(cl))
    return merged, vids

def pick_spread(items, n):
    """Evenly sample n items across a time-sorted list (keeps first & last)."""
    if len(items) <= n:
        return list(items)
    idx = [round(i*(len(items)-1)/(n-1)) for i in range(n)]
    seen, out = set(), []
    for i in idx:
        if i not in seen:
            seen.add(i); out.append(items[i])
    return out

# ----------------------------------------------------------------- naming
# names that read like a road/anonymous grid block make poor stop labels -> demote them
_UGLY = re.compile(r"(通$|線$|号$|道路|街道|バイパス|自動車道|高速|停車場|ランプ|交差点|"
                   r"\d+条|丁目$|番地|Road$|Street$|St$|Avenue$|Ave$|Highway$|Route$|Expressway$)")
def _ok(s): return bool(s) and not _UGLY.search(s)

def label(addr, name):
    for k in ("tourism","attraction","leisure","natural","historic","aeroway","waterway","peak"):
        if _ok(addr.get(k)): return addr[k]
    if _ok(name): return name
    for k in ("neighbourhood","quarter","suburb","hamlet","village","town","island",
              "city_district","borough","municipality","city","county"):
        if _ok(addr.get(k)): return addr[k]
    for k in ("city","town","village","county","state_district","province","state"):
        if addr.get(k): return addr[k]        # least-bad: a real place, even if grid-named
    return name or "?"

def reverse_name(lat, lng):
    key = f"rev:{lat:.4f},{lng:.4f}"
    if key in _cache: return _cache[key]
    u = ("https://nominatim.openstreetmap.org/reverse?format=jsonv2"
         f"&lat={lat}&lon={lng}&zoom=16&accept-language=ja,ko,zh,en")
    try:
        j = NOM.get(u)
        nm = label(j.get("address", {}), j.get("name") or "")
    except Exception as e:
        print(f"  reverse geocode failed @ {lat:.4f},{lng:.4f}: {type(e).__name__}")
        nm = ""
    _cache[key] = nm; _save_cache()
    return nm

def curated_places():
    pts = []
    for j in data_io.read_journeys():
        for s in j.get("stops", []):
            if s.get("name") and s.get("lat") is not None and s.get("lng") is not None:
                pts.append((s["name"], s["lat"], s["lng"]))
    return pts

# ----------------------------------------------------------------- osrm
def osrm_leg(a, b):
    key = f"osrm:{a[0]:.4f},{a[1]:.4f};{b[0]:.4f},{b[1]:.4f}"
    if key in _cache: return _cache[key]
    straight = hav(a, b)
    out = None
    try:
        j = OSRM.get("https://router.project-osrm.org/route/v1/driving/"
                     f"{a[1]},{a[0]};{b[1]},{b[0]}?overview=full&geometries=geojson")
        rt = j["routes"][0]
        pts = [[round(la,5), round(lo,5)] for lo, la in rt["geometry"]["coordinates"]]
        if len(pts) > 200:
            step = len(pts)/200
            pts = [pts[int(i*step)] for i in range(200)] + [pts[-1]]
        out = {"km": round(rt["distance"]/1000, 1), "pts": pts}
    except Exception:
        # unroutable (sea/flight/offline) -> arc; don't count huge phantom distances
        out = {"km": 0.0 if straight > FLIGHT_KM else round(straight, 1),
               "pts": _arc(a, b), "approx": True}
    _cache[key] = out; _save_cache()
    return out

def _arc(a, b, side=1):
    mx, my = (a[0]+b[0])/2, (a[1]+b[1])/2
    dx, dy = b[0]-a[0], b[1]-a[1]
    cx, cy = mx - dy*0.16*side, my + dx*0.16*side
    pts = []
    for i in range(0, 25):
        t = i/24; u = 1-t
        pts.append([round(u*u*a[0]+2*u*t*cx+t*t*b[0], 5), round(u*u*a[1]+2*u*t*cy+t*t*b[1], 5)])
    return pts

# ----------------------------------------------------------------- media
def process_photo(path, name):
    pipeline.THUMB.mkdir(parents=True, exist_ok=True)
    pipeline.LARGE.mkdir(parents=True, exist_ok=True)
    if (pipeline.THUMB / f"{name}.webp").exists() and (pipeline.LARGE / f"{name}.webp").exists():
        return                                   # resume-safe: already built
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"): im = im.convert("RGB")
        big = im.copy(); big.thumbnail((LARGE, LARGE), Image.LANCZOS)
        big.save(pipeline.LARGE / f"{name}.webp", "WEBP", quality=LARGE_Q, method=6)
        small = im.copy(); small.thumbnail((THUMBP, THUMBP), Image.LANCZOS)
        small.save(pipeline.THUMB / f"{name}.webp", "WEBP", quality=THUMB_Q, method=6)

# ----------------------------------------------------------------- build a trip
def build_trip(folder, jid, title, color, plan, vbudget):
    clusters, vids = scan_trip(folder)
    if not clusters:
        print(f"  {folder.name}: no geolocated photos, skipped"); return None, vbudget
    known = curated_places() if not plan else []

    stops = []
    all_ts = []
    seq = 1
    for cl in clusters:
        lat = sum(i["gps"][0] for i in cl)/len(cl)
        lng = sum(i["gps"][1] for i in cl)/len(cl)
        t0, t1 = cl[0]["t"], cl[-1]["t"]
        all_ts += [t0, t1]
        # name
        nm = ""
        if not plan:
            for pn, pla, pln in known:
                if hav((lat, lng), (pla, pln)) <= SNAP_KM:
                    nm = pn; break
            if not nm:
                nm = reverse_name(lat, lng)
        chosen = pick_spread(cl, CAP)
        media = []
        for it in chosen:
            name = f"{jid}-{seq:03d}"; seq += 1
            if not plan: process_photo(it["path"], name)
            media.append({"img": name})
        stops.append({"name": nm or folder.name, "lat": round(lat, 6), "lng": round(lng, 6),
                      "date": t0.strftime("%Y-%m-%d"), "note": "", "media": media,
                      "_t0": t0, "_t1": t1, "_photos": len(chosen)})

    # videos: shortest first, within per-trip + global budget, snapped to nearest stop by time
    vseq = 1
    cand = [v for v in vids if v["mb"] <= VIDEO_SRC_MAX_MB]
    cand.sort(key=lambda v: v["mb"])
    used = 0
    for v in cand[:VIDEO_PER_TRIP]:
        if vbudget[0] <= 0: break
        # nearest stop in time
        si = min(range(len(stops)), key=lambda i: abs((v["t"] - stops[i]["_t0"]).total_seconds()))
        name = f"{jid}-v{vseq:02d}"; vseq += 1
        if not plan:
            old = pipeline.SIZE_CAP_MB
            pipeline.SIZE_CAP_MB = VIDEO_ENC_CAP_MB
            try:
                print(f"  encoding {v['path'].name} ({v['mb']:.0f}MB) -> {name}.mp4")
                pipeline.encode_video(v["path"], name)
                mb = (pipeline.VID / f"{name}.mp4").stat().st_size/1e6
            finally:
                pipeline.SIZE_CAP_MB = old
        else:
            mb = min(v["mb"], VIDEO_ENC_CAP_MB)
        stops[si]["media"].append({"video": name})
        vbudget[0] -= mb; used += mb

    # legs between consecutive stops
    legs = []
    if not plan:
        for i in range(len(stops)-1):
            legs.append(osrm_leg((stops[i]["lat"], stops[i]["lng"]),
                                 (stops[i+1]["lat"], stops[i+1]["lng"])))

    start = min(all_ts).strftime("%Y-%m-%d")
    end   = max(all_ts).strftime("%Y-%m-%d")
    kept = sum(s["_photos"] for s in stops)
    for s in stops:
        for k in ("_t0", "_t1", "_photos"): s.pop(k, None)
    journey = {"id": jid, "title": title, "start": start, "end": end,
               "color": color, "summary": "", "stops": stops, "legs": legs}
    print(f"  {folder.name:<16} -> {jid:<11} {len(stops):>3} stops  {kept:>4} photos  "
          f"{used:>4.0f}MB vid  {start}..{end}")
    return journey, vbudget

# ----------------------------------------------------------------- main
def main(plan):
    print(f"{'PLAN (no writes)' if plan else 'BUILD'}  cap={CAP}/stop  "
          f"photo {LARGE}q{LARGE_Q}/{THUMBP}q{THUMB_Q}  video<= {VIDEO_BUDGET_MB}MB\n")
    vbudget = [VIDEO_BUDGET_MB]
    built = []
    for folder, jid, title, color in TRIPS:
        d = TOURING / folder
        if not d.is_dir():
            print(f"  MISSING {folder}"); continue
        j, vbudget = build_trip(d, jid, title, color, plan, vbudget)
        if j: built.append(j)

    if plan:
        tot_photos = sum(len(s["media"]) - sum(1 for m in s["media"] if "video" in m)
                         for j in built for s in j["stops"])
        est_mb = tot_photos * (LARGE_MB + THUMB_MB)
        print(f"\n  {len(built)} journeys  ~{tot_photos} photos  "
              f"~{est_mb:.0f}MB photos + ~{VIDEO_BUDGET_MB-vbudget[0]:.0f}MB video")
        print(f"  current committed ~505MB  ->  projected ~{505+est_mb+(VIDEO_BUDGET_MB-vbudget[0]):.0f}MB")
        return

    journeys = data_io.read_journeys()
    for j in built:
        idx = next((i for i, x in enumerate(journeys) if x["id"] == j["id"]), None)
        if idx is None: journeys.append(j)
        else: journeys[idx] = j
    data_io.write_journeys(journeys)
    committed = sum(f.stat().st_size for dd in (ROOT/"web", pipeline.VID)
                    for f in dd.rglob("*") if f.is_file())
    print(f"\n  journeys.js rewritten ({len(journeys)} journeys total)")
    print(f"  committed media now {committed/1e6:.0f}MB")

# rough per-photo sizes measured on samples (for --plan estimate only)
LARGE_MB = 0.19
THUMB_MB = 0.05

if __name__ == "__main__":
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass
    main("--plan" in sys.argv)
