"""Frozen-grid spot evaluation. Signals come from the exact page JavaScript."""
from pathlib import Path
import json, datetime as dt, csv
import numpy as np
from numba import njit

HERE=Path(__file__).resolve().parent
def ts(y,m=1,d=1): return int(dt.datetime(y,m,d,tzinfo=dt.timezone.utc).timestamp())
END=ts(2026,10)

@njit
def simulate(B,S,span,rr,hold,start,end,fee=.0012,delay=0):
    lo=np.searchsorted(B[:,0],start); hi=np.searchsorted(B[:,0],end)
    # Start with one BTC, liquidate at the first open to fund a long/cash trading sleeve.
    cash=B[lo,1]*(1-fee); qty=0.; peak=cash; dd=0.; stop=0.; target=0.; entry=0.; entered=-1
    cursor=0; count=0; gaps=0
    ledger=np.zeros((len(S)+1,7))
    while cursor<len(S) and S[cursor,0]+1+delay<lo: cursor+=1
    for j in range(lo,hi):
        if qty>0 and j>lo and B[j,0]-B[j-1,0]!=span:
            px=min(B[j,1],stop);cash=qty*px*(1-fee);qty=0.;gaps+=1
            ledger[count]=np.array([entered,j,entry,px,px*(1-fee)/(entry*(1+fee))-1,3.,B[entered,0]])
            count+=1
        while cursor<len(S) and S[cursor,0]+1+delay<=j:
            si=int(S[cursor,0]);sl=S[cursor,1]
            if S[cursor,0]+1+delay==j and qty==0 and si>=lo and B[j,0]-B[si,0]==(1+delay)*span and 0<sl<B[j,1]:
                entry=B[j,1];stop=sl;target=entry+rr*(entry-stop);entered=j
                qty=cash/(entry*(1+fee));cash=0.
            cursor+=1
        if qty>0:
            px=0.;reason=-1.
            if B[j,1]<=stop: px=B[j,1];reason=0.
            elif B[j,3]<=stop: px=stop;reason=0.
            elif B[j,2]>=target: px=target;reason=1.
            elif j-entered+1>=hold or j==hi-1: px=B[j,4];reason=2.
            if reason>=0:
                cash=qty*px*(1-fee);qty=0.
                ledger[count]=np.array([entered,j,entry,px,px*(1-fee)/(entry*(1+fee))-1,reason,B[entered,0]])
                count+=1
        equity=cash+qty*B[j,4]*(1-fee)
        peak=max(peak,equity);dd=min(dd,equity/peak-1)
    final=cash+qty*B[hi-1,4]*(1-fee)
    return final/(B[hi-1,4]*(1+fee)),final/B[lo,1]-1,dd,ledger[:count],gaps

def summary(out):
    btc,usd,dd,trades,gaps=out
    r=trades[:,4];win=float(r[r>0].sum());loss=float(-r[r<0].sum())
    return dict(btc=float(btc),usdReturn=float(usd),drawdown=float(dd),trades=len(r),mean=float(r.mean()) if len(r) else 0.,
                profitFactor=win/loss if loss else None,winRate=float((r>0).mean()) if len(r) else 0.,gapExits=int(gaps))

def boot(trades,seed=17010):
    # Resample calendar-month blocks, retaining dependence among trades within a month.
    if not len(trades):return [0.,0.]
    buckets={}
    for r in trades:
        month=dt.datetime.fromtimestamp(r[6],dt.timezone.utc).strftime('%Y-%m')
        buckets.setdefault(month,[]).append(r[4])
    sums=np.array([sum(v) for v in buckets.values()]);counts=np.array([len(v) for v in buckets.values()])
    rng=np.random.default_rng(seed);pick=rng.integers(0,len(sums),(3000,len(sums)))
    means=sums[pick].sum(axis=1)/counts[pick].sum(axis=1)
    return np.quantile(means,[.025,.975]).tolist()

