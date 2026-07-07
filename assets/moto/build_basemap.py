"""Build the offline WORLD basemap (assets/moto/basemap.json) from Natural Earth.

The whole planet's COUNTRY outlines, plus PREFECTURE/PROVINCE borders for the
countries you've actually ridden (auto-detected from journeys.js — Japan & Korea
now, wherever you go next later). Rounded geometry so the paper atlas ships in the
repo and the page makes ZERO external map/font requests: instant, works offline.

Run when you add a trip in a NEW country (needs internet):
    python assets/moto/build_basemap.py
basemap.json is committed and loaded locally after that. Existing countries need
no rebuild. To force provinces for a country before you've logged a trip there,
add its ISO3 code to ALWAYS below.
"""
import json, sys, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import data_io

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "basemap.json"
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
ADMIN0 = "ne_50m_admin_0_countries.geojson"     # world country outlines (light)
ADMIN1 = "ne_10m_admin_1_states_provinces.geojson"  # detailed provinces (filtered to visited)
ALWAYS = {"JPN", "KOR"}
PREC = 3  # ~110 m, plenty for borders on a world touring map


def prop(props, *names):
    low = {k.lower(): v for k, v in props.items()}
    for n in names:
        v = low.get(n.lower())
        if v not in (None, "", "-99"):
            return v
    return None


def round_coords(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], PREC), round(c[1], PREC)]
    return [round_coords(s) for s in c]


def dedup(ring):
    out = []
    for p in ring:
        if not out or out[-1] != p:
            out.append(p)
    return out


def clean_geom(g):
    t, co = g["type"], round_coords(g["coordinates"])
    if t == "Polygon":
        co = [r for r in (dedup(r) for r in co) if len(r) >= 4]
    elif t == "MultiPolygon":
        co = [p for p in ([r for r in (dedup(r) for r in poly) if len(r) >= 4] for poly in co) if p]
    else:
        return None
    return {"type": t, "coordinates": co} if co else None


def pip_ring(ring, x, y):
    inside, n, j = False, len(ring), len(ring) - 1
    for i in range(n):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def point_in_geom(g, x, y):
    def poly_hit(rings):
        c = False
        for r in rings:
            if pip_ring(r, x, y):
                c = not c
        return c
    if g["type"] == "Polygon":
        return poly_hit(g["coordinates"])
    if g["type"] == "MultiPolygon":
        return any(poly_hit(p) for p in g["coordinates"])
    return False


def fetch(name):
    print("downloading", name, "...")
    req = urllib.request.Request(BASE + name, headers={"User-Agent": "moto-vault/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


a0 = fetch(ADMIN0)
countries = [(prop(f["properties"], "ADM0_A3", "ISO_A3", "SOV_A3"), f["geometry"]) for f in a0["features"]]

visited = set(ALWAYS)
for j in data_io.read_journeys():
    for s in j.get("stops", []):
        if s.get("lat") is None:
            continue
        for iso, geom in countries:
            if iso and point_in_geom(geom, s["lng"], s["lat"]):
                visited.add(iso)
                break
print("prefecture/province detail for:", sorted(visited))

feats = []
for f in a0["features"]:                                   # tier 0: country outlines (non-visited)
    if prop(f["properties"], "ADM0_A3", "ISO_A3", "SOV_A3") in visited:
        continue
    cg = clean_geom(f["geometry"])
    if cg:
        feats.append({"type": "Feature", "properties": {"t": 0}, "geometry": cg})
n0 = len(feats)

a1 = fetch(ADMIN1)
for f in a1["features"]:                                   # tier 1: provinces for visited countries
    if prop(f["properties"], "adm0_a3", "iso_a2", "sov_a3", "admin") not in visited \
       and prop(f["properties"], "admin") not in ("Japan", "South Korea"):
        continue
    cg = clean_geom(f["geometry"])
    if cg:
        feats.append({"type": "Feature", "properties": {"t": 1}, "geometry": cg})

OUT.write_text(json.dumps({"type": "FeatureCollection", "features": feats},
                          separators=(",", ":")), encoding="utf-8")
print(f"tier0 countries: {n0}   tier1 provinces: {len(feats)-n0}")
print(f"wrote {OUT}  {OUT.stat().st_size/1e6:.1f} MB  ({len(feats)} features)")
