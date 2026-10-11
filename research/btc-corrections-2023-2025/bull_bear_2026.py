"""BTC accumulation: 2026 extension, exact loss attribution, bounded alternatives.
Declared candidates: hold, original, no funding trim, binary ensemble, buffered SMA200,
hold while SMA200 bull / original otherwise, and a 20% dip sleeve with 5% BTC hurdle.
No threshold search. All parameters fixed before viewing this run's results.
"""
import json,sys,csv,hashlib
from pathlib import Path
from datetime import datetime,timezone
import numpy as np
O=Path(__file__).resolve().parent;ROOT=O.parents[1]
sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT.parent/'quant/research_notes/ensemble_v2'))
from core import Grid,page_members,average,sma,band,size
J=json.loads((O/'production-2026.json').read_text());X=json.loads((O/'extension-2026.json').read_text())
old=np.load(ROOT.parent/'quant/research_notes/imacd_ensemble/btc_1h.npy')
more=np.array(X['hourly'],float);hourly=np.vstack([old,more[more[:,0]>old[-1,0]]])
assert np.all(np.diff(hourly[:,0])>0)
# Preserve exchange-history gaps rather than inventing prices. All 4h page bars are present
# after 2023; the source hourly cache omits 2023-03-24 13:00 UTC.
recent=hourly[hourly[:,0]>=datetime(2023,1,1,tzinfo=timezone.utc).timestamp(),0]
gaps=[{'after':int(recent[i]),'before':int(recent[i+1]),'hours':float((recent[i+1]-recent[i])/3600)} for i in np.flatnonzero(np.diff(recent)!=3600)]
ST=np.array(J['funding']['stamps'],float);FT=ST[:,0];CS=np.r_[0,np.cumsum(ST[:,1])]
ts=lambda s:datetime.fromisoformat(s).replace(tzinfo=timezone.utc).timestamp()
date=lambda t:datetime.fromtimestamp(float(t),timezone.utc).strftime('%Y-%m-%d %H:%M')
END='2026-10-10';PHASES=[0,3,6,9,12,15,18,21]
WINDOWS={'2019-22':('2019-01-01','2023-01-01'),'2020-21':('2020-01-01','2022-01-01'),
 '2022':('2022-01-01','2023-01-01'),'2023-25':('2023-01-01','2026-01-01'),
 '2026 YTD':('2026-01-01',END),'2023-26':('2023-01-01',END),'2019-26':('2019-01-01',END),
 '2019-25':('2019-01-01','2026-01-01')}
def levels(E):
    out=np.full(len(E),np.nan);level=0.
    for i,e in enumerate(E):
        if np.isnan(e):continue
        if level==0:want=1. if e>.6 else 0.
        else:
            want=0. if e<.4 else 1/3 if e<.5 else 2/3 if e<.6 else 1.
            if want>level:want=max(level,1. if e>=.63 else 2/3 if e>=.53 else level)
        level=want;out[i]=level
    return out
def signals(G):
    E=average([m[-1] for m in page_members(G)]);L=levels(E)
    A=np.floor((G.real+14400)/86400)*86400;hi=np.searchsorted(FT,A,'right');lo=np.searchsorted(FT,A-14*86400,'right')
    valid=(FT[0]<=A-14*86400)&(hi-lo>=21)&(A-FT[np.maximum(0,hi-1)]<=9*3600)
    F=np.full(G.n,np.nan);last=np.nan
    for i in range(G.n):
        if valid[i]:last=(CS[hi[i]]-CS[lo[i]])/(hi[i]-lo[i])*1095
        F[i]=last
    T=np.where(F>.15,2/3,1.);raw=size(L*T,G,tgt=.6,cap=1.)
    binary=np.zeros(G.n);state=0.
    for i,e in enumerate(E):
        if e>.6:state=1.
        elif e<.4:state=0.
        binary[i]=state
    _,_,dc,de,_=G.daily();s200=sma(dc,200);up=dc>1.02*s200;down=dc<.98*s200
    bull=np.zeros(len(dc));state=0.
    for j in range(1,len(dc)):
        if up[j] and up[j-1]:state=1.
        elif down[j] and down[j-1]:state=0.
        bull[j]=state
    S=G.spread(bull,de);S=np.nan_to_num(S)
    P={'hold':np.ones(G.n),'original':band(raw),'no_funding':band(size(L,G,tgt=.6,cap=1.)),
       'binary':binary,'slow200':S,'bull_hold':np.where(S==1,1.,band(raw)),'dip20':None}
    return E,S,P

