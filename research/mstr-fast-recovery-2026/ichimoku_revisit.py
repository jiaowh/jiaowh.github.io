"""Re-evaluate old indicators in asset units. See ICHIMOKU_PROTOCOL.md."""
from expanded import *
from expanded_validation import execute_mask
from r25_indicator_screen import FAMS, family_members

PERIODS['2019-21']=('2019-01-01','2022-01-01')
BASE='threshold_x50_b50_c3';JOINT=BASE+'__joint200'

def lagged(a,n):return np.r_[np.full(n,np.nan),a[:-n]]

def ichimoku(h,l,c,offset=26):
    mid=lambda n:(rolling(h,n)+rolling(l,n,False))/2
    ten=mid(9);kij=mid(26);br=mid(52);ar=(ten+kij)/2
    a=lagged(ar,offset);b=lagged(br,offset);top=np.maximum(a,b);bottom=np.minimum(a,b)
    pairs={'kijun':(c>kij,c<kij),'spanb':(c>b,c<b),'mid52':(c>br,c<br),
           'cloud':(c>top,c<bottom),'tkcross':(ten>kij,ten<kij),
           'confluence':((c>top)&(ten>kij)&(ar>br),(c<bottom)|(ten<kij))}
    return pairs,dict(tenkan=ten,kijun=kij,rawA=ar,rawB=br,A=a,B=b)

def daily_extra(G):
    return average([m_sma(G,n) for n in [20,50,100,150,200]]+
                   [m_mom(G,n) for n in [14,28,56,84,168]]+
                   [m_donch(G,n) for n in [10,20,50,100]])

def prepare(G,D,only=None,offset=26):
    F=features(G,'fast_recovery');E=F['E'];models={};meta={};specs={};static={};bt=G.real+14400
    def addmodel(name,breadth,exit_,entry,confirmation,family):
        if only is not None and name not in only:return
        models[name]=dict(event=confirmed(breadth,exit_,confirmation)&F['gate'],filters={'none':np.ones(G.n,bool)},
                          recoveries={'e50':breadth>entry+1e-12})
        meta[name]=dict(family=family,exit=exit_,buy=entry,confirmation=confirmation)
    for e,r,k in itertools.product([40,45,50,55,60],[45,50,55,60,65],[1,3]):
        if r>=e:addmodel(f'threshold_x{e}_b{r}_c{k}',E,e/100,r/100,k,'threshold')
    # Keep old indicator formulas and replace the objective/execution wrapper.
    daily=daily_extra(G)
    for fam,fn in FAMS.items():
        names=[f'legacy_{mode}_{fam}_x{exit_}_b{buy}' for mode in ['repl','add'] for exit_,buy in [(50,50),(45,55)]]
        if only is not None and not any(n in only for n in names):continue
        A,w=family_members(G,fn);block=average(A,w)
        assert np.all((block[np.isfinite(block)]>=0)&(block[np.isfinite(block)]<=1))
        for mode in ['repl','add']:
            breadth=.72*block+.28*daily if mode=='repl' else (36*block+50*E)/86
            for exit_,buy in [(50,50),(45,55)]:addmodel(f'legacy_{mode}_{fam}_x{exit_}_b{buy}',breadth,exit_/100,buy/100,3,'legacy')
    # Ichimoku replaces the correction trigger and recovery, not the exit gate.
    for timeframe in ['4h','daily']:
        if timeframe=='4h':h,l,c=G.h,G.l,G.c;ends=np.arange(G.n)
        else:h,l,c,ends,_=G.daily()
        pair,_=ichimoku(h,l,c,offset)
        for sig,k in itertools.product(['kijun','spanb','cloud'],[1,3]):
            name=f'ichitactical_{timeframe}_{sig}_c{k}'
            if only is not None and name not in only:continue
            bull,bear=pair[sig];fresh=confirmed(np.where(bear,0.,1.),.5,k)
            event=np.zeros(G.n,bool);event[ends[fresh]]=True
            recovery=G.spread(bull,ends)==1
            models[name]=dict(event=event&F['gate'],filters={'none':np.ones(G.n,bool)},recoveries={'e50':recovery})
            meta[name]=dict(family='Ichimoku tactical',signal=sig,timeframe=timeframe,confirmation=k)
    dh,dl,dc,de,_=G.daily();bst=ichimoku(dh,dl,dc,offset)[0]
    mst=ichimoku(D[:,2],D[:,3],D[:,4],offset)[0]
    mm=sma(D[:,4],200);m200=np.r_[False,state(D[:,4]>mm*1.02,D[:,4]<mm*.98,2,False)[:-1]]
    gate=at(bt,F['gate'],D[:,0]-1)|m200
    for name in models:
        for joint in [False,True]:
            key=name+('__joint200' if joint else '')
            specs[key]=dict(kind='model',model=name,joint=joint,family=meta[name]['family'])
    for signal,k in itertools.product(bst,[1,2]):
        b=at(bt[de],state(*bst[signal],k,False),D[:,0]-1)
        m=np.r_[False,state(*mst[signal],k,False)[:-1]]
        for source,mask in [('btc',b),('mstr',m)]:
            name=f'ichistate_{source}_{signal}_c{k}';static[name]=mask
            specs[name]=dict(kind='static',family='Ichimoku standalone',signal=signal,source=source,confirmation=k)
        for source,mask in [('btc',b),('mstr',m),('either',b|m),('both',b&m)]:
            name=f'ichifilter_{source}_{signal}_c{k}';static[name]=mask
            specs[name]=dict(kind='filter',model=BASE,family='Ichimoku filter',signal=signal,source=source,confirmation=k)
    # Native MSTR controls: daily family votes + daily feature votes, same units goal.
    if only is None:
        for fam,fn in FAMS.items():
            A=[];weights=[]
            for n in [21,34,55]:
                with np.errstate(all='ignore'):s1,s2=fn(D[:,2],D[:,3],D[:,4],n)
                if s2 is None:A.append(s1);weights.append(2)
                else:A += [s1,s2];weights += [1,1]
            block=average(A,weights);breadth=.72*block+.28*breadth14(D[:,2],D[:,3],D[:,4])
            name='nativelegacy_'+fam;static[name]=np.r_[False,state(breadth>.55+1e-12,breadth<.45-1e-12,2,False)[:-1]]
            specs[name]=dict(kind='static',family='Native legacy',indicator=fam)
    specs['hold']=dict(kind='hold',family='Hold')
    return dict(G=G,D=D,models=models,modelMeta=meta,specs=specs,static=static,gate=gate,cache={})

