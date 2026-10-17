"""Independent execution and accounting checks for the intraday research harness."""
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'research/btc-intraday-tuning-2026'))
from evaluate import simulate
B=np.array([[0,100,101,90,100,1],[300,105,130,80,106,1],[600,104,107,100,106,1],[900,106,108,101,107,1],[1200,103,109,102,108,1]],float)
S=np.array([[0,90],[0,90],[1,80]],float)
btc,usd,dd,trades,gaps=simulate(B,S,300,1.5,2,0,1500)
assert len(trades)==2 and trades[0,2]==105 and trades[0,3]==90
assert trades[0,1]==1 and trades[1,0]==2 and trades[1,1]==3
assert abs(1+usd-.9988*np.prod(1+trades[:,4]))<1e-12
assert abs(btc-100*(1+usd)/(108*1.0012))<1e-12
# Changed future candles cannot change fills before their timestamp.
changed=B.copy();changed[-1,1:5]=[200,300,180,250]
assert np.array_equal(simulate(changed,S,300,1.5,2,0,1500)[3],trades)
G=B.copy();G[1,2:4]=[110,99];G[2,1:5]=[85,87,80,86]
t=simulate(G,S[:1],300,1.5,8,0,1500)[3]
assert t[0,3]==85
# Higher costs reduce terminal BTC when decisions and fills are unchanged.
assert simulate(B,S,300,1.5,2,0,1500,.002)[0]<btc
print('PASS: independent next-open, stop-first, one-position, gap-fill, terminal-BTC, fee-product and future-bar accounting checks.')
