#!/usr/bin/env python3
"""Move chosen candidates into a research batch file (build/data/works/<batch>.json).

    python3 build/curate.py CANDS.json "Artist Name" BATCH 0,3,5-9 [--alt-titles] [--med oil]
                            [--t "5=Title|2019" --t "7=Other title"] [--src URL]

Indices refer to the numbered contact sheet. Titles are left unknown unless given with
--t, or taken from the page's alt text with --alt-titles (only alt text that reads like
a title, not a file name). Re-running with the same image is a no-op.
"""
import json, os, re, sys, time

SP = os.path.dirname(os.path.abspath(__file__))


def parse_idx(s):
    out = []
    for part in s.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = part.split('-')
            out += list(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


FILEISH = re.compile(r'(\.(jpe?g|png|webp)$)|^(img|dsc|image|photo|untitled-?\d|screen ?shot)[\s_-]*\d|^[\w-]*\d{3,}[\w-]*$|_', re.I)


def title_from_alt(alt, artist):
    a = (alt or '').strip()
    if not a or a == 'og:image' or FILEISH.search(a) or len(a) > 120:
        return None
    a = re.sub(r'\s*[-–|,]\s*' + re.escape(artist) + r'\s*$', '', a, flags=re.I).strip()
    if a.lower() in (artist.lower(), 'image', 'artwork', 'painting'):
        return None
    return a


def title_from_filename(url, artist):
    """'basement-door-2022-oil-on-canvas-100x100cm-nick-alm-800.jpg' -> ('Basement door', '2022', 'oil on canvas')"""
    b = os.path.basename(url.split('?')[0])
    b = re.sub(r'\.\w+$', '', b)
    b = re.sub(r'(-edited|-\d{2,4}x\d{2,4}|-scaled|-\d{3,4})+(-\d)?$', '', b)
    slug_a = re.sub(r'[^a-z0-9]+', '-', artist.lower()).strip('-')
    b = b.replace(slug_a, '')
    m = re.match(r'(.+?)[-_ ]((?:19|20)\d\d)(?:[-_ ](.*))?$', b)
    if not m:
        return None, None, None
    t = m.group(1).replace('-', ' ').replace('_', ' ').strip()
    rest = (m.group(3) or '').replace('-', ' ')
    med = None
    mm = re.match(r'((?:oil|acrylic|charcoal|graphite|pastel|watercolou?r|mixed media|egg tempera|tempera)(?: (?:on|and) (?:canvas|linen|panel|board|paper|copper|aluminium|aluminum))?)', rest)
    if mm:
        med = mm.group(1)
    if not t or re.fullmatch(r'[\d ]+', t):
        return None, m.group(2), med
    return t[:1].upper() + t[1:], m.group(2), med


def main():
    args = sys.argv[1:]
    cands_f, artist, batch, idx = args[0], args[1], args[2], parse_idx(args[3])
    opts = args[4:]
    titles = {}
    med = None
    src_override = None
    alt_titles = '--alt-titles' in opts
    fn_titles = '--fn-titles' in opts
    i = 0
    while i < len(opts):
        if opts[i] == '--t':
            k, v = opts[i + 1].split('=', 1)
            titles[int(k)] = v
            i += 2
        elif opts[i] == '--med':
            med = opts[i + 1]; i += 2
        elif opts[i] == '--src':
            src_override = opts[i + 1]; i += 2
        else:
            i += 1
    cands = json.load(open(cands_f, encoding='utf-8'))
    path = os.path.join(SP, 'data', 'works', batch if batch.endswith('.json') else batch + '.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else []
    rec = next((r for r in data if r['n'] == artist), None)
    if not rec:
        rec = {'n': artist, 'works': []}
        data.append(rec)
    have = {w['img'] for r in data for w in r['works']}
    added = 0
    for k in idx:
        c = cands[k]
        if c['img'] in have:
            continue
        w = {'img': c['img'], 'src': src_override or c.get('src')}
        if c.get('th'):
            w['th'] = c['th']
        t, y = None, None
        if k in titles:
            parts = titles[k].split('|')
            t = parts[0].strip() or None
            y = parts[1].strip() if len(parts) > 1 else None
        elif c.get('t') and not FILEISH.search(c['t']):
            t = c['t']
        elif alt_titles and title_from_alt(c.get('alt'), artist):
            t = title_from_alt(c.get('alt'), artist)
        elif fn_titles:
            t, y, m2 = title_from_filename(c['img'], artist)
            if m2 and not med:
                w['med'] = m2
        if t:
            w['t'] = t
        if y or c.get('y'):
            w['y'] = y or c.get('y')
        if med:
            w['med'] = med
        elif c.get('med') and 'med' not in w:
            w['med'] = c['med']
        if c.get('lic'):
            w['lic'] = c['lic']
        w['found'] = time.strftime('%Y-%m-%d')
        rec['works'].append(w)
        have.add(c['img'])
        added += 1
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('%s: +%d → %d in %s' % (artist, added, len(rec['works']), os.path.basename(path)))


if __name__ == '__main__':
    main()
