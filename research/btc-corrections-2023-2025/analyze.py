"""Retrospective audit of unmodified btc.html; no parameter optimization.
Run export.cjs first, then this file with Python + numpy + matplotlib.
"""
import json, math, csv, hashlib
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

OUT=Path(__file__).resolve().parent
J=json.loads((OUT/'production.json').read_text())
arr=lambda x:np.asarray(x,dtype=float)
t=arr(J['t']); B=J['bars']; n=len(t)
o,h,l,c=[arr([b[k] for b in B]) for k in ('open','high','low','close')]
E,L,F,V=[arr(J[k]) for k in ('E','lvl','f14','vol')]
P={k:arr(v) for k,v in J['banded'].items()}
ts=lambda s:datetime.fromisoformat(s).replace(tzinfo=timezone.utc).timestamp()
dt=lambda x:datetime.fromtimestamp(float(x),timezone.utc).strftime('%Y-%m-%d %H:%M')
ix=lambda s:int(np.searchsorted(t,ts(s)))
a,z=ix('2023-01-01'),ix('2026-01-01')
assert np.all(np.diff(t[a:z])==14400), 'Missing 4h candles in study period'

def band(raw):
    out=np.full(n,np.nan); held=np.nan
    for i,p in enumerate(raw):
        if np.isnan(p):continue
        if np.isnan(held) or abs(p-held)>.25 or (p==0 and held!=0):held=p
        out[i]=held
    return out

def ledger(p,fee=.001):
    cash,units=1.,0.; eq=np.ones(n); lo=eq.copy(); hi=eq.copy(); u=np.zeros(n); cc=eq.copy(); trades=[]
    last=np.nan
    for i in range(n):
        # Decision at prior close, executed at this open. No daily rebalancing between changes.
        if i and np.isfinite(p[i-1]) and p[i-1]!=last:
            want=p[i-1]; value=cash+units*o[i]; x=want*value-units*o[i]
            du=x/(o[i]*(1+want*fee if x>0 else 1-want*fee))
            cash-=du*o[i]+abs(du)*o[i]*fee; units+=du; last=want
            if abs(du)*o[i]>1e-12:trades.append(dict(i=i,time=dt(t[i]),price=o[i],target=want,turnover=abs(du)*o[i]/value))
            assert cash>-1e-8 and units>-1e-12
        eq[i]=cash+units*c[i]; lo[i]=cash+units*l[i]; hi[i]=cash+units*h[i];u[i]=units;cc[i]=cash
    return dict(eq=eq,lo=lo,hi=hi,u=u,cash=cc,trades=trades)

def metrics(q,start,end):
    b=ix(start);e=ix(end); base=q['cash'][b-1]+q['u'][b-1]*o[b]
    v=q['eq'][b:e]; peak=np.maximum.accumulate(np.r_[base,v]); dd=np.min(np.r_[base,v]/peak-1)
    # Intrabar bound: prior-bar high to current-bar low, plus each bar's high-to-low bound.
    prev=np.maximum.accumulate(np.r_[base,q['hi'][b:e]])[:-1]
    ddi=np.min(q['lo'][b:e]/np.maximum(prev,q['hi'][b:e])-1)
    ret=v[-1]/base-1; years=(ts(end)-ts(start))/(365.25*86400)
    tr=[x for x in q['trades'] if b<=x['i']<e]
    return dict(return_pct=100*ret,cagr_pct=100*((1+ret)**(1/years)-1),dd_close_pct=100*dd,dd_intrabar_bound_pct=100*ddi,trades=len(tr),mean_exposure_pct=float(np.mean(q['u'][b:e]*c[b:e]/v)*100))

Q={k:ledger(p) for k,p in P.items()};Q['buy_hold']=ledger(np.ones(n))
annual={label:{k:metrics(q,s,e) for k,q in Q.items()} for label,s,e in [('2023','2023-01-01','2024-01-01'),('2024','2024-01-01','2025-01-01'),('2025','2025-01-01','2026-01-01'),('2023-2025','2023-01-01','2026-01-01')]}

# Daily features are published only at the close of a complete UTC day.
de=np.flatnonzero((t+14400)%86400==0); dc=c[de]
def spread(v):
    ind=np.searchsorted(de,np.arange(n),side='right')-1
    out=np.full(n,np.nan); good=ind>=0;out[good]=v[ind[good]];return out
def sma(x,w):
    out=np.full(len(x),np.nan);out[w-1:]=np.convolve(x,np.ones(w)/w,'valid');return out
S20,S50,S200=[spread(sma(dc,w)) for w in (20,50,200)]
def two_below(w):
    raw=dc<sma(dc,w);return spread(raw & np.r_[False,raw[:-1]])==1
