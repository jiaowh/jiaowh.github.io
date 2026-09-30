#!/usr/bin/env python3
"""Per-work details (year, medium, size, collection, notes…) for the info panel.

    python build/meta.py            # all handlers (network; cached under cache/pages, cache/meta)
    python build/meta.py --only cma,bsky

Writes data/work_meta.json: {image URL: {t?, y?, m?, sz?, coll?, note?, pub?, tags?, posted?, via}}.
Every value comes from the work's own source (its caption, the page around the image, the
artist's file name, the museum/publisher record or the artist's own post). Nothing is guessed:
a field that the source does not state stays absent. build.py merges this file (it only fills
t/y/m where the older record is blank).
"""
import html as H, json, os, re, sys, time, urllib.parse, urllib.request

SP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SP)
from research import get, WM_UA

OUT = os.path.join(SP, 'data', 'work_meta.json')
MC = os.path.join(SP, 'cache', 'meta')
os.makedirs(MC, exist_ok=True)
ONLY = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None


def load_works():
    """(artist name, work) for every work record in the sources (same inputs as build.py)."""
    import glob
    rows = []
    for f in ('works_painters.json', 'works_illus.json', 'enrich_painters.json', 'enrich_illus.json'):
        rows += json.load(open(os.path.join(SP, 'data', f), encoding='utf-8'))
    for p in sorted(glob.glob(os.path.join(SP, 'data', 'works', '*.json'))):
        rows += json.load(open(p, encoding='utf-8'))
    out = []
    for r in rows:
        for w in r.get('works') or []:
            if w.get('img'):
                out.append((r['n'], w))
    return out


def jget(url, headers=None, cache=True):
    return json.loads(get(url, headers=headers) if cache else urllib.request.urlopen(
        urllib.request.Request(url, headers=headers or {}), timeout=30).read().decode())


def trim(s, n):
    if len(s) <= n:
        return s
    cut = s[:n]
    k = max(cut.rfind('. '), cut.rfind('。'), cut.rfind('! '), cut.rfind('? '))
    return (cut[:k + 1] if k > n * 0.5 else cut.rsplit(' ', 1)[0]) + ' …'


