#!/usr/bin/env python3
"""Build explore.html from its sources.

    python3 build/build.py            # offline: uses cached verification only
    python3 build/build.py --verify   # first fetch-check any image URL not yet verified

Sources (all under build/):
    template.html          page shell + CSS           (source of truth for markup)
    app.js                 runtime                    (source of truth for behaviour)
    data/seed_painters.json, data/seed_illus.json      the original hand-written lists
    data/enrich_painters.json, data/enrich_illus.json  earlier research (+ their works)
    data/works_painters.json, data/works_illus.json    works for the seed artists
    data/study.json        Study tab: groups of teachers / schools
    data/artists_new.json  artists added in later research passes
    data/artist_meta.json  per-artist extras: aliases, official links, tab overrides
    data/works/*.json      research batches: [{"n": artist, "works": [...]}]
    cache/verify.json      results of fetching every image URL (see verify.py)

Only works whose image URL (and thumbnail URL, if any) has a successful verification
record reach the page. Everything else is listed in build/report.json.
    data/work_meta.json    per-work details from meta.py (size, collection, notes…)
    data/work_motifs.json  per-work subject line (what the picture shows), from looking at it

Output path is ../index.html relative to this file (served at jiaowh.github.io/art/;
override with --out).
"""
import glob, hashlib, json, os, re, sys, time, unicodedata, urllib.parse

SP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SP)
from verify import load_cache, verify_many

OUT = os.path.join(os.path.dirname(SP), 'index.html')
if '--out' in sys.argv:
    OUT = os.path.abspath(sys.argv[sys.argv.index('--out') + 1])


def load(name, default=None):
    p = os.path.join(SP, 'data', name)
    if not os.path.exists(p):
        print('  (missing %s)' % name)
        return default
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def slug(s):
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return s or 'x' + hashlib.sha1(s.encode()).hexdigest()[:6]


def clean(d):
    return {k: v for k, v in d.items() if v not in (None, '', [], {})}


# ---------------------------------------------------------------- artists
artists, by_name = [], {}


def add_artist(rec, tab, kind, is_new=False, origin=''):
    n = rec['n']
    if n in by_name:
        a = artists[by_name[n]]
        if tab not in a['tabs']:
            a['tabs'].append(tab)
        for k in ('jp', 'r', 'b', 'why'):
            if not a.get(k) and rec.get(k):
                a[k] = rec[k]
        return a
    a = {'n': n, 'jp': rec.get('jp', ''), 'r': rec.get('r', ''), 'b': rec.get('b', ''),
         'why': rec.get('why', ''), 'w': rec.get('w') or [], 'tabs': [tab], 'kind': kind,
         'links': [], 'aka': [], 'isNew': bool(is_new or rec.get('isNew')), 'origin': origin}
    for k in ('disc', 'reason'):             # research metadata; not shown on cards
        if rec.get(k):
            a[k] = rec[k]
    if rec.get('site'):
        a['links'].append([rec.get('siteLabel') or 'official site', rec['site']])
    for l in rec.get('links') or []:
        a['links'].append(list(l))
    if rec.get('aka'):
        a['aka'] = list(rec['aka'])
    by_name[n] = len(artists)
    artists.append(a)
    return a


for r in load('seed_painters.json', []):
    add_artist(r, 'cont', 'painter', origin='seed')
for r in load('enrich_painters.json', []):
    add_artist(r, 'cont', 'painter', True, origin='enrich')
for r in load('seed_illus.json', []):
    add_artist(r, 'illu', 'illustrator', origin='seed')
for r in load('enrich_illus.json', []):
    add_artist(r, 'illu', 'illustrator', True, origin='enrich')
for r in load('artists_new.json', []):
    tabs = r.get('tabs') or ['cont']
    a = add_artist(r, tabs[0], r.get('kind') or ('illustrator' if tabs[0] == 'illu' else 'painter'), True, origin='research-2026-09-30')
    for t in tabs[1:]:
        if t not in a['tabs']:
            a['tabs'].append(t)

