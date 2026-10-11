"""Validate every passing fixed blend; retain every sensitivity result."""
from search_blend import *

def run():
    search=json.loads((O/'blend-results.json').read_text());chosen=search['passing'];meta=search['meta'];hourly=data();out=[];detail={};prefix=[]
    for phase in [0,3,6,9,12,15,18,21]:
        G=Grid(phase,a1h=hourly);P,M=candidates(G);H,HM=hybrid_candidates(G);P.update(H)
        names=set([meta[n]['dip'] for n in chosen]+[meta[n]['defense'] for n in chosen]+['hold'])
        if phase==0:
            for cut,hour in [('2021-04-01',0),('2024-08-01',8),('2025-02-01',16)]:
                g=Grid(0,a1h=hourly[hourly[:,0]<ts(cut)+hour*3600]);p,_=candidates(g);h,_=hybrid_candidates(g);p.update(h)
                assert all(np.array_equal(p[n],P[n][:g.n]) for n in names)
                prefix.append(f'{cut} {hour:02}:00')
        for cost,lag in [(0.001,0),(.003,0),(.006,0),(.001,1),(.001,6)]:
            cache={n:{w:simulate(G,P[n],*ab,fee=cost,lag=lag,paths=True,details=phase==0 and cost==.001 and lag==0) for w,ab in WINDOWS.items()} for n in names}
            for name in chosen:
                m=meta[name];rows={w:blend(cache[m['dip']][w],cache[m['defense']][w],m['weight']) for w in WINDOWS}
                out.append({'name':name,'phase':phase,'cost':cost,'lag':lag,'pass':passes(rows,cache['hold']),'rows':rows})
                if phase==0 and cost==.001 and lag==0:
                    detail[name]={}
                    for w,(a,b) in WINDOWS.items():
                        ra=cache[m['dip']][w];rb=cache[m['defense']][w]
                        q=blend(ra,rb,m['weight'],paths=True);aidx=G.ix(a);ix=sorted(set([*range(0,len(q['btcPath']),6),len(q['btcPath'])-1]))
                        q['curve']=[[int(G.real[aidx+i]+14400),float(q['btcPath'][i]),float(q['usdPath'][i])] for i in ix]
                        q.pop('btcPath');q.pop('usdPath')
                        q['fills']=[{**f,'btc':f['btc']*weight,'account':acc} for acc,r,weight in [('dip',ra,m['weight']),('defense',rb,1-m['weight'])] for f in r['fills']]
                        detail[name][w]=q
        print('Validated phase',phase,flush=True)
    summary={}
    for n in chosen:
        summary[n]={}
        for cost,lag in [(0.001,0),(.003,0),(.006,0),(.001,1),(.001,6)]:
            rr=[r for r in out if r['name']==n and r['cost']==cost and r['lag']==lag]
            summary[n][f'{cost}/{lag}']={'passes':sum(r['pass'] for r in rr),'windows':{w:{'mean':float(np.mean([r['rows'][w]['btc'] for r in rr])),
              'min':min(r['rows'][w]['btc'] for r in rr),'max':max(r['rows'][w]['btc'] for r in rr),'wins':sum(r['rows'][w]['btc']>1 for r in rr)} for w in WINDOWS}}
    result={'summary':summary,'rows':out,'detail':detail,'prefixChecks':prefix}
    (O/'validation-results.json').write_text(json.dumps(result,indent=1))
    for n in chosen:
        print(n,flush=True)
        for k,v in summary[n].items():print(k,'completepasses',v['passes'],'bullranges',[(w,round(v['windows'][w]['mean'],4),round(v['windows'][w]['min'],4),v['windows'][w]['wins']) for w in BULLS],flush=True)

if __name__=='__main__':run()
