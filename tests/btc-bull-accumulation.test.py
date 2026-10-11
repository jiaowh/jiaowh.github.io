"""Independent tiny ledgers catch timing, delayed-sale and terminal-cash errors."""
from pathlib import Path
from types import SimpleNamespace
import sys
import numpy as np
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'research/btc-bull-accumulation-2026'))
from bull import replay,ts

t=ts('2023-01-01')+np.arange(8)*14400
g=SimpleNamespace(real=t,o=np.array([100.,110,100,95,90,85,90,95]),
  c=np.array([100.,104,100,95,90,85,90,95]))
trigger=np.array([True,False,False,False,False,False,False,False])
I=(np.zeros(8),{'test':trigger},{0:np.ones(8,bool)})
p={'trigger':'test','gate':0,'gain':.05,'recovery':'trend'}
r=replay(g,I,p,'2023-01-01','2023-01-02',details=True)
assert [f['price'] for f in r['fills']]==[110.,100.]
assert abs(r['btc']-110*.999/(100*1.001))<1e-12
assert all(f['time']==f['decision'] for f in r['fills'])
r3=replay(g,I,p,'2023-01-01','2023-01-02',fee=.003,details=True)
assert [f['time'] for f in r3['fills']]==[f['time'] for f in r['fills']]
assert abs(r3['btc']-110*.997/(100*1.003))<1e-12

# A delayed sale fills at 80, not the original 110, so its target must reset.
g.o=np.array([100.,110,80,76,75,74,80,81]);g.c=np.array([100.,104,77,75,75,74,80,81])
r=replay(g,I,p,'2023-01-01','2023-01-02',delay=1,details=True)
assert [f['time'] for f in r['fills']]==[t[2],t[5]]
assert abs(r['btc']-80*.999/(74*1.001))<1e-12
assert all(f['time']-f['decision']==14400 for f in r['fills'])

# Unspent cash has to pay the eventual BTC purchase fee; orders beyond end do not fill.
g.c=np.full(8,120.)
r=replay(g,I,p,'2023-01-01','2023-01-02',details=True)
assert r['openCash'] and r['trades']==1
assert abs(r['btc']-110*.999/(120*1.001))<1e-12
hold=replay(g,(I[0],{'test':np.zeros(8,bool)},I[2]),p,'2023-01-01','2023-01-02')
assert hold['btc']==1 and hold['trades']==0

# Trend-recovery fallback may buy back higher and genuinely lose BTC.
recovery=np.zeros(8);recovery[1]=.7;g.o[2]=130
r=replay(g,(recovery,I[1],I[2]),p,'2023-01-01','2023-01-02',details=True)
assert r['fills'][1]['reason']=='trend' and abs(r['btc']-110*.999/(130*1.001))<1e-12
assert r['btc']<1
print('PASS: next-open fills, delayed-sale repricing, fixed cost-stress target, cash conversion, hold benchmark and losing recovery trade.')