def btc_run(P,model,period,fee=.001,delay=0):
    key=(model,period,fee,delay)
    if key not in P['cache']:
        a,b=PERIODS[period];P['cache'][key]=btc_sim(P['G'],P['models'][model],'none_e50',a,b,fee=fee,delay=delay,details=True)
    return P['cache'][key]

def modelmask(P,model,period):
    changes=btc_run(P,model,period)['ledger'];D=P['D']
    times=np.array([t['time'] for t in changes]);sides=np.array([t['side']=='buy' for t in changes])
    ix=np.searchsorted(times,D[:,0]-1,side='right')-1;out=np.ones(len(D),bool);ok=ix>=0;out[ok]=sides[ix[ok]]
    return out

def mstr_run(P,name,period,fee=.001,delay=0,details=False):
    s=P['specs'][name];kind=s['kind'];D=P['D']
    if kind=='hold':mask=np.ones(len(D),bool)
    elif kind=='static':mask=P['static'][name]
    elif kind=='filter':mask=modelmask(P,s['model'],period)&P['static'][name]
    else:
        mask=modelmask(P,s['model'],period)
        if s['joint']:mask=mask&P['gate']
    a,b=PERIODS[period];ok=(D[:,0]>=ts(a))&(D[:,0]<ts(b));rows=np.column_stack([D,closes(D)])
    result=execute_mask(rows[ok],mask[ok],fee,delay)
    if not details:return {k:v for k,v in result.items() if k not in ['curve','ledger','pairs']}
    result.pop('curve',None);return result

def unit_score(rows,years,key,balanced):
    z=np.log([rows[y][key] for y in years]);return float(.5*np.mean(z)+.5*np.min(z) if balanced else np.mean(z))

def pick(rows,meta,key):
    def winner(names,balanced):return max(names,key=lambda n:unit_score(rows[n],['2021','2022','2023','2024'] if balanced else ['2023','2024'],key,balanced))
    out=dict(balanced=winner(list(rows),True),bull=winner(list(rows),False),families={})
    for fam in sorted(set(m['family'] for m in meta.values())):
        names=[n for n in rows if meta[n]['family']==fam]
        out['families'][fam]=dict(balanced=winner(names,True),bull=winner(names,False))
    return out

