"""BTC objective re-audit. Each window starts with 1 BTC, no new deposits.
Fixed comparisons, no parameter optimization. Cash marked to fee-net BTC at each close.
"""
import json,sys
from pathlib import Path
from datetime import datetime,timezone
import numpy as np
O=Path(__file__).resolve().parent;root=O.parents[1]
J=json.loads((O/'production.json').read_text());B=J['bars'];t=np.array(J['t']);c=np.array([b['close'] for b in B]);op=np.array([b['open'] for b in B]);E=np.array(J['E'],float)
ts=lambda s:datetime.fromisoformat(s).replace(tzinfo=timezone.utc).timestamp()
inn=np.zeros(len(E));state=0.
for i,e in enumerate(E):
    if e>.60:state=1.
    elif e<.40:state=0.
    inn[i]=state
variants={'hold':np.ones(len(E)),'legacy':np.array(J['banded']['vt60'],float),'binary':inn}

def replay(p,start,end,fee=.001):
    a=int(np.searchsorted(t,ts(start)));z=int(np.searchsorted(t,ts(end)))
    units,cash,last=1.,0.,np.nan;curve=[];fills=[];sold=None;cycles=[]
    for i in range(a,z):
        target=p[i-1] # Known at this open, including the opening conversion from the initial BTC.
        if np.isfinite(target) and target!=last:
            value=cash+units*op[i];delta=target*value-units*op[i]
            du=delta/(op[i]*(1+target*fee if delta>0 else 1-target*fee))
            if abs(du)>1e-12:
                cash-=du*op[i]+abs(du)*op[i]*fee;units+=du
                fills.append({'time':int(t[i]),'price':float(op[i]),'btc':float(du),'target':float(target)})
            last=target
        assert cash>=-1e-7 and units>=-1e-12
        btc=units+max(0,cash)/(c[i]*(1+fee));curve.append(btc)
    curve=np.array(curve);peak=np.maximum.accumulate(np.r_[1.,curve])[1:]
    selected=list(range(0,len(curve),6));selected.append(len(curve)-1);selected=sorted(set(selected))
    return {'btc':float(curve[-1]),'units':float(units),'cash':float(max(0,cash)),
      'btcDrawdown':float(np.min(curve/peak-1)),'trades':len(fills),'belowHold':float(np.mean(curve<1-1e-9)),
      'curve':[[int(t[a+i]+14400),round(float(curve[i]),6)] for i in selected],
      'fills':fills}

windows=[('bull','2023-01-01','2026-01-01','2023–2025'),('earlier','2019-01-01','2023-01-01','2019–2022'),('full','2019-01-01','2026-01-01','2019–2025')]
data={'generated':'2026-10-10','fee':.001,'startBTC':1,'windows':{},'annual':{}}
for key,a,b,label in windows:
    rows={k:replay(p,a,b) for k,p in variants.items()}
    # Preserve 0.8 original BTC; apply legacy to 0.2 BTC, with no rebalancing from the core.
    q=rows['legacy'];curve=[[x,.8+.2*y] for x,y in q['curve']]
    rows['core80']={**q,'btc':.8+.2*q['btc'],'units':.8+.2*q['units'],'cash':.2*q['cash'],'curve':curve}
    # Exact 4h drawdown of sleeve is not derived from daily points; don't report an approximation.
    rows['core80'].pop('btcDrawdown');rows['core80'].pop('fills')
    data['windows'][key]={'label':label,'start':a,'endExclusive':b,'rows':{k:{kk:vv for kk,vv in v.items() if kk!='fills'} for k,v in rows.items()}}
    print(label,{k:round(v['btc'],6) for k,v in rows.items()})
for year in range(2023,2026):
    data['annual'][str(year)]={k:{kk:vv for kk,vv in replay(p,f'{year}-01-01',f'{year+1}-01-01').items() if kk not in ('curve','fills')} for k,p in variants.items()}
data['fees']={str(f):{k:round(replay(p,'2023-01-01','2026-01-01',f)['btc'],6) for k,p in variants.items()} for f in (.001,.003,.006)}
# Monthly starts, fixed 12-month windows: overlapping descriptive comparisons, not independent trials.
rolling=[]
for year in range(2019,2025):
    for month in range(1,13):
        a=f'{year}-{month:02}-01';b=f'{year+1}-{month:02}-01'
        rolling.append({'start':a,**{k:replay(p,a,b)['btc'] for k,p in variants.items() if k!='hold'}})
data['rolling12m']={k:{'wins':sum(r[k]>1 for r in rolling),'total':len(rolling),'median':float(np.median([r[k] for r in rolling])),'worst':min(r[k] for r in rolling)} for k in ('legacy','binary')}
assert all(abs(w['rows']['hold']['btc']-1)<1e-12 for w in data['windows'].values())
assert abs(data['windows']['bull']['rows']['legacy']['btc']-.6783256696732558)<1e-9
# Extend the original audit using the independently parity-checked 2026 research.
extended=O/'bull-bear-2026-results.json'
if extended.exists():
    study=json.loads(extended.read_text())
    mapping={'bull':'2023-25','earlier':'2019-22','full':'2019-25',
      'ytd2026':'2026 YTD','extended':'2023-26','oldbull':'2020-21'}
    for key,label in [('ytd2026','2026 through Oct 9'),('extended','2023 through Oct 9, 2026'),('oldbull','2020–2021 bull comparison')]:
        source=study['detail']['hold'][mapping[key]]
        data['windows'][key]={'label':label,'start':{'ytd2026':'2026-01-01','extended':'2023-01-01','oldbull':'2020-01-01'}[key],
          'endExclusive':'2022-01-01' if key=='oldbull' else study['endExclusive'],'rows':{}}
    for key,window in mapping.items():
        rows=data['windows'][key]['rows']
        for display,source in [('hold','hold'),('legacy','original'),('binary','binary'),('dip20','dip20')]:
            q=study['detail'][source][window]
            value={k:q[k] for k in ['btc','units','cash','trades','curve','usdDD']}
            value['btcDrawdown']=q['btcDD']
            if display in rows:assert abs(rows[display]['btc']-q['btc'])<1e-9
            rows[display]=value
        q=rows['legacy']
        rows['core80']={k:q[k] for k in ['trades']}
        rows['core80'].update(btc=.8+.2*q['btc'],units=.8+.2*q['units'],cash=.2*q['cash'],curve=[[x,.8+.2*y] for x,y in q['curve']])
    data['rolling12m']={display:study['rolling12m'][source] for display,source in [('legacy','original'),('binary','binary'),('dip20','dip20')]}
    data['rollingThrough']='October 2025'
    data['extension']={'endExclusive':study['endExclusive'],'summary':study['summary']['dip20'],
      'originalAttribution':{w:{k:v for k,v in study['detail']['original'][w].items() if k in ['cashTimingBTC','tradingFeesBTC','terminalFeeBTC']} for w in ['2023-25','2026 YTD','2023-26']}}
assets=root/'assets/btc';assets.mkdir(exist_ok=True)
(assets/'accumulation-audit.json').write_text(json.dumps(data,indent=1),encoding='utf-8')
(assets/'accumulation-audit.js').write_text('/* Fixed historical audit. Generated by research/btc-corrections-2023-2025/accumulation.py */\nwindow.BTC_ACCUM_AUDIT='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
(O/'accumulation-results.json').write_text(json.dumps(data,indent=1),encoding='utf-8')
print('Fee sensitivity',data['fees']);print('Rolling 12m',data['rolling12m'])