def simulate(G,p,start,end,fee=.001,E=None,S=None,details=False,lag=0):
    a=int(np.searchsorted(G.real,ts(start)));z=int(np.searchsorted(G.real,ts(end)))
    units,cash,last=1.,0.,np.nan;timing=fees=posTiming=negTiming=0.;eq=[];btc=[];fills=[];perbar=[];sale=None;episodes=[];episode=None
    for i in range(a,z):
        prev=G.o[i] if i==a else G.c[i-1]
        drift=cash*(1/G.o[i]-1/prev)
        j=max(0,i-1-lag);du=0.
        if p is None:
            if cash>1e-8 and (G.c[j]<=sale*(1-fee)/(1+fee)/1.05 or E[j]>.6):du=cash/(G.o[i]*(1+fee))
            elif cash<1e-8 and units>.8+1e-12 and S[j]==1 and E[j]<.4 and E[j-1]>=.4:
                du=-(units-.8);sale=G.o[i]
        elif np.isfinite(p[j]) and p[j]!=last:
            w=p[j];value=cash+units*G.o[i];v=w*value-units*G.o[i]
            du=v/(G.o[i]*(1+w*fee if v>0 else 1-w*fee));last=w
        tradefee=abs(du)*fee
        if abs(du)>1e-12:
            cash-=du*G.o[i]+abs(du)*G.o[i]*fee;units+=du;fees+=tradefee
            fills.append({'time':date(G.real[i]),'price':float(G.o[i]),'btc':float(du),'feeBTC':float(tradefee)})
        assert cash>=-1e-7 and units>=-1e-10
        if p is None:assert units>=.8-1e-12,'The original 0.8 BTC core must never be sold'
        cash=max(0.,cash)
        drift+=cash*(1/G.c[i]-1/G.o[i]);timing+=drift
        if drift>=0:posTiming+=drift
        else:negTiming+=drift
        finalfee=cash/G.c[i]*fee/(1+fee)
        q=units+cash/G.c[i]-finalfee;btc.append(q);eq.append(units*G.c[i]+cash)
        perbar.append((G.real[i],drift,tradefee,q,units,cash))
        if cash>1e-7 and episode is None:episode={'start':date(G.real[i]),'start_price':float(G.o[i]),'timingBTC':0.,'feesBTC':0.}
        if episode:
            episode['timingBTC']+=drift;episode['feesBTC']+=tradefee
            if cash<1e-7 or i==z-1:
                episode.update(end=date(G.real[i]+14400),end_price=float(G.c[i]),open=bool(cash>1e-7))
                episodes.append(episode);episode=None
    q=btc[-1];assert abs(q-(1+timing-fees-finalfee))<1e-9,'Exact BTC attribution failed'
    values=np.r_[1.,btc];dd=np.min(values/np.maximum.accumulate(values)-1)
    usd=np.r_[G.o[a],eq];ddusd=np.min(usd/np.maximum.accumulate(usd)-1)
    result={'btc':float(q),'units':float(units),'cash':float(cash),'price':float(G.c[z-1]),'startPrice':float(G.o[a]),
      'btcDD':float(dd),'usdDD':float(ddusd),'trades':len(fills),'cashTimingBTC':float(timing),
      'cashOnFallsBTC':float(posTiming),'cashOnRisesBTC':float(negTiming),'tradingFeesBTC':float(fees),'terminalFeeBTC':float(finalfee)}
    if details:
        result['fills']=fills;result['episodes']=episodes;result['annualAttribution']={}
        for year in range(int(start[:4]),int(end[:4])+1):
            v=[r for r in perbar if ts(f'{year}-01-01')<=r[0]<ts(f'{year+1}-01-01')]
            if v:result['annualAttribution'][str(year)]={'timingBTC':float(sum(x[1] for x in v)),'feesBTC':float(sum(x[2] for x in v)),'endBTC':float(v[-1][3]),'units':float(v[-1][4]),'cash':float(v[-1][5])}
        result['curve']=[[int(G.real[a+i]+14400),round(float(btc[i]),7)] for i in sorted(set([*range(0,len(btc),6),len(btc)-1]))]
    return result

