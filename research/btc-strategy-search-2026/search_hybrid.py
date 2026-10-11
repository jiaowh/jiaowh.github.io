"""Second exploratory batch after 335 initial rules failed the historical gate.
Explicitly counts additional trials; no claim that this is independent validation.
"""
from search import *

def hybrid_candidates(G):
    h,l,c,e,_=G.daily();n=len(c);P={};M={}
    def spread(v):return np.nan_to_num(G.spread(v,e)).astype(bool)
    ma={n:sma(c,n) for n in [20,50,100,200]}
    bull={n:spread(state(c>ma[n]*1.02,c<ma[n]*.98,2)) for n in [100,200]}
    slope=ma[200]-np.r_[np.full(20,np.nan),ma[200][:-20]]
    bear={'none':np.zeros(G.n,bool),'ma50':spread(c<ma[50]*.98),'ma100':spread(c<ma[100]*.98),
      'ma200':spread(c<ma[200]*.98),'ma200_falling':spread((c<ma[200]*.98)&(slope<0)),
      'death_cross':spread((ma[50]<ma[200])&(c<ma[50])),
      'dd25':spread(c<rolling(c,180)*.75)}
    recovery={'ma20':spread(c>ma[20]*1.02),'ma50':spread(c>ma[50]*1.02),
      'ma200':spread(c>ma[200]*1.02)}
    E=average([m[-1] for m in page_members(G)])
    recovery['ensemble']=E>.6
    change=np.r_[0,np.diff(c)];u=smma(np.maximum(change,0),14);d=smma(np.maximum(-change,0),14)
    rsi=np.divide(u,u+d,out=np.full(n,.5),where=(u+d)>0)*100
    triggers={f'ensemble{x:g}':(E<x)&np.r_[False,E[:-1]>=x] for x in [.2,.3,.4,.5]}
    # Strength reversal: RSI crosses down below an overbought threshold, not simply a high RSI reading.
    triggers.update({f'rsi{x}':spread((rsi<x)&np.r_[False,rsi[:-1]>=x]) for x in [70,80]})
    for trigger,gain,reg,defense,reentry in itertools.product(triggers,[.03,.05,.1,.15],[100,200],bear,['ensemble','ma20']):
        on=True;sale=np.nan;mode='dip';p=np.ones(G.n,bool);S=bull[reg];B=bear[defense];R=recovery[reentry]
        for i in range(1,G.n):
            if not p[i-1] and (i<2 or p[i-2]):sale=G.o[i]
            if on:
                if B[i]:on=False;mode='bear'
                elif S[i] and triggers[trigger][i]:on=False;mode='dip'
            else:
                if B[i]:mode='bear'
                if mode=='bear':
                    if not B[i] and R[i]:on=True
                elif G.c[i]<=sale*.999/1.001/(1+gain) or E[i]>.6:on=True
            p[i]=on
        name=f'{trigger}_gain{gain:g}_bull{reg}_bear{defense}_in{reentry}'
        P[name]=p;M[name]={'family':'hybrid','params':dict(trigger=trigger,gain=gain,bull=reg,bear=defense,reentry=reentry)}
    return P,M

def run():
    G=Grid(0,a1h=data());P,M=hybrid_candidates(G);hold={w:simulate(G,np.ones(G.n,bool),*ab) for w,ab in WINDOWS.items()};rows={}
    for name,p in P.items():rows[name]={w:simulate(G,p,*ab) for w,ab in WINDOWS.items()}
    passing=[n for n in P if passes(rows[n],hold)]
    rank=sorted(P,key=lambda n:min(rows[n][w]['btc'] for w in TARGET),reverse=True)
    result={'count':len(P),'meta':M,'rows':rows,'passing':passing,'rank':rank}
    (O/'hybrid-results.json').write_text(json.dumps(result,indent=1))
    print('Additional configs',len(P),'passing',len(passing),flush=True)
    for name in rank[:18]:print(name,{w:round(rows[name][w]['btc'],4) for w in WINDOWS},'bearDD',[round(rows[name][w]['usdDD'],3) for w in BEARS],flush=True)
    print('PASSING',passing,flush=True)

if __name__=='__main__':run()
