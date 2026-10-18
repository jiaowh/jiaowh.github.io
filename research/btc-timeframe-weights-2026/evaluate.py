"""Frozen, bounded timeframe-weight experiment; read PROTOCOL.md first."""
from pathlib import Path
import sys, json, itertools, math, hashlib, csv
from datetime import datetime, timezone
import numpy as np

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'research/btc-bull-accumulation-2026'))
from bull import Grid, data, inputs, average, page_members, PHASES, ts
from core import m_imacd
from weights import confirmed, TOL
from confidence import sim as execute, PERIODS as OLD_PERIODS

TF=[4,8,12,24,48,72]
PERIODS={**OLD_PERIODS,'2025-26':('2025-01-01','2026-10-10')}
def canonical(values):
    values=tuple(int(v*2) for v in values)
    divisor=math.gcd(*values)
    return tuple(v//divisor for v in values)
def name(values):return 'w_'+'_'.join(map(str,canonical(values)))
PROFILES={name(v):list(canonical(v)) for v in itertools.product([.5,1,2],repeat=6)}
BASE=name([1]*6)
NAMED={'equal':BASE,'half_4h_8h':name([.5,.5,1,1,1,1]),
       'fast_emphasis':name([2,2,2,1,1,1]),'slow_emphasis':name([1,1,1,2,2,2])}
assert len(PROFILES)==665

def components(G):
    blocks=np.array([average([m_imacd(G,tf,n,mode,13) for n,mode in itertools.product([14,21,34],['zero','state'])]) for tf in TF])
    daily=average([m[-1] for m in page_members(G) if m[1]!='imacd'])
    _,_,gates=inputs(G)
    return blocks,daily,gates[200]

def prepare(parts,weights):
    blocks,daily,gate=parts
    weights=np.array(weights,dtype=float);weights/=weights.sum()
    # Keep family totals fixed; do not reweight the 14 daily votes accidentally.
    E=.72*np.sum(blocks*weights[:,None],axis=0)+.28*daily
    return E,dict(event=confirmed(E,.5,3)&gate,filters={'none':np.ones(len(E),bool)},recoveries={'e50':E>.5+TOL})

def simulate(G,parts,w,period,fee=.001,delay=0,details=False):
    E,I=prepare(parts,w)
    return execute(G,I,'none_e50',*PERIODS[period],fee=fee,delay=delay,details=details)

def validate_ledger(G,r,period,fee):
    a,z=map(G.ix,PERIODS[period]);q=1.;cash=0.;usd=[];btc=[]
    bytime={t['time']:t for t in r['ledger']};last_side='buy';sale=None
    for i in range(a,z):
        t=bytime.get(int(G.real[i]))
        if t:
            assert t['side']!=last_side and t['decision']<=t['time']
            assert t['price']==G.o[i]
            if t['side']=='sell':cash=q*t['price']*(1-fee);q=0.;sale=t
            else:q=cash/(t['price']*(1+fee));cash=0.
            last_side=t['side']
        usd.append(q*G.c[i]+cash);btc.append(q+cash/(G.c[i]*(1+fee)))
    assert abs(btc[-1]-r['btc'])<1e-9
    bp=np.r_[1.,btc];up=np.r_[G.o[a],usd]
    assert abs(float(min(bp/np.maximum.accumulate(bp)-1))-r['btcDD'])<1e-9
    r.update(usdReturn=float(up[-1]/up[0]-1),usdDD=float(min(up/np.maximum.accumulate(up)-1)),
             holdUsdReturn=float(G.c[z-1]/G.o[a]-1))
    gains=[p['gain'] for p in r['pairs']]
    r['bestLeg']=max(gains) if gains else None
    r['btcWithoutBestLeg']=r['btc']/(1+max(gains)) if gains else r['btc']

def serial(r):
    return {k:v for k,v in r.items() if k not in ['ledger','pairs']}

def main():
    hourly=data();hourly=hourly[hourly[:,0]<ts('2026-10-10')]
    missing=[]
    for i in np.flatnonzero(np.diff(hourly[:,0])!=3600):
        if hourly[i+1,0]>=ts('2018-01-01'):
            missing.append({'after':datetime.fromtimestamp(hourly[i,0],timezone.utc).isoformat(),'missingHours':int((hourly[i+1,0]-hourly[i,0])/3600-1)})
    audit={'rows':len(hourly),'start':int(hourly[0,0]),'lastOpen':int(hourly[-1,0]),
           'sha256':hashlib.sha256(hourly.tobytes()).hexdigest(),'gaps2018Plus':missing,
           'missingHours2018Plus':sum(g['missingHours'] for g in missing)}
    (OUT/'data-audit.json').write_text(json.dumps(audit,indent=2))
    old=json.loads((ROOT/'research/btc-bull-accumulation-2026/imacd-summary.json').read_text())['details']['fast_s13_im100_e50']
    oldfull_path=ROOT/'research/btc-bull-accumulation-2026/imacd-results.json'
    oldphases={}
    if oldfull_path.exists():
        for row in json.loads(oldfull_path.read_text())['rows']:
            if row['name']=='fast_s13_im100_e50':oldphases[row['phase']]=row['periods']
    rows=[];grids=[];parity=0;prefix=0
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);parts=components(G);grids.append((G,parts))
        for key in old:
            if key not in PERIODS:continue
            current=simulate(G,parts,PROFILES[BASE],key,details=phase==0)
            if phase==0:
                assert abs(current['btc']-old[key]['btc'])<1e-9,(key,current['btc'],old[key]['btc'])
                assert [(t['side'],t['time'],t['price']) for t in current['ledger']]==[(t['side'],t['time'],t['price']) for t in old[key]['ledger']]
                parity+=1
            if phase in oldphases:
                assert abs(current['btc']-oldphases[phase][key]['btc'])<1e-9,(phase,key)
                parity+=1
        for idx,(n,w) in enumerate(PROFILES.items()):
            E,I=prepare(parts,w)
            periods={k:execute(G,I,'none_e50',*ab) for k,ab in PERIODS.items()}
            rows.append(dict(name=n,phase=phase,periods=periods))
            if idx and idx%200==0:print('Phase',phase,'profiles',idx,'/',len(PROFILES),flush=True)
        print('Completed phase',phase,flush=True)
    byname={n:[r for r in rows if r['name']==n] for n in PROFILES}
    scores={}
    for n,rr in byname.items():
        q={k:float(np.quantile([np.log(r['periods'][k]['btc'])/years for r in rr],.25)) for k,years in [('train',2),('2019-21',3),('2015-17',3)]}
        w=np.array(PROFILES[n],float);w/=w.sum()
        scores[n]={'recent':q['train'],'balanced':.6*q['train']+.3*q['2019-21']+.1*q['2015-17'],
                   'distance':float(np.sum((w-1/6)**2)), 'eligible':min(r['periods']['train']['roundTrips'] for r in rr)>=5}
    def ranking(metric):return sorted([n for n in PROFILES if scores[n]['eligible']],key=lambda n:(-scores[n][metric],scores[n]['distance'],n))
    selected={metric:ranking(metric)[0] for metric in ['recent','balanced']}
    names=list(dict.fromkeys([*NAMED.values(),*selected.values()]))
    top=ranking('recent')[:10]
    summary={}
    for n in names+list(set(top)-set(names)):
        rr=byname[n]
        summary[n]={k:{'base':rr[0]['periods'][k],'minimum':min(r['periods'][k]['btc'] for r in rr),
                       'maximum':max(r['periods'][k]['btc'] for r in rr),
                       'winsVsEqual':sum(r['periods'][k]['btc']>b['periods'][k]['btc']+1e-9 for r,b in zip(rr,byname[BASE])),
                       'above1':sum(r['periods'][k]['btc']>1+1e-9 for r in rr)} for k in PERIODS}
    details={};stress=[];shrink=[]
    for phase,(G,parts) in zip(PHASES,grids):
        for n in names:
            if phase==0:
                details[n]={}
                for k in PERIODS:
                    result=simulate(G,parts,PROFILES[n],k,details=True);validate_ledger(G,result,k,.001);details[n][k]=result
            for fee,delay in [(.003,0),(.001,1),(.003,1),(.001,6)]:
                stress.append({'name':n,'phase':phase,'fee':fee,'delay':delay,
                               'periods':{k:simulate(G,parts,PROFILES[n],k,fee=fee,delay=delay) for k in ['2020-21','2023-25','2025','2026','2025-26']}})
        for n in set(selected.values()):
            for fraction in [.25,.5,.75]:
                w=np.array(PROFILES[n],float);w/=w.sum();w=(1-fraction)*w+fraction/6
                shrink.append({'name':n,'phase':phase,'towardEqual':fraction,'weights':w.tolist(),
                               'periods':{k:simulate(G,parts,w,k) for k in ['train','2020-21','2023-25','2025','2026','2025-26']}})
    # Recalculate every candidate on truncated raw history, not sliced signals.
    G,parts=grids[0]
    for cut in [ts('2020-07-24')+8*3600,ts('2025-02-01')+16*3600]:
        shortG=Grid(0,a1h=hourly[hourly[:,0]<cut]);shortP=components(shortG)
        for n,w in PROFILES.items():
            E,I=prepare(parts,w);e,i=prepare(shortP,w)
            assert np.allclose(e,E[:shortG.n],equal_nan=True),(cut,n)
            assert np.array_equal(i['event'],I['event'][:shortG.n]),(cut,n)
            assert np.array_equal(i['recoveries']['e50'],I['recoveries']['e50'][:shortG.n]),(cut,n)
            prefix+=1
        for n in names:
            _,fullI=prepare(parts,PROFILES[n]);_,shortI=prepare(shortP,PROFILES[n])
            start='2020-01-01' if cut<ts('2021-01-01') else '2025-01-01'
            full=execute(G,fullI,'none_e50',start,'2026-10-10',details=True)
            short=execute(shortG,shortI,'none_e50',start,'2026-10-10',details=True)
            assert short['ledger']==[t for t in full['ledger'] if t['time']<shortG.real[-1]+14400]
    result={'profiles':PROFILES,'named':NAMED,'periods':PERIODS,'selected':selected,'scores':scores,'topTen':top,
            'rows':rows,'summary':summary,'details':details,'stress':stress,'shrink':shrink,
            'parityChecks':parity,'prefixChecks':prefix,'audit':audit}
    (OUT/'results-full.json').write_text(json.dumps(result,separators=(',',':')))
    compact={k:v for k,v in result.items() if k not in ['rows','profiles','scores']}
    compact['profiles']={n:PROFILES[n] for n in summary}
    compact['scores']={n:scores[n] for n in summary}
    compact['count']=len(PROFILES)
    (OUT/'summary.json').write_text(json.dumps(compact,separators=(',',':')))
    with (OUT/'candidates.csv').open('w',newline='') as f:
        fields=['profile',*[f'weight{tf}h' for tf in TF],'recentScore','balancedScore',*[k for k in PERIODS], 'cycleWinsAcrossPhases','cycleMin','cycleMax']
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
        for n in ranking('recent')+sorted(n for n in PROFILES if not scores[n]['eligible']):
            w=np.array(PROFILES[n],float);w=.72*w/w.sum();rr=byname[n]
            writer.writerow({'profile':n,**{f'weight{tf}h':float(x) for tf,x in zip(TF,w)},
              'recentScore':scores[n]['recent'],'balancedScore':scores[n]['balanced'],**{k:rr[0]['periods'][k]['btc'] for k in PERIODS},
              'cycleWinsAcrossPhases':sum(r['periods']['2023-25']['btc']>b['periods']['2023-25']['btc']+1e-9 for r,b in zip(rr,byname[BASE])),
              'cycleMin':min(r['periods']['2023-25']['btc'] for r in rr),'cycleMax':max(r['periods']['2023-25']['btc'] for r in rr)})
    with (OUT/'trades.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['profile','period','side','time','decision','price','unitsBefore','unitsAfter','reason']);writer.writeheader()
        for n,periods in details.items():
            for k,r in periods.items():
                for t in r['ledger']:writer.writerow({'profile':n,'period':k,**t})
    print('SELECTED',selected,'PARITY',parity,'PREFIX',prefix,flush=True)
    for label,n in {**NAMED,**selected}.items():print(label,PROFILES[n],{k:round(summary[n][k]['base']['btc'],4) for k in ['2020-21','2023-25','2025','2026','2025-26']},flush=True)

if __name__=='__main__':main()
