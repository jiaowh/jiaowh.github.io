"""Import the rider's Google My Maps into the vault manifest.

old/map.html embedded 9 Google My Maps layers (as NetworkLinks) plus 7
hand-drawn route polylines. This resolves every layer to its live data
(`.../maps/d/kml?mid=..&forcekml=1`), pulls all placemarks (name, coords,
photo URLs) and the route polylines, groups them into journeys, and writes
a manifest the downloader + generator consume.

  python assets/moto/import_mymaps.py          # -> scratchpad/moto_manifest.json

Stage 2: import_photos.py  (download + webp, resumable, slow)
Stage 3: import_generate.py (writes assets/moto/journeys.js from the manifest)

Note: needs internet. The My Maps data is fetched live; photos are the
hostedimage URLs Google serves for those maps.
"""
import json, re, sys, io, zipfile, urllib.request, math
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent
OLD_MAP = ROOT.parent.parent / "old" / "map.html"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "manifest.json"
NS = {"k": "http://www.opengis.net/kml/2.2"}

# ---- journey definitions: which My Maps layers merge into each trip -------
# key = (map id, folder name) ; route names refer to the old/map.html polylines
LAYER_TO_JOURNEY = {
    ("1fL5sb0N-sN32RvrGF9AkFP9xqSEcevBN", "hokkaido"):       "kita",
    ("1fL5sb0N-sN32RvrGF9AkFP9xqSEcevBN", "Untitled layer"): "kita",    # 67-pin 北日本
    ("11fRoQ199cJ-CI7Lggh9JAe5lgFV4tFja", "minami"):         "minami",
    ("16RYVXi7tjgKDkFdIvdmaJzBwibp8_x7b", "kyushu"):         "minami",
    ("16RYVXi7tjgKDkFdIvdmaJzBwibp8_x7b", "shikoku"):        "minami",
    ("1me5nJY2K8PxFrOhDhbkA7bw9AcsJsk0", "Untitled layer"):  "fuji",     # 98-pin album
    ("1eOqNsKQQCVc39wZl29iezRjPaTJ15qYk", "izu"):            "izu",
    ("1eOqNsKQQCVc39wZl29iezRjPaTJ15qYk", "numazu"):         "izu",
    ("1UCBU9ro2aqRgKVIM9oqRVn5qVJXcwbre", "chiba"):          "chiba",
}
JOURNEY_META = {   # id: (title, color, route polyline, start-date guess)
    "kita":   ("北 — 北日本の記録",   "#b0413e", "north", "2023-08-01"),
    "minami": ("南 — 西日本の記録",   "#2f6b8f", "south", "2023-05-01"),
    "fuji":   ("富士・関東アルバム",   "#3f7d5a", None,    "2023-01-01"),
    "izu":    ("伊豆・沼津めぐり",     "#8a6d3b", None,    ""),
    "chiba":  ("千葉・茨城の海",       "#7a4b8a", None,    ""),
}
JOURNEY_ORDER = ["kita", "minami", "fuji", "izu", "chiba"]
# route-start anchors for nearest-neighbour ordering of stops
ANCHOR = {"kita": (35.68, 139.77), "minami": (35.68, 139.77), "fuji": (35.36, 138.73),
          "izu": (35.10, 139.08), "chiba": (35.62, 140.12)}

MIDS = sorted(set(mid for (mid, _n) in LAYER_TO_JOURNEY))


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=120).read()


def load_map(mid):
    raw = fetch(f"https://www.google.com/maps/d/kml?mid={mid}&forcekml=1")
    if raw[:2] == b"PK":
        zf = zipfile.ZipFile(io.BytesIO(raw))
        name = [n for n in zf.namelist() if n.endswith(".kml")][0]
        return zf.read(name).decode("utf-8", "replace")
    return raw.decode("utf-8", "replace")


