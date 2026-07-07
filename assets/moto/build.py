"""Media pipeline for the moto touring vault.

Usage:
  python assets/moto/build.py photos [srcdir]      # webp derivatives for every image under srcdir (default assets/moto/src)
  python assets/moto/build.py video <src> [name]   # encode one video -> assets/moto/video/<name>.mp4 + <name>-poster.webp
  python assets/moto/build.py all                  # photos + any .mov/.MOV in assets/video not yet encoded

Outputs (committed):
  assets/moto/web/thumb/<stem>.webp   640px max-dim q80
  assets/moto/web/large/<stem>.webp   1600px max-dim q84
  assets/moto/video/<name>.mp4        H.264 yuv420p faststart, <=20MB target
  assets/moto/video/<name>-poster.webp

Also importable: exif_datetime(path), exif_gps(path) used by studio.py.
"""
import os, re, sys, subprocess, tempfile
from pathlib import Path

from PIL import Image, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS

try:  # iPhone/iPad photos are HEIC — pip install pillow-heif enables them
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    print("note: pillow-heif not installed — .heic photos will be skipped "
          "(pip install pillow-heif)")

ROOT = Path(__file__).resolve().parent          # assets/moto
SRC = ROOT / "src"
THUMB = ROOT / "web" / "thumb"
LARGE = ROOT / "web" / "large"
VID = ROOT / "video"
OLD_VIDEO_DIR = ROOT.parent / "video"           # assets/video (existing .mov sources)

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".tif", ".tiff"}
VID_EXT = {".mov", ".mp4", ".m4v", ".avi", ".mts"}

SIZE_CAP_MB = 20


def slug(s):
    s = re.sub(r"[^a-z0-9-]+", "-", s.lower()).strip("-")
    return re.sub(r"-{2,}", "-", s) or "x"


# ---------------------------------------------------------------- EXIF helpers

def _exif(path):
    try:
        with Image.open(path) as im:
            return im.getexif()
    except Exception:
        return None


def exif_datetime(path):
    """Return 'YYYY-MM-DD HH:MM:SS' from EXIF DateTimeOriginal/DateTime, else file mtime."""
    ex = _exif(path)
    if ex:
        ifd = {}
        try:
            ifd = ex.get_ifd(0x8769)  # Exif SubIFD
        except Exception:
            pass
        for src, tag in ((ifd, 0x9003), (ifd, 0x9004), (ex, 0x0132)):  # DateTimeOriginal, Digitized, DateTime
            v = src.get(tag) if src else None
            if v and str(v).strip():
                v = str(v).strip()
                # EXIF format: 'YYYY:MM:DD HH:MM:SS'
                m = re.match(r"(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})", v)
                if m:
                    return f"{m.group(1)}-{m.group(2)}-{m.group(3)} {m.group(4)}"
    import datetime
    return datetime.datetime.fromtimestamp(Path(path).stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")


def exif_gps(path):
    """Return (lat, lng) or None."""
    ex = _exif(path)
    if not ex:
        return None
    try:
        gps = ex.get_ifd(0x8825)
    except Exception:
        return None
    if not gps:
        return None

    def dms(v, ref):
        try:
            d = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
        except Exception:
            return None
        return -d if ref in ("S", "W") else d

    lat = dms(gps.get(2), gps.get(1, "N"))
    lng = dms(gps.get(4), gps.get(3, "E"))
    if lat is None or lng is None:
        return None
    return (lat, lng)


# ---------------------------------------------------------------- photos

def process_photo(path, name=None, force=False):
    """One image -> thumb+large webp. Returns output stem or None if skipped."""
    THUMB.mkdir(parents=True, exist_ok=True)
    LARGE.mkdir(parents=True, exist_ok=True)
    path = Path(path)
    stem = slug(name or path.stem)
    t, l = THUMB / f"{stem}.webp", LARGE / f"{stem}.webp"
    if t.exists() and l.exists() and not force:
        return None
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        big = im.copy()
        big.thumbnail((1600, 1600), Image.LANCZOS)
        big.save(l, "WEBP", quality=84, method=6)
        small = im.copy()
        small.thumbnail((640, 640), Image.LANCZOS)
        small.save(t, "WEBP", quality=80, method=6)
    return stem


def photos(srcdir=SRC):
    srcdir = Path(srcdir)
    done = []
    for p in sorted(srcdir.rglob("*")):
        if p.suffix.lower() in IMG_EXT and p.is_file():
            s = process_photo(p)
            if s:
                done.append(s)
                print(f"  {p.name} -> {s}.webp")
    print(f"photos: {len(done)} processed")
    return done


# ---------------------------------------------------------------- video

def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def encode_video(src, name=None, force=False):
    VID.mkdir(parents=True, exist_ok=True)
    src = Path(src)
    name = slug(name or src.stem)
    out = VID / f"{name}.mp4"
    poster = VID / f"{name}-poster.webp"
    if out.exists() and poster.exists() and not force:
        print(f"video: {name}.mp4 exists, skipping")
        return name
    ff = ffmpeg_exe()

    def run(crf, scale):
        cmd = [ff, "-y", "-i", str(src),
               "-vf", f"scale='min({scale},iw)':-2",
               "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
               "-pix_fmt", "yuv420p", "-movflags", "+faststart",
               "-c:a", "aac", "-b:a", "128k", str(out)]
        r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        if r.returncode != 0:
            # sources without audio: retry with -an
            cmd2 = [c for c in cmd if c not in ("-c:a", "aac", "-b:a", "128k")]
            cmd2.insert(-1, "-an")
            r = subprocess.run(cmd2, capture_output=True, text=True, errors="replace")
            if r.returncode != 0:
                raise RuntimeError(f"ffmpeg failed for {src}:\n{r.stderr[-2000:]}")
        return out.stat().st_size / 1e6

    mb = run(24, 1920)
    if mb > SIZE_CAP_MB:
        print(f"  {name}: {mb:.1f}MB > {SIZE_CAP_MB}MB, re-encoding crf27")
        mb = run(27, 1920)
    if mb > SIZE_CAP_MB:
        print(f"  {name}: {mb:.1f}MB still over, re-encoding 1280p crf27")
        mb = run(27, 1280)
    print(f"  {name}.mp4  {mb:.1f}MB")

    # poster: frame at 1s -> webp
    with tempfile.TemporaryDirectory() as td:
        png = Path(td) / "poster.png"
        r = subprocess.run([ff, "-y", "-ss", "1", "-i", str(out), "-frames:v", "1", str(png)],
                           capture_output=True, text=True, errors="replace")
        if r.returncode != 0 or not png.exists():
            r = subprocess.run([ff, "-y", "-i", str(out), "-frames:v", "1", str(png)],
                               capture_output=True, text=True, errors="replace")
        with Image.open(png) as im:
            im = im.convert("RGB")
            im.thumbnail((1280, 1280), Image.LANCZOS)
            im.save(poster, "WEBP", quality=80, method=6)
    print(f"  {name}-poster.webp")
    return name


def all_videos():
    for p in sorted(OLD_VIDEO_DIR.glob("*")):
        if p.suffix.lower() == ".mov" and p.stat().st_size > 0:
            encode_video(p)


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode == "photos":
        photos(sys.argv[2] if len(sys.argv) > 2 else SRC)
    elif mode == "video":
        encode_video(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif mode == "all":
        photos()
        all_videos()
    else:
        print(__doc__)