def two_above(w):
    raw=dc>sma(dc,w);return spread(raw & np.r_[False,raw[:-1]])==1
RISK={
    'Funding >15%':F>.15,
    'Ensemble <60%':E<.60,
    'Ensemble <50%':E<.50,
    'Two daily closes <SMA20 and E<60%':two_below(20)&(E<.60),
    'Two daily closes <SMA50 and E<60%':two_below(50)&(E<.60),
    'E falls 20pp in 3d, below 60%':(E<.60)&((np.r_[np.full(18,np.nan),E[:-18]]-E)>=.20-1e-9),
}
# Independent alarm episodes: initial true state, re-arm only after seven days without the condition.
# Episode success means a FURTHER 10% 4h-closing decline from the next open in 30d.
def episodes(cond):
    out=[];armed=True;off=42
    for i in range(a,z-180):
        if not cond[i]:
            off+=1
            if off>=42:armed=True
        else:
            if armed:
                j=i+1;end=min(j+180,z);down=np.min(c[j:end])/o[j]-1;up=np.max(c[j:end])/o[j]-1
                out.append(dict(i=i,time=dt(t[j]),price=o[j],further_drawdown_pct=100*down,max_up_pct=100*up,hit=bool(down<=-.10)))
                armed=False
            off=0
    return out
alarms={k:episodes(v) for k,v in RISK.items()}
alarm_summary={k:dict(episodes=len(v),hits=sum(x['hit'] for x in v),precision_pct=100*np.mean([x['hit'] for x in v]),active_pct=100*np.mean(RISK[k][a:z])) for k,v in alarms.items()}
base_hits=[np.min(c[i+1:i+181])/o[i+1]-1<=-.10 for i in de if a<=i<z-180]

# Event inventory: alternating 15% swings in 4h CLOSES; intrabar extremes reported separately.
# Identification is hindsight for analysis only, never an input to signals.
events=[];state='up';peak=a;trough=a
for i in range(a+1,z):
    if state=='up':
        if c[i]>c[peak]:peak=i
        elif c[i]<=c[peak]*.85:trough=i;state='down'
    else:
        if c[i]<c[trough]:trough=i
        elif c[i]>=c[trough]*1.15:
            events.append((peak,trough,i));peak=i;state='up'
if state=='down':events.append((peak,trough,None))

def event_report(p,b,recovery=None):
    eq=Q['vt60']['eq']; base=eq[p]; ret=eq[b]/base-1
    v=np.r_[base,eq[p+1:b+1]]; dd=np.min(v/np.maximum.accumulate(v)-1)
    trades=[x for x in Q['vt60']['trades'] if p<x['i']<=b]
    startstate=dict(vote=E[p],target=P['vt60'][p],funding=F[p],actual_exposure=Q['vt60']['u'][p]*c[p]/eq[p])
    notes={}
    for name,cond in RISK.items():
        inds=np.flatnonzero(cond[p:b+1])+p
        if len(inds):
            j=inds[0]; notes[name]=dict(time=dt(t[j]+14400),price=c[j],fall_from_peak_pct=100*(c[j]/c[p]-1),days_to_trough=(t[b]-t[j])/86400,already_active_at_peak=bool(j==p))
    flat=np.flatnonzero(P['vt60'][p:b+1]==0)+p
    again=next((x for x in Q['vt60']['trades'] if x['i']>b and x['target']>0),None)
    return dict(peak_time=dt(t[p]+14400),trough_time=dt(t[b]+14400),peak_close=c[p],trough_close=c[b],btc_close_pct=100*(c[b]/c[p]-1),strategy_return_pct=100*ret,strategy_dd_pct=100*dd,peak_state=startstate,trades=trades,warnings=notes,first_flat=dt(t[flat[0]]+14400) if len(flat) else None,next_positive_trade=again,recovery_15pct_time=dt(t[recovery]+14400) if recovery is not None else None)
ev=[event_report(*x) for x in events]
def swing_inventory(threshold):
    swings=[];state='up';peak=a;trough=a
    for i in range(a+1,z):
        if state=='up':
            if c[i]>c[peak]:peak=i
            elif c[i]<=c[peak]*(1-threshold):trough=i;state='down'
        else:
            if c[i]<c[trough]:trough=i
            elif c[i]>=c[trough]*(1+threshold):
                swings.append(event_report(peak,trough,i));peak=i;state='up'
    if state=='down':swings.append(event_report(peak,trough,None))
    return swings
ev10=swing_inventory(.10)

