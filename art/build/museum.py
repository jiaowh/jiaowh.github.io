#!/usr/bin/env python3
"""Candidates from museum open-access APIs (development-time research).

    python3 build/museum.py aic "Artist Name" OUT.json [--max 60]
    python3 build/museum.py met "Artist Name" OUT.json [--max 60]

Only works the museum itself marks public domain / open access are returned, with
title, date, medium and the museum's object page as source.
AIC images use the IIIF endpoint the API documents (…/full/1686,/0/default.jpg for the
viewer, …/full/600,/0/default.jpg as the thumbnail).
"""
import json, sys, time, urllib.parse, urllib.request

UA = {'User-Agent': 'SalonGalleryResearch/1.0 (personal gallery; development-time research)'}


def getj(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def aic(name, mx=60):
    out, page = [], 1
    fields = 'id,title,image_id,artist_title,artist_display,date_display,medium_display,is_public_domain,thumbnail,credit_line'
    while len(out) < mx and page < 8:
        q = {'query[bool][must][][match][artist_title]': name, 'limit': 100, 'page': page, 'fields': fields}
        j = getj('https://api.artic.edu/api/v1/artworks/search?' + urllib.parse.urlencode(q))
        data = j.get('data', [])
        for a in data:
            if not a.get('image_id') or not a.get('is_public_domain'):
                continue
            if (a.get('artist_title') or '').lower() != name.lower():
                continue
            th = a.get('thumbnail') or {}
            out.append({'img': 'https://www.artic.edu/iiif/2/%s/full/1686,/0/default.jpg' % a['image_id'],
                        'th': 'https://www.artic.edu/iiif/2/%s/full/600,/0/default.jpg' % a['image_id'],
                        'src': 'https://www.artic.edu/artworks/%d' % a['id'], 't': a.get('title'),
                        'y': a.get('date_display'), 'med': a.get('medium_display'), 'lic': 'Public domain (Art Institute of Chicago, CC0)',
                        'alt': (th.get('alt_text') or ''), 'w': th.get('width'), 'h': th.get('height')})
        if len(data) < 100:
            break
        page += 1
    return out[:mx]


def met(name, mx=60):
    j = getj('https://collectionapi.metmuseum.org/public/collection/v1/search?' +
             urllib.parse.urlencode({'hasImages': 'true', 'artistOrCulture': 'true', 'q': name}))
    out = []
    for oid in (j.get('objectIDs') or [])[:mx * 3]:
        o = getj('https://collectionapi.metmuseum.org/public/collection/v1/objects/%d' % oid)
        time.sleep(0.1)
        if not o.get('isPublicDomain') or not o.get('primaryImage'):
            continue
        if name.lower() not in (o.get('artistDisplayName') or '').lower():
            continue
        out.append({'img': o['primaryImage'], 'th': o.get('primaryImageSmall'), 'src': o.get('objectURL'),
                    't': o.get('title'), 'y': o.get('objectDate'), 'med': o.get('medium'),
                    'lic': 'Public domain (The Met Open Access, CC0)', 'alt': ''})
        if len(out) >= mx:
            break
    return out


def cma(name, mx=60):
    q = {'q': name, 'has_image': 1, 'cc0': 1, 'limit': 100}
    j = getj('https://openaccess-api.clevelandart.org/api/artworks/?' + urllib.parse.urlencode(q))
    out = []
    for a in j.get('data', []):
        who = ' '.join(c.get('description') or '' for c in a.get('creators') or [])
        if name.split()[-1].lower() not in who.lower():
            continue
        im = (a.get('images') or {})
        web = (im.get('web') or {})
        if not web.get('url'):
            continue
        out.append({'img': web['url'], 'src': a.get('url'), 't': a.get('title'), 'y': a.get('creation_date'),
                    'med': a.get('technique'), 'lic': 'CC0 (Cleveland Museum of Art Open Access)', 'alt': who[:80],
                    'w': int(web.get('width') or 0) or None, 'h': int(web.get('height') or 0) or None,
                    'type': a.get('type')})
        if len(out) >= mx:
            break
    return out


if __name__ == '__main__':
    src, name, outf = sys.argv[1], sys.argv[2], sys.argv[3]
    mx = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 60
    res = {'aic': aic, 'met': met, 'cma': cma}[src](name, mx)
    json.dump(res, open(outf, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(name, src, len(res))
