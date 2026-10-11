"""Auditable yearly trade overlays: fixed recent-weighted rule, 2018–2026."""
from bull import *
from datetime import datetime,timezone
import csv
NAME='e50_ma200_gain0.1_time14';FEE=.001;END='2026-10-10'

def simulate(G,I,start,end,calendar=False,confirm=1,timeout=14):
    E,tr,gate=I;a=G.ix(start);z=G.ix(end);units=1.;cash=0.;pending=None;sale=0.;sold=0
    fills=[];curve=[];years={};prevyear=None
    below=E<.5;weak=below.copy()
    for k in range(1,confirm):weak &= np.r_[np.zeros(k,bool),below[:-k]]
    event=weak&~np.r_[False,weak[:-1]]
    def fill(i,side,reason,decision):
        nonlocal units,cash,sale,sold
        before=units;beforecash=cash;price=float(G.o[i])
        if side=='sell':
            fee=units*price*FEE;cash=units*price-fee;quantity=units;units=0.;sale=price;sold=G.real[i]
        else:
            units=cash/(price*(1+FEE));quantity=units;fee=units*price*FEE;cash=0.
        f={'id':len(fills)+1,'time':int(G.real[i]),'decision':int(decision),'side':side,'price':price,
          'qty':float(quantity),'fee':float(fee),'unitsBefore':float(before),'cashBefore':float(beforecash),
          'unitsAfter':float(units),'cashAfter':float(cash),'reason':reason}
        fills.append(f)
        assert abs(before*price+beforecash-(units*price+cash)-fee)<1e-6
    curve.append([int(G.real[a]),1.])
    for i in range(a,z):
        y=int(G.year[i]);t=G.real[i];first=y!=prevyear
        if first:
            years[str(y)]={'startTime':int(t),'startBTC':float(units+cash/(G.o[i]*(1+FEE))),
              'startUnits':float(units),'startCash':float(cash),'startPrice':float(G.o[i])}
        count=len(fills)
        if calendar and first and y%4==2:
            pending=None
            if units:fill(i,'sell','calendar exit',t)
        elif calendar and first and y%4==3:
            pending=None
            if cash:fill(i,'buy','calendar entry',t)
        elif pending is not None and pending[0]==i:
            fill(i,pending[1],pending[2],G.real[pending[3]]+14400);pending=None
        q=units+cash/(G.c[i]*(1+FEE))
        if G.dayend[i] or len(fills)>count or i==z-1 or (i+1<z and G.year[i+1]!=y):curve.append([int(t+14400),round(float(q),10)])
        years[str(y)].update(endTime=int(t+14400),endBTC=float(q),endUnits=float(units),endCash=float(cash),lastPrice=float(G.c[i]))
        prevyear=y
        if calendar and y%4==2:continue
        if pending is not None:continue
        if units:
            if event[i] and gate[200][i]:pending=(i+1,'sell','breadth <50%' if confirm==1 else '3 weak closes <50%',i)
        else:
            if G.c[i]<=sale*.999/(1.001*1.1):pending=(i+1,'buy','10% BTC target',i)
            elif t+14400-sold>=timeout*86400:pending=(i+1,'buy',f'{timeout}-day timeout',i)
    pairs=[];opened=None
    for f in fills:
        if f['side']=='sell':
            assert opened is None;opened=f
        else:
            assert opened is not None
            gain=f['qty']/opened['qty']-1
            assert abs(1+gain-opened['price']*.999/(f['price']*1.001))<1e-10
            pairs.append({'id':len(pairs)+1,'sell':opened,'buy':f,'gain':gain});opened=None
    if opened:pairs.append({'id':len(pairs)+1,'sell':opened,'buy':None,'gain':None})
    return {'start':start,'endExclusive':end,'calendar':calendar,'fills':fills,'pairs':pairs,'curve':curve,'years':years}