rows=[];detail={};baseG=None;baseP=None;baseE=None;baseS=None
for phase in PHASES:
    G=Grid(phase,a1h=hourly);E,S,P=signals(G)
    if phase==0:
        assert np.array_equal(G.real,np.array(J['t']))
        assert np.allclose(E,np.array(J['E'],float),equal_nan=True)
        assert np.allclose(P['original'],np.array(J['banded']['vt60'],float),equal_nan=True)
        baseG,baseP,baseE,baseS=G,P,E,S
        # Prefix causality at two historical dates, independent of the JS fixture parity.
        for cut in ['2024-08-01','2025-02-01']:
            gp=Grid(0,a1h=hourly[hourly[:,0]<ts(cut)]);ep,sp,pp=signals(gp)
            for k in P:
                if P[k] is not None:assert np.allclose(pp[k],P[k][:gp.n],equal_nan=True)
    for name,p in P.items():
        for fee in [.001,.006]:
            for window,(a,b) in WINDOWS.items():
                out=simulate(G,p,a,b,fee,E,S,details=phase==0 and fee==.001)
                if phase==0 and fee==.001:detail.setdefault(name,{})[window]=out
                rows.append({'phase':phase,'variant':name,'fee':fee,'window':window,**{k:v for k,v in out.items() if k not in ['fills','episodes','annualAttribution','curve']}})
    print('Completed offset',phase,flush=True)

# Fee/delay stress and start-date sensitivity, without picking a new optimized model.
stress={};rolling={}
for name in baseP:
    stress[name]={str(fee):{str(lag):simulate(baseG,baseP[name],'2023-01-01',END,fee,baseE,baseS,lag=lag)['btc'] for lag in [0,1]} for fee in [.001,.003,.006]}
    rr=[]
    for year in range(2019,2026):
        for month in range(1,13):
            start=f'{year}-{month:02}-01';end=f'{year+1}-{month:02}-01'
            if ts(end)>ts(END):continue
            rr.append(simulate(baseG,baseP[name],start,end,E=baseE,S=baseS)['btc'])
    rolling[name]={'wins':sum(x>1+1e-9 for x in rr),'total':len(rr),'median':float(np.median(rr)),'worst':min(rr)}
summary={}
for name in baseP:
    summary[name]={}
    for window in WINDOWS:
        rr=[x for x in rows if x['variant']==name and x['window']==window and x['fee']==.001]
        summary[name][window]={'mean':float(np.mean([x['btc'] for x in rr])),'min':min(x['btc'] for x in rr),'max':max(x['btc'] for x in rr),'wins':sum(x['btc']>1+1e-9 for x in rr)}
result={'endExclusive':END,'hourlyGaps':gaps,'sourceHash':J['sourceHash'],'dataHash':hashlib.sha256((O/'production-2026.json').read_bytes()).hexdigest(),
 'detail':detail,'summary':summary,'rows':rows,'stress':stress,'rolling12m':rolling}
(O/'bull-bear-2026-results.json').write_text(json.dumps(result,indent=1))
print('PAGE ALIGNMENT: ending BTC from 1 BTC')
for name,d in detail.items():print(name,{w:round(x['btc'],4) for w,x in d.items()})
print('8 OFFSET MEANS')
for name,d in summary.items():print(name,{w:round(x['mean'],4) for w,x in d.items()})
print('ORIGINAL ATTRIBUTION',json.dumps({w:{k:v for k,v in d.items() if k not in ['fills','episodes','curve']} for w,d in detail['original'].items() if w in ['2023-25','2026 YTD','2023-26']},indent=1))
