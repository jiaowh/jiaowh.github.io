"""128 bounded parameter/mixture trials; read IMACD_PROTOCOL.md first."""
from weights import confirmed, TOL
from bull import *
from core import m_imacd, ema, PAGE_TF
from confidence import sim as execute, features as original_features, PERIODS
from r25_indicator_screen import family_members, F_macd

LENGTHS={'fast':[14,21,34],'nearfast':[18,30,48],'original':[21,34,55],
         'nearslow':[24,40,64],'slow':[34,55,89]}
DEFS={f'{length}_s{s}_im{p}':dict(length=length,signal=s,im=p,kind='pure' if p==100 else 'mix')
      for length,s,p in itertools.product(LENGTHS,[5,9,13],[100,75,50,25])}
DEFS.update({n:dict(kind='macd' if n.startswith('macd') else 'swap')
             for n in ['macd_scaled','macd_classic','imzero_macross','mazero_imcross']})
RULES={f'{v}_{r}':dict(breadth=v,recovery=r,**d) for v,d in DEFS.items() for r in ['timeout','e50']}
BASE='original_s9_im100_timeout';RECOVERY='original_s9_im100_e50'
CONTROL=[BASE,RECOVERY,'original_s9_im50_timeout','original_s9_im50_e50',
         'macd_scaled_timeout','macd_classic_timeout','imzero_macross_timeout','mazero_imcross_timeout']

def macd_slots(G,classic=False):
    out=[[],[]]
    for tf,n in itertools.product(PAGE_TF,[26] if classic else LENGTHS['original']):
        h,l,c,e,_=G.group(tf*3600);fast=12 if classic else max(2,round(n*12/26))
        line=ema(c,fast)-ema(c,n);signal=ema(line,9)
        for mode,v in enumerate([line>0,line>signal]):
            v=v.astype(float);v[:n+9]=np.nan;out[mode].append(G.spread(v,e))
    return [average(v) for v in out]

def breadths(G):
    M=page_members(G);daily=average([m[-1] for m in M if m[1]!='imacd'])
    ma=macd_slots(G);mac=average(ma);out={};slots={}
    for length,s in itertools.product(LENGTHS,[5,9,13]):
        imslots=[average([m_imacd(G,tf,n,mode,s) for tf,n in itertools.product(PAGE_TF,LENGTHS[length])])
                 for mode in ['zero','state']]
        slots[(length,s)]=imslots;im=average(imslots)
        for p in [100,75,50,25]:
            block=im if p==100 else im*(p/100)+mac*(1-p/100)
            out[f'{length}_s{s}_im{p}']=.72*block+.28*daily
    im=slots[('original',9)]
    out['macd_scaled']=.72*mac+.28*daily
    out['macd_classic']=.72*average(macd_slots(G,True))+.28*daily
    out['imzero_macross']=.36*im[0]+.36*ma[1]+.28*daily
    out['mazero_imcross']=.36*ma[0]+.36*im[1]+.28*daily
    assert set(out)==set(DEFS)
    assert np.allclose(out['original_s9_im100'],average([m[-1] for m in M]),equal_nan=True)
    a,w=family_members(G,F_macd)
    assert np.allclose(out['macd_scaled'],.72*average(a,w)+.28*daily,equal_nan=True)
    return out

def build(G):
    B=breadths(G);_,_,gates=inputs(G)
    return B,{v:dict(event=confirmed(E,.5,3)&gates[200],filters={'none':np.ones(G.n,bool)},
                     recoveries={'timeout':np.zeros(G.n,bool),'e50':E>.5+TOL}) for v,E in B.items()}

def runrule(G,P,name,start,end,**kw):
    r=RULES[name];return execute(G,P[r['breadth']],'none_'+r['recovery'],start,end,**kw)

def run():
    hourly=data();grids=[];rows=[];parity=0;prefix=0
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);B,P=build(G);grids.append((G,P));original=original_features(G)
        for name,old in [(BASE,'none_timeout'),(RECOVERY,'none_e50')]:
            for y in map(str,range(2018,2027)):
                a=runrule(G,P,name,*PERIODS[y],details=True);b=execute(G,original,old,*PERIODS[y],details=True)
                for k in ['btc','btcDD']:assert abs(a[k]-b[k])<1e-9,(phase,y,name,k)
                assert a['ledger']==b['ledger'];parity+=1
        if phase==0:
            for cut in [ts('2020-07-24')+8*3600,ts('2025-02-01')+16*3600]:
                g=Grid(phase,a1h=hourly[hourly[:,0]<cut]);bb,pp=build(g)
                for n in B:
                    assert np.allclose(bb[n],B[n][:g.n],equal_nan=True),(cut,n)
                    assert np.array_equal(pp[n]['event'],P[n]['event'][:g.n])
                    for r in pp[n]['recoveries']:assert np.array_equal(pp[n]['recoveries'][r],P[n]['recoveries'][r][:g.n])
                    prefix+=1
        for name in RULES:
            rows.append(dict(name=name,phase=phase,periods={k:runrule(G,P,name,*ab) for k,ab in PERIODS.items()}))
        print('Completed iMACD phase',phase,flush=True)
    scores={}
    for n in RULES:
        rr=[r for r in rows if r['name']==n]
        parts={k:float(np.quantile([np.log(r['periods'][k]['btc'])/years for r in rr],.25))
               for k,years in [('train',2),('2019-21',3),('2015-17',3)]}
        scores[n]=dict(recent=parts['train'],weighted=.6*parts['train']+.3*parts['2019-21']+.1*parts['2015-17'])
    selected={s:max(scores,key=lambda n:scores[n][s]) for s in ['recent','weighted']}
    subgroups={f'{kind}_{s}':max([n for n in scores if RULES[n]['kind']==kind],key=lambda n:scores[n][s])
               for kind,s in itertools.product(['pure','mix','swap'],['recent','weighted'])}
    names=list(dict.fromkeys(CONTROL+list(selected.values())+list(subgroups.values())))
    details={};stress=[]
    for phase,(G,P) in zip(PHASES,grids):
        for n in names:
            if phase==0:details[n]={k:runrule(G,P,n,*PERIODS[k],details=True) for k in PERIODS}
            for fee,delay in [(.003,0),(.001,1),(.001,6),(.003,1)]:
                stress.append(dict(name=n,phase=phase,fee=fee,delay=delay,periods={k:runrule(G,P,n,*PERIODS[k],fee=fee,delay=delay)
                    for k in ['2020','2025','2023-25','2015-17','2019-21']}))
    out=dict(rules=RULES,selected=selected,subgroups=subgroups,scores=scores,rows=rows,details=details,stress=stress,
             parityChecks=parity,prefixChecks=prefix)
    (O/'imacd-results.json').write_text(json.dumps(out,separators=(',',':')))
    print('SELECTION',selected,'SUBGROUPS',subgroups,'PARITY',parity,'PREFIX',prefix)
    for n in names:
        print(n,{k:round(details[n][k]['btc'],4) for k in ['2019','2020','2021','2023','2024','2025','2023-25','2015-17','2019-21']})

if __name__=='__main__':run()
