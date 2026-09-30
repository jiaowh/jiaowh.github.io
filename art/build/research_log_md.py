#!/usr/bin/env python3
"""Write ../RESEARCH_LOG.md: the narrative of this research pass (below) plus tables built
from the data — every new artist with its classification and reason, and per-batch counts."""
import glob, json, os, collections

SP = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(SP), 'RESEARCH_LOG.md')
R = json.load(open(os.path.join(SP, 'report.json'), encoding='utf-8'))
dbo = R.get('depth_by_origin', {})
new = json.load(open(os.path.join(SP, 'data', 'artists_new.json'), encoding='utf-8'))

NARRATIVE = open(os.path.join(SP, 'research_log_narrative.md'), encoding='utf-8').read()

L = [NARRATIVE.rstrip(), '']
w = L.append
w('## New artists (%d)\n' % len(new))
w('Classification is research metadata only — it is not shown on gallery cards.\n')
w('| artist | tab | class | works on page | why it belongs |')
w('|---|---|---|---:|---|')
order = {'close': 0, 'adjacent': 1, 'exploratory': 2}
for a in sorted(new, key=lambda a: (order.get(a.get('disc'), 3), a['n'])):
    n = a['n']
    c = sum((dbo.get(n) or {}).values())
    w('| %s%s | %s | %s | %d | %s |' % (n, ' (%s)' % a['jp'] if a.get('jp') else '', '/'.join(a.get('tabs', [])),
                                        a.get('disc', ''), c, a.get('reason', '').replace('|', '/')))
dist = collections.Counter(a.get('disc') for a in new)
w('')
w('Balance of new artists: %s.\n' % ', '.join('%s %d' % (k, v) for k, v in dist.most_common()))
w('## Additions by research batch\n')
w('| batch file | artists | works on page |')
w('|---|---:|---:|')
per_batch = collections.defaultdict(lambda: [set(), 0])
for n, d in dbo.items():
    for o, c in d.items():
        if o.startswith('works/'):
            per_batch[o][0].add(n); per_batch[o][1] += c
for o in sorted(per_batch):
    w('| `%s` | %d | %d |' % (o, len(per_batch[o][0]), per_batch[o][1]))
w('')
open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('written', OUT)
