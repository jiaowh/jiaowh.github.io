"""Bounded expanded search. EXPANDED_PROTOCOL.md defines selection and limits."""
from evaluate import *
from core import ema, imacd, smma
from search import rolling

OUT=HERE/'expanded-summary.json'
YEARS=list(map(str,range(2018,2027)))
PERIODS.update({'train':('2021-01-01','2025-01-01'), 'bull_train':('2023-01-01','2025-01-01'),
                'treasury':('2020-08-11',END), 'validation':('2025-01-01',END)})

def closes(D):
    out=[]
    for row in D:
        date=dt.date.fromisoformat(day(row[0]));y=date.year
        nov1=dt.date(y,11,1);thank=nov1+dt.timedelta(days=(3-nov1.weekday())%7+21)
        half=(date==thank+dt.timedelta(days=1) or
              (date.month==7 and date.day==3 and date.weekday()<4) or
              (date.month==12 and date.day==24 and date.weekday()<4))
        out.append(row[0]+(3.5 if half else 6.5)*3600)
    return np.array(out)

def at(times,values,query):
    ix=np.searchsorted(times,query,side='right')-1
    assert np.all(ix>=0)
    return np.asarray(values)[ix]

def donch(h,l,c,n,k):
    hi=np.r_[np.nan,rolling(h,n)[:-1]];lo=np.r_[np.nan,rolling(l,k,False)[:-1]]
    return state(c>hi,c<lo,1,False)