# Named windows preserve the user's two reference corrections, including the March 2025 first low.
focus={}
for name,ps,pe,bs,be in [
    ('2024 March-August','2024-03-01','2024-03-20','2024-08-01','2024-08-10'),
    ('2025 January-March','2025-01-01','2025-02-01','2025-03-01','2025-03-20'),
    ('2025 January-April','2025-01-01','2025-02-01','2025-04-01','2025-04-15')]:
    p=ix(ps)+np.argmax(h[ix(ps):ix(pe)]);b=ix(bs)+np.argmin(l[ix(bs):ix(be)])
    row=event_report(p,b);row.update(intraday_peak=h[p],intraday_low=l[b],btc_intraday_pct=100*(l[b]/h[p]-1),peak_bar_time=dt(t[p]),trough_bar_time=dt(t[b]))
    # Rebase portfolio at the same BTC peak price and mark at BTC trough price using actual holdings.
    q=Q['vt60'];start=q['cash'][p]+q['u'][p]*h[p];end=q['cash'][b]+q['u'][b]*l[b]
    row['strategy_peak_to_low_mark_pct']=100*(end/start-1)
    focus[name]=row

# Bounded overlays, applied BEFORE the same band. No new grid search.
# Persist risk until two closes above the same SMA and E >=64%; reductions/exits remain immediate.
overlays={}; overlayQ={};raw=arr(J['pos']['vt60'])
for w in (20,50):
    flag=np.zeros(n,dtype=bool);on=False
    enter=two_below(w)&(E<.60);leave=two_above(w)&(E>=.64)
    for i in range(n):
        if enter[i]:on=True
        elif leave[i]:on=False
        flag[i]=on
    p=band(np.minimum(raw,np.where(flag,1/3,1.)))
    name=f'SMA{w} confirmed cap 1/3';overlayQ[name]=ledger(p)
    overlays[name]={label:metrics(overlayQ[name],s,e) for label,s,e in [('2019-2022','2019-01-01','2023-01-01'),('2023-2025','2023-01-01','2026-01-01')]}
    ch=np.flatnonzero(np.diff(p[a:z])!=0)+a+1;mv=p[ch]-p[ch-1]
    overlays[name]['rapid_reversals_24h']=int(np.sum((np.diff(ch)<=6)&(mv[1:]*mv[:-1]<0)))
for name,p in [('Current',P['vt60']),('No funding trim',band(L*np.minimum(1,.6/V)))]:
    q=ledger(p);overlayQ[name]=q
    overlays[name]={label:metrics(q,s,e) for label,s,e in [('2019-2022','2019-01-01','2023-01-01'),('2023-2025','2023-01-01','2026-01-01')]}
    ch=np.flatnonzero(np.diff(p[a:z])!=0)+a+1;mv=p[ch]-p[ch-1]
    overlays[name]['rapid_reversals_24h']=int(np.sum((np.diff(ch)<=6)&(mv[1:]*mv[:-1]<0)))

# Existing recovery-buffer ablation, not a new warning rule.
unbuf=np.full(n,np.nan);state=0.
for i,e in enumerate(E):
    if not np.isfinite(e):continue
    if state==0:state=1. if e>.60 else 0.
    else:state=0. if e<.40 else 1/3 if e<.50 else 2/3 if e<.60 else 1.
    unbuf[i]=state
up=band(unbuf*np.where(F>.15,2/3,1)*np.minimum(1,.6/V))
uq=ledger(up);ch=np.flatnonzero(np.diff(up[a:z])!=0)+a+1;mv=up[ch]-up[ch-1]
overlays['Without existing 3pp recovery buffer']={'2023-2025':metrics(uq,'2023-01-01','2026-01-01'),'rapid_reversals_24h':int(np.sum((np.diff(ch)<=6)&(mv[1:]*mv[:-1]<0)))}

# Identify portfolio stress, actual exposure and timestamps at important dates.
q=Q['vt60'];prior=np.maximum.accumulate(np.r_[q['eq'][a-1],q['hi'][a:z]])[:-1];intra=q['lo'][a:z]/np.maximum(prior,q['hi'][a:z])-1
worst=a+np.argmin(intra)
diagnostics=dict(worst_intrabar_bar=dt(t[worst]),worst_intrabar_bound_pct=100*np.min(intra),exposure_before_bar=100*q['u'][worst]*o[worst]/(q['cash'][worst]+q['u'][worst]*o[worst]),vote_prior_close=E[worst-1],bar_open=o[worst],bar_low=l[worst],daily_base_rate_further10pct_30d=100*np.mean(base_hits),snapshot={})
for s in ['2023-08-16','2024-03-23','2024-07-31','2024-08-01','2024-08-03','2024-08-05','2025-01-20','2025-02-03','2025-02-06','2025-03-11','2025-04-07','2025-04-22']:
    i=ix(s)-1;diagnostics['snapshot'][s]=dict(price=c[i],vote=E[i],funding=F[i],level=L[i],desired=J['pos']['vt60'][i],target=P['vt60'][i],vol=V[i])
