"""192 fixed refinements, with retrospective chronological selection checks."""
from bull import *
PARAMS={f'e{e}_c{c}_g{g:g}_{r}':dict(exit=e/100,confirm=c,gain=g,recovery=r)
 for e,c,g,r in itertools.product([20,30,40,50],[1,3],[.03,.05,.075,.1],['time3','time7','time14','time28','trend','guard14'])}
OLD='e50_c1_g0.1_time14';CONSERVATIVE='e20_c1_g0.05_trend'
PERIODS={'train2023_24':('2023-01-01','2025-01-01'),'train2024_H125':('2024-01-01','2025-07-01'),
 'test2025':('2025-01-01','2026-01-01'),'testH225':('2025-07-01','2026-01-01'),
 'full2023_25':('2023-01-01','2026-01-01'),'full2024_25':('2024-01-01','2026-01-01')}

def prepare(G):
    E,_,gates=inputs(G);events={}
    for ex in [.2,.3,.4,.5]:
        for n in [1,3]:
            b=E<ex;q=b.copy()
            for k in range(1,n):q &= np.r_[np.zeros(k,bool),b[:-k]]
            events[(ex,n)]=q&~np.r_[False,q[:-1]]
    return E,gates[200],events

def sim(G,I,p,start,end,fee=.001,delay=0,details=False):
    E,gate,events=I;a=G.ix(start);z=G.ix(end);q=1.;cash=0.;pending=None;sale=0.;sold=0
    fills=[];cashbars=0;top=1.;dd=0.;curve=[];event=events[(p['exit'],p['confirm'])]
    for i in range(a,z):
        if pending is not None and i==pending[0]:
            if pending[1]=='sell':du=-q;cash=q*G.o[i]*(1-fee);q=0.;sale=G.o[i];sold=G.real[i]
            else:du=cash/(G.o[i]*(1+fee));q=du;cash=0.
            fills.append({'time':int(G.real[i]),'price':float(G.o[i]),'btc':float(du),'reason':pending[2]});pending=None
        value=q+cash/(G.c[i]*(1+fee));top=max(top,value);dd=min(dd,value/top-1);cashbars+=cash>0
        if details and (G.dayend[i] or i==z-1):curve.append([int(G.real[i]+14400),float(value)])
        if pending is not None:continue
        if q:
            if event[i] and gate[i]:pending=(i+1+delay,'sell','confirmed weakness')
        else:
            age=(G.real[i]+14400-sold)/86400;r=p['recovery']
            target=G.c[i]<=sale*.999/(1.001*(1+p['gain']))
            recovery=E[i]>.6 if r=='trend' else (age>=14 and E[i]>.6) if r=='guard14' else age>=int(r[4:])
            if target or recovery:pending=(i+1+delay,'buy','target' if target else r)
    ratio=1.;pairs=[]
    for j in range(0,len(fills)-1,2):
        s,b=fills[j:j+2];assert s['btc']<0 and b['btc']>0
        mult=s['price']*(1-fee)/(b['price']*(1+fee));ratio*=mult
        assert abs(ratio-b['btc'])<1e-9
        pairs.append({'sale':s['time'],'buy':b['time'],'ratio':mult,'reason':b['reason']})
    if len(fills)%2:ratio*=fills[-1]['price']*(1-fee)/(G.c[z-1]*(1+fee))
    assert abs(ratio-value)<1e-9
    out={'btc':float(value),'units':float(q),'cash':float(cash),'fills':len(fills),
      'roundTrips':len(pairs),'wins':sum(p['ratio']>1 for p in pairs),'btcDD':float(dd),'cashFraction':cashbars/(z-a)}
    if details:out.update(ledger=fills,pairs=pairs,curve=curve)
    return out

def run():
    hourly=data();grids=[];rows=[];parity=0
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);I=prepare(G);grids.append((G,I))
        if phase==0:
            original=inputs(G)
            for name,ref in [(OLD,'e50_ma200_gain0.1_time14'),(CONSERVATIVE,'e20_ma200_gain0.05_trend')]:
                for y in range(2018,2026):
                    a,b=f'{y}-01-01',f'{y+1}-01-01'
                    check=replay(G,original,ref,a,b,details=True);r=sim(G,I,PARAMS[name],a,b,details=True)
                    assert abs(check['btc']-r['btc'])<1e-10
                    assert [(f['time'],f['price']) for f in check['fills']]==[(f['time'],f['price']) for f in r['ledger']]
                    parity+=1
            for cut in [ts('2024-08-01')+8*3600,ts('2025-07-01')]:
                g=Grid(0,a1h=hourly[hourly[:,0]<cut]);ii=prepare(g)
                for k in I[2]:assert np.array_equal(ii[2][k],I[2][k][:g.n])
        for n,p in PARAMS.items():rows.append({'name':n,'phase':phase,'rows':{w:sim(G,I,p,*ab) for w,ab in PERIODS.items()}})
        print('Refinement phase',phase,flush=True)
    scores={n:{w:float(np.quantile([np.log(r['rows'][w]['btc']) for r in rows if r['name']==n],.25))
      for w in ['train2023_24','train2024_H125','test2025','full2023_25']} for n in PARAMS}
    chosen={'locked2024':max(scores,key=lambda n:scores[n]['train2023_24']),
      'lockedJune2025':max(scores,key=lambda n:scores[n]['train2024_H125']),
      'hindsight2025':max(scores,key=lambda n:scores[n]['test2025']),
      'hindsightFullCycle':max(scores,key=lambda n:scores[n]['full2023_25']),
      'current':OLD,'conservative':CONSERVATIVE}
    stress=[];detail={};extra={}
    for phase,(G,I) in zip(PHASES,grids):
        for n in set(chosen.values()):
            for fee,delay in [(.001,0),(.003,0),(.001,1),(.001,6)]:
                rr={w:sim(G,I,PARAMS[n],*ab,fee=fee,delay=delay,details=phase==0 and fee==.001 and delay==0) for w,ab in PERIODS.items()}
                if phase==0 and fee==.001 and delay==0:detail[n]=rr
                stress.append({'name':n,'phase':phase,'fee':fee,'delay':delay,'rows':{w:{k:v for k,v in r.items() if k not in ['ledger','pairs','curve']} for w,r in rr.items()}})
            extra.setdefault(n,[]).append({'phase':phase,**sim(G,I,PARAMS[n],'2020-01-01','2022-01-01')})
    summary={}
    for label,n in chosen.items():
        rr=[r for r in rows if r['name']==n]
        summary[label]={'name':n,'params':PARAMS[n],'windows':{w:{'base':next(r['rows'][w]['btc'] for r in rr if r['phase']==0),
          'min':min(r['rows'][w]['btc'] for r in rr),'max':max(r['rows'][w]['btc'] for r in rr),'wins':sum(r['rows'][w]['btc']>1 for r in rr)} for w in PERIODS},'carry':{}}
        for tag,full,train in [('2025','full2023_25','train2023_24'),('H225','full2024_25','train2024_H125')]:
            vals=[r['rows'][full]['btc']/r['rows'][train]['btc'] for r in rr]
            summary[label]['carry'][tag]={'base':vals[0],'min':min(vals),'max':max(vals),'wins':sum(v>1 for v in vals)}
    result={'configs':PARAMS,'chosen':chosen,'scores':scores,'rows':rows,'summary':summary,'stress':stress,'details':detail,'olderDiagnostic':extra,'parityChecks':parity}
    (O/'refinement-results.json').write_text(json.dumps(result,indent=1))
    print(json.dumps(summary,indent=1));print('PASS parity:',parity)

if __name__=='__main__':run()