study = load('study.json', {}) or {}
study_alias = load('study_alias.json', {}) or {}
groups = []
for gi, g in enumerate(study.get('groups', [])):
    groups.append(g['group'])
    for r in g['artists']:
        target = study_alias.get(r['n'], r['n'])       # same person listed under another name
        existed = target in by_name
        a = add_artist(r if not existed else {'n': target}, 'study', 'teacher', origin='study')
        if target != r['n'] and r['n'] not in a['aka']:
            a['aka'].append(r['n'])
        a['study'] = clean({'gi': gi, 'g': g['group'], 'r': r.get('r'), 'b': r.get('b'), 'why': r.get('why'),
                            'site': r.get('site'), 'siteLabel': r.get('siteLabel')})
        if not existed:
            a['links'] = []          # the school link lives in study.site

meta = load('artist_meta.json', {}) or {}
for n, m in meta.items():
    if n not in by_name:
        print('  artist_meta: unknown artist', n)
        continue
    a = artists[by_name[n]]
    for x in m.get('aka', []):
        if x not in a['aka']:
            a['aka'].append(x)
    for l in m.get('links', []):
        if l[1] not in [y[1] for y in a['links']]:
            a['links'].append(l)
    for t in m.get('tabs', []):
        if t not in a['tabs']:
            a['tabs'].append(t)
    for k in ('jp', 'r', 'b', 'kind', 'disc', 'reason'):
        if m.get(k):
            a[k] = m[k]

alias = {}
for i, a in enumerate(artists):
    alias[a['n']] = i
    for x in a['aka']:
        alias.setdefault(x, i)

ids = set()
for a in artists:
    base = slug(a['n'])
    i, k = base, 2
    while i in ids:
        i = '%s-%d' % (base, k); k += 1
    ids.add(i)
    a['id'] = i

# ---------------------------------------------------------------- works
raw = []          # (artist index, work dict, origin file)


def harvest(rows, origin):
    for r in rows or []:
        ai = alias.get(r['n'])
        if ai is None:
            print('  %s: works for unknown artist %r' % (origin, r['n']))
            continue
        for w in r.get('works') or []:
            if w.get('img'):
                raw.append((ai, w, origin))


for f in ('works_painters.json', 'works_illus.json', 'enrich_painters.json', 'enrich_illus.json'):
    harvest(load(f, []), f)
for p in sorted(glob.glob(os.path.join(SP, 'data', 'works', '*.json'))):
    harvest(json.load(open(p, encoding='utf-8')), 'works/' + os.path.basename(p))

if '--verify' in sys.argv:
    urls = [w['img'] for _, w, _ in raw] + [w['th'] for _, w, _ in raw if w.get('th')]
    print('verifying (cached where possible):', len(set(urls)), 'urls')
    verify_many(urls)
cache = load_cache()
json.dump(sorted({w['img'] for _, w, _ in raw} | {w['th'] for _, w, _ in raw if w.get('th')}
                 | set((load('thumbs.json', {}) or {}).values())),
          open(os.path.join(SP, 'cache', 'wanted.json'), 'w'))   # what browser_probe.js checks
try:
    browser = json.load(open(os.path.join(SP, 'cache', 'browser.json'), encoding='utf-8'))
except (OSError, ValueError):
    browser = {}


def url_key(u):
    """Same picture at another size on the same host → same key (for dedup only)."""
    p = urllib.parse.urlsplit(u)
    path = re.sub(r'-\d{2,4}x\d{2,4}(?=\.\w+$)', '', p.path)           # WordPress sizes
    path = re.sub(r'/thumb(/.+?)/\d+px-[^/]+$', r'\1', path)            # Wikimedia thumbs
    path = re.sub(r'/(cover_\d+|s\d+|w\d+|h\d+)/', '/', path)
    q = urllib.parse.parse_qsl(p.query)
    q = [(k, v) for k, v in q if k.lower() not in ('w', 'h', 'width', 'height', 'resize', 'fit', 'quality', 'q', 'format', 'auto', 'ssl', 'size')]
    return (p.netloc.lower().replace('www.', '') + path + ('?' + urllib.parse.urlencode(q) if q else '')).lower()