def main():
    result={'protocol':'PROTOCOL.md','feePerSide':.0012,'results':{}}
    rows=[];ledger_rows=[]
    for frame,span in [('5m',300),('1h',3600)]:
        B=np.load(HERE/'cache'/f'{frame}.npy')
        signals=json.loads((HERE/'cache'/f'{frame}-signals.json').read_text())
        candidates=[];holds=[96,288] if frame=='5m' else [48,168]
        for pars,families in signals.items():
            for family,sigs in families.items():
                S=np.array([[s['i'],s['stop']] for s in sigs],dtype=float).reshape(-1,2)
                for rr in [1.,1.5,2.]:
                    for hold in holds:
                        id=f'{pars}:{family}:R{rr}:H{hold}'
                        annual={str(y):summary(simulate(B,S,span,rr,hold,ts(y),min(ts(y+1),END))) for y in range(2020,2027)}
                        train=summary(simulate(B,S,span,rr,hold,ts(2020),ts(2025)))
                        validation=summary(simulate(B,S,span,rr,hold,ts(2025),END))
                        c=dict(id=id,parameters=pars,family=family,rr=rr,hold=hold,annual=annual,train=train,validation=validation)
                        candidates.append(c)
                        rows.append(dict(frame=frame,id=id,trainMean=train['mean'],trainTrades=train['trades'],validationMean=validation['mean'],validationTrades=validation['trades'],**{f'btc{y}':annual[str(y)]['btc'] for y in range(2020,2027)}))
        qualified=[c for c in candidates if c['train']['trades']>=(100 if frame=='5m' else 30)]
        selected=max(qualified,key=lambda c:(min(c['annual'][str(y)]['usdReturn'] for y in range(2020,2025)),c['train']['mean']))
        control=next(c for c in candidates if c['parameters']=='34-9' and c['family']=='confluence' and c['rr']==1.5 and c['hold']==holds[0])
        hindsight=max(candidates,key=lambda c:c['validation']['mean'])
        checks={}
        for label,c in [('control',control),('selected',selected),('hindsight',hindsight)]:
            S=np.array([[s['i'],s['stop']] for s in signals[c['parameters']][c['family']]],dtype=float).reshape(-1,2)
            run=lambda start,end,fee=.0012,delay=0:simulate(B,S,span,c['rr'],c['hold'],start,end,fee,delay)
            out=run(ts(2025),END);ci=boot(out[3]);mid=ts(2025,11,15)
            checks[label]={'id':c['id'],'annual':c['annual'],'train':c['train'],'validation':summary(out),'meanCI95':ci,
                           'firstHalf':summary(run(ts(2025),mid)),'secondHalf':summary(run(mid,END)),
                           'higherCost':summary(run(ts(2025),END,.002)),
                           'zeroCost':summary(run(ts(2025),END,0)),
                           'delayed':summary(run(ts(2025),END,.0012,1))}
            ch=checks[label]
            ch['passes']=bool(label!='hindsight' and ch['validation']['trades']>=(30 if frame=='5m' else 15) and ci[0]>0 and all(ch[k]['mean']>0 for k in ['validation','firstHalf','secondHalf','higherCost','delayed']))
            for r in out[3]:ledger_rows.append(dict(frame=frame,rule=label,entryTime=int(B[int(r[0]),0]),exitTime=int(B[int(r[1]),0]+span),entry=r[2],exit=r[3],netReturn=r[4],reason=int(r[5])))
        neighbours=[c for c in candidates if c['family']==selected['family'] and c['rr']==selected['rr'] and c['hold']==selected['hold']]
        result['results'][frame]={'candidates':len(candidates),'checks':checks,'neighbours':[{'id':c['id'],'train':c['train'],'validation':c['validation']} for c in neighbours],
                                  'positiveValidationCandidates':sum(c['validation']['mean']>0 for c in candidates),
                                  'bestValidationHindsightOnly':max(candidates,key=lambda c:c['validation']['mean'])}
        print(frame,json.dumps(checks),flush=True)
    for name,items in [('candidates.csv',rows),('validation-trades.csv',ledger_rows)]:
        with (HERE/name).open('w',newline='',encoding='utf-8') as f:w=csv.DictWriter(f,fieldnames=list(items[0]));w.writeheader();w.writerows(items)
    (HERE/'results.json').write_text(json.dumps(result,indent=2))

if __name__=='__main__': main()
