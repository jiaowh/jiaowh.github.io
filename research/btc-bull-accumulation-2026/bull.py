"""BTC accumulation strictly inside the supplied three-year bull windows."""
from pathlib import Path
import sys,json,itertools,hashlib
import numpy as np
O=Path(__file__).resolve().parent;ROOT=O.parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(O.parent/'btc-strategy-search-2026'))
from search import Grid,data,sma,smma,average,page_members,state,ts

WINDOWS={'2015-17':('2015-01-01','2018-01-01'),'2019-21':('2019-01-01','2022-01-01'),
 '2023-25':('2023-01-01','2026-01-01'),'2020-21':('2020-01-01','2022-01-01')}
CYCLES=['2015-17','2019-21','2023-25'];PHASES=[0,3,6,9,12,15,18,21]
CONFIGS={f'{tr}_ma{gate}_gain{gain:g}_{recovery}':dict(trigger=tr,gate=gate,gain=gain,recovery=recovery)
 for tr,gate,gain,recovery in itertools.product(['e20','e30','e40','e50','rsi70','rsi80'],[0,100,200],[.03,.05,.1,.15],['trend','stop3','time14'])}

def inputs(G):
    h,l,c,e,_=G.daily();E=average([m[-1] for m in page_members(G)])
    triggers={f'e{int(x*100)}':(E<x)&np.r_[False,E[:-1]>=x] for x in [.2,.3,.4,.5]}
    change=np.r_[0,np.diff(c)];u=smma(np.maximum(change,0),14);d=smma(np.maximum(-change,0),14)
    rsi=np.divide(u,u+d,out=np.full(len(c),.5),where=(u+d)>0)*100
    for x in [70,80]:
        events=(rsi<x)&np.r_[False,rsi[:-1]>=x];out=np.zeros(G.n,bool);out[e[events]]=True
        triggers[f'rsi{x}']=out
    gates={0:np.ones(G.n,bool)}
    for N in [100,200]:
        ma=sma(c,N);regime=state(c>ma*1.02,c<ma*.98,2,False)
        gates[N]=np.nan_to_num(G.spread(regime,e)).astype(bool)
    return E,triggers,gates

def replay(G,I,config,start,end,fee=.001,delay=0,details=False):
    E,triggers,gates=I;p=CONFIGS[config] if isinstance(config,str) else config
    a=int(np.searchsorted(G.real,ts(start)));z=int(np.searchsorted(G.real,ts(end)))
    units,cash=1.,0.;pending=None;sale=None;sale_time=None;btc=[];usd=[];fills=[];reason=None
    trigger=triggers[p['trigger']];gate=gates[p['gate']];gain=p['gain'];recovery=p['recovery'];cashbars=0
    for i in range(a,z):
        if pending is not None and i==pending[0]:
            if pending[1]=='sell':
                du=-units;cash=units*G.o[i]*(1-fee);units=0.;sale=G.o[i];sale_time=G.real[i]
            else:
                du=cash/(G.o[i]*(1+fee));units=du;cash=0.
            fills.append({'time':int(G.real[i]),'price':float(G.o[i]),'btc':float(du),'reason':pending[2],
              'decision':int(G.real[pending[3]]+14400)})
            pending=None
        q=units+cash/(G.c[i]*(1+fee));btc.append(q);usd.append(units*G.c[i]+cash)
        cashbars+=cash>0
        if pending is not None:continue
        if units>0:
            if trigger[i] and gate[i]:pending=(i+1+delay,'sell',p['trigger'],i)
        else:
            hurdle=sale*.999/(1.001*(1+gain))
            profit=G.c[i]<=hurdle
            fallback=(E[i]>.6 if recovery=='trend' else G.c[i]>=sale*1.03 if recovery=='stop3'
              else G.real[i]+14400-sale_time>=14*86400)
            if profit or fallback:pending=(i+1+delay,'buy','hurdle' if profit else recovery,i)
    values=np.r_[1,btc];uv=np.r_[G.o[a],usd]
    result={'btc':float(btc[-1]),'units':float(units),'cash':float(cash),'lastPrice':float(G.c[z-1]),
      'btcDD':float(np.min(values/np.maximum.accumulate(values)-1)),
      'usdDD':float(np.min(uv/np.maximum.accumulate(uv)-1)),'trades':len(fills),'cashFraction':cashbars/(z-a)}
    # Exact independent multiplicative check for each completed cash round trip.
    q=1.;wins=0;pairs=[]
    for j in range(0,len(fills)-1,2):
        s,b=fills[j:j+2];assert s['btc']<0 and b['btc']>0
        mult=s['price']*(1-fee)/(b['price']*(1+fee));q*=mult;wins+=mult>1
        assert abs(q-b['btc'])<1e-8
        pairs.append({'sale':s['time'],'buy':b['time'],'ratio':float(mult),'reason':b['reason']})
    if len(fills)%2:q*=fills[-1]['price']*(1-fee)/(G.c[z-1]*(1+fee))
    assert abs(q-result['btc'])<1e-8
    result.update(roundTrips=len(pairs),wins=int(wins),openCash=bool(cash>0))
    if details:
        idx=sorted(set([*range(0,z-a,6),z-a-1]));result['fills']=fills;result['pairs']=pairs
        result['curve']=[[int(G.real[a+k]+14400),float(btc[k]),float(usd[k]/G.o[a])] for k in idx]
    return result

def run():
    hourly=data();allrows=[];detail={};count=len(CONFIGS);shortlist=None
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);I=inputs(G)
        names=CONFIGS if phase==0 else shortlist
        for name in names:
            rows={w:replay(G,I,name,*ab,details=phase==0) for w,ab in WINDOWS.items()}
            if phase==0:
                # Preserve every trial and fill; full selected paths live in validation.
                for r in rows.values():r.pop('curve',None)
                detail[name]=rows
            allrows.append({'name':name,'phase':phase,'rows':{w:{k:v for k,v in r.items() if k not in ['fills','pairs','curve']} for w,r in rows.items()}})
        if phase==0:
            shortlist=[n for n,r in detail.items() if all(r[w]['btc']>1+1e-9 for w in CYCLES)]
            print('Configurations',count,'base bull-cycle passes',len(shortlist),flush=True)
            top=sorted(CONFIGS,key=lambda n:min(detail[n][w]['btc'] for w in CYCLES),reverse=True)
            for n in top[:15]:print(n,{w:round(detail[n][w]['btc'],4) for w in WINDOWS},flush=True)
        print('Completed phase',phase,flush=True)
    summary={}
    for n in shortlist:
        rr=[r for r in allrows if r['name']==n]
        summary[n]={'allCyclePasses':sum(all(r['rows'][w]['btc']>1+1e-9 for w in CYCLES) for r in rr),
          'windows':{w:{'mean':float(np.mean([r['rows'][w]['btc'] for r in rr])),
          'min':min(r['rows'][w]['btc'] for r in rr),'max':max(r['rows'][w]['btc'] for r in rr),
          'wins':sum(r['rows'][w]['btc']>1+1e-9 for r in rr)} for w in WINDOWS}}
    result={'count':count,'configs':CONFIGS,'windows':WINDOWS,'shortlist':shortlist,'summary':summary,
      'rows':allrows,'detail':detail,'codeHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (O/'results.json').write_text(json.dumps(result,indent=1))
    print('ROBUST RANK',flush=True)
    for n in sorted(shortlist,key=lambda n:(summary[n]['allCyclePasses'],min(summary[n]['windows'][w]['min'] for w in CYCLES)),reverse=True)[:20]:
        print(n,summary[n],flush=True)

if __name__=='__main__':run()
