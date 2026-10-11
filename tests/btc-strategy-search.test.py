"""Research-engine verification; requires the same cached inputs as the search."""
from pathlib import Path
import sys,json
import numpy as np
from types import SimpleNamespace
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'research/btc-strategy-search-2026'))
from search import data,Grid,candidates,simulate,ts,state
from search_hybrid import hybrid_candidates
from search_mvrv import mvrv_candidates

real=ts('2023-01-01')+np.arange(-1,5)*14400
g=SimpleNamespace(real=real,o=np.array([100.,100,110,100,90,95]),c=np.array([100.,100,110,100,90,100]))
hold=simulate(g,np.ones(6,bool),'2023-01-01','2023-01-02',details=True)
assert abs(hold['btc']-1)<1e-12 and hold['trades']==0
flat=simulate(g,np.zeros(6,bool),'2023-01-01','2023-01-02',details=True)
assert abs(flat['btc']-.999/1.001)<1e-12 and flat['trades']==1
p=np.array([True,False,False,True,True,False])
r=simulate(g,p,'2023-01-01','2023-01-02',details=True)
assert abs(r['btc']-110*.999/(90*1.001))<1e-12
assert r['trades']==2 and r['fills'][0]['price']==110 and r['fills'][1]['price']==90
assert list(state([False,True,True,False],[False,False,False,True],2,False))==[False,False,True,True]

hourly=data();G=Grid(0,a1h=hourly);cut=ts('2024-08-01')+8*3600;prefix=Grid(0,a1h=hourly[hourly[:,0]<cut])
count=0
for build in [candidates,hybrid_candidates,mvrv_candidates]:
    full,_=build(G);short,_=build(prefix)
    for name in full:
        assert np.array_equal(short[name],full[name][:prefix.n]),name
        count+=1
    if build==candidates:
        expected=json.loads((root/'research/btc-corrections-2023-2025/bull-bear-2026-results.json').read_text())['detail']['binary']['2023-25']['btc']
        actual=simulate(G,full['ensemble0.6_0.4'],'2023-01-01','2026-01-01',details=True)['btc']
        assert abs(actual-expected)<1e-9
print(f'PASS: exact initial/final fees, owned-BTC benchmark, next-open execution, independent ledger, confirmation, original binary parity and {count} causal signal prefixes (including unfinished daily tail).')
