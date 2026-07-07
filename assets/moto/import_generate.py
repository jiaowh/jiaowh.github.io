"""Stage 3: write assets/moto/journeys.js from the manifest.

Includes only photos whose WebP derivatives actually exist (so a partial
download still yields a valid file; re-run after more photos land). Route
polylines from old/map.html ride the 北 and 南 journeys. Overwrites the
old seed journeys entirely.

  python assets/moto/import_generate.py
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent
MAN = ROOT / "manifest.json"
OUT = ROOT / "journeys.js"

SUMMARY = {
    "kita":   "北海道と東北をぐるりと巡った、最北端への長い旅の記録。",
    "minami": "関西から中国・四国、そして九州へ。西日本をひと巡りした記録。",
    "fuji":   "富士山麓を拠点に、関東から沖縄まで——あちこちで撮った一枚。",
    "izu":    "伊豆半島と沼津の海沿いをめぐった小旅行。",
    "chiba":  "房総半島と茨城の海岸線を走った、海沿いの記録。",
}
HEADER = '''/* ================================================================
   MOTO VAULT — journey data.            (this file is the vault!)

   Most of this was imported from the rider's Google My Maps:
     1. python assets/moto/import_mymaps.py     -> manifest.json
     2. python assets/moto/import_photos.py     -> download + webp
     3. python assets/moto/import_generate.py   -> (re)writes this file
   Re-run 1-3 to refresh from My Maps; edit below to curate by hand.

   ADD A TRIP the easy way:  python assets/moto/studio.py
     drop photos in assets/moto/inbox/, place stops, Save.

   SCHEMA
     - journey: {"id","title","start","end","color","summary","stops"}
                 optional "route":[[lat,lng]...]  = a drawn ride path; the
                 pins are places along it (北/南 have one, RIDE follows it).
     - stop:    {"name","lat","lng","date","note","media"}
                 media: {"img":"<name>"}  -> assets/moto/web/(thumb|large)/<name>.webp
                        {"video":"<name>"} -> assets/moto/video/<name>.mp4
     - a journey with neither "route" nor "legs" just shows its pins.
     - keep the body valid JSON (double quotes, no trailing commas, no
       comments) so Studio can read it back.
   ================================================================ */'''


def have(name):
    return (build.THUMB / f"{name}.webp").exists() and (build.LARGE / f"{name}.webp").exists()


def dump_journey(j):
    lines = [" {"]
    for k in ("id", "title", "start", "end", "color", "summary"):
        lines.append(f'  {json.dumps(k)}: {json.dumps(j[k], ensure_ascii=False)},')
    if "route" in j:
        lines.append(f'  "route": {json.dumps(j["route"], separators=(",", ":"))},')
    lines.append('  "stops": [')
    lines.append(",\n".join("   " + json.dumps(s, ensure_ascii=False) for s in j["stops"]))
    lines.append("  ]")
    lines.append(" }")
    return "\n".join(lines)


def main():
    data = json.loads(MAN.read_text(encoding="utf-8"))
    journeys, kept, dropped = [], 0, 0
    for j in data["journeys"]:
        stops = []
        for s in j["stops"]:
            media = []
            for p in s["photos"]:
                if have(p["name"]):
                    media.append({"img": p["name"]}); kept += 1
                else:
                    dropped += 1
            stops.append({"name": s["name"], "lat": s["lat"], "lng": s["lng"],
                          "date": "", "note": "", "media": media})
        obj = {"id": j["id"], "title": j["title"], "start": j.get("start", ""),
               "end": "", "color": j["color"], "summary": SUMMARY.get(j["id"], "")}
        if j.get("route"):
            obj["route"] = [[round(a, 5), round(b, 5)] for a, b in j["route"]]
        obj["stops"] = stops
        journeys.append(obj)
        print(f"  {j['id']:<7} {len(stops):>3} stops, {sum(len(s['media']) for s in stops):>4} photos"
              + (f", route {len(obj['route'])}pts" if 'route' in obj else ""))

    body = "[\n" + ",\n".join(dump_journey(j) for j in journeys) + "\n]"
    OUT.write_text(HEADER + "\nconst JOURNEYS =\n" + body + "\n;\n", encoding="utf-8")
    print(f"\nwrote {OUT}\n  {kept} photos linked, {dropped} not yet downloaded")


if __name__ == "__main__":
    main()
