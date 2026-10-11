"""Third exploratory batch: fixed independent allocations, no calendar regime oracle."""
from search_hybrid import *
DEFENSE=['ensemble0.6_0.4','ensemble0.6_0.5','ensemble0.5_0.4','sma50_band0_confirm1','sma100_band0.02_confirm1']
WEIGHTS=[1/3,.5,2/3]

def blend(a,b,w,paths=False):
    btc=w*a['btcPath']+(1-w)*b['btcPath'];usd=w*a['usdPath']+(1-w)*b['usdPath']
    bp=np.r_[1,btc];up=np.r_[1,usd]
    r={'btc':float(btc[-1]),'usdDD':float(np.min(up/np.maximum.accumulate(up)-1)),
      'btcDD':float(np.min(bp/np.maximum.accumulate(bp)-1)),
      'usdReturn':float(usd[-1]-1),'trades':a['trades']+b['trades'],
      'units':w*a['units']+(1-w)*b['units'],'cash':w*a['cash']+(1-w)*b['cash'],
      'lastPrice':a['lastPrice']}
    if paths:r.update(btcPath=btc,usdPath=usd)
    return r

def run():
    G=Grid(0,a1h=data());P,M=candidates(G);H,HM=hybrid_candidates(G)
    dip=[n for n in H if '_bearnone_inensemble' in n and n.startswith('ensemble')]
    rows={};meta={};cache={}
    for n in ['hold']+DEFENSE+dip:
        p=P[n] if n in P else H[n]
        cache[n]={win:simulate(G,p,*ab,paths=True) for win,ab in WINDOWS.items()}
    for a,b,w in itertools.product(dip,DEFENSE,WEIGHTS):
        name=f'{a}__{b}__w{w:.4f}'
        rows[name]={win:blend(cache[a][win],cache[b][win],w) for win in WINDOWS}
        meta[name]={'family':'blend','dip':a,'defense':b,'weight':w}
    passing=[n for n in rows if passes(rows[n],cache['hold'])]
    rank=sorted(rows,key=lambda n:min(rows[n][w]['btc'] for w in TARGET),reverse=True)
    result={'count':len(rows),'meta':meta,'rows':rows,'passing':passing,'rank':rank}
    (O/'blend-results.json').write_text(json.dumps(result,indent=1))
    print('Additional blends',len(rows),'passing',len(passing),flush=True)
    top=sorted(passing,key=lambda n:min(rows[n][w]['btc'] for w in BULLS),reverse=True)
    for name in top[:15]:print(name,{w:round(rows[name][w]['btc'],4) for w in WINDOWS},'bearDD',[round(rows[name][w]['usdDD'],3) for w in BEARS],flush=True)

if __name__=='__main__':run()
