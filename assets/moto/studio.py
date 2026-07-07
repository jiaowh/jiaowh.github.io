"""MOTO VAULT Studio — local curator tool (never published).

    python assets/moto/studio.py          then open  http://127.0.0.1:8787

Workflow:
  1. Drop a trip's photos/videos into  assets/moto/inbox/
  2. Studio groups them into stops by timestamp; place each stop by
     name-search / clicking the map / importing a Google My Maps KMZ.
  3. Notes, captions -> Save.
     Saving compresses media (WebP/MP4), archives originals to src/<id>/,
     fetches the road route (OSRM), and rewrites journeys.js.

Saving a journey with videos can take minutes (H.264 encode) — watch this console.
"""
import base64, io, json, mimetypes, re, shutil, sys, threading, time, urllib.request, zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build as pipeline
import data_io

ROOT = data_io.ROOT
INBOX = ROOT / "inbox"
SRC = ROOT / "src"
PORT = 8787
UA = {"User-Agent": "moto-vault-studio/1.0 (personal touring journal, contact: site owner)"}
CLUSTER_GAP_MIN = 45

_net_lock = threading.Lock()
_last_req = [0.0]


def throttled_get(url, timeout=30):
    """Serialize + rate-limit outbound requests (Nominatim policy: 1/s)."""
    with _net_lock:
        wait = 1.1 - (time.time() - _last_req[0])
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        finally:
            _last_req[0] = time.time()


# ---------------------------------------------------------------- inbox scan

def scan_inbox():
    files = []
    INBOX.mkdir(exist_ok=True)
    for p in sorted(INBOX.iterdir()):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext in pipeline.IMG_EXT:
            kind = "img"
        elif ext in pipeline.VID_EXT:
            kind = "vid"
        else:
            continue
        ts = pipeline.exif_datetime(p)
        gps = pipeline.exif_gps(p) if kind == "img" else None
        files.append({"name": p.name, "ts": ts, "gps": list(gps) if gps else None, "kind": kind})
    files.sort(key=lambda f: f["ts"])
    clusters, cur = [], None
    for f in files:
        t = datetime.strptime(f["ts"], "%Y-%m-%d %H:%M:%S")
        if cur and (t - cur["_end"]).total_seconds() <= CLUSTER_GAP_MIN * 60:
            cur["files"].append(f)
            cur["_end"] = t
        else:
            cur = {"files": [f], "_start": t, "_end": t}
            clusters.append(cur)
    for c in clusters:
        c["start"] = c.pop("_start").strftime("%Y-%m-%d %H:%M")
        c["end"] = c.pop("_end").strftime("%Y-%m-%d %H:%M")
        gpss = [f["gps"] for f in c["files"] if f["gps"]]
        c["gps"] = [sum(g[0] for g in gpss) / len(gpss), sum(g[1] for g in gpss) / len(gpss)] if gpss else None
    return {"count": len(files), "clusters": clusters}


# ---------------------------------------------------------------- geocode / kmz / osrm

def geocode(q):
    j = throttled_get("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q="
                      + urllib.request.quote(q))
    return [{"name": r.get("name") or q, "display": r.get("display_name", ""),
             "lat": float(r["lat"]), "lng": float(r["lon"])} for r in j]


def parse_kmz(b64):
    raw = base64.b64decode(b64)
    marks = []
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
        kml = next(n for n in z.namelist() if n.endswith(".kml"))
        root = ET.fromstring(z.read(kml))
    except zipfile.BadZipFile:  # plain .kml
        root = ET.fromstring(raw)
    for pm in root.iter("{http://www.opengis.net/kml/2.2}Placemark"):
        name = (pm.findtext("{http://www.opengis.net/kml/2.2}name") or "").strip()
        el = pm.find(".//{http://www.opengis.net/kml/2.2}Point/{http://www.opengis.net/kml/2.2}coordinates")
        if el is None or not (el.text or "").strip():
            continue
        lng, lat = [float(x) for x in el.text.strip().split(",")[:2]]
        marks.append({"name": name or f"Pin {len(marks)+1}", "lat": lat, "lng": lng})
    return marks


def osrm_leg(a, b):
    try:
        j = throttled_get("https://router.project-osrm.org/route/v1/driving/"
                          f"{a[1]},{a[0]};{b[1]},{b[0]}?overview=full&geometries=geojson")
        route = j["routes"][0]
        pts = [[round(la, 5), round(lo, 5)] for lo, la in route["geometry"]["coordinates"]]
        if len(pts) > 220:
            step = len(pts) / 220
            pts = [pts[int(i * step)] for i in range(220)] + [pts[-1]]
        return {"km": round(route["distance"] / 1000, 1), "pts": pts}
    except Exception as e:
        print(f"  OSRM failed ({type(e).__name__}) — page will draw a dashed arc for this leg")
        return {}


# ---------------------------------------------------------------- save

def next_seq(jid):
    n = 0
    for d, pat in ((pipeline.THUMB, f"{jid}-*.webp"), (pipeline.VID, f"{jid}-*.mp4")):
        for p in d.glob(pat):
            m = re.match(rf"{re.escape(jid)}-(\d+)", p.stem)
            if m:
                n = max(n, int(m.group(1)))
    return n + 1


