"""Post-selection diagnostics; no parameter re-selection from these results."""
from expanded import *

def execute_mask(rows,mask,fee=.001,delay=0):
    q=1.;cash=0.;ledger=[];path=[];pending=None
    for i,row in enumerate(rows):
        if pending is None and bool(mask[i])!=bool(q):pending=(i+delay,bool(mask[i]),int(row[0]-1))
        if pending and i>=pending[0]:
            _,want,decision=pending;p=row[1]
            if want:q=cash/(p*(1+fee));cash=0.
            else:cash=q*p*(1-fee);q=0.
            ledger.append(dict(side='buy' if want else 'sell',time=int(row[0]),decision=decision,price=float(p),units=float(q),reason='combined target'));pending=None
        path.append([q+cash/(row[4]*(1+fee)),q*row[4]+cash])
    out=metrics(rows,q,cash,ledger,path,fee)
    out['curve']=[[int(row[5]),*map(float,value)] for row,value in zip(rows,path)]
    return out

def run():
    x=json.loads(OUT.read_text());raw=fetch();D=raw['1d'];rth,audit=regular(raw['1h'],D)
    G=Grid(0,a1h=data());F=features(G,'fast_recovery');P=build_panel(D,G,F)
    n=x['selected']['balanced'];assert n=='fast_either200'
    ct=closes(D);c=D[:,4];dh,dl,dc,de,_=G.daily();bt=G.real+14400
    mstrma=sma(c,200);mst=state(c>mstrma*1.02,c<mstrma*.98,2,False)
    btcma=sma(dc,200);bst=state(dc>btcma*1.02,dc<btcma*.98,2,False)
    intraday=[]
    for period in ['2024','2025','2026','validation','2024-26']:
        a,b=PERIODS[period];rows=rth[(rth[:,0]>=ts(a))&(rth[:,0]<ts(b))]
        changes=btc_sim(G,F,'none_e50',a,b,details=True)['ledger'];times=np.array([v['time'] for v in changes]);sides=np.array([v['side']=='buy' for v in changes])
        ix=np.searchsorted(times,rows[:,0]-1,side='right')-1;fast=np.ones(len(rows),bool);ok=ix>=0;fast[ok]=sides[ix[ok]]
        regime=at(ct,mst,rows[:,0]-1)|at(bt[de],bst,rows[:,0]-1)
        for name,mask in [('fast_recovery',fast),(n,fast&regime)]:
            for fee,delay in [(.001,0),(.003,0),(.005,0),(.001,1),(.003,1)]:
                r=execute_mask(rows,mask,fee,delay)
                intraday.append(dict(name=name,period=period,fee=fee,extraBars=delay,result=r if fee==.001 and delay==0 else compact(r)))
                if name=='fast_recovery' and fee==.001 and delay==0:
                    old=json.loads((HERE/'summary.json').read_text())['hourlyMirror'][name].get(period if period!='validation' else '2025-26')
                    if old:assert abs(old['shares']-r['shares'])<1e-9
    # Neighborhood is diagnostic, not eligible for changing the selected rule.
    neighbors=[]
    for bn,mn,band in itertools.product([150,200],[150,200],[.01,.02,.03]):
        bm=sma(dc,bn);mm=sma(c,mn)
        bv=state(dc>bm*(1+band),dc<bm*(1-band),2,False)
        mv=state(c>mm*(1+band),c<mm*(1-band),2,False)
        mask=at(bt[de],bv,D[:,0]-1)|np.r_[False,mv[:-1]]
        P['series']['neighbor']=mask;P['meta']['neighbor']=dict(kind='overlay',family='Diagnostic only')
        for period in ['2022','2023','2024','2025','2026','validation']:
            r=run_model(P,'neighbor',*PERIODS[period])
            neighbors.append(dict(btcMA=bn,mstrMA=mn,band=band,period=period,result=r))
    concentration=[]
    for name in [n,'fast_recovery']:
        for period in ['2023-25','validation','treasury']:
            r=x['details'][name][period];g=max([1+p['gain'] for p in r['pairs']]+[1])
            concentration.append(dict(name=name,period=period,shares=r['shares'],bestCompletedMultiplier=g,
                                      sharesWithoutBestCompleted=r['shares']/g))
    # No annual reset for the walk-forward portfolio. Attribute units at each
    # year boundary directly from that continuous path.
    walk=x['walkForward'];segments={};prior=1.
    for y in ['2023','2024','2025','2026']:
        points=[v for v in walk['curve'] if day(v[0])[:4]==y]
        end=points[-1][1];segments[y]=dict(rule=walk['schedule'][y],startingShareEquivalent=prior,endingShareEquivalent=end,multiplier=end/prior);prior=end
    # The same dated continuous comparison, rather than annual products.
    continuous={name:run_model(P,name,'2023-01-01',END,details=True) for name in [n,'fast_recovery','hold']}
    result=dict(selected=n,intraday=intraday,neighbors=neighbors,concentration=concentration,walkSegments=segments,
                continuous2023to2026=continuous,checks=['Five hourly control periods match prior hourly mirror results',
                  'MSTR daily regimes become available after their actual regular-session close',
                  'Stock/crypto SMA regimes, BTC trade targets and stock fill clocks are mapped separately',
                  'Neighbor diagnostics do not change the selected candidate'])
    (HERE/'expanded-validation.json').write_text(json.dumps(result,indent=2))
    for r in intraday:
        if r['fee']==.001 and r['extraBars']==0:print(r['name'],r['period'],round(r['result']['shares'],4),round(r['result']['usdDD'],4))
    print('CONCENTRATION',concentration)
    print('WALK',segments)

if __name__=='__main__':run()
