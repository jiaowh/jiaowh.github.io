"""Stage 2: download every photo in the manifest and compress to WebP.

Streams each hostedimage URL to a temp file, runs it through the vault's
photo pipeline (640/1600 WebP), then deletes the temp — so the ~16GB of
Google-hosted originals never touch disk; only the ~250MB of derivatives
stay. The originals are full-res (~10-16MB each) and Google won't serve a
smaller size, so downloads run in a thread pool to stay fast. Resumable: a
photo whose thumb+large already exist is skipped.

  python assets/moto/import_photos.py [workers]  # default 12 workers

Progress + failures are printed and logged to manifest_photos.log.
"""
import json, sys, time, tempfile, threading, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # process_photo, THUMB, LARGE

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent
MAN = ROOT / "manifest.json"
LOG = ROOT / "manifest_photos.log"
WORKERS = int(sys.argv[1]) if len(sys.argv) > 1 else 12

data = json.loads(MAN.read_text(encoding="utf-8"))
jobs = [(p["name"], p["url"]) for j in data["journeys"] for s in j["stops"] for p in s["photos"]]
total = len(jobs)
build.THUMB.mkdir(parents=True, exist_ok=True)
build.LARGE.mkdir(parents=True, exist_ok=True)
print(f"{total} photos to fetch, {WORKERS} workers")

lock = threading.Lock()
counts = {"done": 0, "skip": 0, "fail": 0, "seen": 0}
fails = []
t0 = time.time()


def fetch_one(nu):
    name, url = nu
    if (build.THUMB / f"{name}.webp").exists() and (build.LARGE / f"{name}.webp").exists():
        return ("skip", name)
    for attempt in range(6):   # exponential backoff rides out Google's throttling
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            raw = urllib.request.urlopen(req, timeout=120).read()
            with tempfile.NamedTemporaryFile(suffix=".img", delete=False) as tf:
                tf.write(raw); tmp = Path(tf.name)
            try:
                build.process_photo(tmp, name=name, force=True)
            finally:
                tmp.unlink(missing_ok=True)
            return ("done", name)
        except Exception as e:
            if attempt == 5:
                return ("fail", f"{name} {url} :: {e}")
            time.sleep(2 ** attempt + 0.5)   # 1.5, 2.5, 4.5, 8.5, 16.5s


t_first = [None]   # when the first real download starts (skips are instant)

with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    for res in ex.map(fetch_one, jobs):
        kind, info = res
        with lock:
            counts[kind] += 1; counts["seen"] += 1
            if kind == "fail":
                fails.append(info)
            if kind != "skip" and t_first[0] is None:
                t_first[0] = time.time()
            n = counts["seen"]
            on_disk = counts["skip"] + counts["done"]
        if n % 10 == 0 or n == total:
            newn = counts["done"]
            drate = newn / max(1e-6, time.time() - (t_first[0] or t0))   # downloads/sec
            remaining = total - on_disk
            eta = remaining / drate if drate > 0.02 else 0
            bar = int(40 * on_disk / total)
            print(f"  [{'#'*bar}{'.'*(40-bar)}] {on_disk}/{total} photos  "
                  f"(+{newn} new, {counts['fail']} fail)  {drate:.1f}/s"
                  + (f"  eta {eta/60:.0f}m" if eta else ""), flush=True)

LOG.write_text("\n".join(fails), encoding="utf-8")
print(f"\ndownload done. new {counts['done']}, already-had {counts['skip']}, failed {counts['fail']}."
      + (f"  ({counts['fail']} failures logged in {LOG.name} — re-run to retry them)" if fails else ""))

# regenerate journeys.js so the newly-downloaded photos show up on the page
print("\nregenerating assets/moto/journeys.js ...")
import import_generate
import_generate.main()
print("\nALL DONE — journeys.js updated. Commit assets/moto/journeys.js + assets/moto/web/ .")