def text(s):
    s = re.sub(r'<br\s*/?>|</p>|</div>|</li>', ' · ', s, flags=re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = H.unescape(H.unescape(s)).replace('\\/', '/').replace('\\u003c', '<').replace('\\"', '"')
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', s).strip(' ·')


# ------------------------------------------------------------------ caption parsing
NUM = r'\d{1,4}(?:[.,]\d{1,2})?(?:\s?[½¼¾])?'
UNIT = r'(?:cm|mm|in\b\.?|inches|inch|["”″]|\'\')'
SIZE = re.compile(r'(?<![\w/.-])(%s)\s*(%s)?\s*[x×X]\s*(%s)\s*(%s)?(?:\s*[x×X]\s*(%s)\s*(%s)?)?' % (NUM, UNIT, NUM, UNIT, NUM, UNIT))
SIZE_JA = re.compile(r'(\d{1,3}(?:\.\d)?)\s*[×x]\s*(\d{1,3}(?:\.\d)?)\s*(?:cm|㎝)|(\d{1,3})\s*号')
MEDIA = r'(?:(?:oil and \w+|oil paint|oil|acrylic|watercolou?r|gouache|charcoal|graphite|pastel|ink|egg tempera|tempera|colou?red pencil|pencil|cont[eé]|silverpoint|mixed media|encaustic|etching|drypoint|lithograph|woodcut|woodblock print|color woodcut|colour woodcut|aquatint|chalk|sanguine|olio|huile|óleo|oleo)(?![a-zà-ÿ]))'
SUPPORT = r'(?:linen|canvas|panel|board|paper|wood|aluminium|aluminum|copper|dibond|gessobord|mylar|toned paper|linen on panel|canvas on panel|linen mounted on panel|multiple panels|mdf|masonite|hardboard|tela|tavola|lienzo|tabla|toile|carta|papel|\w+ paper)'
MED = re.compile(r'\b(%s(?:\s*(?:,|and|&)\s*%s)*(?:\s+(?:on|su|sur|sobre)\s+%s(?:\s+(?:on|mounted on)\s+%s)?)?)' % (MEDIA, MEDIA, SUPPORT, SUPPORT), re.I)
MED_JA = re.compile(r'(キャンバスに油彩|油彩[・、/／]?(?:キャンバス|カンヴァス|パネル|板|紙)?|キャンバス[・、]?油彩|パネルに油彩|紙に鉛筆|鉛筆[・、]?紙|テンペラ|水彩|アクリル|日本画|岩絵具|鉛筆)')
YEAR = re.compile(r'(?<!\d)(1[89]\d\d|20[0-2]\d)(?!\d)')
COLL = re.compile(r'((?:private collection|pvt\.? coll\.?|collection of|coll\.)[^.;|·]{0,60}|(?:museum|musée|museo|gallery)[^.;|·]{0,40}collection)', re.I)
IT = {'olio': 'oil', 'tela': 'canvas', 'tavola': 'panel', 'su': 'on', 'óleo': 'oil', 'oleo': 'oil', 'sobre': 'on', 'lienzo': 'canvas',
      'tabla': 'panel', 'huile': 'oil', 'sur': 'on', 'toile': 'canvas', 'carta': 'paper', 'papel': 'paper'}


def fmt_num(s):
    return s.replace(',', '.').replace(' ', '')


def parse_size(s):
    for m in SIZE.finditer(s):
        a, ua, b, ub, c, uc = m.groups()
        unit = ub or ua or uc or ''
        fa, fb = float(re.sub(r'[^\d.]', '', fmt_num(a)) or 0), float(re.sub(r'[^\d.]', '', fmt_num(b)) or 0)
        if not (2 <= fa <= 1200 and 2 <= fb <= 1200):
            continue
        if not unit and (fa > 150 or fb > 150):   # probably pixel sizes
            continue
        u = {'"': 'in', '”': 'in', '″': 'in', "''": 'in', 'inches': 'in', 'inch': 'in', 'in.': 'in'}.get(unit.strip().lower(), unit.strip().lower().rstrip('.'))
        dims = [fmt_num(a), fmt_num(b)] + ([fmt_num(c)] if c else [])
        return ' × '.join(dims) + (' ' + u if u else '')
    m = SIZE_JA.search(s)
    if m:
        return ('%s × %s cm' % (m.group(1), m.group(2))) if m.group(1) else ('%s号' % m.group(3))
    return ''


def parse_med(s):
    m = MED.search(s)
    if m:
        v = m.group(1).strip()
        if re.fullmatch(r'ink|chalk|pencil|oil', v, re.I) and not re.search(r'\b%s\b\s*(on|,|$)' % re.escape(v), s, re.I):
            pass
        v = ' '.join(IT.get(x.lower(), x) for x in v.split())
        return v[0].upper() + v[1:].lower()
    m = MED_JA.search(s)
    return m.group(1) if m else ''


def parse_caption(s, want_year=True):
    """Fields a caption states explicitly. s is plain text."""
    out = {}
    # never read numbers out of markup or addresses (upload paths carry years, srcsets carry pixel sizes)
    s = re.sub(r'<[^>]*>?|https?://\S+|\S+\.(?:jpe?g|png|webp|gif)\S*|\b(?:width|height)="?\d+', ' ', s, flags=re.I)
    sz = parse_size(s)
    if sz:
        out['sz'] = sz
    md = parse_med(s)
    if md:
        out['m'] = md
    if want_year:
        ys = YEAR.findall(s)
        if len(set(ys)) == 1:
            out['y'] = ys[0]
    c = COLL.search(s)
    if c:
        out['coll'] = re.sub(r'^pvt\.? coll\.?', 'Private collection', c.group(1).strip(' ,'), flags=re.I)
    return out


def fname(u):
    p = urllib.parse.unquote(urllib.parse.urlsplit(u).path.rsplit('/', 1)[-1])
    p = re.sub(r'\.\w{3,4}$', '', p)
    p = re.sub(r'-\d{2,4}x\d{2,4}$', '', p)
    return re.sub(r'(?<=[A-Za-z])-|-(?=[A-Za-z])', ' ', p.replace('+', ' ').replace('_', ' '))


# ------------------------------------------------------------------ handlers
def h_cma(w):
    m = re.search(r'clevelandart\.org/art/([\w.]+)', w.get('src', ''))
    if not m:
        return None
    j = jget('https://openaccess-api.clevelandart.org/api/artworks/%s' % m.group(1))['data']
    meas = j.get('measurements') or ''
    sz = re.sub(r'\s+', ' ', meas.split(';')[0]).strip()
    note = j.get('wall_description') or j.get('description') or j.get('fun_fact') or ''
    out = {'t': j.get('title'), 'y': j.get('creation_date'), 'm': j.get('technique'), 'sz': sz,
           'coll': 'Cleveland Museum of Art' + (', ' + j['accession_number'] if j.get('accession_number') else ''),
           'note': trim(text(note), 1200), 'type': j.get('type')}
    if j.get('credit_line'):
        out['credit'] = j['credit_line']
    return out


def h_commons(w):
    u = w['img']
    m = re.search(r'/commons/(?:thumb/)?\w/\w\w/([^/]+)', u)
    if 'wikimedia' not in u or not m:
        return None
    title = 'File:' + urllib.parse.unquote(m.group(1))
    q = {'action': 'query', 'format': 'json', 'titles': title, 'prop': 'revisions|imageinfo', 'rvprop': 'content', 'rvslots': 'main',
         'iiprop': 'extmetadata'}
    j = jget('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(q), headers={'User-Agent': WM_UA})
    pg = next(iter(j['query']['pages'].values()))
    wt = ((pg.get('revisions') or [{}])[0].get('slots', {}).get('main', {}).get('*', ''))
    md = ((pg.get('imageinfo') or [{}])[0].get('extmetadata') or {})

    def field(*names):
        for n in names:
            mm = re.search(r'\|\s*%s\s*=\s*(.+)' % n, wt, re.I)
            if mm:
                v = mm.group(1).strip()
                v = re.sub(r'\{\{\s*(?:en|ru)\s*\|\s*(?:1=)?(.*?)\}\}', r'\1', v)
                v = re.sub(r'\{\{\s*(?:technique|Oil on canvas)\s*\|?([^}]*)\}\}', lambda x: x.group(0), v)
                return v
        return ''

    out = {}
    med = field('medium', 'technique')
    t = re.match(r'\{\{\s*technique\s*\|([^}]*)\}\}', med, re.I)
    if re.match(r'\{\{\s*oil on canvas', med, re.I):
        out['m'] = 'Oil on canvas'
    elif t:
        parts = [x.strip() for x in t.group(1).split('|') if x.strip() and '=' not in x]
        if len(parts) >= 2 and parts[-2].lower() not in ('and', 'on'):
            parts.insert(-1, 'on')
        out['m'] = ' '.join(parts).capitalize()
    elif med and '{{' not in med:
        out['m'] = text(med)
    dim = field('dimensions')
    d = re.search(r'\{\{\s*size\s*\|\s*(?:unit=)?(\w+)\s*\|\s*(?:height=)?([\d.]+)\s*\|\s*(?:width=)?([\d.]+)', dim, re.I)
    if d:
        out['sz'] = '%s × %s %s' % (d.group(2), d.group(3), d.group(1))
    elif dim and '{{' not in dim:
        out['sz'] = parse_size(text(dim)) or text(dim)[:40]
    inst = field('institution', 'museum', 'current location')
    i = re.search(r'\{\{\s*Institution:([^}|]+)', inst)
    if i:
        out['coll'] = i.group(1).strip()
    elif inst and '{{' not in inst and not inst.startswith('|'):
        out['coll'] = text(re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', inst))[:80]
    date = text((md.get('DateTimeOriginal') or {}).get('value', ''))
    if date and len(date) < 30 and not re.match(r'\d{4}-\d\d-\d\d', date):   # skip photo/upload timestamps
        out['y'] = date
    obj = text((md.get('ObjectName') or {}).get('value', ''))
    if obj and len(obj) < 120 and not re.search(r'\d{8}|\.\w{3}$| by |\(\d{4}-', obj):
        out['t'] = obj
    desc = text((md.get('ImageDescription') or {}).get('value', ''))
    if desc and len(desc) > 30 and desc != obj:
        out['note'] = trim(desc, 600)
    time.sleep(1)
    return out


_bsky = None


def h_bsky(w):
    global _bsky
    m = re.match(r'https://bsky.app/profile/[^/]+/post/(\w+)', w.get('src', ''))
    dm = re.search(r'(did:plc:[a-z0-9]+)', w['img'])
    if not (m and dm):
        return None
    if _bsky is None:
        p = os.path.join(MC, 'bsky_posts.json')
        _bsky = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    uri = 'at://%s/app.bsky.feed.post/%s' % (dm.group(1), m.group(1))
    if uri not in _bsky:
        j = jget('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=' + urllib.parse.quote(uri, safe=''), cache=False,
                 headers={'User-Agent': 'salon-meta/1.0'})
        for p in j['posts']:
            _bsky[p['uri']] = {'text': p['record'].get('text', ''), 'at': p['record'].get('createdAt')}
        json.dump(_bsky, open(os.path.join(MC, 'bsky_posts.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    p = _bsky.get(uri)
    if not p:
        return None
    note = re.sub(r'\s*\n\s*', ' / ', p['text'].strip())
    note = re.sub(r'https?://\S+', '', note).strip(' /')
    out = {'posted': (p.get('at') or '')[:10]}
    if note:
        out['note'] = note[:500]
    out.update({k: v for k, v in parse_caption(p['text'], want_year=False).items() if k in ('m', 'sz')})
    return out


def h_pixiv(w):
    m = re.search(r'pixiv\.net/artworks/(\d+)', w.get('src', ''))
    if not m:
        return None
    p = os.path.join(MC, 'pixiv.json')
    cache = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    b = cache.get(m.group(1))
    if not b:
        b = jget('https://www.pixiv.net/ajax/illust/' + m.group(1), cache=False,
                 headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.pixiv.net/'})['body']
        cache[m.group(1)] = b
        json.dump(cache, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
        time.sleep(1)
    tags = [t['tag'] for t in b['tags']['tags'] if not re.search(r'users入り|^本家$|^仕事絵$|^オリジナル$|^原创$', t['tag'])][:6]
    out = {'t': b['title'], 'posted': b.get('createDate', '')[:10], 'tags': tags}
    cap = text(b.get('description') or b.get('illustComment') or '')
    if cap:
        out['note'] = cap[:400]
    return out


def h_book(w):
    src = w.get('src', '')
    if 'kadokawa.co.jp/product/' not in src and 'honto.jp/' not in src:
        return None
    try:
        pg = get(src)
    except Exception as e:
        return {'_err': str(e)}
    out = {}
    lds = re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', pg, re.S)
    for ld in lds:
        try:
            j = json.loads(ld)
        except ValueError:
            continue
        for x in (j if isinstance(j, list) else [j]):
            if not isinstance(x, dict) or x.get('@type') not in ('Book', 'Product'):
                continue
            nm = x.get('name')
            au = x.get('author')
            au = ', '.join(a.get('name', '') for a in au) if isinstance(au, list) else (au or {}).get('name', '') if isinstance(au, dict) else au
            pb = x.get('publisher')
            pb = pb.get('name') if isinstance(pb, dict) else pb
            out['pub'] = '『%s』' % nm + (' — ' + au if au else '') + (' · ' + pb if pb else '')
            if x.get('datePublished'):
                out['posted'] = x['datePublished'][:10]
    if not out:
        t = re.search(r'<meta property="og:title" content="([^"]+)"', pg)
        d = re.search(r'<meta (?:property|name)="og:description" content="([^"]+)"', pg)
        if t:
            out['pub'] = text(t.group(1))[:120]
        if d:
            out['note'] = text(d.group(1))[:300]
    lab = re.search(r'レーベル[^<]*</[^>]+>\s*<[^>]+>\s*(?:<a[^>]*>)?([^<]{2,40})', pg)
    if lab:
        out['label'] = text(lab.group(1))
    rel = re.search(r'発売日[^<]*</[^>]+>\s*<[^>]+>\s*([^<]{6,20})', pg)
    if rel and 'posted' not in out:
        out['posted'] = text(rel.group(1))
    time.sleep(0.6)
    out['type'] = 'Book cover illustration'
    return out


def page_segments(pg, img):
    """Text that belongs to this image on a page: the tag's alt/title and whatever follows it
    up to the next image. Several candidates (every occurrence)."""
    stem = urllib.parse.unquote(urllib.parse.urlsplit(img).path.rsplit('/', 1)[-1])
    stem = re.sub(r'\.\w{3,4}$', '', stem)
    stem = re.sub(r'-\d{2,4}x\d{2,4}$', '', stem)
    keys = {stem, urllib.parse.quote(stem), stem.replace(' ', '+'), stem.replace('/', '\\/')}
    segs = []
    for k in keys:
        if len(k) < 6:
            continue
        for m in re.finditer(re.escape(k), pg):
            i = m.start()
            tag_start = pg.rfind('<', 0, i)
            tag_end = pg.find('>', i)
            tag = pg[tag_start:tag_end + 1] if 0 <= tag_start and tag_end > 0 else ''
            attrs = ' · '.join(H.unescape(x) for x in re.findall(r'\b(?:alt|title|data-title|data-caption|aria-label)\s*=\s*"([^"]{3,300})"', tag))
            nxt = re.search(r'\.(?:jpe?g|png|webp)', pg[tag_end + 1:tag_end + 4000], re.I)
            seg = pg[tag_end + 1: tag_end + 1 + (nxt.start() if nxt else 1800)]
            # stop at the next image *tag* or JSON record with a different file
            seg = seg[:1800]
            jt = re.search(r'"title"\s*:\s*"([^"]{3,300})"', pg[i:i + 600])
            segs.append((attrs, text(seg)[:700], H.unescape(jt.group(1)).replace('\\/', '/') if jt else ''))
    return segs


def artlogic_detail(pg, img, base):
    stem = re.sub(r'\.\w{3,4}$', '', img.rsplit('/', 1)[-1])
    i = pg.find(stem)
    if i < 0:
        return None
    win = pg[max(0, i - 1500): i + 2500]
    links = [(abs(m.start() - 1500), m.group(1)) for m in re.finditer(r'href="(/[^"]*/works/\d+[^"]*)"', win)]
    if not links:
        return None
    link = urllib.parse.urljoin(base, min(links)[1])
    dp = get(link)
    out = {}
    for cls, key in (('medium', 'm'), ('dimensions', 'sz'), ('year', 'y'), ('description', 'note')):
        m = re.search(r'<div class="%s">(.*?)</div>' % cls, dp, re.S) or re.search(r'<span class="%s">(.*?)</span>' % cls, dp, re.S)
        if m and text(m.group(1)):
            out[key] = text(m.group(1))[:500]
    if 'sz' in out:
        out['sz'] = out['sz'].replace(' · ', '; ')
    t = re.search(r'<div class="subtitle">.*?<span class="title">(.*?)</span>', dp, re.S) or re.search(r'<span class="title">\s*<em>(.*?)</em>', dp, re.S)
    if t:
        out['t'] = text(t.group(1))
    time.sleep(0.8)
    return out


def jsonld_art(pg, img):
    stem = img.split('?')[0].rsplit('/', 1)[-1]
    for m in re.finditer(r'\{[^{}]*"@type"\s*:\s*\\?"VisualArtwork\\?"[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', pg):
        blk = m.group(0).replace('\\"', '"')
        if stem in blk:
            g = lambda k: (re.search(r'"%s"\s*:\s*"([^"]+)"' % k, blk) or [None, ''])[1]
            out = {'m': g('artMedium'), 'y': g('dateCreated')}
            wd, ht = g('width'), g('height')
            return {k: v for k, v in out.items() if v}
    return None


def h_page(w):
    src = w.get('src', '')
    if not src.startswith('http') or re.search(r'bsky\.app|pixiv\.net|wikimedia\.org|clevelandart\.org|kadokawa\.co\.jp/product|honto\.jp', src + ' ' + w['img']):
        return None           # these have their own handlers
    out = {}
    # 1) the artist's own file name ("Title, 2016, oil on linen, 36x48")
    fn = fname(w['img'])
    fc = parse_caption(fn)
    try:
        pg = get(src)
    except Exception as e:
        pg = ''
        out['_err'] = str(e)[:80]
    cand = []
    if pg:
        for attrs, seg, jt in page_segments(pg, w['img']):
            for s in (jt, attrs, seg[:400]):
                if s:
                    cand.append(s)
        if 'artlogic' in w['img'] or '/works/' in pg[:0] or 'artlogic.net' in pg[:5000]:
            try:
                d = artlogic_detail(pg, w['img'], src)
                if d:
                    out.update({k: v for k, v in d.items() if v})
            except Exception as e:
                out['_err'] = 'artlogic ' + str(e)[:60]
        j = jsonld_art(pg, w['img'])
        if j:
            for k, v in j.items():
                out.setdefault(k, v)
    # pick the richest caption (size+medium beat medium beat year)
    best, score = {}, 0
    for s in cand:
        c = parse_caption(s)
        sc = 3 * ('sz' in c) + 2 * ('m' in c) + ('y' in c) + ('coll' in c)
        if sc > score:
            best, score, bests = c, sc, s
    for k, v in fc.items():
        out.setdefault(k, v)
    for k, v in best.items():
        out.setdefault(k, v)
    if score:
        out['_cap'] = bests[:300]
    if out.get('m'):
        m = out['m'].strip(' ・、,.;')
        out['m'] = m[0].upper() + m[1:].lower() if re.match(r'[A-Za-z]', m) else m
    for k in ('t',):
        if out.get(k):
            out[k] = out[k].strip(' "“”')
    return out


HANDLERS = [('cma', h_cma), ('commons', h_commons), ('bsky', h_bsky), ('pixiv', h_pixiv), ('book', h_book), ('page', h_page)]


def main():
    prev = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    works = load_works()
    res = dict(prev)
    n = 0
    for name, w in works:
        img = w['img']
        for hn, fn in HANDLERS:
            if ONLY and hn not in ONLY:
                continue
            if img in prev and prev[img].get('via') == hn and '--redo' not in sys.argv:
                break
            try:
                r = fn(w)
            except Exception as e:
                r = {'_err': '%s: %s' % (type(e).__name__, str(e)[:100])}
            if r is None:
                continue
            r = {k: v for k, v in r.items() if v not in (None, '', [], {})}
            r['via'] = hn
            res[img] = r
            n += 1
            if n % 25 == 0:
                print(n, name, hn, {k: v for k, v in r.items() if k in ('t', 'y', 'm', 'sz')}, flush=True)
                json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
            break
    json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('done', len(res))


if __name__ == '__main__':
    main()
