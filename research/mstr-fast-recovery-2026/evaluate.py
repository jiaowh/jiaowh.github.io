"""Frozen-parameter transfer test. See PROTOCOL.md; run from any directory.

Reuses audited BTC math and its adjacent quant data dependency. Raw Yahoo data
is cached locally and hashed, not committed. summary.json includes all ledgers.
"""
from pathlib import Path
import sys, json, hashlib, urllib.request, datetime as dt, itertools
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent / 'btc-bull-accumulation-2026'))
from bull import Grid, data, state, ts
from weights import confirmed
from core import m_imacd, m_sma, m_mom, m_donch, average, sma
from confidence import sim as btc_sim

END = '2026-10-10'
PERIODS = {str(y): (f'{y}-01-01', f'{y+1}-01-01' if y < 2026 else END) for y in range(2018, 2027)}
PERIODS.update({'2020-21': ('2020-01-01', '2022-01-01'),
                '2023-25': ('2023-01-01', '2026-01-01'),
                '2025-26': ('2025-01-01', END),
                '2024-26': ('2024-01-01', END)})
RULES = {'fast_recovery': ([14,21,34], 13, True),
         'original_recovery': ([21,34,55], 9, True),
         'original_timeout': ([21,34,55], 9, False)}

def iso(t):
    return dt.datetime.fromtimestamp(float(t), dt.timezone.utc).isoformat()

def day(t):
    return iso(t)[:10]

def et_offset(t):
    d = dt.datetime.fromtimestamp(float(t), dt.timezone.utc); y = d.year
    march = dt.datetime(y, 3, 8, 7, tzinfo=dt.timezone.utc)
    march += dt.timedelta(days=(6-march.weekday()) % 7)
    nov = dt.datetime(y, 11, 1, 6, tzinfo=dt.timezone.utc)
    nov += dt.timedelta(days=(6-nov.weekday()) % 7)
    return -4 if march <= d < nov else -5

def fetch():
    cache = HERE/'cache'; cache.mkdir(exist_ok=True)
    for tag in ['1d', '1h']:
        dest = cache/f'MSTR_{tag}.json'
        if dest.exists(): continue
        old = json.loads((ROOT.parent/f'quant/mstr/data/raw/MSTR_{tag}.json').read_text())
        interval = '1d' if tag == '1d' else '60m'
        url = f'https://query1.finance.yahoo.com/v8/finance/chart/MSTR?range=1mo&interval={interval}&includePrePost=true&events=div%2Csplit'
        r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=40))['chart']['result'][0]
        quote = r['indicators']['quote'][0]
        new = dict(t=r['timestamp'], o=quote['open'], h=quote['high'], l=quote['low'], c=quote['close'])
        # Yahoo OHLC are already split adjusted. MSTR has no dividend adjustment
        # in this sample; retain OHLC and audit daily versus hourly below.
        rows = {t:[t, *[old[k][i] for k in 'ohlc']] for i,t in enumerate(old['t'])}
        for i,t in enumerate(new['t']): rows[t] = [t, *[new[k][i] for k in 'ohlc']]
        rows = [rows[t] for t in sorted(rows) if ts('2017-01-01') <= t < ts(END) and None not in rows[t]]
        dest.write_text(json.dumps(dict(source=url, bars=rows), separators=(',',':')))
    return {tag:np.array(json.loads((cache/f'MSTR_{tag}.json').read_text())['bars'], float) for tag in ['1d','1h']}

def regular(raw, daily):
    # Hourly Yahoo bars are 09:30,10:30,...15:30 ET. Early closes have
    # fewer rows; their final half-hour ends at 13:00. Ignore extended hours.
    dates = {day(r[0]):r for r in daily}; groups = {}
    for r in raw:
        d = dt.datetime.fromtimestamp(r[0]+et_offset(r[0])*3600, dt.timezone.utc)
        if d.minute == 30 and d.second == 0 and 9 <= d.hour <= 15:
            groups.setdefault(day(r[0]), []).append(r)
    rows=[]; audits=[]
    for date, bars in sorted(groups.items()):
        if date not in dates: continue
        a=np.array(bars); expected=dates[date]
        err=abs(a[-1,4]/expected[4]-1)
        if len(a)!=7:
            # Yahoo omits the last half hour on seven half-days and large
            # chunks of Jan 30 / Feb 2 2026. Never manufacture hourly prices:
            # use the independently observed whole-session daily candle.
            half=date in ['2023-11-24','2024-07-03','2024-11-29','2024-12-24','2025-07-03','2025-11-28','2025-12-24']
            assert half or date in ['2026-01-30','2026-02-02'], ('unexpected data gap',date)
            close=expected[0]+(3.5 if half else 6.5)*3600
            rows.append([*expected,close])
            audits.append(dict(date=date,closeRelativeError=float(err),fallback='daily half-session' if half else 'daily missing-hours'))
            continue
        assert a[0,0] == expected[0] and np.all(np.diff(a[:,0])==3600), date
        audits.append(dict(date=date, closeRelativeError=float(err)))
        assert err < .006, ('daily/hourly split or data mismatch', date, err)
        for i,r in enumerate(a):
            close=r[0]+(1800 if i==len(a)-1 else 3600)
            rows.append([*r, close])
    return np.array(rows), audits