def save_journey(payload):
    j = payload["journey"]
    jid = j.get("id", "")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", jid or ""):
        raise ValueError("journey id must be lowercase letters/digits/dashes")
    seq = next_seq(jid)
    archive = SRC / jid
    report = []
    for stop in j.get("stops", []):
        media = []
        for m in stop.get("media", []):
            if "pend" in m:
                src = INBOX / m["pend"]
                if not src.exists():
                    report.append(f"SKIP missing inbox file {m['pend']}")
                    continue
                name = f"{jid}-{seq:03d}"
                seq += 1
                if m.get("kind") == "vid":
                    print(f"encoding {src.name} -> {name}.mp4 (this can take minutes)")
                    pipeline.encode_video(src, name)
                    entry = {"video": name}
                    out = pipeline.VID / f"{name}.mp4"
                else:
                    pipeline.process_photo(src, name, force=True)
                    entry = {"img": name}
                    out = pipeline.LARGE / f"{name}.webp"
                if m.get("cap"):
                    entry["cap"] = m["cap"]
                media.append(entry)
                report.append(f"{m['pend']} -> {out.name}  {out.stat().st_size/1e6:.1f}MB")
                archive.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), archive / src.name)
            else:
                media.append({k: v for k, v in m.items() if k in ("img", "video", "cap") and v})
        stop["media"] = media
    # road legs between consecutive geo stops
    geo = [s for s in j.get("stops", []) if s.get("lat") is not None and s.get("lng") is not None]
    legs = []
    for i in range(len(geo) - 1):
        print(f"route {geo[i]['name']} -> {geo[i+1]['name']} ...")
        legs.append(osrm_leg((geo[i]["lat"], geo[i]["lng"]), (geo[i + 1]["lat"], geo[i + 1]["lng"])))
    j["legs"] = legs
    j = {k: j[k] for k in ("id", "title", "start", "end", "color", "summary", "stops", "legs") if k in j}

    journeys = data_io.read_journeys()
    idx = next((i for i, x in enumerate(journeys) if x["id"] == jid), None)
    if idx is None:
        journeys.append(j)
    else:
        journeys[idx] = j
    data_io.write_journeys(journeys)
    report.append("journeys.js rewritten")

    committed = sum(f.stat().st_size for d in (ROOT / "web", pipeline.VID) for f in d.rglob("*") if f.is_file())
    report.append(f"total committed media now {committed/1e6:.0f}MB"
                  + ("  ⚠ getting heavy — consider trimming/YouTube for long films" if committed > 800e6 else ""))
    return {"ok": True, "report": report, "journey": j}


# ---------------------------------------------------------------- http

class H(BaseHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _bytes(self, data, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        try:
            if self.path in ("/", "/index.html"):
                self._bytes((ROOT / "studio.html").read_bytes(), "text/html; charset=utf-8")
            elif self.path == "/api/state":
                self._json({"journeys": data_io.read_journeys(), "inbox": scan_inbox()})
            elif self.path.startswith("/inbox/"):
                p = (INBOX / urllib.request.unquote(self.path[7:])).resolve()
                if p.parent != INBOX.resolve() or not p.exists():
                    self._json({"err": "not found"}, 404); return
                self._bytes(p.read_bytes(), mimetypes.guess_type(p.name)[0] or "application/octet-stream")
            elif self.path.startswith("/thumb/"):
                p = (pipeline.THUMB / urllib.request.unquote(self.path[7:])).resolve()
                if p.parent != pipeline.THUMB.resolve() or not p.exists():
                    self._json({"err": "not found"}, 404); return
                self._bytes(p.read_bytes(), "image/webp")
            else:
                self._json({"err": "not found"}, 404)
        except Exception as e:
            self._json({"err": str(e)}, 500)

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n) or b"{}")
            if self.path == "/api/geocode":
                self._json({"results": geocode(data.get("q", ""))})
            elif self.path == "/api/kmz":
                self._json({"placemarks": parse_kmz(data.get("b64", ""))})
            elif self.path == "/api/upload":
                name = re.sub(r"[^\w.\- ぁ-ヿ一-鿿]", "_", Path(data["name"]).name)
                if not name or name.startswith("."):
                    raise ValueError(f"bad filename {data['name']!r}")
                dest = INBOX / name
                stem, ext = dest.stem, dest.suffix
                n = 1
                while dest.exists():
                    dest = INBOX / f"{stem}({n}){ext}"
                    n += 1
                dest.write_bytes(base64.b64decode(data["b64"]))
                if data.get("mtime"):  # preserve capture time for clustering fallback
                    import os
                    os.utime(dest, (data["mtime"] / 1000, data["mtime"] / 1000))
                self._json({"ok": True, "saved": dest.name})
            elif self.path == "/api/save":
                self._json(save_journey(data))
            else:
                self._json({"err": "not found"}, 404)
        except Exception as e:
            import traceback; traceback.print_exc()
            self._json({"ok": False, "err": str(e)}, 500)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            print(f"  {args[0]}")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    INBOX.mkdir(exist_ok=True)
    print(__doc__)
    print(f"inbox: {INBOX}  ({scan_inbox()['count']} files)")
    print(f"serving  http://127.0.0.1:{PORT}   (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
