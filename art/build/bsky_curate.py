#!/usr/bin/env python3
"""Curate Bluesky candidates: parse 'TITLE (2019)' / 'TITLE　2019' post text into title + year.
    python3 build/bsky_curate.py CANDS.json "Artist" BATCH 0,3,5-9 [--t "3=Title|2020"] [--notitle 4,5]
"""
import json, re, subprocess, sys, os
SP = os.path.dirname(os.path.abspath(__file__))
from curate import parse_idx
cands_f, artist, batch, idx = sys.argv[1], sys.argv[2], sys.argv[3], parse_idx(sys.argv[4])
rest = sys.argv[5:]
over = {}
notitle = set()
i = 0
while i < len(rest):
    if rest[i] == '--t': k, v = rest[i + 1].split('=', 1); over[int(k)] = v; i += 2
    elif rest[i] == '--notitle': notitle = set(parse_idx(rest[i + 1])); i += 2
    else: i += 1
c = json.load(open(cands_f, encoding='utf-8'))
args = []
for k in idx:
    if k in over:
        args += ['--t', '%d=%s' % (k, over[k])]; continue
    t = c[k].get('t') or ''
    m = re.match(r'^(.*?)[\s　]*[\(（]?((?:19|20)\d\d)[\)）]?$', t.strip())
    title, year = (m.group(1).strip(' -　'), m.group(2)) if m else (t.strip(), '')
    if k in notitle or re.fullmatch(r'[\W_]*', title) or len(title) > 60:
        title = ''
    args += ['--t', '%d=%s|%s' % (k, title, year)]
# stop curate.py from inheriting the post text as a title when we decided there is none
for x in c:
    x.pop('t', None)
tmp = cands_f + '.notext.json'
json.dump(c, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
subprocess.run(['python3', os.path.join(SP, 'curate.py'), tmp, artist, batch, ','.join(map(str, idx))] + args, check=True)
