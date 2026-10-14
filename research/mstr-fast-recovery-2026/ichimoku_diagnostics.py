"""Post-selection accounting, concentration and execution checks; no re-selection."""
from ichimoku_revisit import *


def btc_risk(G, result, period):
    a,b=map(G.ix,PERIODS[period]);q=1.;cash=0.;j=0;ledger=result['ledger'];usd=[];units=[]
    for i in range(a,b):
        while j<len(ledger) and ledger[j]['time']<=G.real[i]:
            t=ledger[j];assert t['time']==G.real[i]
            assert t['decision']<=t['time']
            if t['side']=='sell':cash=q*t['price']*.999;q=0.
            else:q=cash/(t['price']*1.001);cash=0.
            j+=1
        usd.append(q*G.c[i]+cash);units.append(q+cash/(G.c[i]*1.001))
    assert abs(units[-1]-result['btc'])<1e-9
    dd=lambda p:float(min(p/np.maximum.accumulate(p)-1))
    return dict(usdReturn=usd[-1]/G.o[a]-1,holdReturn=G.c[b-1]/G.o[a]-1,
                usdDD=dd(np.r_[G.o[a],usd]),holdDD=dd(np.r_[G.o[a],G.c[a:b]]))


def run():
    x=json.loads((HERE/'ichimoku-results.json').read_text());G=Grid(0,a1h=data())
    risk={n:{p:btc_risk(G,r,p) for p,r in periods.items()} for n,periods in x['detailsBTC'].items()}
    concentration=[]
    for asset,field,key in [('BTC','detailsBTC','btc'),('MSTR','detailsMSTR','shares')]:
        for name,periods in x[field].items():
            for period in ['2023-25','validation']:
                r=periods[period];best=max([1+p['gain'] for p in r['pairs']]+[1.])
                concentration.append(dict(asset=asset,name=name,period=period,units=r[key],
                                          bestCompletedMultiplier=best,withoutBestCompleted=r[key]/best))
    # Check the newly selected MSTR alternatives at regular-session hourly opens.
    raw=fetch();D=raw['1d'];rth,audit=regular(raw['1h'],D)
    names=list(dict.fromkeys([BASE,JOINT,x['selectedMSTR']['balanced'],x['selectedMSTR']['bull'],
                              x['selectedMSTR']['families']['Ichimoku filter']['balanced']]))
    needs={x['mstrDefinitions'][n]['model'] for n in names}
    P=prepare(G,D,only=needs);bt=G.real+14400;ct=closes(D)
    _,_,bc,be,_=G.daily();bm=sma(bc,200);mm=sma(D[:,4],200)
    bs=state(bc>bm*1.02,bc<bm*.98,2,False);ms=state(D[:,4]>mm*1.02,D[:,4]<mm*.98,2,False)
    bp=ichimoku(*G.daily()[:3])[0];mp=ichimoku(D[:,2],D[:,3],D[:,4])[0]
    hourly=[]
    for period in ['2024','2025','2026','validation']:
        a,b=PERIODS[period];rows=rth[(rth[:,0]>=ts(a))&(rth[:,0]<ts(b))]
        joint=at(bt[be],bs,rows[:,0]-1)|at(ct,ms,rows[:,0]-1)
        for name in names:
            spec=P['specs'][name];changes=btc_run(P,spec['model'],period)['ledger']
            times=np.array([t['time'] for t in changes]);sides=np.array([t['side']=='buy' for t in changes])
            ix=np.searchsorted(times,rows[:,0]-1,side='right')-1;mask=np.ones(len(rows),bool);ok=ix>=0;mask[ok]=sides[ix[ok]]
            if spec.get('joint'):mask &= joint
            if spec['kind']=='filter':
                sig=spec['signal'];k=spec['confirmation']
                bsig=at(bt[be],state(*bp[sig],k,False),rows[:,0]-1)
                msig=at(ct,state(*mp[sig],k,False),rows[:,0]-1)
                mask &= {'btc':bsig,'mstr':msig,'either':bsig|msig,'both':bsig&msig}[spec['source']]
            for fee,delay in [(.001,0),(.003,0),(.001,1),(.003,1)]:
                r=execute_mask(rows,mask,fee,delay)
                hourly.append(dict(name=name,period=period,fee=fee,extraBars=delay,
                                   result={k:v for k,v in r.items() if k not in ['curve','ledger','pairs']}))
    # Added after selection to test whether the apparent repair of 2020-21 is fragile.
    # These diagnostics are not a second optimization stage.
    oldbull=[];btc_names=list(dict.fromkeys([BASE,x['selectedBTC']['balanced'],x['selectedBTC']['bull']]))
    for phase in [0,3,6,9,12,15,18,21]:
        pg=G if phase==0 else Grid(phase,a1h=data());pp=prepare(pg,D,only=set(btc_names))
        for n in btc_names:
            for fee,delay in ([(.001,0),(.003,0),(.001,1),(.003,1)] if phase==0 else [(.001,0)]):
                r=btc_run(pp,n,'2020-21',fee,delay)
                oldbull.append(dict(name=n,phase=phase,fee=fee,delay=delay,btc=r['btc']))
    out=dict(btcRisk=risk,concentration=concentration,hourly=hourly,hourlyAudit=audit,oldBullDiagnostics=oldbull,
             checks=['Independent BTC ledger reconstruction reconciles all selected end units',
                     'BTC risk paths use completed four-hour closes; MSTR risk uses session closes',
                     'Hourly MSTR indicators use completed daily candles and earlier BTC trade targets'])
    (HERE/'ichimoku-diagnostics.json').write_text(json.dumps(out,separators=(',',':')))
    print('Saved ichimoku-diagnostics.json',flush=True)


if __name__=='__main__':run()
