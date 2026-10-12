"""Synthetic recovery, causality of execution, timeout and delayed-fill checks."""
import sys
from pathlib import Path
from types import SimpleNamespace
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'research/btc-bull-accumulation-2026'))
from confidence import sim,ts

n=60;start=ts('2023-01-01');t=start+np.arange(n)*14400
G=SimpleNamespace(n=n,real=t,o=np.full(n,100.),c=np.full(n,100.),ix=lambda s:int(np.searchsorted(t,ts(s))))
ev=np.zeros(n,bool);ev[0]=True
recovery=np.zeros(n,bool);recovery[3]=True
I={'event':ev,'filters':{'none':np.ones(n,bool)},'recoveries':{'timeout':np.zeros(n,bool),'e60':recovery}}
G.o[1]=110.;G.o[4]=115.;G.c[3]=109.
r=sim(G,I,'none_e60','2023-01-01','2023-01-11',details=True)
assert [x['time'] for x in r['ledger']]==[t[1],t[4]]
assert abs(r['btc']-110*.999/(115*1.001))<1e-12
assert r['pairs'][0]['reason']=='recovery'
# Delayed sale gets the actual execution price; target is not the signal close.
G.o[2]=120.;G.o[3]=80.;G.c[2]=80.
r=sim(G,I,'none_e60','2023-01-01','2023-01-11',delay=1,details=True)
assert r['ledger'][0]['price']==120. and r['ledger'][1]['time']==t[4]
assert abs(r['btc']-120*.999/(115*1.001))<1e-12
assert r['pairs'][0]['reason']=='target'
# An early recovery never disables the existing timeout when it does not fire.
G.o[:]=100.;G.c[:]=100.
r=sim(G,I,'none_timeout','2023-01-01','2023-01-11',details=True)
assert r['ledger'][1]['time']-r['ledger'][0]['time']==7*86400
assert abs(r['btc']-.999/1.001)<1e-12
# Rejecting an event leaves the account in BTC despite future filter changes.
I['filters']['none'][0]=False
assert sim(G,I,'none_e60','2023-01-01','2023-01-11')['btc']==1.
print('PASS: recovery and target fill at the next open, actual delayed sale reprices target, seven-day fallback survives, rejected event is not sold later.')