fee_sensitivity={str(fee):metrics(ledger(P['vt60'],fee),'2023-01-01','2026-01-01') for fee in (.003,.006)}

result=dict(source_hash=J['sourceHash'],bars=n,first=dt(t[0]),last=dt(t[-1]),study_bars=z-a,annual=annual,events=ev,events10=ev10,focus=focus,alarm_summary=alarm_summary,alarms=alarms,overlays=overlays,diagnostics=diagnostics,fee_sensitivity=fee_sensitivity)
(OUT/'results.json').write_text(json.dumps(result,indent=2))
with (OUT/'trades-2023-2025.csv').open('w',newline='') as f:
    rows=[x for x in Q['vt60']['trades'] if a<=x['i']<z];w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)

plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'figure.dpi':140})
dates=[datetime.fromtimestamp(float(x+14400),timezone.utc) for x in t]
fig,ax=plt.subplots(2,1,figsize=(12,7),sharex=True,gridspec_kw={'height_ratios':[2,1]})
for k,label,color in [('buy_hold','Buy & hold','#9ca3af'),('vt60','Current Average (60% vol target)','#087e8b')]:
    q=Q[k];base=q['cash'][a-1]+q['u'][a-1]*o[a];v=q['eq'][a:z]/base
    ax[0].plot(dates[a:z],100*v,label=label,color=color,lw=1.5)
    ax[1].plot(dates[a:z],100*(v/np.maximum.accumulate(np.r_[1,v])[1:]-1),color=color,lw=1.2)
ax[0].set(ylabel='Equity (start = 100)',title='BTC Average strategy | 2023-2025 | actual production rules');ax[0].legend(loc='upper left');ax[1].set(ylabel='Drawdown (%)')
for x in ax:x.grid(alpha=.2)
fig.text(.08,.015,'Closed 4h signals; next-open fills; fixed BTC units between trades; 0.10% per side; cash yield zero. Retrospective.',fontsize=9)
fig.tight_layout(rect=(0,.04,1,1));fig.savefig(OUT/'equity.png');plt.close(fig)
fig,axs=plt.subplots(3,2,figsize=(14,9),sharex='col',gridspec_kw={'height_ratios':[2,1,1]})
for col,(start,end,title) in enumerate([('2024-02-01','2024-11-15','2024: March peak to August sell-off'),('2024-12-01','2025-06-15','2025: January peak to March/April sell-off')]):
    b,e=ix(start),ix(end);xx=dates[b:e]
    axs[0,col].plot(xx,c[b:e]/1000,color='#273444',label='BTC close');axs[0,col].plot(xx,S50[b:e]/1000,color='#db8c00',label='Daily SMA50',lw=1)
    axs[0,col].set(title=title,ylabel='BTC ($000)');axs[0,col].legend(fontsize=8)
    axs[1,col].plot(xx,E[b:e]*100,color='#087e8b',lw=1);axs[1,col].axhline(60,color='#db8c00',ls='--');axs[1,col].axhline(40,color='#c64747',ls='--');axs[1,col].set(ylabel='Long votes (%)',ylim=(0,100))
    axs[2,col].fill_between(xx,100*Q['vt60']['u'][b:e]*c[b:e]/Q['vt60']['eq'][b:e],step='post',color='#087e8b',alpha=.35,label='Actual BTC allocation')
    axs[2,col].plot(xx,(F[b:e]>.15)*100,color='#b76b24',lw=1,alpha=.65,label='Funding crowding flag');axs[2,col].set(ylabel='Allocation (%)',ylim=(0,105));axs[2,col].legend(fontsize=8)
    axs[2,col].xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
    axs[2,col].xaxis.set_major_locator(mdates.MonthLocator(interval=2))
for x in axs.flat:x.grid(alpha=.2)
fig.text(.07,.014,'Allocation includes price drift and skipped changes from the 25pp trading band. Funding flag is a condition, not a crash forecast.',fontsize=9)
fig.tight_layout(rect=(0,.04,1,1));fig.savefig(OUT/'focus-corrections.png');plt.close(fig)
print(json.dumps(dict(diagnostics=diagnostics,overlays=overlays,fee_sensitivity=fee_sensitivity),indent=2))