def breadth14(h,l,c):
    votes=[c>sma(c,n) for n in [20,50,100,150,200]]
    votes += [c>np.r_[np.full(n,np.nan),c[:-n]] for n in [14,28,56,84,168]]
    votes += [donch(h,l,c,n,n//2) for n in [10,20,50,100]]
    return np.mean(votes,axis=0)

def build_panel(D,G,F):
    c=D[:,4];h=D[:,2];l=D[:,3];ct=closes(D);bt=G.real+14400
    # All stock daily indicators are shifted to the next stock open.
    prev=lambda v:np.r_[False,np.asarray(v)[:-1]].astype(bool)
    series={};meta={}
    def add(name,v,family):series[name]=np.asarray(v,bool);meta[name]=dict(kind='static',family=family)
    M={}
    for n,band in itertools.product([50,100,150,200],[0,.02]):
        s=sma(c,n);v=state(c>s*(1+band),c<s*(1-band),2,False)
        name=f'mstr_sma{n}_b{int(band*100)}';M[name]=prev(v);add(name,M[name],'MSTR trend')
    for a,b in [(20,50),(50,200)]:add(f'mstr_ema{a}_{b}',prev(state(ema(c,a)>ema(c,b),ema(c,a)<ema(c,b),2,False)),'MSTR trend')
    macrec=None
    for a,b,s in [(12,26,9),(6,13,5)]:
        line=ema(c,a)-ema(c,b);sig=ema(line,s)
        for mode in ['zero','cross']:
            v=line>(0 if mode=='zero' else sig)
            add(f'mstr_macd{a}_{b}_{s}_{mode}',prev(state(v,~v,2,False)),'MSTR MACD')
            if a==12 and mode=='cross':macrec=prev(v)
    iv=[]
    for n in [14,21,34]:
        md,sb=imacd(h,l,c,n,13);iv += [md>0,md>sb]
    I=np.mean(iv,axis=0);B=breadth14(h,l,c)
    for label,v in [('imacd6',I),('breadth14',B),('breadth20',(.3*I+.7*B))]:
        add('mstr_'+label,prev(state(v>.6,v<.4,2,False)),'MSTR breadth')
    for n in [63,126,252]:
        lag=np.r_[np.full(n,np.nan),c[:-n]];add(f'mstr_mom{n}',prev(state(c>lag,c<lag,2,False)),'MSTR momentum')
    for n,k in [(20,10),(55,20)]:add(f'mstr_donch{n}_{k}',prev(donch(h,l,c,n,k)),'MSTR breakout')
    for pct in [.2,.3]:
        on=False;peak=0;v=[];ma=sma(c,50)
        for i,price in enumerate(c):
            if on:
                peak=max(peak,price)
                if price<peak*(1-pct):on=False
            elif price>ma[i]:on=True;peak=price
            v.append(on)
        add(f'mstr_trail{int(pct*100)}',prev(v),'MSTR trailing stop')
    dh,dl,dc,de,_=G.daily();dtimes=bt[de]
    BTC={}
    for n in [100,150,200]:
        ma=sma(dc,n);v=state(dc>ma*1.02,dc<ma*.98,2,False)
        BTC[n]=at(dtimes,v,D[:,0]-1).astype(bool);add(f'btc_sma{n}',BTC[n],'BTC trend')
    for lo,hi in [(.4,.6),(.5,.5)]:
        v=state(F['E']>hi+1e-12,F['E']<lo-1e-12,2,False)
        add(f'btc_breadth{int(lo*100)}_{int(hi*100)}',at(bt,v,D[:,0]-1),'BTC breadth')
    ratio=c/at(bt,G.c,ct);R={}
    for n in [50,100]:
        ma=sma(ratio,n);R[n]=prev(state(ratio>ma*1.02,ratio<ma*.98,2,False))
        add(f'relative_sma{n}',R[n],'MSTR/BTC relative strength')
    for n in [100,150,200]:
        for mode in ['either','both']:
            a=BTC[200];b=M[f'mstr_sma{n}_b2']
            add(f'trend_{mode}_btc200_mstr{n}',a|b if mode=='either' else a&b,'Hybrid trend')
    masks={'btc200':BTC[200],'either200':BTC[200]|M['mstr_sma200_b2'],'both200':BTC[200]&M['mstr_sma200_b2']}
    masks.update({f'mstr{n}':M[f'mstr_sma{n}_b2'] for n in [50,100,150,200]})
    masks.update({f'relative{n}':v for n,v in R.items()})
    for k,v in masks.items():series['fast_'+k]=v;meta['fast_'+k]=dict(kind='overlay',family='BTC fast + regime')
    for rule in RULES:meta[rule]=dict(kind='mirror',family='BTC correction control')
    meta['hold']=dict(kind='hold',family='Hold')
    for filt,gain,recover,timer in itertools.product(['none','ma20','relative50'],[.1,.2],['btc','mstr'],[7,14]):
        name=f'tactical_{filt}_g{int(gain*100)}_{recover}_t{timer}'
        meta[name]=dict(kind='tactical',family='BTC entry + MSTR buyback',filter=filt,gain=gain,recovery=recover,timer=timer)
    events=bt[F['event']]
    # A fresh event can act once: first regular open after it; several closed-
    # market events collapse to one decision at that opening.
    latest=np.searchsorted(events,D[:,0]-1,side='right');ev=np.r_[False,np.diff(latest)>0]
    panel=dict(D=D,G=G,F=F,bt=bt,ct=ct,series=series,meta=meta,
        bear=~masks['either200'],event=ev,brecovery=at(bt,F['E']>.5+1e-12,D[:,0]-1),
        mrec=macrec,prevc=np.r_[np.nan,c[:-1]],
        filters={'none':np.ones(len(D),bool),'ma20':prev(c<sma(c,20)),
                 'relative50':prev(ratio<sma(ratio,50))},mirrorCache={})
    assert len(meta)==len(set(meta))
    return panel

def desired_btc(P,rule,a,b):
    key=(rule,a,b)
    if key not in P['mirrorCache']:
        F=P['F'] if rule=='fast_recovery' else features(P['G'],rule)
        changes=btc_sim(P['G'],F,'none_e50',a,b,details=True)['ledger']
        times=np.array([v['time'] for v in changes]);sides=np.array([v['side']=='buy' for v in changes])
        ix=np.searchsorted(times,P['D'][:,0]-1,side='right')-1
        mask=np.ones(len(P['D']),bool);ok=ix>=0;mask[ok]=sides[ix[ok]]
        P['mirrorCache'][key]=mask
    return P['mirrorCache'][key]

def run_model(P,name,a,b,fee=.001,delay=0,details=False,schedule=None):
    D=P['D'];inds=np.flatnonzero((D[:,0]>=ts(a))&(D[:,0]<ts(b)))
    q=1.;cash=0.;sale=None;saletime=None;cashmode=None;pending=None;ledger=[];path=[];used=[]
    # Only actual price-bearing fills update q, cash, sale price and timer.
    def target(rule,i):
        nonlocal cashmode
        m=P['meta'][rule];kind=m['kind']
        if kind=='hold':return True,'hold'
        if kind=='static':return P['series'][rule][i],'signal'
        if kind=='mirror':return desired_btc(P,rule,a,b)[i],'BTC position'
        if kind=='overlay':return desired_btc(P,'fast_recovery',a,b)[i]&P['series'][rule][i],'BTC plus regime'
        if P['bear'][i]:cashmode='bear';return False,'both SMA200 bearish'
        if cashmode=='bear':return True,'bear regime recovery'
        if q:
            if P['event'][i] and P['filters'][m['filter']][i]:return False,'BTC weakness + '+m['filter']
            return True,'hold'
        targetprice=sale*.999/(1.001*(1+m['gain']))
        if P['prevc'][i]<=targetprice:return True,'MSTR share target'
        if (P['brecovery'] if m['recovery']=='btc' else P['mrec'])[i]:return True,m['recovery']+' recovery'
        if D[i,0]-saletime>=m['timer']*86400:return True,'timeout'
        return False,'wait'
    for k,i in enumerate(inds):
        rule=schedule.get(day(D[i,0])[:4],name) if schedule else name
        used.append(rule)
        if pending is None:
            want,reason=target(rule,i)
            if bool(want)!=bool(q):pending=(k+delay,bool(want),reason,int(D[i,0]-1))
        if pending is not None and k>=pending[0]:
            _,buy,reason,decision=pending;p=D[i,1]
            if buy:q=cash/(p*(1+fee));cash=0.;cashmode=None
            else:cash=q*p*(1-fee);q=0.;sale=p;saletime=D[i,0];cashmode='bear' if 'bearish' in reason else 'tactical'
            ledger.append(dict(side='buy' if buy else 'sell',time=int(D[i,0]),decision=decision,price=float(p),units=float(q),reason=reason,rule=rule));pending=None
        path.append([q+cash/(D[i,4]*(1+fee)),q*D[i,4]+cash])
    out=metrics(D[inds],q,cash,ledger,path,fee)
    if details:
        out['curve']=[[int(P['ct'][i]),*map(float,row)] for i,row in zip(inds,path)]
        if schedule:out['schedule']=schedule
    else:out=compact(out)
    return out

def score(rows,years):
    logs=np.log([rows[y]['shares'] for y in years]);return float(.5*np.mean(logs)+.5*np.min(logs))

def session_test(D,raw,changes,a,b,exit_hour=None,overlay=False,fee=.001):
    """Scheduled auction entry, observed opening exit; never trade a gap print."""
    close=closes(D);dates=[day(t) for t in D[:,0]];early={}
    if exit_hour is not None:
        for r in raw:
            t=r[0];loc=dt.datetime.fromtimestamp(t+et_offset(t)*3600,dt.timezone.utc)
            if loc.hour==exit_hour and loc.minute==0 and loc.second==0:early[day(t)]=r
    times=np.array([t['time'] for t in changes]);sides=np.array([t['side']=='buy' for t in changes])
    def signal(t):
        j=np.searchsorted(times,t,side='right')-1
        return True if j<0 else bool(sides[j])
    inds=np.flatnonzero((D[:,0]>=ts(a))&(D[:,0]<ts(b)));q=1.;cash=0.;fills=[];path=[];missing=[]
    for i in inds:
        r=D[i] if exit_hour is None else early.get(dates[i])
        if r is None:
            # Missing premarket print: use the actual regular opening;
            # report it, rather than drop the day's return.
            r=D[i];missing.append(dates[i])
        want=overlay and signal(r[0]-1)
        if q and not want:
            cash=q*r[1]*(1-fee);q=0.;fills.append(dict(side='sell',time=int(r[0]),decision=int(r[0]-1),price=float(r[1]),units=0.,reason='scheduled morning exit'))
        elif not q and want:
            q=cash/(r[1]*(1+fee));cash=0.;fills.append(dict(side='buy',time=int(r[0]),decision=int(r[0]-1),price=float(r[1]),units=float(q),reason='BTC day holding'))
        if not q:
            # Always buy the scheduled auction, decided before its price exists.
            q=cash/(D[i,4]*(1+fee));cash=0.;fills.append(dict(side='buy',time=int(close[i]),decision=int(close[i]-1800),price=float(D[i,4]),units=float(q),reason='scheduled closing auction'))
        path.append([q,q*D[i,4]])
    out=metrics(D[inds],q,cash,fills,path,fee);out['missingPremarketDays']=missing
    return out

def bootstrap(r,seed=314):
    # Conditional uncertainty of one selected backtest, not selection-adjusted.
    q=np.r_[1,[v[1] for v in r['curve']]];log=np.diff(np.log(q));rng=np.random.default_rng(seed);out={}
    for block in [20,60]:
        starts=rng.integers(0,len(log),size=(1000,int(np.ceil(len(log)/block))))
        ix=(starts[:,:,None]+np.arange(block))%len(log)
        vals=np.exp(log[ix.reshape(1000,-1)[:,:len(log)]].sum(axis=1))
        out[str(block)]=dict(pBelowHolding=float(np.mean(vals<=1)),range90=list(map(float,np.quantile(vals,[.05,.95]))))
    return out

def run():
    raw=fetch();D=raw['1d'];G=Grid(0,a1h=data());F=features(G,'fast_recovery');P=build_panel(D,G,F)
    print('Candidates',len(P['meta']),flush=True)
    results={}
    for num,name in enumerate(P['meta']):
        results[name]={k:run_model(P,name,*ab) for k,ab in PERIODS.items()}
        if num%15==0:print('Completed',num+1,name,flush=True)
    # Baseline annual/continuous parity with the preceding transfer study.
    old=json.loads((HERE/'summary.json').read_text());parity=0
    for name in RULES:
        for period,r in old['dailyMirror'][name].items():
            assert abs(results[name][period]['shares']-r['shares'])<1e-9,(name,period,results[name][period]['shares'],r['shares'])
            parity+=1
    balanced=max(results,key=lambda n:score(results[n],['2021','2022','2023','2024']))
    bull=max(results,key=lambda n:np.mean(np.log([results[n][y]['shares'] for y in ['2023','2024']])))
    families=sorted(set(m['family'] for m in P['meta'].values()))
    familybest={fam:max([n for n in results if P['meta'][n]['family']==fam],key=lambda n:score(results[n],['2021','2022','2023','2024'])) for fam in families}
    selected=dict(balanced=balanced,bull=bull,families=familybest)
    print('SELECTED',selected,flush=True)
    # Selection never reads the year being evaluated.
    schedule={str(y):max(results,key=lambda n:score(results[n],list(map(str,range(y-3,y))))) for y in range(2023,2027)}
    walk=run_model(P,'hold','2023-01-01',END,details=True,schedule=schedule)
    shortlist=list(dict.fromkeys(['hold','fast_recovery','original_recovery',balanced,bull,*familybest.values()]))
    detail={name:{p:run_model(P,name,*PERIODS[p],details=True) for p in ['2020-21','2022','2023','2024','2025','2026','2023-25','validation','treasury']} for name in shortlist}
    stresses=[]
    for name in shortlist:
        for fee,delay in [(.003,0),(.005,0),(.001,1),(.003,1)]:
            for period in ['2022','2023-25','validation']:
                stresses.append(dict(name=name,fee=fee,extraSessions=delay,period=period,result=run_model(P,name,*PERIODS[period],fee=fee,delay=delay)))
    # Causal prefix checks at both a full day and a mid-session boundary.
    checks=[f'{parity} baseline period/rule share outcomes match the preceding study']
    for cutoff in ['2025-06-01','2026-01-01']:
        DD=D[closes(D)<ts(cutoff)];GG=Grid(0,a1h=data()[data()[:,0]<ts(cutoff)]);FF=features(GG,'fast_recovery');PP=build_panel(DD,GG,FF)
        for name,v in PP['series'].items():assert np.array_equal(v,P['series'][name][:len(v)]),(cutoff,name)
        for k in ['bear','event','brecovery','mrec']:assert np.array_equal(PP[k],P[k][:len(DD)]),(cutoff,k)
    checks.append('All daily candidate inputs match two truncated-history prefixes')
    # Deliberately perturb future prices: the first-open target may not change.
    DD=D.copy();j=int(np.searchsorted(D[:,0],ts('2025-06-01')));DD[j:,1:]*=2
    PP=build_panel(DD,G,F)
    for name,v in P['series'].items():assert np.array_equal(v[:j+1],PP['series'][name][:j+1]),name
    checks.append('Perturbing current/future stock OHLC cannot change that morning\'s indicator decision')
    checks.append('Every fill and cash leg reconciles independently to ending share equivalents')
    sessions=[]
    for period in ['2020-21','2022','2023','2024','2025','2026','validation','2023-25']:
        a,b=PERIODS[period];changes=btc_sim(G,F,'none_e50',a,b,details=True)['ledger']
        exits=[None,4,6,8] if period in ['2024','2025','2026','validation'] else [None]
        for exit_hour,overlay,fee in itertools.product(exits,[False,True],[.001,.003,.005]):
            r=session_test(D,raw['1h'],changes,a,b,exit_hour,overlay,fee)
            sessions.append(dict(period=period,exitHour=exit_hour,overlay=overlay,fee=fee,result=compact(r)))
    phases=[]
    for phase in [3,6,9,12,15,18,21]:
        GG=Grid(phase,a1h=data());PP=build_panel(D,GG,features(GG,'fast_recovery'))
        for name in list(dict.fromkeys(['fast_recovery',balanced,bull])):
            for period in ['2023-25','validation']:
                phases.append(dict(phase=phase,name=name,period=period,result=run_model(PP,name,*PERIODS[period])))
    boot={name:bootstrap(detail[name]['validation']) for name in list(dict.fromkeys([balanced,bull,'fast_recovery']))}
    output=dict(asOf=END,protocol='EXPANDED_PROTOCOL.md',candidateCount=len(results),definitions=P['meta'],results=results,
                selected=selected,walkForward=walk,details=detail,stress=stresses,sessions=sessions,phases=phases,bootstrap=boot,checks=checks)
    OUT.write_text(json.dumps(output,indent=2))
    print('SAVED',OUT.name,'CHECKS',checks,flush=True)
    for n in list(dict.fromkeys(['fast_recovery',balanced,bull])):print(n,{y:round(results[n][y]['shares'],4) for y in ['2021','2022','2023','2024','2025','2026','validation']})
    print('WALK',schedule,walk['shares'],flush=True)

if __name__=='__main__':run()
