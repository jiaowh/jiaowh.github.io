"""Execution/cost sensitivity and causal checks for the bull-only shortlist."""
from bull import *
import csv

SELECTED='e20_ma200_gain0.05_trend'
NAMES=[SELECTED,'e20_ma200_gain0.03_trend','e40_ma200_gain0.1_trend']
STRESSES=[(.001,0),(.003,0),(.006,0),(.001,1),(.001,6)]

def run():
    hourly=data();rows=[];detail={};prefix=[];annual={};boundaries=[]
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);I=inputs(G)
        if phase==0:
            for cut,hour in [('2021-04-01',0),('2024-08-01',8),('2025-02-01',16)]:
                g=Grid(0,a1h=hourly[hourly[:,0]<ts(cut)+hour*3600]);i=inputs(g)
                assert np.array_equal(i[0],I[0][:g.n],equal_nan=True)
                for j in [1,2]:
                    for k in i[j]:assert np.array_equal(i[j][k],I[j][k][:g.n]),(cut,j,k)
                prefix.append(f'{cut} {hour:02}:00')
            annual={str(y):replay(G,I,SELECTED,f'{y}-01-01',f'{y+1}-01-01')
              for y in [2015,2016,2017,2019,2020,2021,2023,2024,2025]}
            import datetime as dt
            for days in [-90,-30,30,90]:
                for w,(a,b) in WINDOWS.items():
                    shifted=[(dt.date.fromisoformat(x)+dt.timedelta(days=days)).isoformat() for x in [a,b]]
                    boundaries.append({'window':w,'days':days,'start':shifted[0],'end':shifted[1],
                      'btc':replay(G,I,SELECTED,*shifted)['btc']})
        for cost,delay in STRESSES:
            for name in NAMES:
                rr={w:replay(G,I,name,*ab,fee=cost,delay=delay,details=phase==0 and cost==.001 and delay==0) for w,ab in WINDOWS.items()}
                if phase==0 and cost==.001 and delay==0:detail[name]=rr
                rows.append({'name':name,'phase':phase,'cost':cost,'delay':delay,
                  'rows':{w:{k:v for k,v in r.items() if k not in ['fills','pairs','curve']} for w,r in rr.items()}})
        print('Stress phase',phase,flush=True)
    summary={}
    for name in NAMES:
        summary[name]={}
        for cost,delay in STRESSES:
            rr=[r for r in rows if r['name']==name and r['cost']==cost and r['delay']==delay]
            summary[name][f'{cost}/{delay}']={'allCyclePasses':sum(all(r['rows'][w]['btc']>1 for w in CYCLES) for r in rr),
              'windows':{w:{'mean':float(np.mean([r['rows'][w]['btc'] for r in rr])),
              'min':min(r['rows'][w]['btc'] for r in rr),'max':max(r['rows'][w]['btc'] for r in rr),
              'wins':sum(r['rows'][w]['btc']>1 for r in rr)} for w in WINDOWS}}
    initial=json.loads((O/'results.json').read_text())['detail']
    first=max(initial,key=lambda n:initial[n]['2015-17']['btc'])
    first_two=max(initial,key=lambda n:min(initial[n][w]['btc'] for w in CYCLES[:2]))
    chronological={label:{'name':n,'btc':{w:initial[n][w]['btc'] for w in WINDOWS}}
      for label,n in [('train2015_17',first),('trainFirstTwo_minimum',first_two)]}
    result={'selected':SELECTED,'summary':summary,'rows':rows,'detail':detail,'prefixChecks':prefix,
      'annualFresh1BTC':annual,'shiftedBoundaries':boundaries,'chronological':chronological}
    (O/'validation-results.json').write_text(json.dumps(result,indent=1))
    with (O/'trades.csv').open('w',newline='') as f:
        fields=['window','time','side','price','btc','reason','decision'];wr=csv.DictWriter(f,fieldnames=fields);wr.writeheader()
        from datetime import datetime,timezone
        for w,r in detail[SELECTED].items():
            for fill in r['fills']:
                ff={**fill,'window':w,'side':'sell' if fill['btc']<0 else 'buy'}
                for k in ['time','decision']:ff[k]=datetime.fromtimestamp(fill[k],timezone.utc).isoformat()
                wr.writerow(ff)
    print(json.dumps({'selectedStress':summary[SELECTED],'annual':{y:r['btc'] for y,r in annual.items()},'chronological':chronological},indent=1))

if __name__=='__main__':run()
