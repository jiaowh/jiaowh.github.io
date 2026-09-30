#!/usr/bin/env python3
"""Find lighter feed images for heavy works, using only size variants the source itself
publishes, then prove each is the same picture.

    python3 build/thumbs.py            # writes build/data/thumbs.json {img: th}

Candidates:
  * Squarespace CDN: the documented ?format=750w rendition of the same asset.
  * WordPress: a -WxH size of the same upload that appears in the source page's own
    srcset/markup (read from the research page cache).
  * WordPress standard sizes computed from the recorded dimensions (768/1024 wide).
A candidate is kept only if it verifies (200, image/*), is smaller in bytes, and its
difference hash is within 6 bits of the full image's. The full image is still what the
viewer shows; the thumbnail is only used in feeds and grids.
"""
import glob, json, os, re, sys, urllib.parse

SP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SP)
from verify import load_cache, verify_many

OUT = os.path.join(SP, 'data', 'thumbs.json')
MIN_BYTES = 350 * 1024


def ham(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count('1')


def works():
    files = [os.path.join(SP, 'data', f) for f in ('works_painters.json', 'works_illus.json', 'enrich_painters.json', 'enrich_illus.json')]
    files += glob.glob(os.path.join(SP, 'data', 'works', '*.json'))
    for f in files:
        for a in json.load(open(f, encoding='utf-8')):
            for w in a.get('works') or []:
                if w.get('img') and not w.get('th'):
                    yield w


def page_text(src):
    key = re.sub(r'[^A-Za-z0-9]+', '_', src)[:180]
    p = os.path.join(SP, 'cache', 'pages', key)
    return open(p, encoding='utf-8', errors='replace').read() if os.path.exists(p) else ''


def main():
    cache = load_cache()
    have = json.load(open(OUT)) if os.path.exists(OUT) else {}
    cands = {}
    for w in works():
        u = w['img']
        v = cache.get(u) or {}
        if not v.get('ok') or v.get('bytes', 0) < MIN_BYTES or u in have:
            continue
        host = urllib.parse.urlsplit(u).netloc
        if host == 'images.squarespace-cdn.com':
            cands[u] = [u.split('?')[0] + '?format=750w']
        elif '/wp-content/uploads/' in u:
            base = re.sub(r'(-scaled|-\d{2,4}x\d{2,4})?\.(\w+)$', '', u.split('?')[0])
            html = page_text(w.get('src', ''))
            found = set(re.findall(re.escape(base) + r'-(\d{3,4})x(\d{3,4})\.\w+', html))
            opts = sorted(found, key=lambda wh: abs(int(wh[0]) - 800))
            ext = u.split('?')[0].rsplit('.', 1)[-1]
            cands[u] = ['%s-%sx%s.%s' % (base, a, b, ext) for a, b in opts[:2] if 500 <= int(a) <= 1100]
            if not cands[u] and v.get('w') and v.get('h'):
                # WordPress's standard intermediate sizes (768 / 1024 wide, proportional
                # height); only kept below if the file exists and hash-matches the original
                for tw in (768, 1024):
                    if v['w'] > tw:
                        th_ = round(v['h'] * tw / v['w'])
                        cands[u] += ['%s-%dx%d.%s' % (base, tw, hh, ext) for hh in (th_, th_ - 1, th_ + 1)]
    urls = [t for ts in cands.values() for t in ts]
    print('checking', len(urls), 'thumbnail candidates for', len(cands), 'images')
    res = verify_many(urls, progress=False)
    added = 0
    for u, ts in cands.items():
        full = cache[u]
        for t in ts:
            r = res.get(t) or {}
            if r.get('ok') and r.get('bytes', 1e12) < full['bytes'] and full.get('hash') and r.get('hash') \
                    and ham(full['hash'], r['hash']) <= 6:
                have[u] = t
                added += 1
                break
    json.dump(have, open(OUT, 'w', encoding='utf-8'), indent=0, sort_keys=True)
    print('thumbnails recorded:', added, 'total', len(have))


if __name__ == '__main__':
    main()
