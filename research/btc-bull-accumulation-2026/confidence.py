"""Fixed 40-rule diagnostic; see CONFIDENCE_PROTOCOL.md before interpreting."""
from bull import *
from refine import prepare, sim as oldsim, PARAMS
from search import rolling

FILTERS=['none','ma20','ma50','support10','atrhalf','adx20','adx25','efficiency','family3','confluence2']
RECOVERIES=['timeout','e50','e60','e60c3']
RULES={f'{f}_{r}':(f,r) for f,r in itertools.product(FILTERS,RECOVERIES)}
BASE='none_timeout'
PERIODS={str(y):(f'{y}-01-01',f'{y+1}-01-01' if y<2026 else '2026-10-10') for y in range(2018,2027)}
PERIODS.update({'2015-17':('2015-01-01','2018-01-01'),'2019-21':('2019-01-01','2022-01-01'),
 '2020-21':('2020-01-01','2022-01-01'),'train':('2023-01-01','2025-01-01'),'2023-25':('2023-01-01','2026-01-01')})

def features(G):
    E,gate,ev=prepare(G);h,l,c,e,_=G.daily();ma20=sma(c,20);ma50=sma(c,50)
    pc=np.r_[c[0],c[:-1]];atr=smma(np.maximum(h-l,np.maximum(abs(h-pc),abs(l-pc))),14)
    up=np.r_[0,np.diff(h)];dn=np.r_[0,-np.diff(l)]
    pdm=smma(np.where((up>dn)&(up>0),up,0),14)
    ndm=smma(np.where((dn>up)&(dn>0),dn,0),14)
    dx=np.divide(abs(pdm-ndm),pdm+ndm,out=np.full(len(c),np.nan),where=(pdm+ndm)>0)*100
    # Wilder smoothing starts only once directional-movement averages exist.
    adx=np.full(len(c),np.nan);adx[13:]=smma(np.nan_to_num(dx[13:]),14)
    displacement=np.r_[np.full(20,np.nan),c[20:]-c[:-20]]
    travel=sma(abs(np.r_[0,np.diff(c)]),20)*20
    er=np.divide(abs(displacement),travel,out=np.zeros(len(c)),where=travel>0)
    spread=lambda v:np.nan_to_num(G.spread(v,e)).astype(bool)
    F={'none':np.ones(G.n,bool),'ma20':spread(c<ma20),'ma50':spread(c<ma50),
       'support10':G.c<G.spread(np.r_[np.nan,rolling(l,10,False)[:-1]],e),
       'atrhalf':spread(c<ma20-.5*atr),'adx20':spread((adx>20)&(ndm>pdm)),
       'adx25':spread((adx>25)&(ndm>pdm)),'efficiency':spread((er>=.3)&(displacement<0))}
    members=page_members(G)
    families=[average([m[-1] for m in members if m[1]==f]) for f in ['imacd','sma','mom','donch']]
    F['family3']=np.sum(np.array(families)<.5,axis=0)>=3
    F['confluence2']=np.sum([F[k] for k in ['ma20','support10','adx20']],axis=0)>=2
    strong=E>.6
    R={'timeout':np.zeros(G.n,bool),'e50':E>.5,'e60':strong,
       'e60c3':strong & np.r_[False,strong[:-1]] & np.r_[False,False,strong[:-2]]}
    return dict(E=E,gate=gate,event=ev[(.5,3)]&gate,filters=F,recoveries=R)

def sim(G,I,name,start,end,fee=.001,delay=0,details=False):
    """Event-driven next-open engine; independently reconciles every cash leg."""
    f,r=RULES[name];a=G.ix(start);z=G.ix(end);q=1.;cash=0.;cursor=a;fills=[];pairs=[]
    equity=np.ones(z-a);cashbars=0;events=np.flatnonzero(I['event']&I['filters'][f])
    while cursor<z:
        where=np.searchsorted(events,cursor)
        if where==len(events):break
        decision=int(events[where]);sale_i=decision+1+delay
        if sale_i>=z:break
        before=q;sale=float(G.o[sale_i]);cash=q*sale*(1-fee);q=0.
        fills.append(dict(side='sell',time=int(G.real[sale_i]),decision=int(G.real[decision]+14400),price=sale,unitsBefore=before,reason=f))
        # A fill can generate its next decision at that same bar's CLOSE.
        look=np.arange(sale_i,z)
        target=G.c[look]<=sale*.999/(1.001*1.1)
        recovery=I['recoveries'][r][look]
        timer=G.real[look]+14400-G.real[sale_i]>=7*86400
        hit=np.flatnonzero(target|recovery|timer)
        buy_dec=int(look[hit[0]]) if len(hit) else z
        buy_i=buy_dec+1+delay
        stop=min(buy_i,z);equity[sale_i-a:stop-a]=cash/(G.c[sale_i:stop]*(1+fee));cashbars+=stop-sale_i
        if buy_i>=z:break
        q=cash/(G.o[buy_i]*(1+fee));cash=0.;equity[buy_i-a:]=q
        k=int(hit[0]);reason='target' if target[k] else 'recovery' if recovery[k] else 'timeout'
        gain=sale*(1-fee)/(G.o[buy_i]*(1+fee))-1
        assert abs(q/before-1-gain)<1e-10
        fills.append(dict(side='buy',time=int(G.real[buy_i]),decision=int(G.real[buy_dec]+14400),price=float(G.o[buy_i]),unitsAfter=float(q),reason=reason))
        pairs.append(dict(sale=int(G.real[sale_i]),buy=int(G.real[buy_i]),gain=float(gain),reason=reason))
        cursor=buy_i
    value=float(q+cash/(G.c[z-1]*(1+fee)))
    assert abs(equity[-1]-value)<1e-9
    path=np.r_[1.,equity];dd=float(min(path/np.maximum.accumulate(path)-1))
    out=dict(btc=value,units=float(q),cash=float(cash),roundTrips=len(pairs),wins=sum(p['gain']>0 for p in pairs),
             fills=len(fills),btcDD=dd,cashFraction=cashbars/(z-a))
    if details:out.update(ledger=fills,pairs=pairs)
    return out

