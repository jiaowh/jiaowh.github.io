from pathlib import Path
import sys,json,itertools,hashlib,csv
import numpy as np
sys.dont_write_bytecode=True
O=Path(__file__).resolve().parent;ROOT=O.parents[1]
sys.path.insert(0,str(ROOT/'research/btc-timeframe-weights-2026'))
import evaluate as base
W=[1,1,1,1,1,2];TOL=1e-12;PERIODS=base.PERIODS

def lag(x,n):return np.r_[np.full(n,np.nan),x[:-n]]
def ema(x,n):
 out=np.full(len(x),np.nan);prev=np.nan
 for i,v in enumerate(x):
  if np.isfinite(v):prev=v if not np.isfinite(prev) else prev+2/(n+1)*(v-prev);out[i]=prev
 return out
def count(x,n):return np.convolve(x.astype(int),np.ones(n,int),'full')[:len(x)]
def fresh(x):return x&~np.r_[False,x[:-1]]
def features(G,parts):
 E,I=base.prepare(parts,W);event=I['event'];rec=E>.5+TOL;gate=parts[2]
 D={n:E-lag(E,n) for n in [3,6,12]};one=E-lag(E,1);out={};meta={}
 def add(name,sell,buy,category,description):
  out[name]={'event':sell,'filters':{'none':np.ones(G.n,bool)},'recoveries':{'e50':buy}}
  meta[name]={'category':category,'description':description,'complexity':0 if name=='current' else 2 if category=='combined' else 1}
 add('current',event,rec,'baseline','Current weighted breadth rule')
 sell={};buy={}
 for n,pp in itertools.product([3,6,12],[0,5,10]):sell[f'slope{n}_{pp}']=D[n]<-pp/100-TOL
 for n in [3,6]:sell[f'accel{n}']=(D[n]<-TOL)&(D[n]-lag(D[n],n)<-TOL)
 for n,k in [(3,2),(6,4)]:sell[f'persistent{n}']=count(one<-TOL,n)>=k
 for a,b in [(3,12),(6,24)]:sell[f'ema{a}_{b}']=ema(E,a)<ema(E,b)-TOL
 for n,pp in itertools.product([6,12,42],[10,20]):sell[f'peak{n}_{pp}']=np.maximum.reduce([E,*[lag(E,k) for k in range(1,n)]])-E>=pp/100-TOL
 for name,test in sell.items():add('sell_'+name,event&test,rec,'sell','Filter original sale: '+name)
 for n,ceiling,drop in itertools.product([6,12],[.6,.65],[.1,.2]):
  condition=(E>=.5-TOL)&(E<ceiling-TOL)&(D[n]<=-drop+TOL);two=condition&np.r_[False,condition[:-1]]
  add(f'early_sell_{n}_{int(ceiling*100)}_{int(drop*100)}',event|(fresh(two)&gate),rec,'sell','Extra two-close early sale above 50%')
 for n,pp in itertools.product([3,6,12],[0,5]):buy[f'slope{n}_{pp}']=rec&(D[n]>pp/100+TOL)
 for n,k in [(3,2),(6,4)]:buy[f'persistent{n}']=rec&(count(one>TOL,n)>=k)
 for a,b in [(3,12),(6,24)]:buy[f'ema{a}_{b}']=rec&(ema(E,a)>ema(E,b)+TOL)
 for n in [3,6]:buy[f'accel{n}']=rec&(D[n]>TOL)&(D[n]-lag(D[n],n)>TOL)
 for n,pp in itertools.product([3,6,12],[10,15]):buy[f'early{n}_{pp}']=rec|((E>.4+TOL)&(D[n]>pp/100+TOL))
 for name,test in buy.items():add('buy_'+name,event,test,'recovery','Recovery condition: '+name)
 for a,b in itertools.product(['slope6_0','ema3_12','peak12_20'],['slope6_0','ema3_12','early6_10']):add('both_'+a+'_'+b,event&sell[a],buy[b],'combined',a+' sale / '+b+' recovery')
 assert len(out)==57,len(out)
 return E,out,meta

