#!/usr/bin/env python3
"""Research helpers used while expanding the collection (development time only —
the published page never crawls anything).

    python3 build/research.py page URL [URL ...]  > cands.json   # images on a page
    python3 build/research.py commons "Category:Paintings by X" > cands.json
    python3 build/research.py sheet cands.json out.png [--cols 6]  # numbered contact sheet
    python3 build/research.py verify cands.json                    # fetch-check + dims

Candidates are {"img", "src", "alt", "t"?, "y"?, "lic"?} records. Nothing goes into the
gallery from here directly: chosen records are copied into build/data/works/*.json
after looking at the contact sheet and the source page.
"""
import html as H, io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

SP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SP)
from verify import verify_many, load_cache, UA

PAGE_CACHE = os.path.join(SP, 'cache', 'pages')
WM_UA = 'SalonGalleryResearch/1.0 (personal art-gallery research; python-urllib)'


def get(url, timeout=30, binary=False, headers=None):
    os.makedirs(PAGE_CACHE, exist_ok=True)
    key = re.sub(r'[^A-Za-z0-9]+', '_', url)[:180]
    p = os.path.join(PAGE_CACHE, key)
    if not binary and os.path.exists(p) and time.time() - os.path.getmtime(p) < 86400 * 3:
        return open(p, encoding='utf-8', errors='replace').read()
    parts = urllib.parse.urlsplit(url)
    safe = urllib.parse.urlunsplit((parts.scheme, parts.netloc, urllib.parse.quote(parts.path, safe="/%:@!$&'()*+,;=~-._"),
                                    urllib.parse.quote(parts.query, safe="=&%:/+,;@!$'()*~-._?"), ''))
    h = {'User-Agent': UA, 'Accept-Language': 'en,ja;q=0.8'}
    h.update(headers or {})
    delay = 3
    for attempt in range(5):
        try:
            if 'wikimedia.org' in parts.netloc:
                time.sleep(1.5)          # Wikimedia rate-limits bursts of image requests
                h['User-Agent'] = WM_UA
            req = urllib.request.Request(safe, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 4:
                time.sleep(delay); delay *= 2; continue
            raise
    if binary:
        return body
    txt = body.decode('utf-8', errors='replace')
    open(p, 'w', encoding='utf-8').write(txt)
    return txt


IMG_EXT = re.compile(r'\.(jpe?g|png|webp|gif|avif)(\?|$)', re.I)


def page_images(url, html=None):
    html = html if html is not None else get(url)
    out, seen = [], set()

    def add(u, alt=''):
        if not u or u.startswith('data:'):
            return
        u = H.unescape(u.strip())
        u = urllib.parse.urljoin(url, u)
        if u in seen:
            return
        seen.add(u)
        out.append({'img': u, 'src': url, 'alt': H.unescape(alt or '').strip()})

    for m in re.finditer(r'<img\b[^>]*>', html, re.I):
        tag = m.group(0)
        alt = re.search(r'\balt\s*=\s*"([^"]*)"', tag) or re.search(r"\balt\s*=\s*'([^']*)'", tag)
        alt = alt.group(1) if alt else ''
        best = None
        for attr in ('data-src', 'data-lazy-src', 'data-original', 'data-image', 'src'):
            a = re.search(r'\b%s\s*=\s*"([^"]+)"' % attr, tag) or re.search(r"\b%s\s*=\s*'([^']+)'" % attr, tag)
            if a and not a.group(1).startswith('data:'):
                best = a.group(1); break
        ss = re.search(r'\b(?:data-)?srcset\s*=\s*"([^"]+)"', tag)
        if ss:  # largest candidate in srcset
            cands = []
            for part in ss.group(1).split(','):
                bits = part.strip().split()
                if not bits:
                    continue
                wv = int(re.sub(r'\D', '', bits[1]) or 0) if len(bits) > 1 and bits[1].endswith('w') else 0
                cands.append((wv, bits[0]))
            if cands:
                best = max(cands)[1]
        add(best, alt)
    for m in re.finditer(r'<a\b[^>]*href\s*=\s*"([^"]+)"', html, re.I):
        if IMG_EXT.search(m.group(1)):
            add(m.group(1))
    for m in re.finditer(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html, re.I):
        add(m.group(1), 'og:image')
    return out


def commons(cat, limit=500):
    """List files in a Wikimedia Commons category with url, size, license, description."""
    api = 'https://commons.wikimedia.org/w/api.php'
    out, cont = [], {}
    while len(out) < limit:
        q = {'action': 'query', 'format': 'json', 'generator': 'categorymembers', 'gcmtitle': cat,
             'gcmtype': 'file', 'gcmlimit': '100', 'prop': 'imageinfo',
             'iiprop': 'url|size|extmetadata|mime', 'iiurlwidth': '1280',
             'iiextmetadatafilter': 'LicenseShortName|ObjectName|DateTimeOriginal|ImageDescription|Artist'}
        q.update(cont)
        j = json.loads(get(api + '?' + urllib.parse.urlencode(q), headers={'User-Agent': WM_UA}))
        for pg in (j.get('query') or {}).get('pages', {}).values():
            ii = (pg.get('imageinfo') or [{}])[0]
            if not ii.get('mime', '').startswith('image/'):
                continue
            md = ii.get('extmetadata') or {}
            val = lambda k: re.sub(r'<[^>]+>', '', (md.get(k) or {}).get('value', '')).strip()
            big = ii.get('width', 0) > 1600 and ii.get('thumburl')
            out.append({'img': ii.get('thumburl') if big else ii.get('url'), 'orig': ii.get('url'),
                        'src': ii.get('descriptionurl'), 'alt': pg['title'][5:],
                        't': val('ObjectName')[:140], 'y': val('DateTimeOriginal')[:40],
                        'lic': val('LicenseShortName'), 'by': val('Artist')[:80],
                        'w': ii.get('width'), 'h': ii.get('height')})
        if 'continue' not in j:
            break
        cont = j['continue']
    return out


def sheet(cands, out, cols=6, cell=220):
    from PIL import Image, ImageDraw
    rows = (len(cands) + cols - 1) // cols
    W, Hh = cols * cell, rows * (cell + 16)
    im = Image.new('RGB', (W, max(Hh, 20)), (24, 22, 20))
    d = ImageDraw.Draw(im)
    for i, c in enumerate(cands):
        x, y = (i % cols) * cell, (i // cols) * (cell + 16)
        try:
            from verify import THUMBS, preview_name
            pv = [os.path.join(THUMBS, preview_name(u)) for u in (c['img'], c.get('th')) if u]
            pv = [p for p in pv if os.path.exists(p)]
            if pv:
                t = Image.open(pv[0]).convert('RGB')
            else:
                u = c.get('th') or c['img']
                b = get(u, binary=True, timeout=25)
                t = Image.open(io.BytesIO(b)).convert('RGB')
            t.thumbnail((cell - 8, cell - 8))
            im.paste(t, (x + 4 + (cell - 8 - t.width) // 2, y + 4 + (cell - 8 - t.height) // 2))
        except Exception as e:
            d.text((x + 8, y + 90), 'ERR ' + str(e)[:24], fill=(220, 90, 80))
        d.text((x + 6, y + cell), '%d %s' % (i, (c.get('t') or c.get('alt') or '')[:30]), fill=(230, 220, 200))
    im.save(out, quality=82)
    return out


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'page':
        res = []
        for u in sys.argv[2:]:
            try:
                res += page_images(u)
            except Exception as e:
                print('ERR', u, e, file=sys.stderr)
        print(json.dumps(res, ensure_ascii=False, indent=0))
    elif cmd == 'commons':
        print(json.dumps(commons(sys.argv[2]), ensure_ascii=False, indent=0))
    elif cmd == 'sheet':
        cols = int(sys.argv[sys.argv.index('--cols') + 1]) if '--cols' in sys.argv else 6
        sheet(json.load(open(sys.argv[2])), sys.argv[3], cols)
    elif cmd == 'verify':
        c = json.load(open(sys.argv[2]))
        r = verify_many([x['img'] for x in c] + [x['th'] for x in c if x.get('th')], progress=False)
        for i, x in enumerate(c):
            v = r[x['img']]
            print(i, 'OK ' if v.get('ok') else 'BAD', v.get('w'), v.get('h'), v.get('err', ''), x['img'][:100])
