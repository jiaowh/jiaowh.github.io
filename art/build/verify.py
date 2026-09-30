#!/usr/bin/env python3
"""Fetch artwork image URLs and record what actually came back.

    python3 build/verify.py URL [URL ...]         # check a few by hand
    from verify import verify_many                # used by collect.py / research scripts

For each URL we record: HTTP status, content-type, final URL after redirects, byte size,
pixel dimensions, a 64-bit difference hash (for spotting the same picture at another
size or on another host) and the time of the check. Results are cached in
build/cache/verify.json so re-runs never re-hit a host that already answered.

A URL counts as usable only when: status 200, content-type image/*, the body decodes
as an image, and the short side is at least MIN_SIDE px.

Politeness: at most PER_HOST concurrent requests per host, a few global workers,
timeouts, and exponential backoff on 429/5xx. A host that keeps refusing (403 x3)
is recorded as blocked and skipped for the rest of the run.
"""
import io, json, os, sys, time, threading, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

SP = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(SP, 'cache', 'verify.json')
THUMBS = os.path.join(SP, 'cache', 'previews')


def preview_name(url):
    import hashlib
    return hashlib.sha1(url.encode('utf-8')).hexdigest()[:20] + '.jpg'
MIN_SIDE = 160
MAX_BYTES = 25 * 1024 * 1024
PER_HOST = 2
WORKERS = 8
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/149.0 Safari/537.36')

try:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
except ImportError:          # dimensions/hash become unknown, status still checked
    Image = None

_lock = threading.Lock()
_host_sem = {}
_host_403 = {}


def _sem(host):
    with _lock:
        if host not in _host_sem:
            _host_sem[host] = threading.Semaphore(1 if 'wikimedia.org' in host else PER_HOST)
        return _host_sem[host]


def load_cache():
    try:
        return json.load(open(CACHE, encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def save_cache(c):
    """Merge into the on-disk cache under a lock, so parallel research runs don't
    overwrite each other's results."""
    import fcntl
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE + '.lock', 'w') as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        disk = load_cache()
        disk.update(c)
        c.update(disk)
        tmp = CACHE + '.tmp'
        json.dump(disk, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
        os.replace(tmp, CACHE)


def dhash(im):
    g = im.convert('L').resize((9, 8))
    px = list(g.tobytes())
    bits = 0
    for r in range(8):
        for c in range(8):
            bits = (bits << 1) | (px[r * 9 + c] > px[r * 9 + c + 1])
    return '%016x' % bits


class _Retry(Exception):
    pass


def check(url, referer=None):
    host = urllib.parse.urlsplit(url).netloc
    rec = {'url': url, 'checked': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    if _host_403.get(host, 0) >= 3:
        rec.update(ok=False, err='host blocked earlier in run')
        return rec
    # urls may contain non-ascii (Japanese filenames): quote the path safely
    parts = urllib.parse.urlsplit(url)
    safe = urllib.parse.urlunsplit((parts.scheme, parts.netloc,
                                    urllib.parse.quote(parts.path, safe="/%:@!$&'()*+,;=~-._"),
                                    urllib.parse.quote(parts.query, safe="=&%:/+,;@!$'()*~-._?"),
                                    ''))
    hdrs = {'User-Agent': UA, 'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8'}
    if 'wikimedia.org' in host:     # their policy: identify the client, go slowly
        hdrs['User-Agent'] = 'SalonGalleryResearch/1.0 (personal art-gallery research; python-urllib)'
        time.sleep(1.5)
    if referer:
        hdrs['Referer'] = referer
    delay = 2
    for attempt in range(4):
        try:
            with _sem(host):
                req = urllib.request.Request(safe, headers=hdrs)
                with urllib.request.urlopen(req, timeout=25) as r:
                    body = r.read(MAX_BYTES + 1)
                    if r.status == 202 and attempt < 3:      # CDN still rendering the size
                        raise _Retry()
                    rec.update(status=r.status, ctype=r.headers.get('Content-Type', ''),
                               final=r.geturl(), bytes=len(body))
            break
        except urllib.error.HTTPError as e:
            rec.update(status=e.code, ctype=e.headers.get('Content-Type', '') if e.headers else '')
            if e.code == 403:
                with _lock:
                    _host_403[host] = _host_403.get(host, 0) + 1
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(delay); delay *= 2; continue
            rec.update(ok=False, err='http %d' % e.code)
            return rec
        except _Retry:
            time.sleep(delay); delay *= 2; continue
        except Exception as e:  # timeouts, DNS, TLS
            if attempt < 2:
                time.sleep(delay); delay *= 2; continue
            rec.update(ok=False, err=type(e).__name__ + ': ' + str(e)[:120])
            return rec
    ct = rec.get('ctype', '').lower()
    if rec.get('status') != 200:
        rec.update(ok=False, err='status %s' % rec.get('status')); return rec
    if not ct.startswith('image/'):
        rec.update(ok=False, err='content-type ' + ct); return rec
    if rec['bytes'] > MAX_BYTES:
        rec.update(ok=False, err='too large'); return rec
    if Image is not None:
        try:
            im = Image.open(io.BytesIO(body))
            im.load()
            rec.update(w=im.width, h=im.height, hash=dhash(im))
            try:   # small local preview for research contact sheets (never published)
                t = im.convert('RGB'); t.thumbnail((240, 240))
                os.makedirs(THUMBS, exist_ok=True)
                t.save(os.path.join(THUMBS, preview_name(url)), quality=80)
            except Exception:
                pass
        except Exception as e:
            rec.update(ok=False, err='undecodable: ' + str(e)[:80]); return rec
        if min(im.width, im.height) < MIN_SIDE:
            rec.update(ok=False, err='too small %dx%d' % (im.width, im.height)); return rec
    rec['ok'] = True
    return rec


def verify_many(urls, refresh=False, progress=True, referers=None):
    """Return {url: record}. Uses and updates the cache."""
    cache = load_cache()
    todo = [u for u in dict.fromkeys(urls) if refresh or u not in cache]
    referers = referers or {}
    done = [0]

    def one(u):
        r = check(u, referers.get(u))
        with _lock:
            cache[u] = r
            done[0] += 1
            if progress and done[0] % 25 == 0:
                print('  verified %d/%d' % (done[0], len(todo)), flush=True)
                save_cache(cache)
        return r

    if todo:
        with ThreadPoolExecutor(WORKERS) as ex:
            list(ex.map(one, todo))
        save_cache(cache)
    return {u: cache[u] for u in urls}


if __name__ == '__main__':
    res = verify_many(sys.argv[1:], refresh=True, progress=False)
    for u, r in res.items():
        print(('OK  ' if r.get('ok') else 'BAD ') + u)
        print('    ', {k: v for k, v in r.items() if k != 'url'})
