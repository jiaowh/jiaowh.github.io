#!/usr/bin/env python3
"""Collect candidate images for artists from given pages, verify them, and make contact
sheets for review.  Development-time research tool.

    python3 build/gather.py plan.json OUTDIR

plan.json: [{"n": "Artist", "pages": [url, ...], "host": "optional substring the image
host/path must contain", "skip": ["substring", ...], "min": 500}]

Writes OUTDIR/<slug>.json (verified candidates, largest first per duplicate group,
already-collected works removed) and OUTDIR/<slug>.jpg (numbered contact sheet).
"""
import json, os, re, sys, urllib.parse
from concurrent.futures import ThreadPoolExecutor

SP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SP)
from research import page_images, sheet, get
from verify import verify_many

JUNK = re.compile(r'logo|icon|sprite|avatar|favicon|banner|header|footer|button|arrow|social|facebook|instagram|twitter|'
                  r'youtube|placeholder|spinner|loading|blank\.|pixel\.|spacer|/emoji|badge|flag|signature|cart|'
                  r'paypal|newsletter|thumb_up|share', re.I)


def ukey(u):
    p = urllib.parse.urlsplit(u)
    path = re.sub(r'-\d{2,4}x\d{2,4}(?=\.\w+$)', '', p.path)
    path = re.sub(r'/thumb(/.+?)/\d+px-[^/]+$', r'\1', path)
    return (p.netloc.lower().replace('www.', '') + path).lower()


def existing_keys():
    keys, hashes = set(), {}
    from verify import load_cache
    cache = load_cache()
    import glob
    files = [os.path.join(SP, 'data', f) for f in ('works_painters.json', 'works_illus.json', 'enrich_painters.json', 'enrich_illus.json')]
    files += glob.glob(os.path.join(SP, 'data', 'works', '*.json'))
    for f in files:
        for a in json.load(open(f, encoding='utf-8')):
            for w in a.get('works') or []:
                if w.get('img'):
                    keys.add(ukey(w['img']))
                    h = (cache.get(w['img']) or {}).get('hash')
                    if h:
                        hashes.setdefault(a['n'], []).append(h)
    return keys, hashes


KEYWORDS = re.compile(r'gallery|galleries|work|paint|portfolio|figur|portrait|oil|drawing|series|collection|recent|selected|archive|art/', re.I)
SKIPLINK = re.compile(r'\.(css|js|png|jpe?g|gif|ico|xml|svg|pdf)(\?|$)|cart|shop|store|contact|about|news|blog|login|account|privacy|terms|event|workshop|class|course|mailto:|tel:|#', re.I)


def crawl_links(start, limit=8):
    out = list(start)
    host = urllib.parse.urlsplit(start[0]).netloc.replace('www.', '')
    for u in start:
        try:
            h = get(u)
        except Exception:
            continue
        for m in re.finditer(r'href="([^"]+)"', h):
            l = urllib.parse.urljoin(u, m.group(1)).split('#')[0]
            if urllib.parse.urlsplit(l).netloc.replace('www.', '') != host or SKIPLINK.search(l):
                continue
            if KEYWORDS.search(urllib.parse.urlsplit(l).path) and l not in out:
                out.append(l)
            if len(out) >= limit + len(start):
                break
    return out


def ham(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count('1')


def run(plan, outdir):
    os.makedirs(outdir, exist_ok=True)
    have, have_h = existing_keys()
    summary = []
    for item in plan:
        n = item['n']
        slug = re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-')
        cands = []
        pages = list(item['pages'])
        if item.get('crawl'):
            pages = crawl_links(pages, item.get('crawl') if isinstance(item.get('crawl'), int) else 8)
        for pg in pages:
            try:
                cands += page_images(pg)
            except Exception as e:
                print('  ERR page', pg, str(e)[:80])
        host = item.get('host')
        skip = item.get('skip', [])
        cc, seen = [], set()
        for c in cands:
            u = c['img']
            if not u.startswith('http') or u.lower().endswith(('.svg', '.gif')):
                continue
            if JUNK.search(urllib.parse.urlsplit(u).path) or any(s in u for s in skip):
                continue
            if host and host not in u:
                continue
            k = ukey(u)
            if k in seen or k in have:
                continue
            seen.add(k)
            cc.append(c)
        res = verify_many([c['img'] for c in cc], progress=False)
        mn = item.get('min', 450)
        good = []
        for c in cc:
            v = res[c['img']]
            if v.get('ok') and max(v.get('w', 0), v.get('h', 0)) >= mn:
                c.update(w=v['w'], h=v['h'], hash=v.get('hash'))
                good.append(c)
        # collapse same picture at several sizes; drop ones we already have
        out = []
        for c in sorted(good, key=lambda x: -(x['w'] * x['h'])):
            if c.get('hash') and any(ham(c['hash'], o['hash']) <= 4 for o in out if o.get('hash')):
                continue
            if c.get('hash') and any(ham(c['hash'], h) <= 4 for h in have_h.get(n, [])):
                continue
            out.append(c)
        # keep page order for review (easier to match with titles on the page)
        order = {c['img']: i for i, c in enumerate(cc)}
        out.sort(key=lambda c: order.get(c['img'], 0))
        json.dump(out, open(os.path.join(outdir, slug + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        if out:
            try:
                sheet(out[:60], os.path.join(outdir, slug + '.jpg'), cols=10 if len(out) > 30 else 8)
            except Exception as e:
                print('  sheet error', e)
        summary.append((n, len(cands), len(cc), len(out)))
        print('%-26s raw %3d  new %3d  usable %3d' % (n, len(cands), len(cc), len(out)), flush=True)
    return summary


if __name__ == '__main__':
    run(json.load(open(sys.argv[1], encoding='utf-8')), sys.argv[2])
