"""Read/write assets/moto/journeys.js.

The .js file is a doc-comment header + `const JOURNEYS =` + a pure-JSON body
+ `;` so Python can round-trip it (json) while the page loads it as a script.
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
JOURNEYS_JS = ROOT / "journeys.js"
FILMS_JS = ROOT / "films.js"

JOURNEYS_HEADER = """\
/* ================================================================
   MOTO VAULT — journey data.            (this file is the vault!)

   HOW TO ADD A TRIP
   the easy way:  python assets/moto/studio.py
     1. drop the trip's photos/videos into  assets/moto/inbox/
     2. Studio groups them into stops by time; you place each stop
        (search a name / click the map / drop a My Maps KMZ export)
     3. write notes -> Save. Studio compresses media, fetches the
        road route, and rewrites this file. Commit journeys.js +
        assets/moto/web + assets/moto/video  (inbox/ and src/ stay local).

   the manual way: edit the JSON below.
     - a journey: {"id","title","start","end","color","summary","stops","legs"}
     - a stop:    {"name","lat","lng","date","note","media"}
       media entries:  {"img":"<name>"}  -> assets/moto/web/(thumb|large)/<name>.webp
                       {"video":"<name>"} -> assets/moto/video/<name>.mp4 (+ -poster.webp)
       run  python assets/moto/build.py photos|video ...  to create those files.
     - stop order = the order you rode; stops without lat/lng are
       shown in the story but not on the map.
     - "legs" (road geometry between consecutive stops) is machine-
       written by Studio/seed scripts; leave it alone by hand. If a
       leg is missing the page draws a dashed arc instead.
     - keep the body valid JSON (double quotes, no trailing commas,
       no comments) so Studio can read it back.
   ================================================================ */
const JOURNEYS =
"""

def _read(path, const):
    txt = path.read_text(encoding="utf-8")
    m = re.search(rf"const {const}\s*=\s*(\[.*\])\s*;?\s*$", txt, re.S)
    if not m:
        raise ValueError(f"could not find `const {const} = [...]` in {path}")
    return json.loads(m.group(1))


def read_journeys():
    return _read(JOURNEYS_JS, "JOURNEYS") if JOURNEYS_JS.exists() else []


def read_films():
    return _read(FILMS_JS, "FILMS") if FILMS_JS.exists() else []


def _compact_legs(js_text):
    """Collapse leg point pairs onto single lines so the file stays scannable."""
    return re.sub(r"\[\s+(-?\d+\.?\d*),\s+(-?\d+\.?\d*)\s+\]", r"[\1,\2]", js_text)


def write_journeys(journeys):
    body = json.dumps(journeys, ensure_ascii=False, indent=1)
    JOURNEYS_JS.write_text(JOURNEYS_HEADER + _compact_legs(body) + "\n;\n", encoding="utf-8")
