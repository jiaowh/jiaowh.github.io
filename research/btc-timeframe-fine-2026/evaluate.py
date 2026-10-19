"""Bounded fine search; selection is frozen in PROTOCOL.md before evaluation."""
from pathlib import Path
import sys,json,itertools,math,csv,hashlib,time
import numpy as np
sys.dont_write_bytecode=True
OUT=Path(__file__).resolve().parent; ROOT=OUT.parents[1]
sys.path.insert(0,str(ROOT/'research/btc-timeframe-weights-2026'))
import evaluate as base
PHASES=base.PHASES;PERIODS=base.PERIODS;TF=base.TF
CURRENT=[1,1,1,1,1,2]
def canonical(w):
    ints=[int(round(x*10000)) for x in w];d=math.gcd(*ints)
    return tuple(x//d for x in ints)
def name(w):return 'w_'+'_'.join(map(str,canonical(w)))
PROFILES={};STAGE={}
def add(w,stage):
    w=[round(float(x),6) for x in w];n=name(w)
    if n not in PROFILES:PROFILES[n]=w;STAGE[n]=stage
    return n
CONTROL=add(CURRENT,'control');EQUAL=add([1]*6,'control')
for w in itertools.product([.75,1,1.25],repeat=5):
    for slow in np.arange(1.5,3.001,.25):add([*w,slow],'joint')
ONE=[];SWEEPS=[]
for axis in range(6):
    for x in np.arange(.5,(3.501 if axis==5 else 1.501),.05):
        w=CURRENT.copy();w[axis]=round(float(x),2);n=add(w,'axis');SWEEPS.append({'axis':axis,'value':w[axis],'name':n})
        if axis==5:ONE.append(n)

def train(G,parts,w):return base.simulate(G,parts,w,'train')
def score(n,results):
    rr=results[n];w=np.array(PROFILES[n]);w=w/w.sum();c=np.array(CURRENT)/sum(CURRENT)
    return {'score':float(np.quantile([np.log(r['btc'])/2 for r in rr],.25)),
            'eligible':min(r['roundTrips'] for r in rr)>=5,'distance':float(np.sum((w-c)**2))}
def ranking(names,scores):return sorted([n for n in names if scores[n]['eligible']],key=lambda n:(-scores[n]['score'],scores[n]['distance'],n))
def main():
    started=time.time();hourly=base.data();hourly=hourly[hourly[:,0]<base.ts('2026-10-10')]
    prior=json.loads((ROOT/'research/btc-timeframe-weights-2026/summary.json').read_text())
    digest=hashlib.sha256(hourly.tobytes()).hexdigest();assert digest==prior['audit']['sha256']
    (OUT/'data-audit.json').write_text(json.dumps(prior['audit'],indent=2))
    grids=[]
    for phase in PHASES:
        G=base.Grid(phase,a1h=hourly);grids.append((G,base.components(G)))
        print('Prepared phase',phase,flush=True)
    results={};scores={};stage1=list(PROFILES)
    def run(names,label):
        for ix,n in enumerate(names):
            results[n]=[train(G,parts,PROFILES[n]) for G,parts in grids];scores[n]=score(n,results)
            if (ix+1)%100==0:print(label,ix+1,'/',len(names),'elapsed',round(time.time()-started),'s',flush=True)
    run(stage1,'Stage 1')
    centers=ranking(stage1,scores)[:3]
    print('Training-only centers',[(PROFILES[n],scores[n]['score']) for n in centers],flush=True)
    for center in centers:
        for offsets in itertools.product([-1,0,1],repeat=6):
            add([v+delta*(.1 if i==5 else .05) for i,(v,delta) in enumerate(zip(PROFILES[center],offsets))],'refine')
    stage2=[n for n in PROFILES if n not in results];run(stage2,'Stage 2')
    order=ranking(PROFILES,scores);selected={'fine':order[0],'only72':ranking(ONE,scores)[0]}
    labels={'current':CONTROL,'equal':EQUAL,**selected};names=list(dict.fromkeys(labels.values()))
    print('Frozen selection', {k:PROFILES[n] for k,n in labels.items()},'profiles',len(PROFILES),flush=True)
    # Freeze training selection before reading annual/retrospective results.
    (OUT/'selection.json').write_text(json.dumps({'count':len(PROFILES),'stage1':len(stage1),'stage2':len(stage2),'centers':centers,'selected':selected,'profiles':{n:PROFILES[n] for n in names},'scores':{n:scores[n] for n in names}},indent=2))
    summary={};details={};stress=[];perturb=[];parity=0;prefix=0
    for n in names:
        summary[n]=[];details[n]={}
        for phase,(G,parts) in zip(PHASES,grids):
            periods={}
            for k in PERIODS:
                r=base.simulate(G,parts,PROFILES[n],k,details=True);base.validate_ledger(G,r,k,.001)
                periods[k]=base.serial(r)
                if phase==0:details[n][k]=r
            summary[n].append({'phase':phase,'periods':periods})
            for fee,delay in [(.003,0),(.001,1),(.003,1),(.001,6)]:
                stress.append({'name':n,'phase':phase,'fee':fee,'delay':delay,'periods':{k:base.simulate(G,parts,PROFILES[n],k,fee=fee,delay=delay) for k in ['2020-21','2023-25','2025','2026','2025-26']}})
        print('Evaluated',n,flush=True)
    for label,n in [('current',CONTROL),('equal',EQUAL)]:
        pn=prior['selected']['recent'] if label=='current' else prior['named']['equal']
        for k in PERIODS:
            a=details[n][k];b=prior['details'][pn][k]
            assert abs(a['btc']-b['btc'])<1e-9,(label,k)
            assert a['ledger']==b['ledger'];parity+=1
    for n in set(selected.values()):
        for axis,scale in itertools.product(range(6),[.95,1.05]):
            w=PROFILES[n].copy();w[axis]*=scale
            phases=[]
            for phase,(G,parts) in zip(PHASES,grids):
                phases.append({'phase':phase,'periods':{k:base.simulate(G,parts,w,k) for k in ['train','2020-21','2023-25','2025-26']}})
            perturb.append({'name':n,'axis':axis,'scale':scale,'weights':w,'phases':phases})
    G,parts=grids[0]
    for cut in [base.ts('2020-07-24')+8*3600,base.ts('2025-02-01')+16*3600]:
        shortG=base.Grid(0,a1h=hourly[hourly[:,0]<cut]);shortP=base.components(shortG)
        for n in names:
            E,I=base.prepare(parts,PROFILES[n]);e,i=base.prepare(shortP,PROFILES[n])
            assert np.allclose(e,E[:shortG.n],equal_nan=True)
            assert np.array_equal(i['event'],I['event'][:shortG.n]);assert np.array_equal(i['recoveries']['e50'],I['recoveries']['e50'][:shortG.n]);prefix+=1
            start='2020-01-01' if cut<base.ts('2021-01-01') else '2025-01-01'
            full=base.execute(G,I,'none_e50',start,'2026-10-10',details=True);short=base.execute(shortG,i,'none_e50',start,'2026-10-10',details=True)
            assert short['ledger']==[t for t in full['ledger'] if t['time']<shortG.real[-1]+14400]
    promotion={}
    for label,n in selected.items():
        def values(key):return [r['periods'][key]['btc'] for r in summary[n]]
        curr=[r['periods']['2023-25']['btc'] for r in summary[CONTROL]]
        cost=[r['periods']['2023-25']['btc'] for r in stress if r['name']==n and r['fee']==.003 and r['delay']==0]
        oldcost=[r['periods']['2023-25']['btc'] for r in stress if r['name']==CONTROL and r['fee']==.003 and r['delay']==0]
        checks={'recent6of8':sum(a>b+1e-9 for a,b in zip(values('2023-25'),curr))>=6,'recentWorstNotWorse':min(values('2023-25'))>=min(curr)-1e-9,'olderAllAbove1':min(values('2020-21'))>1,'highFee6of8':sum(a>b+1e-9 for a,b in zip(cost,oldcost))>=6}
        promotion[label]={'checks':checks,'passed':all(checks.values())}
    out={'count':len(PROFILES),'stage1':len(stage1),'stage2':len(stage2),'centers':centers,'selected':selected,'labels':labels,'profiles':{n:PROFILES[n] for n in names},'scores':{n:scores[n] for n in names},'periods':PERIODS,'summary':summary,'details':details,'stress':stress,'perturbations':perturb,'promotion':promotion,'parityChecks':parity,'prefixChecks':prefix,'seconds':time.time()-started}
    (OUT/'summary.json').write_text(json.dumps(out,separators=(',',':')))
    (OUT/'results-full.json').write_text(json.dumps({'profiles':PROFILES,'scores':scores,'training':results,'sweeps':SWEEPS},separators=(',',':')))
    with (OUT/'candidates.csv').open('w',newline='') as f:
        fields=['name','stage',*[f'w{tf}h' for tf in TF],'score','eligible','distance',*[f'trainBTC_phase{p}' for p in PHASES]];writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
        for n in order+sorted(set(PROFILES)-set(order)):writer.writerow({'name':n,'stage':STAGE[n],**dict(zip([f'w{tf}h' for tf in TF],PROFILES[n])),**scores[n],**{f'trainBTC_phase{p}':r['btc'] for p,r in zip(PHASES,results[n])}})
    with (OUT/'trades.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['profile','period','side','time','decision','price','unitsBefore','unitsAfter','reason']);writer.writeheader()
        for n,periods in details.items():
            for period,r in periods.items():
                for t in r['ledger']:writer.writerow({'profile':n,'period':period,**t})
    print('DONE',json.dumps({'profiles':len(PROFILES),'seconds':out['seconds'],'promotion':promotion}),flush=True)
    for label,n in labels.items():print(label,PROFILES[n],{k:round(details[n][k]['btc'],4) for k in ['2020-21','2023-25','2025','2026','2025-26']},flush=True)
if __name__=='__main__':main()
