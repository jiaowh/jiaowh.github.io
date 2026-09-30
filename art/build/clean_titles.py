#!/usr/bin/env python3
"""Split gallery-caption style titles ('Title, 36x48", oil on canvas, 2025 Sold') into
title / year / medium. Only rearranges text the source gave; never invents.
    python3 build/clean_titles.py data/works/<batch>.json
"""
import json, re, sys
MED = re.compile(r'\b((?:oil|acrylic|pastel|charcoal|graphite|watercolou?r|gouache|tempera|egg tempera|mixed media|ink|pencil)'
                 r'(?:\s+(?:and|&)\s+(?:mixed media|graphite|charcoal))?(?:\s+on\s+(?:linen(?:\s+over\s+panel)?|canvas|panel|board|paper|wood|denim|aluminium|aluminum|copper|mylar))?)\b', re.I)
DIM = re.compile(r'\d+(?:\.\d+)?\s*(?:"|”|in\.?|inches|cm)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:"|”|in\.?|inches|cm)?(?:\s*\([^)]*\))?', re.I)
YEAR = re.compile(r'\b((?:19|20)\d\d)\b')

def clean(t, artist_jp=None):
    if not t:
        return None, None, None
    s = t.strip()
    if artist_jp:
        s = re.sub(r'[\s　]*[-–]?[\s　]*' + re.escape(artist_jp) + r'$', '', s)
    s = s.strip().strip('「」').strip()
    med = MED.search(s)
    med = med.group(1).lower() if med else None
    years = YEAR.findall(s)
    year = years[-1] if years else None
    parts = [p.strip() for p in re.split(r'\s*[|,]\s*', s) if p.strip()]
    if len(parts) > 1:
        title = parts[0]
    else:
        # 'FRENCH GIRLS IN THE DOMAIN 2012 oil on linen 91 x 71cm' / 'John with Sheepskin oil on denim'
        title = re.split(r'\s+(?:(?:19|20)\d\d\b|' + (re.escape(med) if med else r'\b$^') + ')', s, flags=re.I)[0]
    title = DIM.sub('', title).strip(' ,.-|')
    title = re.sub(r'\s+(?:sold|SOLD)$', '', title)
    if YEAR.fullmatch(title or ''):
        title = ''
    if title and title.isupper() and len(title) > 3:
        title = title.capitalize()
    return title or None, year, med

if __name__ == '__main__':
    p = sys.argv[1]
    jp = {'Hikari Motoki': '本木ひかり'}
    d = json.load(open(p, encoding='utf-8'))
    for r in d:
        for w in r['works']:
            if not w.get('t') or len(w['t']) < 12 and not re.search(r'[|,]|\d{4}', w['t']):
                if w.get('t'):
                    w['t'] = w['t'].strip('「」')
                continue
            t, y, m = clean(w['t'], jp.get(r['n']))
            if t != w['t']:
                print(r['n'], '|', w['t'], '→', t, y, m)
            w['t'] = t
            if not w['t']:
                del w['t']
            if y and not w.get('y'):
                w['y'] = y
            if m and not w.get('med'):
                w['med'] = m
    json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