def hav(a, b):
    R = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0] - a[0]); dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def nn_order(stops, anchor):
    """Greedy nearest-neighbour chain from the pin closest to anchor."""
    if not stops:
        return stops
    remaining = stops[:]
    cur = min(remaining, key=lambda s: hav((s["lat"], s["lng"]), anchor))
    remaining.remove(cur); out = [cur]
    while remaining:
        nxt = min(remaining, key=lambda s: hav((out[-1]["lat"], out[-1]["lng"]),
                                               (s["lat"], s["lng"])))
        remaining.remove(nxt); out.append(nxt)
    return out


def extract_routes():
    """Pull the hand-drawn polylines from old/map.html (lat/lng waypoint arrays)."""
    html = OLD_MAP.read_text(encoding="utf-8", errors="replace")
    routes = {}
    # each trip is an addPolylineN() function; N maps to the button label
    idx_to_name = {"": "momiji", "1": "400x", "2": "kanazawa", "3": "kansai",
                   "4": "fuji", "5": "south", "6": "north"}
    for m in re.finditer(r"function addPolyline(\d*)\(\)\s*\{", html):
        name = idx_to_name.get(m.group(1))
        if not name:
            continue
        # the path:[ {lat,lng}, ... ] array holds no nested [] -> first ] closes it
        pm = re.search(r"path:\s*\[(.*?)\]", html[m.end():m.end() + 30000], re.S)
        if not pm:
            continue
        pts = [[float(la), float(ln)] for la, ln in
               re.findall(r"lat:\s*([\d.\-]+)\s*,\s*lng:\s*([\d.\-]+)", pm.group(1))]
        if len(pts) > 1:
            routes[name] = pts
    return routes


def main():
    routes = extract_routes()
    print("routes from old/map.html:", {k: len(v) for k, v in routes.items()})

    buckets = {jid: [] for jid in JOURNEY_ORDER}
    import xml.etree.ElementTree as ET
    for mid in MIDS:
        kml = load_map(mid)
        root = ET.fromstring(kml)
        for folder in root.findall(".//k:Folder", NS):
            fn = folder.find("k:name", NS)
            fname = fn.text if fn is not None else ""
            jid = LAYER_TO_JOURNEY.get((mid, fname))
            if not jid:
                continue
            for pm in folder.findall(".//k:Placemark", NS):
                pt = pm.find(".//k:Point/k:coordinates", NS)
                if pt is None or not pt.text:
                    continue
                lng, lat, *_ = pt.text.strip().split(",")
                nm = pm.find("k:name", NS)
                desc = pm.find("k:description", NS)
                urls, seen = [], set()
                if desc is not None and desc.text:
                    for src in re.findall(r'<img[^>]+src="([^"]+)"', desc.text):
                        if ("hostedimage" in src or "googleusercontent" in src) and src not in seen:
                            seen.add(src); urls.append(src)
                buckets[jid].append({
                    "name": (nm.text or "").strip() if nm is not None else "",
                    "lat": round(float(lat), 6), "lng": round(float(lng), 6),
                    "img_urls": urls,
                })

    journeys = []
    for jid in JOURNEY_ORDER:
        title, color, route_name, start = JOURNEY_META[jid]
        stops = nn_order(buckets[jid], ANCHOR[jid])
        seq = 0
        for s in stops:
            s["photos"] = []
            for u in s.pop("img_urls"):
                seq += 1
                s["photos"].append({"name": f"{jid}-{seq:04d}", "url": u})
        journeys.append({
            "id": jid, "title": title, "color": color, "start": start,
            "route": routes.get(route_name) if route_name else None,
            "stops": stops,
        })
        nphoto = sum(len(s["photos"]) for s in stops)
        print(f"  {jid:<7} {len(stops):>3} stops  {nphoto:>4} photos  "
              f"route={route_name or '-'}({len(routes.get(route_name or '', []))} pts)")

    OUT.write_text(json.dumps({"journeys": journeys}, ensure_ascii=False), encoding="utf-8")
    tot_s = sum(len(j["stops"]) for j in journeys)
    tot_p = sum(len(s["photos"]) for j in journeys for s in j["stops"])
    print(f"\nwrote {OUT}  — {len(journeys)} journeys, {tot_s} stops, {tot_p} photos")


if __name__ == "__main__":
    main()
