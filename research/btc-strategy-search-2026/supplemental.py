"""Annual parameter selection and start-date sensitivity for the frozen search grid."""
from search_blend import *
from search_mvrv import mvrv_candidates

def run():
    G=Grid(0,a1h=data());P,M=candidates(G);H,HM=hybrid_candidates(G);V,VM=mvrv_candidates(G)
    P.update(H);P.update(V);M.update(HM);M.update(VM)
    blend_search=json.loads((O/'blend-results.json').read_text());BM=blend_search['meta']
    names=list(P)+list(BM);annual={n:{} for n in names}
    components=set([x['dip'] for x in BM.values()]+[x['defense'] for x in BM.values()])
    for year in range(2015,2027):
        a=f'{year}-01-01';b=END if year==2026 else f'{year+1}-01-01';cache={}
        for name,p in P.items():
            r=simulate(G,p,a,b,paths=name in components)
            if name in components:cache[name]=r
            annual[name][str(year)]={k:v for k,v in r.items() if k not in ['btcPath','usdPath']}
        for name,m in BM.items():annual[name][str(year)]=blend(cache[m['dip']],cache[m['defense']],m['weight'])
        print('Annual paths',year,flush=True)
    # Freeze the selection rule before computing its outputs: choose the highest
    # worst annual BTC multiple over the preceding four complete years. Ties use
    # geometric BTC growth, then fewer trades. Holding is an eligible candidate.
    choices=[];balance=1.
    for year in range(2019,2027):
        history=[str(y) for y in range(year-4,year)]
        def score(n):
            rr=[annual[n][y] for y in history]
            return (round(min(x['btc'] for x in rr),9),round(sum(np.log(x['btc']) for x in rr),9),-sum(x['trades'] for x in rr))
        name=max(names,key=score);r=annual[name][str(year)]
        end_open=G.o[G.ix(f'{year+1}-01-01')] if year<2026 else r['lastPrice']
        # Annual rotation physically converts residual cash to BTC at the next
        # January open before reallocating; costs of the new initial sale follow.
        multiple=r['units']+r['cash']/(end_open*1.001);balance*=multiple
        choices.append({'year':year,'name':name,'trainingWorstBTC':score(name)[0],
          'btc':multiple,'usdDD':r['usdDD'],'cumulativeBTC':balance})
    rolling={};yearly={}
    for name in blend_search['passing']:
        m=BM[name];rr=[]
        for year in range(2019,2026):
            for month in range(1,13):
                a=f'{year}-{month:02}-01';b=f'{year+1}-{month:02}-01'
                if ts(b)>ts(END):continue
                r=blend(simulate(G,P[m['dip']],a,b,paths=True),simulate(G,P[m['defense']],a,b,paths=True),m['weight'])
                rr.append({'start':a,'btc':r['btc'],'usdDD':r['usdDD']})
        rolling[name]={'wins':sum(r['btc']>1+1e-9 for r in rr),'total':len(rr),'median':float(np.median([r['btc'] for r in rr])),
          'worst':min(r['btc'] for r in rr),'rows':rr}
        yearly[name]={y:r for y,r in annual[name].items() if int(y)>=2019}
    result={'annual':annual,'choices':choices,'rolling':rolling,'selectedAnnual':yearly,
      'selection':'Highest minimum annual BTC over previous four complete years; geometric growth then fewer trades break ties; hold eligible.',
      'cumulativeBTC':balance}
    (O/'supplemental-results.json').write_text(json.dumps(result,indent=1))
    print('FORWARD CHRONOLOGICAL SELECTION',json.dumps(choices,indent=1),flush=True)
    print('Combined BTC',balance,flush=True)
    print('Rolling',[(n,v['wins'],v['median'],v['worst']) for n,v in rolling.items()],flush=True)

if __name__=='__main__':run()
