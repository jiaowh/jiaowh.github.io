"""288 predeclared breadth/threshold/recovery combinations; see protocol."""
from bull import *
from confidence import sim as execute, features as original_features, PERIODS
from r25_indicator_screen import family_members,F_keltner,F_macd,F_rsi

VARIANTS=['page','im50','im25','im0','im90','im100','daily14','slow_im50','fast_im50',
 'half_fast','replace_bands','replace_macd','replace_rsi','add_bands20','im35_bands35','five_equal']
RULES={f'{v}_x{int(x*100)}_c{c}_{r}':dict(breadth=v,exit=x,confirm=c,recovery=r)
 for v,x,c,r in itertools.product(VARIANTS,[.4,.45,.5],[1,3],['timeout','e50','e60'])}
BASE='page_x50_c3_timeout';RECOVERY='page_x50_c3_e50'
CONTROL=[BASE,RECOVERY,*[f'{v}_x50_c3_timeout' for v in ['im25','im50','im0','replace_bands']]]
TOL=1e-12

def breadths(G):
    M=page_members(G);fam={f:average([m[-1] for m in M if m[1]==f]) for f in ['imacd','sma','mom','donch']}
    generic=average([fam[f] for f in ['sma','mom','donch']]);out={'page':average([m[-1] for m in M])}
    for n in [50,25,0,90,100]:
        # Do not let NaNs from a zero-weight family contaminate the warm-up.
        out[f'im{n}']=generic.copy() if n==0 else fam['imacd'].copy() if n==100 else fam['imacd']*(n/100)+generic*(1-n/100)
    out['daily14']=average([m[-1] for m in M if m[1]!='imacd'])
    for label,allowed in [('slow_im50',[24,48,72]),('fast_im50',[4,8,12])]:
        block=average([m[-1] for m in M if m[1]=='imacd' and any(m[0].startswith(f'im{tf}h') for tf in allowed)])
        out[label]=.5*block+.5*generic
    w=[.5 if m[0].startswith(('im4h','im8h')) else 1. for m in M]
    out['half_fast']=average([m[-1] for m in M],w)
    alternatives={}
    for label,fn in [('bands',F_keltner),('macd',F_macd),('rsi',F_rsi)]:
        arr,weights=family_members(G,fn);alternatives[label]=average(arr,weights)
        out['replace_'+label]=.72*alternatives[label]+.28*out['daily14']
    out['add_bands20']=.8*out['page']+.2*alternatives['bands']
    out['im35_bands35']=.35*fam['imacd']+.35*alternatives['bands']+.3*generic
    out['five_equal']=average([*fam.values(),alternatives['bands']])
    assert set(out)==set(VARIANTS)
    assert np.allclose(out['im25'],average(list(fam.values())),equal_nan=True)
    for E in out.values():assert np.all((E[np.isfinite(E)]>=-TOL)&(E[np.isfinite(E)]<=1+TOL))
    return out,fam

def confirmed(E,threshold,n):
    if len(E)<n:return np.zeros(len(E),bool)
    weak=E<threshold-TOL;q=weak.copy()
    for k in range(1,n):q &= np.r_[np.zeros(k,bool),weak[:-k]]
    return q&~np.r_[False,q[:-1]]

def build(G):
    B,F=breadths(G);_,_,gates=inputs(G);gate=gates[200];prepared={}
    for v,E in B.items():
        recoveries={'timeout':np.zeros(G.n,bool),'e50':E>.5+TOL,'e60':E>.6+TOL}
        for x,c in itertools.product([.4,.45,.5],[1,3]):
            prepared[(v,x,c)]=dict(event=confirmed(E,x,c)&gate,filters={'none':np.ones(G.n,bool)},recoveries=recoveries)
    return B,F,prepared

def runrule(G,P,name,start,end,**kw):
    r=RULES[name];return execute(G,P[(r['breadth'],r['exit'],r['confirm'])],'none_'+r['recovery'],start,end,**kw)

def run():
    hourly=data();grids=[];rows=[];fixed={};parity=0;correlation={}
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);B,F,P=build(G);grids.append((G,P))
        original=original_features(G)
        for name,old in [(BASE,'none_timeout'),(RECOVERY,'none_e50')]:
            for y in map(str,range(2018,2027)):
                a=runrule(G,P,name,*PERIODS[y],details=True);b=execute(G,original,old,*PERIODS[y],details=True)
                for k in ['btc','btcDD']:assert abs(a[k]-b[k])<1e-9,(phase,y,name,k)
                assert a['ledger']==b['ledger'];parity+=1
        if phase==0:
            for cut in [ts('2020-07-24')+8*3600,ts('2025-02-01')+16*3600]:
                g=Grid(phase,a1h=hourly[hourly[:,0]<cut]);bb,ff,pp=build(g)
                for n in B:assert np.allclose(bb[n],B[n][:g.n],equal_nan=True),(cut,n)
                for n in P:
                    assert np.array_equal(pp[n]['event'],P[n]['event'][:g.n])
                    for r in pp[n]['recoveries']:assert np.array_equal(pp[n]['recoveries'][r],P[n]['recoveries'][r][:g.n])
            for tag,(a,b) in {'train':PERIODS['train'],'2025':PERIODS['2025']}.items():
                sl=slice(G.ix(a),G.ix(b));correlation[tag]=np.corrcoef(np.array(list(F.values()))[:,sl]).tolist()
        for name in RULES:rows.append(dict(name=name,phase=phase,periods={k:runrule(G,P,name,*ab) for k,ab in PERIODS.items()}))
        print('Completed weight phase',phase,flush=True)
    scores={}
    for n in RULES:
        rr=[r for r in rows if r['name']==n]
        parts={k:float(np.quantile([np.log(r['periods'][k]['btc'])/years for r in rr],.25)) for k,years in [('train',2),('2019-21',3),('2015-17',3)]}
        scores[n]=dict(recent=parts['train'],weighted=.6*parts['train']+.3*parts['2019-21']+.1*parts['2015-17'])
    selected={s:max(scores,key=lambda n:scores[n][s]) for s in ['recent','weighted']}
    names=list(dict.fromkeys(CONTROL+list(selected.values())));summary={};details={};stress=[]
    for n in names:
        rr=[r for r in rows if r['name']==n]
        summary[n]={k:dict(base=rr[0]['periods'][k],minimum=min(r['periods'][k]['btc'] for r in rr),
          maximum=max(r['periods'][k]['btc'] for r in rr),above1=sum(r['periods'][k]['btc']>1+1e-9 for r in rr)) for k in PERIODS}
    for phase,(G,P) in zip(PHASES,grids):
        for n in names:
            if phase==0:details[n]={k:runrule(G,P,n,*PERIODS[k],details=True) for k in PERIODS}
            for fee,delay in [(.003,0),(.001,1),(.001,6),(.003,1)]:
                stress.append(dict(name=n,phase=phase,fee=fee,delay=delay,periods={k:runrule(G,P,n,*PERIODS[k],fee=fee,delay=delay) for k in ['2020','2025','2023-25','2015-17','2019-21']}))
    out=dict(rules=RULES,selected=selected,scores=scores,summary=summary,rows=rows,details=details,stress=stress,correlation=correlation,parityChecks=parity)
    (O/'weights-results.json').write_text(json.dumps(out,separators=(',',':')))
    print('SELECTION',selected,'PARITY',parity)
    for n in names:print(n,{k:round(summary[n][k]['base']['btc'],4) for k in ['2019','2020','2021','2023','2024','2025','2023-25','2015-17','2019-21']})

if __name__=='__main__':run()
