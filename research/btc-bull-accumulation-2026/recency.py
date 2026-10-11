"""Recent-cycle parameter selection with a retrospective chronological check."""
from bull import *
BASE='e20_ma200_gain0.05_trend'
PERIODS={'2015-17':('2015-01-01','2018-01-01'),'2019-21':('2019-01-01','2022-01-01'),
 '2023-24':('2023-01-01','2025-01-01'),'2025':('2025-01-01','2026-01-01'),
 '2023-25':('2023-01-01','2026-01-01')}
WEIGHTS={'2015-17':.1,'2019-21':.3,'2023-24':.6}
YEARS={'2015-17':3,'2019-21':3,'2023-24':2}

def run():
    hourly=data();records=[];grids=[];volatility={}
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);I=inputs(G);grids.append((G,I))
        if phase==0:
            _,_,c,e,_=G.daily();t=G.real[e]+14400;ret=np.r_[np.nan,np.diff(np.log(c))]
            for w in CYCLES:
                a,b=WINDOWS[w];ix=(t>ts(a))&(t<=ts(b));cc=c[ix]
                rv=np.array([np.std(ret[j-29:j+1],ddof=1)*np.sqrt(365) for j in np.flatnonzero(ix) if j>=30])
                volatility[w]={'annualizedDailyVol':float(np.std(ret[ix],ddof=1)*np.sqrt(365)),
                  'median30dVol':float(np.median(rv)), 'dailyCloseMaxDD':float(np.min(cc/np.maximum.accumulate(cc)-1))}
        for name in CONFIGS:
            rr={w:replay(G,I,name,*ab) for w,ab in PERIODS.items() if w!='2023-25'}
            records.append({'name':name,'phase':phase,'rows':rr})
        print('Selection phase',phase,flush=True)
    # Selection only touches the three training keys, not the computed 2025 rows.
    scores={}
    for n in CONFIGS:
        rr=[r for r in records if r['name']==n]
        parts={w:float(np.quantile([np.log(r['rows'][w]['btc'])/YEARS[w] for r in rr],.25)) for w in WEIGHTS}
        scores[n]={'parts':parts,'recentOnly':parts['2023-24'],
          'recentWeighted':sum(WEIGHTS[w]*parts[w] for w in WEIGHTS)}
    selected={k:max(scores,key=lambda n:scores[n][k]) for k in ['recentOnly','recentWeighted']}
    old=json.loads((O/'results.json').read_text())['detail']
    selected['fullCycleHindsight']=max(old,key=lambda n:old[n]['2023-25']['btc'])
    selected['baseline']=BASE
    names=list(dict.fromkeys(selected.values()));stress=[];details={}
    for phase,(G,I) in zip(PHASES,grids):
        for fee,delay in [(.001,0),(.003,0),(.001,1),(.001,6)]:
            for n in names:
                rr={w:replay(G,I,n,*PERIODS[w],fee=fee,delay=delay,details=phase==0 and fee==.001 and delay==0) for w in ['2025','2023-25']}
                if phase==0 and fee==.001 and delay==0:details[n]=rr
                stress.append({'name':n,'phase':phase,'fee':fee,'delay':delay,
                  'rows':{w:{k:v for k,v in r.items() if k not in ['fills','pairs','curve']} for w,r in rr.items()}})
    summary={}
    for label,n in selected.items():
        rr=[r for r in records if r['name']==n]
        summary[label]={'name':n,'score':scores[n],'trainingAndTest':{w:{'base':next(r['rows'][w]['btc'] for r in rr if r['phase']==0),
          'min':min(r['rows'][w]['btc'] for r in rr),'max':max(r['rows'][w]['btc'] for r in rr),
          'above1':sum(r['rows'][w]['btc']>1+1e-9 for r in rr)} for w in PERIODS if w!='2023-25'},'stress':{}}
        for fee,delay in [(.001,0),(.003,0),(.001,1),(.001,6)]:
            ss=[r for r in stress if r['name']==n and r['fee']==fee and r['delay']==delay]
            summary[label]['stress'][f'{fee}/{delay}']={w:{'base':next(r['rows'][w]['btc'] for r in ss if r['phase']==0),
              'min':min(r['rows'][w]['btc'] for r in ss),'max':max(r['rows'][w]['btc'] for r in ss),
              'above1':sum(r['rows'][w]['btc']>1+1e-9 for r in ss)} for w in ['2025','2023-25']}
    out={'weights':WEIGHTS,'selected':selected,'summary':summary,'volatility':volatility,'scores':scores,
      'records':records,'stress':stress,'detail':details,'codeHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (O/'recency-results.json').write_text(json.dumps(out,indent=1))
    print(json.dumps({'summary':summary,'volatility':volatility},indent=1),flush=True)

if __name__=='__main__':run()