def independent(G,I,start,end):
 a,z=G.ix(start),G.ix(end);q=1.;cash=0.;sale=0.;saleTime=0;pending=None;ledger=[]
 for i in range(a,z):
  if pending:
   side,reason,decision=pending;price=float(G.o[i]);t={'side':side,'time':int(G.real[i]),'decision':decision,'price':price,'reason':reason}
   if side=='sell':t['unitsBefore']=q;cash=q*price*.999;q=0;sale=price;saleTime=G.real[i]
   else:q=cash/(price*1.001);cash=0;t['unitsAfter']=q
   ledger.append(t);pending=None
  if q>0:
   if I['event'][i]:pending=('sell','none',int(G.real[i]+14400))
  else:
   target=G.c[i]<=sale*.999/(1.001*1.1);recovery=I['recoveries']['e50'][i];timeout=G.real[i]+14400-saleTime>=7*86400
   if target or recovery or timeout:pending=('buy','target' if target else 'recovery' if recovery else 'timeout',int(G.real[i]+14400))
 return ledger,q+cash/(G.c[z-1]*1.001)

def diagnostic(G,E,gate):
 d=E-lag(E,6);out=[]
 for title,(start,end) in {'2018-22':('2018-01-01','2023-01-01'),'2023-24':('2023-01-01','2025-01-01'),'2025-26':('2025-01-01','2026-10-10')}.items():
  a,z=G.ix(start),G.ix(end)
  for regime in ['all','bullish']:
   for label in ['falling','flat','rising']:
    values=[]
    for i in range(a,z-42,6):
     if not (.45-TOL<=E[i]<=.55+TOL) or (regime=='bullish' and not gate[i]):continue
     group='falling' if d[i]<-.05-TOL else 'rising' if d[i]>.05+TOL else 'flat'
     if group!=label or G.real[i+42]-G.real[i]!=42*14400:continue
     entry=G.o[i+1];values.append((G.c[i+6]/entry-1,G.c[i+42]/entry-1,float(min(G.l[i+1:i+43])/entry-1<=-.1)))
    arr=np.array(values);out.append({'period':title,'regime':regime,'momentum':label,'n':len(values),'mean24h':float(arr[:,0].mean()) if len(arr) else None,'median24h':float(np.median(arr[:,0])) if len(arr) else None,'mean7d':float(arr[:,1].mean()) if len(arr) else None,'drop10rate':float(arr[:,2].mean()) if len(arr) else None})
 return out

