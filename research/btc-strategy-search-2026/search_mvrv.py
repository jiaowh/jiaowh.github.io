"""Fourth exploratory batch: delayed on-chain valuation plus price confirmation."""
from search import *
import csv

def mvrv_series():
    out={r['date'][:10]:float(r['CapMVRVCur']) for r in csv.DictReader(open(ROOT.parent/'quant/research_notes/ensemble_v2/ext/cm.csv')) if r['CapMVRVCur']}
    ext=json.loads((O/'mvrv-extension.json').read_text())
    for r in ext['data']:
        if r.get('CapMVRVCur'):out[r['time'][:10]]=float(r['CapMVRVCur'])
    return sorted(out.items())

def mvrv_candidates(G,release_days=2):
    series=mvrv_series();times=np.array([ts(d)+release_days*86400 for d,v in series]);values=np.array([v for d,v in series]);h,l,c,e,_=G.daily()
    ix=np.searchsorted(times,G.real[e]+14400,side='right')-1
    v=np.where(ix>=0,values[np.maximum(ix,0)],np.nan);n=len(v)
    ma={k:sma(c,k) for k in [20,50,200]};v200=sma(v,200);slope=ma[200]-np.r_[np.full(20,np.nan),ma[200][:-20]]
    B={'none':np.zeros(n,bool),'falling200':(c<ma[200])&(slope<0),
      'mvrv200':(v<v200)&(c<ma[50])}
    hot=rolling(v,90);P={};M={}
    def add(name,p,params):
        P[name]=np.nan_to_num(G.spread(p,e),nan=1).astype(bool);M[name]={'family':'mvrv','params':params}
    for high,low,exit_,entry,bear in itertools.product([2,2.5,3,3.5],[1,1.5,2],['instant','weak20','weak50'],['valuation','ma20'],B):
        if low>=high:continue
        sell=(v>high) if exit_=='instant' else (hot>high)&(c<ma[int(exit_[4:])])
        on=True;mode='value';p=np.ones(n,bool)
        for i in range(n):
            if on:
                if B[bear][i]:on=False;mode='bear'
                elif sell[i]:on=False;mode='value'
            else:
                if B[bear][i]:mode='bear'
                if mode=='bear':
                    if not B[bear][i] and c[i]>ma[50][i]:on=True
                elif v[i]<low or (entry=='ma20' and v[i]<high and c[i]>ma[20][i]):on=True
            p[i]=on
        name=f'mvrv{high:g}_{low:g}_{exit_}_in{entry}_bear{bear}'
        add(name,p,dict(high=high,low=low,exit=exit_,entry=entry,bear=bear,releaseDays=release_days))
    for N,b,k in itertools.product([20,50,100,200],[0,.05,.1],[1,2]):
        mv=sma(v,N);name=f'mvrv_ma{N}_band{b:g}_confirm{k}'
        add(name,state(v>mv*(1+b),v<mv*(1-b),k),dict(n=N,band=b,confirm=k,releaseDays=release_days))
    return P,M

def run():
    G=Grid(0,a1h=data());P,M=mvrv_candidates(G);hold={w:simulate(G,np.ones(G.n,bool),*ab) for w,ab in WINDOWS.items()};rows={}
    for name,p in P.items():rows[name]={w:simulate(G,p,*ab) for w,ab in WINDOWS.items()}
    passing=[n for n in P if passes(rows[n],hold)]
    rank=sorted(P,key=lambda n:min(rows[n][w]['btc'] for w in TARGET),reverse=True)
    result={'count':len(P),'meta':M,'rows':rows,'passing':passing,'rank':rank}
    (O/'mvrv-results.json').write_text(json.dumps(result,indent=1))
    print('Additional on-chain configs',len(P),'passing',len(passing),flush=True)
    for name in rank[:15]:print(name,{w:round(rows[name][w]['btc'],4) for w in WINDOWS},'bearDD',[round(rows[name][w]['usdDD'],3) for w in BEARS],flush=True)
    print('PASSING',passing,flush=True)

if __name__=='__main__':run()
