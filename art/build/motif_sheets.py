#!/usr/bin/env python3
"""Numbered contact sheets for writing data/work_motifs.json (the "Subject" line).

    python build/motif_sheets.py OUTDIR [--per 24]

Writes OUTDIR/sheet_NNN.jpg and OUTDIR/index.json ({sheet: [image URL, ...]}) for every
published work that has no subject line yet. The subject lines themselves are written by
looking at the sheets; they describe only what is visible.
"""
import hashlib, io, json, os, re, sys, urllib.request
from PIL import Image, ImageDraw, ImageFont

SP = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1]
per = int(sys.argv[sys.argv.index('--per') + 1]) if '--per' in sys.argv else 24
os.makedirs(out, exist_ok=True)
h = open(os.path.join(SP, '..', 'index.html'), encoding='utf-8').read()
d = json.loads(re.search(r'id="salon-data"[^>]*>(.*?)</script>', h, re.S).group(1))
done = {}
p = os.path.join(SP, 'data', 'work_motifs.json')
if os.path.exists(p):
    done = json.load(open(p, encoding='utf-8'))
works = [w for w in d['works'] if w['img'] not in done]
print(len(works), 'works without a subject line')


def img_of(w):
    pv = os.path.join(SP, 'cache', 'previews', hashlib.sha1(w['img'].encode()).hexdigest()[:20] + '.jpg')
    if os.path.exists(pv) and os.path.getsize(pv) > 2000:
        return Image.open(pv).convert('RGB')
    for u in (w.get('th'), w['img']):
        if not u:
            continue
        try:
            b = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read()
            im = Image.open(io.BytesIO(b)).convert('RGB')
            im.thumbnail((600, 600))
            return im
        except Exception:
            pass
    return Image.new('RGB', (300, 300), (60, 60, 60))


cols, cell = 6, 300
font = ImageFont.load_default(size=26) if hasattr(ImageFont, 'load_default') else None
index = {}
for si in range(0, len(works), per):
    chunk = works[si:si + per]
    rows = (len(chunk) + cols - 1) // cols
    sh = Image.new('RGB', (cols * cell, rows * cell), 'white')
    dr = ImageDraw.Draw(sh)
    for k, w in enumerate(chunk):
        im = img_of(w)
        im.thumbnail((cell - 8, cell - 8))
        x, y = (k % cols) * cell + 4, (k // cols) * cell + 4
        sh.paste(im, (x, y))
        dr.rectangle([x, y, x + 34, y + 30], fill='yellow')
        dr.text((x + 3, y + 1), str(k), fill='black', font=font)
    name = 'sheet_%03d.jpg' % (si // per)
    sh.save(os.path.join(out, name), quality=82)
    index[name] = [w['img'] for w in chunk]
    print(name, flush=True)
json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=0)
