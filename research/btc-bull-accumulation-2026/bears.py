"""Fixed selected bull overlay applied outside its intended windows, versus cash.

Each bear starts with fresh 1 BTC. Cash benchmark sells at the first open and
remains in dollars; its ending BTC equivalent includes the hypothetical buy fee.
No calendar retuning or extra bear-specific signal has been added.
"""
from bull import *
NAME='e20_ma200_gain0.05_trend'
BEARS={'2014':('2014-01-01','2015-01-01'),'2018':('2018-01-01','2019-01-01'),
 '2022':('2022-01-01','2023-01-01'),'2026 through Oct 9':('2026-01-01','2026-10-10')}

def run():
    hourly=data();rows=[];details={};combined={}
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);I=inputs(G)
        for w,(a,b) in BEARS.items():
            start=int(np.searchsorted(G.real,ts(a)));end=int(np.searchsorted(G.real,ts(b)))
            price=G.o[start];last=G.c[end-1];fee=.001
            r=replay(G,I,NAME,a,b,details=phase==0)
            if phase==0:details[w]=r
            h=np.r_[price,G.c[start:end]]
            hold={'btc':1.,'usdReturn':float(last/price-1),'usdDD':float(np.min(h/np.maximum.accumulate(h)-1))}
            dollars=price*(1-fee);cashq=dollars/(last*(1+fee))
            cash={'btcEquivalent':float(cashq),'actualBTC':0.,'cash':float(dollars),'usdReturn':-fee,'usdDD':-fee}
            rows.append({'window':w,'phase':phase,'startPrice':float(price),'lastPrice':float(last),
              'overlay':{**{k:v for k,v in r.items() if k not in ['fills','pairs','curve']},
                'usdReturn':float((r['units']*last+r['cash'])/price-1)},'hold':hold,'calendarCash':cash})
            if phase==0 and w!='2014':
                # Carry the actual end-of-bull units/cash into the calendar exit.
                # If already cash, do not invent another sell or duplicate its fees.
                y=int(a[:4]);bull=replay(G,I,NAME,f'{y-3}-01-01',a)
                carryCash=bull['cash']+bull['units']*price*(1-fee)
                combined[w]={'bullStart':f'{y-3}-01-01','endingBTCEquivalent':float(carryCash/(last*(1+fee))),
                  'actualBTC':0.,'cash':float(carryCash),'bullEndingUnits':bull['units'],'bullEndingCash':bull['cash']}
    summary={w:{'base':next(r for r in rows if r['window']==w and r['phase']==0),
      'overlayRange':{'min':min(r['overlay']['btc'] for r in rows if r['window']==w),
      'max':max(r['overlay']['btc'] for r in rows if r['window']==w),
      'above1':sum(r['overlay']['btc']>1+1e-9 for r in rows if r['window']==w)}} for w in BEARS}
    out={'model':NAME,'feeEachSide':.001,'cutoffExclusive':'2026-10-10T00:00:00Z','summary':summary,
      'combinedBullThenCash':combined,'rows':rows,'details':details}
    (O/'bear-results.json').write_text(json.dumps(out,indent=1))
    for w,s in summary.items():
        r=s['base'];print(w,json.dumps({'overlayBTC':r['overlay']['btc'],'overlayUSDreturn':r['overlay']['usdReturn'],
          'overlayUSDdd':r['overlay']['usdDD'],'roundTrips':r['overlay']['roundTrips'],'cashBTCeq':r['calendarCash']['btcEquivalent'],
          'holdUSDreturn':r['hold']['usdReturn'],'holdUSDdd':r['hold']['usdDD'],'alignment':s['overlayRange']}))
    print('Combined:',json.dumps(combined))

if __name__=='__main__':run()
