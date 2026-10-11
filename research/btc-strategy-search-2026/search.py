"""Exploratory search, all trials retained. No claim of untouched holdout data.
Spot/cash only. Closed-bar signals, next-open execution, fee-net ending BTC.
"""
from pathlib import Path
import sys,json,itertools,hashlib
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
O=Path(__file__).resolve().parent;ROOT=O.parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT.parent/'quant/research_notes/ensemble_v2'))
from core import Grid as SourceGrid,load_1h,sma,ema,smma,average,page_members,ts

class Grid(SourceGrid):
    def group(self,span):
        # Restrict reductions to completed groups. Without the slice, reduceat's
        # final bucket can absorb the following, incomplete group's high/low.
        key=(self.t//span).astype(np.int64);cut=np.flatnonzero(np.diff(key))
        s=np.insert(cut+1,0,0);e=np.append(cut,self.n-1)
        if (self.t[-1]+14400)%span!=0:s,e=s[:-1],e[:-1]
        if not len(s):return np.array([]),np.array([]),np.array([]),e,s
        end=e[-1]+1
        return np.maximum.reduceat(self.h[:end],s),np.minimum.reduceat(self.l[:end],s),self.c[e],e,s

END='2026-10-10'
WINDOWS={'2014-18':('2014-01-01','2019-01-01'),'2019':('2019-01-01','2020-01-01'),
 '2020-21':('2020-01-01','2022-01-01'),'2022':('2022-01-01','2023-01-01'),
 '2023-25':('2023-01-01','2026-01-01'),'2026 YTD':('2026-01-01',END),
 '2023-26':('2023-01-01',END),'2019-26':('2019-01-01',END)}
BULLS=['2020-21','2023-25'];BEARS=['2022','2026 YTD'];TARGET=BULLS+BEARS

def data():
    a=load_1h();x=json.loads((ROOT/'research/btc-corrections-2023-2025/extension-2026.json').read_text())
    b=np.array(x['hourly'],float)
    return np.vstack([a,b[b[:,0]>a[-1,0]]])

def rolling(x,n,maximum=True):
    out=np.full(len(x),np.nan)
    if len(x)>=n:out[n-1:]=(np.max if maximum else np.min)(sliding_window_view(x,n),axis=1)
    return out

def previous(x):return np.r_[np.nan,x[:-1]]

def state(up,down,confirm=1,initial=True):
    up=np.array(up,bool);down=np.array(down,bool)
    rawup=up.copy();rawdown=down.copy()
    for j in range(1,confirm):
        up &= np.r_[np.zeros(j,bool),rawup[:-j]]
        down &= np.r_[np.zeros(j,bool),rawdown[:-j]]
    out=np.zeros(len(up),bool);s=initial
    for j in range(len(up)):
        if down[j]:s=False
        elif up[j]:s=True
        out[j]=s
    return out

def candidates(G):
    h,l,c,e,_=G.daily();n=len(c);P={'hold':np.ones(G.n,bool)};meta={'hold':{'family':'hold'}}
    mas={k:{n:f(c,n) for n in [5,10,20,30,50,65,100,150,200]} for k,f in [('sma',sma),('ema',ema)]}
    def add(name,p,family,params):
        assert name not in P
        P[name]=np.nan_to_num(G.spread(p,e),nan=1).astype(bool);meta[name]={'family':family,'params':params}
    for kind,N,b,k in itertools.product(['sma','ema'],[20,50,65,100,150,200],[0,.02,.05],[1,2]):
        q=mas[kind][N];name=f'{kind}{N}_band{b:g}_confirm{k}'
        add(name,state(c>q*(1+b),c<q*(1-b),k),'price_ma',dict(kind=kind,n=N,band=b,confirm=k))
    for kind,f,s,b in itertools.product(['sma','ema'],[5,10,20,50],[20,50,100,200],[0,.02]):
        if f>=s:continue
        name=f'{kind}{f}_{s}_band{b:g}';q=mas[kind][f];r=mas[kind][s]
        add(name,state(q>r*(1+b),q<r*(1-b)),'ma_cross',dict(kind=kind,fast=f,slow=s,band=b))
    for ent,ext in itertools.product([5,10,20,50,100],[5,10,20,50,100]):
        hi=previous(rolling(h,ent));lo=previous(rolling(l,ext,False))
        add(f'donchian{ent}_{ext}',state(c>hi,c<lo),'donchian',dict(entry=ent,exit=ext))
    for N,b,k in itertools.product([10,20,65,120,180],[0,.02,.05],[1,2]):
        q=np.r_[np.full(N,np.nan),c[:-N]]
        add(f'roc{N}_band{b:g}_confirm{k}',state(c>q*(1+b),c<q*(1-b),k),'roc',dict(n=N,band=b,confirm=k))
    # ATR trailing trend direction; stop is ratcheted, reversals use the current final band.
    tr=np.maximum(h-l,np.maximum(abs(h-previous(c)),abs(l-previous(c))));tr[0]=h[0]-l[0]
    for N,mult in itertools.product([10,20,40],[2,3,4,5]):
        atr=smma(tr,N);up=(h+l)/2+mult*atr;dn=(h+l)/2-mult*atr;bull=np.ones(n,bool)
        for i in range(1,n):
            if not np.isfinite(atr[i-1]):continue
            up[i]=up[i] if up[i]<up[i-1] or c[i-1]>up[i-1] else up[i-1]
            dn[i]=dn[i] if dn[i]>dn[i-1] or c[i-1]<dn[i-1] else dn[i-1]
            bull[i]=(c[i]>=dn[i]) if bull[i-1] else (c[i]>up[i])
        add(f'atr{N}_x{mult}',bull,'atr',dict(n=N,mult=mult))
    # Closing-price trailing stop, reset on signal entry. Price breakout re-entry.
    for dd,ent in itertools.product([.1,.15,.2,.25],[5,10,20,50]):
        hi=previous(rolling(h,ent));p=np.ones(n,bool);on=True;peak=c[0]
        for i in range(1,n):
            if on:
                peak=max(peak,c[i])
                if c[i]<peak*(1-dd):on=False
            elif c[i]>hi[i]:on=True;peak=c[i]
            p[i]=on
        add(f'trail{dd:g}_break{ent}',p,'trail',dict(drawdown=dd,entry=ent))
    change=np.r_[0,np.diff(c)]
    for N in [7,14,21]:
        u=smma(np.maximum(change,0),N);d=smma(np.maximum(-change,0),N)
        rsi=np.divide(u,u+d,out=np.full(n,.5),where=(u+d)>0)*100
        for high,low in itertools.product([50,55,60],[40,45,50]):
            if high<=low:continue
            add(f'rsi{N}_{high}_{low}',state(rsi>high,rsi<low),'rsi_trend',dict(n=N,entry=high,exit=low))
        # Sell strength / buy retracement, with explicit full-cash bear defense.
        for high,low,reg in itertools.product([70,80],[40,50,60],[50,100,200]):
            p=np.ones(n,bool);on=True;ma=mas['sma'][reg]
            for i in range(n):
                if c[i]<ma[i]*.98:on=False
                elif on and rsi[i]>high:on=False
                elif not on and c[i]>ma[i]*1.02 and rsi[i]<low:on=True
                p[i]=on
            add(f'rsi_fade{N}_{high}_{low}_ma{reg}',p,'rsi_fade',dict(n=N,sell=high,buy=low,regime=reg))
    E=average([m[-1] for m in page_members(G)])
    for enter,exit_ in itertools.product([.45,.5,.6,.7],[.2,.3,.4,.5]):
        if enter<=exit_:continue
        name=f'ensemble{enter:g}_{exit_:g}';P[name]=state(E>enter,E<exit_);meta[name]={'family':'ensemble','params':dict(entry=enter,exit=exit_)}
    # BTC buyback hurdle, using actual next-open sale price; full position and bear defense.
    regimes={0:np.ones(G.n,bool)}
    for N in [100,200]:regimes[N]=np.nan_to_num(G.spread(state(c>mas['sma'][N]*1.02,c<mas['sma'][N]*.98,2),e),nan=1).astype(bool)
    for out,gain,reg in itertools.product([.3,.4,.5],[.03,.05,.1,.15],[0,100,200]):
        on=True;sale=np.nan;p=np.ones(G.n,bool);S=regimes[reg]
        for i in range(1,G.n):
            if p[i-1]==False and (i<2 or p[i-2]==True):sale=G.o[i]
            if on and E[i]<out:on=False
            elif not on and (E[i]>.6 or (S[i] and G.c[i]<=sale*(1-.001)/(1+.001)/(1+gain))):on=True
            p[i]=on
        name=f'buyback{gain:g}_exit{out:g}_ma{reg}';P[name]=p;meta[name]={'family':'buyback','params':dict(exit=out,gain=gain,regime=reg)}
    return P,meta

def simulate(G,p,start,end,fee=.001,lag=0,details=False,paths=False):
    a=int(np.searchsorted(G.real,ts(start)));z=int(np.searchsorted(G.real,ts(end)))
    pos=p[np.arange(a,z)-1-lag].astype(int);prev=np.r_[1,pos[:-1]];changes=pos-prev
    fee_log=np.where(changes>0,-np.log1p(fee),np.where(changes<0,np.log1p(-fee),0))
    move=np.r_[0,prev[1:]*np.log(G.o[a+1:z]/G.o[a:z-1])]
    log_open=np.cumsum(fee_log+move)
    usd=G.o[a]*np.exp(log_open+pos*np.log(G.c[a:z]/G.o[a:z]))
    btc=usd/G.c[a:z]/np.where(pos==0,1+fee,1)
    usdpath=np.r_[G.o[a],usd];btcpath=np.r_[1,btc]
    r={'btc':float(btc[-1]),'usdDD':float(np.min(usdpath/np.maximum.accumulate(usdpath)-1)),
      'btcDD':float(np.min(btcpath/np.maximum.accumulate(btcpath)-1)),
      'usdReturn':float(usd[-1]/G.o[a]-1),'trades':int(np.count_nonzero(changes)),
      'exposure':float(np.mean(pos)),'units':float(usd[-1]/G.c[z-1] if pos[-1] else 0),
      'cash':float(usd[-1] if not pos[-1] else 0),'lastPrice':float(G.c[z-1])}
    if details:
        units=1.;cash=0.;fills=[]
        for k in np.flatnonzero(changes):
            i=a+k;price=G.o[i]
            if pos[k]:du=cash/(price*(1+fee));units=du;cash=0.
            else:du=-units;cash=units*price*(1-fee);units=0.
            fills.append({'time':int(G.real[i]),'price':float(price),'btc':float(du)})
        assert abs(units+cash/(G.c[z-1]*(1+fee))-r['btc'])<1e-8,'Independent ledger mismatch'
        idx=sorted(set([*range(0,z-a,6),z-a-1]))
        r.update(fills=fills,curve=[[int(G.real[a+k]+14400),float(btc[k]),float(usd[k]/G.o[a])] for k in idx])
    if paths:r.update(btcPath=btc,usdPath=usd/G.o[a])
    return r

def passes(rows,hold):
    return all(rows[w]['btc']>1+1e-9 for w in TARGET) and all(abs(rows[w]['usdDD'])<=.75*abs(hold[w]['usdDD']) for w in BEARS)

def run():
    G=Grid(0,a1h=data());P,M=candidates(G);rows={}
    for name,p in P.items():rows[name]={w:simulate(G,p,*ab) for w,ab in WINDOWS.items()}
    passing=[n for n in P if passes(rows[n],rows['hold'])]
    rank=sorted([n for n in P if n!='hold'],key=lambda n:min(rows[n][w]['btc'] for w in TARGET),reverse=True)
    result={'endExclusive':END,'count':len(P)-1,'meta':M,'rows':rows,'passing':passing,'rank':rank,
      'codeHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (O/'search-results.json').write_text(json.dumps(result,indent=1))
    print('Tested',len(P)-1,'configurations; passing BTC + bear-DD gate',len(passing),flush=True)
    for n in rank[:25]:print(n,{w:round(rows[n][w]['btc'],4) for w in WINDOWS},'bearDD',[round(rows[n][w]['usdDD'],3) for w in BEARS],flush=True)
    print('PASSING',passing,flush=True)

if __name__=='__main__':run()