def label_events(G,I):
    out=[]
    for d in np.flatnonzero(I['event']):
        s=d+1
        if s>=G.n or G.real[s]<ts('2018-01-01'):continue
        look=np.arange(s,min(s+44,G.n));target=G.c[look]<=G.o[s]*.999/(1.001*1.1)
        hit=np.flatnonzero(target|(G.real[look]+14400-G.real[s]>=7*86400))
        if not len(hit):continue
        b=int(look[hit[0]]+1)
        if b>=G.n:continue
        out.append(dict(time=int(G.real[s]),buy=int(G.real[b]),gain=float(G.o[s]*.999/(G.o[b]*1.001)-1),
          filters={f:bool(v[d]) for f,v in I['filters'].items()}))
    return out

def stats(values):
    n=len(values)
    if not n:return dict(n=0)
    w=sum(x>0 for x in values);p=w/n;z=1.96;den=1+z*z/n
    center=(p+z*z/(2*n))/den;half=z*np.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    return dict(n=n,wins=w,winRate=p,winWilson95=[center-half,center+half],mean=float(np.mean(values)),worst=float(min(values)))

def run():
    hourly=data();rows=[];grids=[];parity=0;labels=[]
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);I=features(G);grids.append((G,I))
        oldI=prepare(G)
        for y in map(str,range(2018,2027)):
            actual=sim(G,I,BASE,*PERIODS[y],details=True)
            prior=oldsim(G,oldI,PARAMS['e50_c3_g0.1_time7'],*PERIODS[y],details=True)
            assert abs(actual['btc']-prior['btc'])<1e-9,(phase,y,actual,prior)
            assert abs(actual['btcDD']-prior['btcDD'])<1e-9
            assert [(v['time'],v['price']) for v in actual['ledger']]==[(v['time'],v['price']) for v in prior['ledger']]
            parity+=1
        if phase==0:
            labels=label_events(G,I)
            for cut in [ts('2020-07-24')+8*3600,ts('2025-02-01')+16*3600]:
                g=Grid(phase,a1h=hourly[hourly[:,0]<cut]);ii=features(g)
                for group in ['filters','recoveries']:
                    for k in I[group]:assert np.array_equal(ii[group][k],I[group][k][:g.n]),(group,k)
                assert np.array_equal(ii['event'],I['event'][:g.n])
        for name in RULES:rows.append(dict(name=name,phase=phase,periods={k:sim(G,I,name,*ab) for k,ab in PERIODS.items()}))
        print('Completed phase',phase,flush=True)
    scores={name:float(np.quantile([np.log(r['periods']['train']['btc']) for r in rows if r['name']==name],.25)) for name in RULES}
    eligible=[n for n in RULES if min(r['periods']['train']['roundTrips'] for r in rows if r['name']==n)>=5]
    selected=dict(baseline=BASE,recoveryOnly=max([n for n in RULES if n.startswith('none_')],key=scores.get),
                  allFilters=max(RULES,key=scores.get),minimumFive=max(eligible,key=scores.get) if eligible else BASE)
    # Always inspect the specifically proposed >60% recovery, even if not chosen.
    selected['proposed']='none_e60'
    selected['postRunRecoveryDiagnostic']='none_e50'
    selected['postRunFilterDiagnostic']='adx20_timeout'
    summary={}
    for name in set(selected.values()):
        rr=[r for r in rows if r['name']==name]
        summary[name]={k:dict(base=rr[0]['periods'][k],minimum=min(r['periods'][k]['btc'] for r in rr),
           maximum=max(r['periods'][k]['btc'] for r in rr),above1=sum(r['periods'][k]['btc']>1+1e-9 for r in rr)) for k in PERIODS}
    stress=[];details={}
    for phase,(G,I) in zip(PHASES,grids):
        for name in summary:
            for fee,delay in [(.003,0),(.001,1),(.001,6),(.003,1)]:
                stress.append(dict(name=name,phase=phase,fee=fee,delay=delay,periods={k:sim(G,I,name,*PERIODS[k],fee=fee,delay=delay) for k in ['2020','2025','2023-25']}))
            if phase==0:details[name]={k:sim(G,I,name,*PERIODS[k],details=True) for k in PERIODS}
    quality={}
    for label,(a,b) in {'older':('2018-01-01','2023-01-01'),'train':PERIODS['train'],'2025':PERIODS['2025']}.items():
        population=[v for v in labels if v['time']>=ts(a) and v['buy']<ts(b)]
        quality[label]={f:{'accepted':stats([v['gain'] for v in population if v['filters'][f]]),
                           'rejected':stats([v['gain'] for v in population if not v['filters'][f]])} for f in FILTERS}
    out=dict(selected=selected,scores=scores,summary=summary,rows=rows,stress=stress,details=details,quality=quality,events=labels,parityChecks=parity)
    (O/'confidence-results.json').write_text(json.dumps(out,indent=1))
    print('SELECTION',selected,'PARITY',parity)
    for n in summary:print(n,{k:round(summary[n][k]['base']['btc'],4) for k in PERIODS})

if __name__=='__main__':run()
