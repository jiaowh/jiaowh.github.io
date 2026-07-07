"""One-off seeding: parse Untitled layer.kmz -> stops JSON, download hosted photos,
fetch OSRM road legs. Writes assets/moto/seed_out.json for the page-data authoring step.

Usage: python assets/moto/seed_kml.py [--skip-photos]
"""
import json, re, sys, time, zipfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
KMZ = REPO / "Untitled layer.kmz"
SRC = ROOT / "src"
OUT = ROOT / "seed_out.json"
NS = {"k": "http://www.opengis.net/kml/2.2"}
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}

# journey grouping by placemark name (KML document order is preserved within groups)
HOKKAIDO = {"納沙布岬", "宗谷岬", "白い道"}


def parse_kmz():
    with zipfile.ZipFile(KMZ) as z:
        kml = next(n for n in z.namelist() if n.endswith(".kml"))
        root = ET.fromstring(z.read(kml))
    stops = []
    for pm in root.iter("{http://www.opengis.net/kml/2.2}Placemark"):
        name = (pm.findtext("k:name", "", NS) or "").strip()
        coords = pm.findtext(".//k:Point/k:coordinates", "", NS).strip()
        if not coords:
            continue
        lng, lat = [float(x) for x in coords.split(",")[:2]]  # KML is lng,lat
        desc = pm.findtext("k:description", "", NS) or ""
        photos = re.findall(r'src="(https://mymaps\.usercontent\.google\.com/hostedimage/[^"]+)"', desc)
        stops.append({"name": name, "lat": lat, "lng": lng, "photos": photos})
    return stops


def slugify(s, i):
    table = {"納沙布岬": "nosappu", "宗谷岬": "soya", "白い道": "shiroimichi",
             "天空の鳥居": "tenku-torii", "興徳寺": "kotokuji", "田子の浦港": "tagonoura",
             "道の駅 富士川楽座": "fujikawa-rakuza", "魚河岸丸天 富士店": "maruten",
             "道の駅つる": "tsuru"}
    return table.get(s, f"stop{i}")


def download_photos(stops):
    for i, st in enumerate(stops):
        sslug = slugify(st["name"], i)
        got = []
        for n, url in enumerate(st["photos"], 1):
            dest = SRC / f"{sslug}-{n:02d}.jpg"
            if dest.exists():
                got.append(dest.name)
                continue
            for u in (url + "=s1600", url):
                try:
                    req = urllib.request.Request(u, headers=UA)
                    with urllib.request.urlopen(req, timeout=30) as r:
                        data = r.read()
                    if len(data) > 5000:
                        dest.write_bytes(data)
                        got.append(dest.name)
                        print(f"  ok  {dest.name}  {len(data)//1024}KB")
                        break
                except Exception as e:
                    print(f"  FAIL {sslug}-{n:02d}: {type(e).__name__} {e}")
            time.sleep(0.4)
        st["downloaded"] = got
        st["slug"] = sslug


def osrm_leg(a, b):
    """Fetch driving route a->b from OSRM demo server. Returns (km, [[lat,lng],...]) or None."""
    url = (f"https://router.project-osrm.org/route/v1/driving/"
           f"{a[1]},{a[0]};{b[1]},{b[0]}?overview=full&geometries=geojson")
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.load(r)
        route = j["routes"][0]
        pts = [[round(lat, 5), round(lng, 5)] for lng, lat in route["geometry"]["coordinates"]]
        # thin to <=220 points
        if len(pts) > 220:
            step = len(pts) / 220
            pts = [pts[int(i * step)] for i in range(220)] + [pts[-1]]
        return {"km": round(route["distance"] / 1000, 1), "pts": pts}
    except Exception as e:
        print(f"  OSRM FAIL {a}->{b}: {type(e).__name__} {e}")
        return None


def main():
    stops = parse_kmz()
    print(f"placemarks: {len(stops)}")
    for s in stops:
        print(f"  {s['name'] or '(unnamed)'}  {s['lat']:.5f},{s['lng']:.5f}  photos:{len(s['photos'])}")

    if "--skip-photos" not in sys.argv:
        print("\ndownloading hosted photos...")
        download_photos(stops)
    else:
        for i, s in enumerate(stops):
            s["slug"] = slugify(s["name"], i)
            s["downloaded"] = []

    hok = [s for s in stops if s["name"] in HOKKAIDO]
    fuji = [s for s in stops if s["name"] not in HOKKAIDO]
    # ride order: hokkaido south->north-ish (shiroimichi -> soya -> nosappu), fuji in KML order
    order = {"白い道": 0, "宗谷岬": 1, "納沙布岬": 2}
    hok.sort(key=lambda s: order.get(s["name"], 9))

    print("\nfetching OSRM legs...")
    for group, gname in ((hok, "hokkaido"), (fuji, "fuji")):
        for i in range(len(group) - 1):
            a, b = group[i], group[i + 1]
            leg = osrm_leg((a["lat"], a["lng"]), (b["lat"], b["lng"]))
            a["leg_to_next"] = leg
            print(f"  {gname}: {a['name']} -> {b['name']}  " +
                  (f"{leg['km']}km {len(leg['pts'])}pts" if leg else "none"))
            time.sleep(1.1)

    OUT.write_text(json.dumps({"hokkaido": hok, "fuji": fuji}, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