def ham(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count('1')


report = {'raw_records': len(raw), 'unverified': [], 'failed': [], 'browser_failed': [], 'browser_unprobed': [], 'dup_url': [], 'dup_image': [],
          'cross_artist_same_image': [], 'by_origin': {}}
kept = {}         # artist index -> list of work dicts
seen_key = {}
hash_owner = {}
exclusions = load('exclusions.json', {}) or {}
thumbs = load('thumbs.json', {}) or {}
wmeta = load('work_meta.json', {}) or {}
motifs = load('work_motifs.json', {}) or {}
NOTE_LABEL = {'bsky': 'Artist’s post', 'pixiv': 'Artist’s caption', 'cma': 'Museum note', 'commons': 'Description',
              'book': 'About the book', 'page': 'Note'}


def details(w):
    """Extra fields for the info panel. Older hand-checked t/y/m win; the rest come from meta.py."""
    m = wmeta.get(w['img']) or {}
    via = m.get('via', '')
    out = {'sz': m.get('sz'), 'coll': m.get('coll'), 'pub': m.get('pub'), 'tg': m.get('tags'),
           'po': m.get('posted'), 'ty': m.get('type'), 'cr': m.get('credit'), 'no': m.get('note'),
           'mo': motifs.get(w['img'])}
    if out['no']:
        out['nl'] = NOTE_LABEL.get(via, 'Note')
    if m.get('label') and out['pub'] and m['label'] not in out['pub']:
        out['pub'] += ' · ' + m['label']
    fill = {k: m.get(k) for k in ('t', 'y', 'm') if m.get(k)}
    if via == 'commons':
        fill.pop('t', None)            # Commons "object names" are often file names
    return out, fill
report['excluded'] = []
for ai, w, origin in raw:
    o = report['by_origin'].setdefault(origin, {'raw': 0, 'kept': 0})
    o['raw'] += 1
    if w['img'] in exclusions:
        report['excluded'].append([artists[ai]['n'], w['img'], exclusions[w['img']].get('reason', '')]); continue
    v = cache.get(w['img'])
    if not v:
        report['unverified'].append([artists[ai]['n'], w['img']]); continue
    if not v.get('ok'):
        report['failed'].append([artists[ai]['n'], w['img'], v.get('err', '')]); continue
    b = browser.get(w['img'])
    if b and b.get('s') != 'ok':
        report['browser_failed'].append([artists[ai]['n'], w['img'], b.get('s')]); continue
    if not b:
        report['browser_unprobed'].append(w['img'])
    th = w.get('th') or thumbs.get(w['img'])
    if th and (not (cache.get(th) or {}).get('ok') or (browser.get(th) or {}).get('s', 'ok') != 'ok'):
        th = None
    k = (ai, url_key(w['img']))
    if k in seen_key:
        report['dup_url'].append([artists[ai]['n'], w['img']]); continue
    lst = kept.setdefault(ai, [])
    h = v.get('hash')
    dup = None
    if h and h != '0000000000000000' and h != 'ffffffffffffffff':
        for j, x in enumerate(lst):
            if x.get('_h') and ham(x['_h'], h) <= 3:
                dup = j; break
    if dup is not None:
        x = lst[dup]
        report['dup_image'].append([artists[ai]['n'], w['img'], x['img']])
        # keep the larger rendition, but keep the earlier record's text if it has more
        if (v.get('w', 0) * v.get('h', 0)) > (x.get('w', 0) * x.get('h', 0)):
            for kk in ('t', 'ten', 'y', 'm', 'src', 'lic', 'sz', 'coll', 'pub', 'tg', 'po', 'ty', 'cr', 'no', 'nl', 'mo'):
                if not x.get(kk) and w.get(kk):
                    x[kk] = w[kk]
            x.update(img=w['img'], w=v.get('w'), h=v.get('h'), _h=h)
        continue
    seen_key[k] = True
    extra, fill = details(w)
    rec = clean({'t': w.get('t') or fill.get('t'), 'ten': w.get('ten'), 'y': str(w.get('y') or fill.get('y') or ''),
                 'm': w.get('med') or w.get('m') or fill.get('m'),
                 'img': w['img'], 'th': th, 'src': w.get('src'), 'lic': w.get('lic') or w.get('rights'),
                 'w': v.get('w'), 'h': v.get('h'), '_h': h, '_id': w.get('id'), '_o': origin, **extra})
    if h and h != '0000000000000000':
        prev = hash_owner.get(h)
        if prev is not None and prev != ai:
            report['cross_artist_same_image'].append([artists[ai]['n'], artists[prev]['n'], w['img']])
        hash_owner.setdefault(h, ai)
    lst.append(rec)
    o['kept'] += 1

works = []
wids = set()
for ai in range(len(artists)):
    for w in kept.get(ai, []):
        wid = w.pop('_id', None) or '%s~%s' % (artists[ai]['id'], hashlib.sha1(url_key(w['img']).encode()).hexdigest()[:8])
        while wid in wids:
            wid += 'x'
        wids.add(wid)
        w.pop('_h', None); origin = w.pop('_o', '')
        if w.get('m') and w['m'][0].isalpha():
            w['m'] = w['m'][0].upper() + w['m'][1:]
        works.append({'i': wid, 'a': ai, **w})
        dbo = report.setdefault('depth_by_origin', {}).setdefault(artists[ai]['n'], {})
        dbo[origin] = dbo.get(origin, 0) + 1

# ---------------------------------------------------------------- emit
pub_artists = []
for a in artists:
    pub_artists.append(clean({k: a.get(k) for k in ('id', 'n', 'jp', 'r', 'b', 'why', 'w', 'links', 'tabs', 'kind', 'aka', 'study', 'isNew')}))
data = {'artists': pub_artists, 'works': works, 'groups': groups, 'built': time.strftime('%Y-%m-%d %H:%M')}

tpl = open(os.path.join(SP, 'template.html'), encoding='utf-8').read()
app = open(os.path.join(SP, 'app.js'), encoding='utf-8').read()
blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
assert tpl.count('/*DATA*/') == 1 and tpl.count('/*APP*/') == 1, 'template placeholders missing'
html = tpl.replace('/*DATA*/', blob).replace('/*APP*/', app.replace('</script', '<\\/script'))
tmp = OUT + '.tmp'
open(tmp, 'w', encoding='utf-8').write(html)
os.replace(tmp, OUT)

# ---------------------------------------------------------------- report
per = {}
for w in works:
    per.setdefault(w['a'], 0)
    per[w['a']] += 1
kinds = {}
for i, a in enumerate(artists):
    for t in a['tabs']:
        kinds.setdefault(t, {'artists': 0, 'with_works': 0, 'works': 0})
        kinds[t]['artists'] += 1
        if per.get(i):
            kinds[t]['with_works'] += 1
            kinds[t]['works'] += per[i]
report.update({
    'built': data['built'], 'artists': len(artists), 'artists_with_works': len(per),
    'verified_unique_works': len(works), 'by_tab': kinds,
    'depth': sorted([[artists[i]['n'], n] for i, n in per.items()], key=lambda x: -x[1]),
    'no_works': [a['n'] for i, a in enumerate(artists) if not per.get(i)],
    'artist_meta': {a['n']: {'kind': a['kind'], 'tabs': a['tabs'], 'origin': a.get('origin'), 'disc': a.get('disc'),
                             'reason': a.get('reason'), 'jp': a.get('jp')} for a in artists},
    'thumbnails': sum(1 for w in works if w.get('th')),
    'pixiv_embed_crops': sum(1 for w in works if 'embed.pixiv.net' in w['img']),
    'domains': sorted(((d, n) for d, n in __import__('collections').Counter(
        urllib.parse.urlsplit(w.get('src') or w['img']).netloc.replace('www.', '') for w in works).items()), key=lambda x: -x[1]),
})
json.dump(report, open(os.path.join(SP, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('artists %d (with works %d) · raw records %d · verified unique works %d' % (
    len(artists), len(per), len(raw), len(works)))
print('browser-failed %d · not yet browser-probed %d' % (len(report['browser_failed']), len(report['browser_unprobed'])))
print('excluded by data/exclusions.json %d' % len(report['excluded']))
print('unverified %d · failed %d · dup url %d · dup image %d · cross-artist same image %d' % (
    len(report['unverified']), len(report['failed']), len(report['dup_url']), len(report['dup_image']),
    len(report['cross_artist_same_image'])))
for t, k in kinds.items():
    print('  %-6s artists %3d  with works %3d  works %4d' % (t, k['artists'], k['with_works'], k['works']))
print('written:', OUT, len(html), 'chars')