def features(G, rule):
    lengths, signal, recovery = RULES[rule]
    votes=[m_imacd(G,tf,n,mode,signal) for tf,n,mode in itertools.product([4,8,12,24,48,72], lengths, ['zero','state'])]
    votes += [m_sma(G,n) for n in [20,50,100,150,200]]
    votes += [m_mom(G,n) for n in [14,28,56,84,168]]
    votes += [m_donch(G,n) for n in [10,20,50,100]]
    E=average(votes); _,_,c,e,_=G.daily(); ma=sma(c,200)
    gate=G.spread(state(c>ma*1.02,c<ma*.98,2,False),e)==1
    return dict(E=E,gate=gate,event=confirmed(E,.5,3)&gate,filters={'none':np.ones(G.n,bool)},
                recoveries={'e50':E>.5+1e-12 if recovery else np.zeros(G.n,bool)})

class StockGrid:
    """Session-anchored native adaptation; no invented closed-market candles."""
    def __init__(self, rth, phase=0):
        bars=[]; dates=sorted(set(map(day,rth[:,0])))
        for date in dates:
            a=rth[[day(t)==date for t in rth[:,0]]]
            for part in [a[:4],a[4:]]:
                if len(part): bars.append([part[0,0],part[0,1],max(part[:,2]),min(part[:,3]),part[-1,4],part[-1,5],date])
        self.real=np.array([r[0] for r in bars]);self.o=np.array([r[1] for r in bars])
        self.h=np.array([r[2] for r in bars]);self.l=np.array([r[3] for r in bars]);self.c=np.array([r[4] for r in bars])
        self.close=np.array([r[5] for r in bars]);self.dates=[r[6] for r in bars]
        self.n=len(bars);self.phase=phase;self._cache={}
        self.dayno=np.array([dates.index(d) for d in self.dates])

    def group(self, span):
        if span==4*3600:
            ix=np.arange(self.n);return self.h,self.l,self.c,ix,ix
        sessions=max(1,span//86400)
        keys=(self.dayno+self.phase)//sessions
        starts=np.r_[0,np.flatnonzero(np.diff(keys))+1];ends=np.r_[starts[1:]-1,self.n-1]
        # Require the last session in a multi-session bucket and its close.
        valid=[j for j,(s,e) in enumerate(zip(starts,ends)) if
               (self.dayno[e]+self.phase+1)%sessions==0 and
               (e+1==self.n or self.dayno[e+1]!=self.dayno[e]) and
               self.close[e] == self.session_close(e)]
        starts=starts[valid];ends=ends[valid]
        return np.array([max(self.h[s:e+1]) for s,e in zip(starts,ends)]),np.array([min(self.l[s:e+1]) for s,e in zip(starts,ends)]),self.c[ends],ends,starts

    def session_close(self,i):
        # Native grid is constructed only from complete audited sessions.
        return max(self.close[self.dayno==self.dayno[i]])

    def daily(self):return self.group(86400)
    def spread(self,v,e):
        ix=np.searchsorted(e,np.arange(self.n),side='right')-1;out=np.full(self.n,np.nan);ok=ix>=0;out[ok]=v[ix[ok]];return out

def metrics(rows, q, cash, ledger, path, fee):
    units=float(q+cash/(rows[-1,4]*(1+fee)))
    equity=np.array(path); initial=rows[0,1]
    hold=np.r_[initial,rows[:,4]]; strat=np.r_[initial,equity[:,1]]; sharepath=np.r_[1,equity[:,0]]
    dd=lambda p:float(min(p/np.maximum.accumulate(p)-1))
    product=1.;pairs=[]
    for s,b in zip(ledger[::2],ledger[1::2]):
        assert s['side']=='sell' and b['side']=='buy'
        gain=s['price']*(1-fee)/(b['price']*(1+fee))-1;product*=1+gain
        assert abs(product-b['units'])<1e-9
        pairs.append(dict(sale=s['time'],buy=b['time'],gain=gain,reason=b['reason']))
    if len(ledger)%2:product*=ledger[-1]['price']*(1-fee)/(rows[-1,4]*(1+fee))
    assert abs(product-units)<1e-9
    for t in ledger: assert t['time']>=t['decision']
    return dict(shares=units,holding=bool(q),trades=len(ledger),roundTrips=len(pairs),wins=sum(p['gain']>0 for p in pairs),
                usdReturn=float(strat[-1]/initial-1),holdReturn=float(hold[-1]/initial-1),usdDD=dd(strat),holdDD=dd(hold),shareDD=dd(sharepath),
                ledger=ledger,pairs=pairs)

def mirror(rows, changes, start, end, fee=.001, delay=0):
    rows=rows[(rows[:,0]>=ts(start))&(rows[:,0]<ts(end))]
    changes=[x for x in changes if ts(start)<=x['time']<ts(end)]
    q=1.;cash=0.;want=True;j=0;ledger=[];path=[];last=None
    for row in rows:
        now=row[0]
        while j<len(changes) and changes[j]['time']+delay<=now:
            last=changes[j];want=last['side']=='buy';j+=1
        if want != bool(q):
            p=row[1]
            if want:q=cash/(p*(1+fee));cash=0.
            else:cash=q*p*(1-fee);q=0.
            ledger.append(dict(side='buy' if want else 'sell',time=int(now),decision=last['time'],price=float(p),units=float(q),reason=last['reason']))
        path.append([q+cash/(row[4]*(1+fee)),q*row[4]+cash])
    return metrics(rows,q,cash,ledger,path,fee)

def native(rows,G,F,start,end,fee=.001,delay=0):
    rows=rows[(rows[:,0]>=ts(start))&(rows[:,0]<ts(end))]
    closeidx=np.flatnonzero((G.close>ts(start))&(G.close<ts(end)))
    q=1.;cash=0.;pending=None;j=0;ledger=[];path=[];sale=None;saletime=None
    for row in rows:
        now=row[0]
        while j<len(closeidx) and G.close[closeidx[j]]<=now:
            i=closeidx[j];when=G.close[i];j+=1
            if pending:continue
            reason=None
            if q and F['event'][i]:reason='weakness'
            elif not q:
                if G.c[i]<=sale*.999/(1.001*1.1):reason='target'
                elif F['recoveries']['e50'][i]:reason='recovery'
                elif when-saletime>=7*86400:reason='timeout'
            if reason:pending=(when,reason)
        if pending and now>=pending[0]+delay:
            p=row[1];buy=not bool(q)
            if buy:q=cash/(p*(1+fee));cash=0.
            else:cash=q*p*(1-fee);q=0.;sale=p;saletime=now
            ledger.append(dict(side='buy' if buy else 'sell',time=int(now),decision=int(pending[0]),price=float(p),units=float(q),reason=pending[1]));pending=None
        path.append([q+cash/(row[4]*(1+fee)),q*row[4]+cash])
    return metrics(rows,q,cash,ledger,path,fee)

def compact(r):return {k:v for k,v in r.items() if k not in ['ledger','pairs']}

def run():
    raw=fetch();daily=raw['1d'];rth,audit=regular(raw['1h'],daily)
    print('Data',day(daily[-1,0]),len(rth),'RTH bars',flush=True)
    hourly=data();G=Grid(0,a1h=hourly);output=dict(asOf='2026-10-09',protocol='PROTOCOL.md',audit=dict(
        firstIntraday=iso(rth[0,0]),lastIntraday=iso(rth[-1,5]),sessions=len(audit),maxDailyHourlyCloseError=max(x['closeRelativeError'] for x in audit if 'fallback' not in x),
        dailyFallbacks=[x for x in audit if 'fallback' in x],
        files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (HERE/'cache').glob('*.json')}),
        dailyMirror={},hourlyMirror={},native={},stress=[],checks=[])
    # Exact BTC indicator and replay parity against the already saved research.
    old=json.loads((HERE.parent/'btc-bull-accumulation-2026/imacd-summary.json').read_text())
    names={'fast_recovery':'fast_s13_im100_e50','original_recovery':'original_s9_im100_e50','original_timeout':'original_s9_im100_timeout'}
    for rule in RULES:
        F=features(G,rule);output['dailyMirror'][rule]={};output['hourlyMirror'][rule]={}
        for period,(a,b) in PERIODS.items():
            btc=btc_sim(G,F,'none_e50',a,b,details=True)
            if period in old['details'][names[rule]]:
                assert abs(btc['btc']-old['details'][names[rule]][period]['btc'])<1e-9
            changes=btc['ledger']
            output['dailyMirror'][rule][period]=mirror(daily,changes,a,b)
            if period in ['2024','2025','2026','2025-26','2024-26']:
                output['hourlyMirror'][rule][period]=mirror(rth,changes,a,b)
                for fee,delay in [(.003,0),(.001,3600),(.001,86400)]:
                    output['stress'].append(dict(method='hourlyMirror',rule=rule,period=period,fee=fee,delaySeconds=delay,result=compact(mirror(rth,changes,a,b,fee,delay))))
            if rule=='fast_recovery' and period in ['2020-21','2023-25','2025','2026']:
                for fee,delay in [(.003,0),(.001,86400)]:
                    output['stress'].append(dict(method='dailyMirror',rule=rule,period=period,fee=fee,delaySeconds=delay,result=compact(mirror(daily,changes,a,b,fee,delay))))
        print('BTC mirror',rule,{k:round(v['shares'],4) for k,v in output['dailyMirror'][rule].items()},flush=True)
    output['checks'].append('BTC indicator/replay equals saved BTC research for overlapping periods and all three rules')
    # Robustness diagnostic only: retain every phase; never pick its best result.
    output['btcPhaseStress']=[]
    for phase in [0,3,6,9,12,15,18,21]:
        P=G if phase==0 else Grid(phase,a1h=hourly);F=features(P,'fast_recovery')
        for period in ['2020-21','2023-25','2024','2025','2026','2025-26']:
            a,b=PERIODS[period];changes=btc_sim(P,F,'none_e50',a,b,details=True)['ledger']
            row=dict(phase=phase,period=period,daily=compact(mirror(daily,changes,a,b)))
            if period in ['2024','2025','2026','2025-26']:row['hourly']=compact(mirror(rth,changes,a,b))
            output['btcPhaseStress'].append(row)
        print('Phase diagnostic',phase,flush=True)
    for phase in [0,1,2]:
        S=StockGrid(rth,phase)
        for rule in ['fast_recovery','original_recovery']:
            F=features(S,rule)
            assert np.isfinite(F['E'][S.real>=ts('2025-01-01')]).all()
            if phase==0:
                output['native'][rule]={}
                for cutoff in ['2025-06-01','2026-01-01']:
                    short=StockGrid(rth[rth[:,5]<ts(cutoff)],phase);f=features(short,rule)
                    assert np.allclose(f['E'],F['E'][:short.n],equal_nan=True)
                    assert np.array_equal(f['event'],F['event'][:short.n])
                output['checks'].append(f'Native {rule}: two causal prefix checks pass')
            for period in ['2025','2026','2025-26']:
                a,b=PERIODS[period];r=native(rth,S,F,a,b)
                if phase==0:output['native'][rule][period]=r
                output['stress'].append(dict(method='native',rule=rule,period=period,phase=phase,fee=.001,delaySeconds=0,result=compact(r)))
                if phase==0:
                    for fee,delay in [(.003,0),(.001,3600),(.001,86400)]:
                        output['stress'].append(dict(method='native',rule=rule,period=period,phase=phase,fee=fee,delaySeconds=delay,result=compact(native(rth,S,F,a,b,fee,delay))))
            if phase==0:print('Native',rule,{k:round(v['shares'],4) for k,v in output['native'][rule].items()},flush=True)
    # If both BTC changes occur over a closed market, cancel obsolete actions.
    fake=np.array([[ts('2025-01-06')+14.5*3600,100,100,100,100]])
    events=[dict(time=ts('2025-01-04'),side='sell',reason='weakness'),dict(time=ts('2025-01-05'),side='buy',reason='recovery')]
    assert mirror(fake,events,'2025-01-01','2026-01-01')['trades']==0
    output['checks'].append('Closed-market sell and recovery cancel before the next stock open')
    output['checks'].append('Every ledger reconciles fee-net shares and executes on an observed bar at/after its decision')
    (HERE/'summary.json').write_text(json.dumps(output,indent=2))
    print('Checks passed; summary.json saved',flush=True)

if __name__=='__main__':run()