def run():
    G=Grid(0,a1h=data());I=inputs(G);accounts={};checked=0
    for kind,cal in [('overlay',False),('calendar',True)]:
        for y in range(2018,2027):
            end=f'{y+1}-01-01' if y<2026 else END
            r=simulate(G,I,f'{y}-01-01',end,cal);accounts[f'{kind}:fresh:{y}']=r
            if not cal:
                ref=replay(G,I,NAME,f'{y}-01-01',end,details=True)
                assert abs(r['years'][str(y)]['endBTC']-ref['btc'])<1e-10
                assert [(f['time'],f['price']) for f in r['fills']]==[(f['time'],f['price']) for f in ref['fills']]
                checked+=1
        for y in [2018,2023]:accounts[f'{kind}:from{y}']=simulate(G,I,f'{y}-01-01',END,cal)
    old=json.loads((O/'recency-results.json').read_text())
    assert abs(accounts['overlay:from2023']['years']['2025']['endBTC']-old['detail'][NAME]['2023-25']['btc'])<1e-10
    for r in accounts.values():
        if r['calendar']:
            assert all(v['endUnits']==0 for y,v in r['years'].items() if int(y)%4==2)
            assert all(f['reason']=='calendar exit' for f in r['fills'] if datetime.fromtimestamp(f['time'],timezone.utc).year%4==2)
    from refine import prepare,sim,PARAMS
    refined={};ri=prepare(G);rp=PARAMS['e50_c3_g0.1_time7']
    for kind,cal in [('overlay',False),('calendar',True)]:
        for yr in range(2018,2027):
            end=f'{yr+1}-01-01' if yr<2026 else END
            r=simulate(G,I,f'{yr}-01-01',end,cal,3,7);refined[f'{kind}:fresh:{yr}']=r
            if not cal:
                ref=sim(G,ri,rp,f'{yr}-01-01',end,details=True)
                assert abs(r['years'][str(yr)]['endBTC']-ref['btc'])<1e-10
                assert [(f['time'],f['price']) for f in r['fills']]==[(f['time'],f['price']) for f in ref['ledger']]
                checked+=1
        for yr in [2018,2023]:refined[f'{kind}:from{yr}']=simulate(G,I,f'{yr}-01-01',END,cal,3,7)
    refinement=json.loads((O/'refinement-results.json').read_text())
    assert abs(refined['overlay:from2023']['years']['2025']['endBTC']-refinement['details']['e50_c3_g0.1_time7']['full2023_25']['btc'])<1e-10
    models={'current':{'label':'Original · 1 close / 14 days','confirm':1,'timeout':14,'accounts':accounts},
      'refined':{'label':'Refined · 3 closes / 7 days','confirm':3,'timeout':7,'accounts':refined}}
    for model in models.values():
        for r in model['accounts'].values():
            if r['calendar']:assert all(v['endUnits']==0 for y,v in r['years'].items() if int(y)%4==2)
    h,l,c,e,s=G.daily();prices=[[int(G.real[si]),round(float(G.o[si]),2),round(float(hh),2),round(float(ll),2),round(float(cc),2)]
      for hh,ll,cc,ei,si in zip(h,l,c,e,s) if G.real[si]>=ts('2018-01-01')]
    obj={'model':NAME,'fee':FEE,'cutoff':int(G.real[-1]+14400),'priceInterval':'daily OHLC, UTC',
      'source':'Bitstamp/Binance cached research history; Binance BTCUSDT for displayed years',
      'accounts':accounts,'models':models,'prices':prices}
    asset=ROOT/'assets/btc/trade-replay-data.js'
    asset.write_text('window.BTC_TRADE_REPLAY='+json.dumps(obj,separators=(',',':'))+';\n',encoding='utf-8')
    (O/'trade-replay-data.json').write_text(json.dumps(obj,separators=(',',':')))
    fields=['account','id','time','decision','side','price','qty','fee','unitsBefore','cashBefore','unitsAfter','cashAfter','reason']
    with (O/'all-year-fills.csv').open('w',newline='') as file:
        wr=csv.DictWriter(file,fieldnames=fields);wr.writeheader()
        for model,m in models.items():
            for key,r in m['accounts'].items():
                for f in r['fills']:
                    row={'account':model+':'+key,**f}
                    for k in ['time','decision']:row[k]=datetime.fromtimestamp(row[k],timezone.utc).isoformat()
                    wr.writerow(row)
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    fig,axs=plt.subplots(3,3,figsize=(17,12),layout='constrained')
    dt=lambda t:datetime.fromtimestamp(t,timezone.utc)
    for ax,y in zip(axs.flat,range(2018,2027)):
        a=ts(f'{y}-01-01');b=ts(f'{y+1}-01-01');pp=[p for p in prices if a<=p[0]<b];r=accounts[f'overlay:fresh:{y}']
        ax.plot([dt(p[0]+86400) for p in pp],[p[4] for p in pp],c='#516778',lw=1)
        for side,color,marker in [('sell','#bd7713','v'),('buy','#147f86','^')]:
            ff=[f for f in r['fills'] if f['side']==side]
            ax.scatter([dt(f['time']) for f in ff],[f['price'] for f in ff],color=color,marker=marker,s=38,zorder=3,label=side)
        for p in r['pairs']:
            if p['buy']:ax.plot([dt(p['sell']['time']),dt(p['buy']['time'])],[p['sell']['price'],p['buy']['price']],c='#b84646' if p['gain']<0 else '#27835a',ls='--',lw=1)
        n=len(r['fills']);q=r['years'][str(y)]['endBTC'];ax.set_title(f'{y}{" through Oct 9" if y==2026 else ""} | {q:.4f} BTC | {n} fills',loc='left',fontsize=11)
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v,_:f'${v/1000:g}k'));ax.xaxis.set_major_locator(mdates.MonthLocator(interval=3));ax.xaxis.set_major_formatter(mdates.DateFormatter('%b'))
        ax.grid(alpha=.2);ax.spines[['right','top']].set_visible(False)
        if n==0:ax.text(.5,.85,'No trades — holds BTC',transform=ax.transAxes,ha='center',fontsize=10)
    axs[0,0].legend(loc='upper right',fontsize=9)
    fig.suptitle('Every year: recent-weighted overlay, fresh 1 BTC each January\nHistorical simulation • 0.10% each side • calendar bear exit disabled in this view',fontsize=15)
    fig.savefig(O/'trade-overlays-2018-2026.png',dpi=140);plt.close(fig)
    print(f'PASS: {checked} annual replays match reference fills and BTC, continuous 2023 parity, fees and calendar exits. {len(accounts)} accounts; {len(prices)} daily candles; {asset.stat().st_size} bytes.')
    print([(y,len(accounts[f'overlay:fresh:{y}']['fills']),round(accounts[f'overlay:fresh:{y}']['years'][str(y)]['endBTC'],4)) for y in range(2018,2027)])

if __name__=='__main__':run()