def main():
 hourly=base.data();hourly=hourly[hourly[:,0]<base.ts('2026-10-10')]
 prior=json.loads((ROOT/'research/btc-timeframe-weights-2026/summary.json').read_text())
 assert hashlib.sha256(hourly.tobytes()).hexdigest()==prior['audit']['sha256']
 grids=[];results={};parity=0
 for phase in base.PHASES:
  G=base.Grid(phase,a1h=hourly);parts=base.components(G);E,rules,meta=features(G,parts);grids.append((G,parts,E,rules))
  for n,I in rules.items():results.setdefault(n,[]).append({'phase':phase,'periods':{k:base.execute(G,I,'none_e50',*ab) for k,ab in PERIODS.items()}})
  print('Completed',phase,'57 rules',flush=True)
 scores={n:{'score':float(np.quantile([np.log(r['periods']['train']['btc'])/2 for r in rr],.25)),'eligible':min(r['periods']['train']['roundTrips'] for r in rr)>=5} for n,rr in results.items()}
 def rank(names):return sorted([n for n in names if scores[n]['eligible']],key=lambda n:(-scores[n]['score'],meta[n]['complexity'],n))
 selected={'overall':rank(results)[0],'sell':rank([n for n in results if meta[n]['category'] in ['baseline','sell']])[0],'recovery':rank([n for n in results if meta[n]['category'] in ['baseline','recovery']])[0]}
 names=list(dict.fromkeys(['current',*selected.values(),'sell_slope6_0','buy_slope6_0','early_sell_6_65_10','buy_early6_10']))
 details={};stress=[];independentChecks=0;prefix=0
 for n in names:
  G,parts,E,rules=grids[0];I=rules[n];details[n]={}
  for k,ab in PERIODS.items():
   r=base.execute(G,I,'none_e50',*ab,details=True);base.validate_ledger(G,r,k,.001)
   ledger,btc=independent(G,I,*ab);assert ledger==r['ledger'],(n,k);assert abs(btc-r['btc'])<1e-9;independentChecks+=1;details[n][k]=r
   if n=='current':assert r['ledger']==prior['details'][prior['selected']['recent']][k]['ledger'];parity+=1
  for phase,(G,parts,E,rules) in zip(base.PHASES,grids):
   for fee,delay in [(.003,0),(.001,1),(.003,1),(.001,6)]:stress.append({'name':n,'phase':phase,'fee':fee,'delay':delay,'periods':{k:base.execute(G,rules[n],'none_e50',*PERIODS[k],fee=fee,delay=delay) for k in ['2020-21','2023-25','2025','2026','2025-26']}})
 for cut in [base.ts('2020-07-24')+8*3600,base.ts('2025-02-01')+16*3600]:
  G=base.Grid(0,a1h=hourly[hourly[:,0]<cut]);parts=base.components(G);E,rules,_=features(G,parts)
  for n,I in rules.items():
   original=grids[0][3][n];assert np.array_equal(I['event'],original['event'][:G.n]);assert np.array_equal(I['recoveries']['e50'],original['recoveries']['e50'][:G.n]);prefix+=1
 promotion={}
 for label,n in selected.items():
  val=lambda rule,k:[r['periods'][k]['btc'] for r in results[rule]]
  cost=lambda rule:[r['periods']['2023-25']['btc'] for r in stress if r['name']==rule and r['fee']==.003 and r['delay']==0]
  checks={'recent6of8':sum(a>b+1e-9 for a,b in zip(val(n,'2023-25'),val('current','2023-25')))>=6,'recentWorstNotWorse':min(val(n,'2023-25'))>=min(val('current','2023-25'))-1e-9,'olderAllAbove1':min(val(n,'2020-21'))>1,'highFee6of8':sum(a>b+1e-9 for a,b in zip(cost(n),cost('current')))>=6}
  promotion[label]={'checks':checks,'passed':all(checks.values())}
 G,parts,E,rules=grids[0]
 out={'count':len(results),'selected':selected,'scores':scores,'metadata':meta,'periods':PERIODS,'results':results,'details':details,'stress':stress,'diagnostic':diagnostic(G,E,parts[2]),'promotion':promotion,'parityChecks':parity,'prefixChecks':prefix,'independentLedgers':independentChecks,'audit':prior['audit']}
 (O/'summary.json').write_text(json.dumps(out,separators=(',',':')))
 # Plot data is historical, for inspection only; next-open markers use ledger times.
 with (O/'chart-data.csv').open('w',newline='') as f:
  writer=csv.writer(f);writer.writerow(['time','close','breadth','change24h','gate']);delta=E-lag(E,6)
  for i in range(G.n):
   if G.real[i]>=base.ts('2023-01-01'):writer.writerow([int(G.real[i]),G.c[i],E[i],delta[i],int(parts[2][i])])
 with (O/'candidates.csv').open('w',newline='') as f:
  fields=['name','category','score','eligible',*PERIODS,'recentPhaseWins','recentPhaseMin'];writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
  for n in rank(results)+sorted(n for n in results if not scores[n]['eligible']):writer.writerow({'name':n,'category':meta[n]['category'],**scores[n],**{k:results[n][0]['periods'][k]['btc'] for k in PERIODS},'recentPhaseWins':sum(r['periods']['2023-25']['btc']>b['periods']['2023-25']['btc']+1e-9 for r,b in zip(results[n],results['current'])),'recentPhaseMin':min(r['periods']['2023-25']['btc'] for r in results[n])})
 with (O/'trades.csv').open('w',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=['rule','period','side','time','decision','price','unitsBefore','unitsAfter','reason']);writer.writeheader()
  for n,periods in details.items():
   for k,r in periods.items():
    for t in r['ledger']:writer.writerow({'rule':n,'period':k,**t})
 print('SELECTED',selected,'PROMOTION',promotion,flush=True)
 for n in names:print(n,{k:round(details[n][k]['btc'],4) for k in ['2020-21','2023-25','2025','2026','2025-26']},flush=True)
if __name__=='__main__':main()