def run():
    D=fetch()['1d'];hourly=data();G=Grid(0,a1h=hourly);P=prepare(G,D)
    print('Old families',len(FAMS),'BTC models',len(P['models']),'MSTR candidates',len(P['specs']),flush=True)
    bresults={n:{p:{k:v for k,v in btc_run(P,n,p).items() if k not in ['ledger','pairs']} for p in PERIODS} for n in P['models']}
    mresults={}
    for j,name in enumerate(P['specs']):
        mresults[name]={p:mstr_run(P,name,p) for p in PERIODS}
        if j%40==0:print('MSTR complete',j+1,name,flush=True)
    bs=pick(bresults,P['modelMeta'],'btc');ms=pick(mresults,P['specs'],'shares')
    print('BTC SELECT',bs,flush=True);print('MSTR SELECT',ms,flush=True)
    (HERE/'ichimoku-primary.json').write_text(json.dumps(dict(btc=bresults,mstr=mresults,selectedBTC=bs,selectedMSTR=ms),separators=(',',':')))
    prior=json.loads((HERE/'expanded-overview.json').read_text());checks=[]
    for old,new in [('fast_recovery',BASE),('fast_either200',JOINT)]:
        for period,r in prior['results'][old].items():
            assert abs(r['shares']-mresults[new][period]['shares'])<1e-9,(old,period)
    oldbtc=json.loads((HERE.parent/'btc-bull-accumulation-2026/imacd-summary.json').read_text())['details']['fast_s13_im100_e50']
    for period,r in oldbtc.items():
        # The old BTC study called 2023-24 "train"; the MSTR study uses 2021-24.
        new_period='bull_train' if period=='train' else period
        if new_period in bresults[BASE]:assert abs(r['btc']-bresults[BASE][new_period]['btc'])<1e-9,(period,r['btc'],bresults[BASE][new_period]['btc'])
    checks.append('Current BTC model and both MSTR baseline variants reproduce previous period outcomes')
    # Verify displacement against an independent direct-window formula.
    _,lines=ichimoku(D[:,2],D[:,3],D[:,4])
    for i in [100,300,len(D)-1]:
        j=i-26;assert abs(lines['B'][i]-(max(D[j-51:j+1,2])+min(D[j-51:j+1,3]))/2)<1e-10
        assert abs(lines['kijun'][i]-(max(D[i-25:i+1,2])+min(D[i-25:i+1,3]))/2)<1e-10
    checks.append('Kijun and displayed Span B match independent rolling-window/26-bar-shift arithmetic')
    shortb=list(dict.fromkeys([BASE,bs['balanced'],bs['bull'],*[v for r in bs['families'].values() for v in r.values()]]))
    shortm=list(dict.fromkeys([BASE,JOINT,ms['balanced'],ms['bull'],*[v for r in ms['families'].values() for v in r.values()]]))
    needs=set(shortb+[P['specs'][n]['model'] for n in shortm if 'model' in P['specs'][n]])
    # All candidate signals, including the full old family screen, causal prefix.
    cutoff='2025-01-01';gg=Grid(0,a1h=hourly[hourly[:,0]<ts(cutoff)]);dd=D[closes(D)<ts(cutoff)];pp=prepare(gg,dd)
    for n,f in pp['models'].items():
        assert np.array_equal(f['event'],P['models'][n]['event'][:gg.n]),n
        assert np.array_equal(f['recoveries']['e50'],P['models'][n]['recoveries']['e50'][:gg.n]),n
    for n,z in pp['static'].items():assert np.array_equal(z,P['static'][n][:len(z)]),n
    checks.append('All model events, recovery arrays and native daily signals pass a full future-truncation check')
    detailB={n:{p:btc_run(P,n,p) for p in ['2020-21','2022','2023','2024','2025','2026','2023-25','validation']} for n in shortb}
    detailM={n:{p:mstr_run(P,n,p,details=True) for p in ['2020-21','2022','2023','2024','2025','2026','2023-25','validation']} for n in shortm}
    stress=[]
    for n in shortb:
        for fee,delay in [(.003,0),(.001,1),(.003,1)]:
            for p in ['2023-25','validation']:stress.append(dict(asset='BTC',name=n,period=p,fee=fee,delay=delay,result={k:v for k,v in btc_run(P,n,p,fee,delay).items() if k not in ['ledger','pairs']}))
    for n in shortm:
        for fee,delay in [(.003,0),(.001,1),(.003,1)]:
            for p in ['2023-25','validation']:stress.append(dict(asset='MSTR',name=n,period=p,fee=fee,delay=delay,result=mstr_run(P,n,p,fee,delay)))
    phases=[]
    for phase in [3,6,9,12,15,18,21]:
        gg=Grid(phase,a1h=hourly);pp=prepare(gg,D,only=needs)
        for n in shortb:
            for period in ['2023-25','validation']:phases.append(dict(asset='BTC',phase=phase,name=n,period=period,units=btc_run(pp,n,period)['btc']))
        for n in shortm:
            if P['specs'][n]['kind']=='static':continue
            for period in ['2023-25','validation']:phases.append(dict(asset='MSTR',phase=phase,name=n,period=period,units=mstr_run(pp,n,period)['shares']))
        print('Phase',phase,'completed',flush=True)
    offsets=[]
    for offset in [25,27]:
        pp=prepare(G,D,only=needs,offset=offset)
        for n in shortm:
            if 'ichi' not in n:continue
            for period in ['2023-25','validation']:offsets.append(dict(name=n,offset=offset,period=period,units=mstr_run(pp,n,period)['shares']))
    out=dict(asOf='2026-10-09',protocol='ICHIMOKU_PROTOCOL.md',oldFamilies=list(FAMS),btcDefinitions=P['modelMeta'],mstrDefinitions=P['specs'],
             btc=bresults,mstr=mresults,selectedBTC=bs,selectedMSTR=ms,detailsBTC=detailB,detailsMSTR=detailM,stress=stress,phases=phases,offsets=offsets,checks=checks)
    (HERE/'ichimoku-results.json').write_text(json.dumps(out,separators=(',',':')))
    print('Saved ichimoku-results.json',flush=True)

if __name__=='__main__':run()
