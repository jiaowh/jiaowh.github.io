"""Sensitivity to candle/day boundaries; independent Python replay, eight offsets.
All windows remain retrospective. Eight alignments are not independent samples.
"""
import sys,json
from pathlib import Path
import numpy as np
OUT=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(OUT.parents[2]/'quant/research_notes/ensemble_v2'))
from core import Grid,page_members,average,size,band,sma,ts
F=json.loads((OUT/'production.json').read_text())
fixture=json.loads(Path(F['fixturePath']).read_text())
stamps=np.asarray(fixture['funding']['stamps']);ft=stamps[:,0];cs=np.r_[0,np.cumsum(stamps[:,1])]

def levels(E,margin=.03):
    out=np.full(len(E),np.nan);level=0.
    for i,e in enumerate(E):
        if np.isnan(e):continue
        if level==0:want=1. if e>.6 else 0.
        else:
            want=0. if e<.4 else 1/3 if e<.5 else 2/3 if e<.6 else 1.
            if want>level:want=max(level,1. if e>=.6+margin else 2/3 if e>=.5+margin else level)
        level=want;out[i]=level
    return out

def ledger(G,p,fee=.001):
    C,U=1.,0.;last=np.nan;eq=np.ones(G.n);uu=np.zeros(G.n);cc=np.ones(G.n)
    for i in range(G.n):
        if i and np.isfinite(p[i-1]) and p[i-1]!=last:
            w=p[i-1];price=G.o[i];value=C+U*price;x=w*value-U*price
            du=x/(price*(1+w*fee if x>0 else 1-w*fee));C-=du*price+abs(du)*price*fee;U+=du;last=w
        eq[i]=C+U*G.c[i];uu[i]=U;cc[i]=C
    return eq,uu,cc

rows=[]
for phase in [0,3,6,9,12,15,18,21]:
    G=Grid(phase,binance_only=True);E=average([m[-1] for m in page_members(G)]);L=levels(E)
    A=np.floor((G.real+14400)/86400)*86400
    hi=np.searchsorted(ft,A,'right');lo=np.searchsorted(ft,A-14*86400,'right');valid=(ft[0]<=A-14*86400)&(hi-lo>=21)&(A-ft[np.maximum(0,hi-1)]<=9*3600)
    funding=np.full(G.n,np.nan);last=np.nan
    for i in range(G.n):
        if valid[i]:last=(cs[hi[i]]-cs[lo[i]])/(hi[i]-lo[i])*1095
        funding[i]=last
    T=np.where(funding>.15,2/3,1.);raw=size(L*T,G,tgt=.6,cap=1.)
    ps={'Current':band(raw),'No funding trim':band(size(L,G,tgt=.6,cap=1.)),'No recovery buffer':band(size(levels(E,0)*T,G,tgt=.6,cap=1.))}
    if phase==0:
        assert np.allclose(E,np.asarray(F['E'],float),equal_nan=True)
        assert np.allclose(ps['Current'],np.asarray(F['banded']['vt60'],float),equal_nan=True)
    _,_,dc,de,_=G.daily()
    for w in (20,50):
        sm=sma(dc,w);below=dc<sm;above=dc>sm
        enter=(G.spread(below&np.r_[False,below[:-1]],de)==1)&(E<.6)
        leave=(G.spread(above&np.r_[False,above[:-1]],de)==1)&(E>=.64)
        flag=np.zeros(G.n,bool);on=False
        for i in range(G.n):
            if enter[i]:on=True
            elif leave[i]:on=False
            flag[i]=on
        ps[f'SMA{w} cap']=band(np.minimum(raw,np.where(flag,1/3,1)))
    for name,p in ps.items():
        for fee in [.001,.006]:
            eq,uu,cc=ledger(G,p,fee)
            for start,end in [('2019-01-01','2023-01-01'),('2023-01-01','2026-01-01')]:
                b,e=G.ix(start),G.ix(end);base=cc[b-1]+uu[b-1]*G.o[b];v=np.r_[base,eq[b:e]];ret=v[-1]/base-1
                ch=np.flatnonzero(np.diff(p[b:e])!=0)+b+1;mv=p[ch]-p[ch-1]
                rows.append(dict(phase=phase,variant=name,fee=fee,window=start[:4]+'-'+str(int(end[:4])-1),return_pct=100*ret,cagr_pct=100*((1+ret)**(365.25*86400/(ts(end)-ts(start)))-1),dd_pct=100*np.min(v/np.maximum.accumulate(v)-1),changes=len(ch),rapid_reversals=int(np.sum((np.diff(ch)<=6)&(mv[1:]*mv[:-1]<0)))))
    print('Completed offset',phase,flush=True)
(OUT/'alignments.json').write_text(json.dumps(rows,indent=2))
for win in ['2019-2022','2023-2025']:
    for name in ps:
        rr=[x for x in rows if x['variant']==name and x['window']==win and x['fee']==.001]
        print(win,name,{k:round(float(np.mean([x[k] for x in rr])),2) for k in ['return_pct','cagr_pct','dd_pct','changes','rapid_reversals']},'CAGR range',round(min(x['cagr_pct'] for x in rr),2),round(max(x['cagr_pct'] for x in rr),2))
