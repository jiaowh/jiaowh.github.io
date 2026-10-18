"""Guard family normalization, threshold ties and weighted recovery execution."""
from pathlib import Path
from types import SimpleNamespace
import sys
import numpy as np
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'research/btc-timeframe-weights-2026'))
from evaluate import prepare, PROFILES, BASE, execute, ts

# A unanimous iMACD block must always contribute .72, regardless of its weights.
for w in PROFILES.values():
    e,_=prepare((np.ones((6,4)),np.zeros(4),np.ones(4,bool)),w)
    assert np.allclose(e,.72)
    e,_=prepare((np.zeros((6,4)),np.ones(4),np.ones(4,bool)),w)
    assert np.allclose(e,.28)
assert len(PROFILES)==665

blocks=np.full((6,7),1/3)
blocks[:,3]=.4;blocks[0,3]=1.;blocks[:,4:]=.8
parts=(blocks,np.full(7,.5),np.ones(7,bool))
equal,I=prepare(parts,PROFILES[BASE]);weighted,J=prepare(parts,[2,1,1,1,1,1])
assert abs(equal[3]-.5)<1e-12
assert not I['recoveries']['e50'][3], 'An exact 50% tie cannot trigger recovery'
assert J['recoveries']['e50'][3]
assert np.flatnonzero(I['event']).tolist()==[2]
assert np.flatnonzero(J['event']).tolist()==[2]
assert np.allclose(prepare(parts,[4,2,2,2,2,2])[0],weighted)
start=ts('2020-01-01')
g=SimpleNamespace(n=7,real=start+np.arange(7)*14400,o=np.array([100,100,100,100,90,110,110.]),c=np.array([100,100,100,100,90,110,110.]))
g.ix=lambda d:0 if d=='2020-01-01' else 7
base=execute(g,I,'none_e50','2020-01-01','2021-01-01',details=True)
candidate=execute(g,J,'none_e50','2020-01-01','2021-01-01',details=True)
assert base['ledger'][0]['time']==candidate['ledger'][0]['time']==start+3*14400
assert candidate['ledger'][1]['time']==start+4*14400
assert candidate['ledger'][1]['reason']=='recovery'
assert base['ledger'][1]['time']==start+5*14400
assert abs(candidate['btc']-100*.999/(90*1.001))<1e-12
assert abs(base['btc']-100*.999/(110*1.001))<1e-12
print('PASS: 665 normalized profiles preserve 72/28 family totals, scale invariance, threshold ties and independently priced next-open weighted recovery.')
