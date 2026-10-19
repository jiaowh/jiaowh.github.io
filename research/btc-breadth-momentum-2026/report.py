from pathlib import Path
import json,csv
from datetime import datetime,timezone
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
O=Path(__file__).resolve().parent;j=json.loads((O/'summary.json').read_text())
C='current';S=j['selected']['sell'];R=j['selected']['recovery'];A=j['selected']['overall'];N=list(dict.fromkeys([C,S,R,A]))
label={C:'Current',S:'Sell only if 24h breadth falls',R:'Add 48h breadth recovery',A:'24h sell filter + early recovery','buy_slope6_0':'Require rising 24h breadth to recover','early_sell_6_65_10':'Earlier sale below 65%','buy_early6_10':'Add 24h breadth recovery'}
def d(n,k):return j['details'][n][k]
def vals(n,k):return [r['periods'][k]['btc'] for r in j['results'][n]]
def cell(n,k):return f'{d(n,k)["btc"]:.4f}'+('*' if d(n,k)['cash'] else '')
def countwin(a,b):return sum(x>y+1e-9 for x,y in zip(a,b))
def bounds(a):return f'{min(a):.4f}–{max(a):.4f}'
def date(t):return datetime.fromtimestamp(t,timezone.utc).strftime('%Y-%m-%d %H:%M')
def pct(x):return '—' if x is None else f'{x*100:+.2f}%'
colors=['#0891b2','#a855f7','#d97706','#475569'];years=list(map(str,range(2018,2027)))
fig,(ax,bx)=plt.subplots(2,1,figsize=(13,8.5));x=np.arange(len(years));w=.2
for i,n in enumerate(N):ax.bar(x+(i-1.5)*w,[d(n,k)['btc'] for k in years],w,label=label[n],color=colors[i]);bx.plot([r['phase'] for r in j['results'][n]],vals(n,'2023-25'),color=colors[i],marker='o',label=label[n])
ax.axhline(1,ls='--',color='#374151',lw=1);ax.set_xticks(x,years[:-1]+['2026*']);ax.set_ylabel('Ending BTC from 1 BTC');ax.legend(ncol=2,frameon=False,fontsize=9);ax.set_title('Annual results: extra momentum rules shift both good and bad trades',loc='left')
bx.set_xlabel('Candle boundary shift (hours)');bx.set_ylabel('2023–2025 ending BTC');bx.set_title('A better default result does not imply a robust improvement',loc='left')
for a in [ax,bx]:a.spines[['top','right']].set_visible(False);a.grid(alpha=.16);a.set_axisbelow(True)
fig.suptitle('BTC breadth momentum: useful context, no validated rule change',x=.07,ha='left',fontsize=16,fontweight='bold')
fig.text(.07,.015,'57 fixed candidates; training selection 2023–2024; eight dependent candle alignments.\n*2026 through Oct 9. Costs 0.1% each side, next-open fills. All results are retrospective; annual accounts reset.',fontsize=9)
fig.tight_layout(rect=[0,.065,1,.95]);fig.savefig(O/'comparison.png',dpi=160);plt.close(fig)
chart=list(csv.DictReader((O/'chart-data.csv').open()));t=np.array([float(r['time']) for r in chart]);prices=np.array([float(r['close']) for r in chart]);E=np.array([float(r['breadth']) for r in chart]);delta=np.array([float(r['change24h']) for r in chart]);dates=np.array([datetime.fromtimestamp(x,timezone.utc) for x in t])
fig,axes=plt.subplots(3,3,figsize=(15,9.2),sharex='col',gridspec_kw={'height_ratios':[1.5,1,1]})
windows=[('2023-04-15','2023-05-20','May 2023: skipped losing sale'),('2024-02-15','2024-09-10','2024 correction'),('2025-01-01','2025-05-15','2025 correction')]
for col,(start,end,title) in enumerate(windows):
 lo=datetime.fromisoformat(start).replace(tzinfo=timezone.utc).timestamp();hi=datetime.fromisoformat(end).replace(tzinfo=timezone.utc).timestamp();mask=(t>=lo)&(t<hi);tt=dates[mask]
 axes[0,col].plot(tt,prices[mask]/1000,color='#334155',lw=1);axes[0,col].set_title(title,loc='left',fontsize=11)
 for side,color,marker in [('sell','#dc2626','v'),('buy','#16a34a','^')]:
  trades=[r for r in d(C,'2023-25')['ledger'] if r['side']==side and lo<=r['time']<hi]
  axes[0,col].scatter([datetime.fromtimestamp(r['time'],timezone.utc) for r in trades],[r['price']/1000 for r in trades],color=color,marker=marker,s=42,label='Current '+side,zorder=3)
 axes[1,col].plot(tt,E[mask]*100,color='#0891b2',lw=1.2);axes[1,col].axhline(50,color='#d97706',ls='--',lw=1);axes[1,col].set_ylim(0,100)
 axes[2,col].plot(tt,delta[mask]*100,color='#a855f7',lw=1);axes[2,col].axhline(0,color='#64748b',lw=1);axes[2,col].fill_between(tt,delta[mask]*100,0,where=delta[mask]<0,color='#dc2626',alpha=.12)
 for row in range(3):axes[row,col].grid(alpha=.15);axes[row,col].spines[['top','right']].set_visible(False)
 axes[2,col].xaxis.set_major_locator(mdates.AutoDateLocator(minticks=3,maxticks=5));axes[2,col].xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
axes[0,0].legend(frameon=False,fontsize=8);axes[0,0].set_ylabel('BTC price ($1,000)');axes[1,0].set_ylabel('Weighted breadth (%)');axes[2,0].set_ylabel('24h change (percentage points)')
fig.suptitle('Reading the breadth curve: level and direction are different observations',x=.07,ha='left',fontsize=16,fontweight='bold')
fig.text(.07,.015,'Closed four-hour bars; trade markers at next opening. Declining breadth can warn of weakening agreement, but also occurs during recoveries and consolidation.\nThe illustrative windows do not establish predictive accuracy. Exact trade and whole-period tests are in the report.',fontsize=9)
fig.tight_layout(rect=[0,.065,1,.95]);fig.savefig(O/'examples.png',dpi=160);plt.close(fig)
lines=['# Does BTC breadth momentum add value?','',
'Completed 19 October 2026. **It adds descriptive context, but this experiment does not validate changing the live trading rule.** '
'Tested 57 predeclared candidates across eight candle alignments. The training-selected sell filter improves 2023–2025 from '
'2.2566 to 2.3173 BTC by skipping one losing trade, but improves only one of eight alignments. No shortlisted rule passes the replacement criteria.','',
'## What the curve means','',
'Our breadth is a weighted agreement score across indicators/timeframes of BTC itself. It is not advancing-versus-declining participation across many assets, '
'and its momentum is not independent evidence from a new data source. A reading of 55% while rising describes improving agreement; '
'the same level while falling describes deterioration. Neither reading is a calibrated probability.','',
'Traditional breadth-momentum tools exist: the [McClellan Oscillator](https://chartschool.stockcharts.com/table-of-contents/market-indicators/mcclellan-oscillator) '
'applies a difference of moving averages to advance/decline data. That supports testing the idea, not transferring its effectiveness to our BTC score.','',
'Four useful descriptive features are the level, change in percentage points, persistence of rises/falls, and distance below a recent peak. '
'Acceleration means the change in that momentum. A declining curve above 50% can still be stronger than a rising curve below 50%. '
'Near a plateau, an unchanged percentage means the same balance of bullish votes, not necessarily unchanged price momentum.','',
'![Examples](examples.png)','',
'## Test design','',
'Weights stay [1,1,1,1,1,2], with 72% iMACD / 28% daily. All candidates retain the daily SMA200 regime, '
'10% BTC target and seven-day buyback timeout. All 57 named rules are published:','',
'- 21 sale filters: slope, acceleration, persistence, breadth EMA spread and distance below recent peak.\n'
'- 8 extra early-sale triggers while breadth remains between 50% and 60/65%.\n'
'- 18 recovery variants, including momentum-confirmed recovery and recovery before 50%.\n'
'- 9 combinations plus the unchanged baseline.','',
'Select using the lower quartile of annualized log BTC across eight alignments in 2023–2024, minimum five round trips per alignment. '
'2025/2026 are evaluation periods, but were already researched; they are not pristine holdouts. All signals use completed candles and next-open execution. '
'Sale filters only accept/reject a fresh baseline event, rather than inventing a later entry in the same weak run.','',
'## Selected rules','',
'| Selection | Rule | Meaning |','|---|---|---|',
f'| Sale only | `{S}` | Sell only if current breadth is lower than 24 hours earlier, in addition to the original sale conditions. |',
f'| Recovery only | `{R}` | Also buy below 50% when breadth is above 40% and has risen more than 10 percentage points in 48 hours. |',
f'| Overall | `{A}` | The 24h falling-breadth sale filter, plus early recovery above 40% after a >10-point rise in 24h. |','',
'## Results from 1 BTC','',
'Each annual account resets. Multi-year accounts carry positions continuously. Costs 0.1% each side. * = cash valued as purchasable BTC after its buy fee. '
'2026 stops October 9, matching the frozen data used by the earlier studies.','',
'| Window | Current | 24h sale filter | Early 48h recovery | Combined |','|---|---:|---:|---:|---:|']
for k in years+['train','2020-21','2023-25','2025-26']:
 lines.append('| '+('2023–2024 training' if k=='train' else k)+' | '+' | '.join(cell(n,k) for n in N)+' |')
lines+=['','![Comparison](comparison.png)','',
'## Why the apparently good filter is not enough','',
'The 24-hour falling-breadth sell filter skips the 3 May 2023, 20:00 UTC sale and 4 May, 00:00 UTC recovery buyback. '
'That round trip lost **2.62% BTC after costs**. Avoiding this one trade accounts for the entire default 2023–2025 improvement. '
'The recent-cycle comparison across alignments is **1 win, 5 ties, 2 losses**.','',
'| Rule | Default 2023–25 | Median | Worst–best | Wins / ties / losses vs current |','|---|---:|---:|---|---|']
for n in N:
 a,b=vals(n,'2023-25'),vals(C,'2023-25');w=countwin(a,b);ties=sum(abs(x-y)<1e-9 for x,y in zip(a,b))
 lines.append(f'| {label[n]} | {a[0]:.4f} | {np.median(a):.4f} | {bounds(a)} | {w} / {ties} / {8-w-ties} |')
lines+=['','Buying earlier on improving breadth can avoid missing a rally, but it can also re-enter before a decline finishes. '
'The 24h early-recovery rule alone lowers default 2025 from **1.2735 to 1.1942 BTC**. '
'The illustrative earlier-sale rule below 65% finishes 2023–2025 at **2.2645 BTC**, but lowers 2025 to **1.2477 BTC**. '
'These are diagnostic controls, not replacements selected after seeing later results.','',
'## Does rising versus falling breadth predict the next move?','',
'This descriptive check samples one close per day when breadth is 45–55%, under a bullish daily regime. '
'Falling/rising means a 24h change below −5 / above +5 percentage points; flat is between. '
'Returns start at the next opening. Seven-day outcomes overlap, samples are small, and these percentages are not calibrated trade confidence.','',
'| Period | Momentum | Samples | Mean next 24h return | Mean next 7d return | ≥10% drop within 7d |','|---|---|---:|---:|---:|']
for r in j['diagnostic']:
 if r['regime']=='bullish':lines.append(f'| {r["period"]} | {r["momentum"]} | {r["n"]} | {pct(r["mean24h"])} | {pct(r["mean7d"])} | {"—" if r["drop10rate"] is None else f"{r['drop10rate']*100:.1f}%"} |')
lines+=['','Falling breadth looked ominous in 2023–2024, but the later seven-day comparison reverses: falling cases averaged positive returns while rising cases averaged negative returns. '
'That instability is why a visually convincing shape is insufficient to classify a crash reliably. These samples also do not match breadth levels exactly, control for volatility, or measure independent effects.','',
'## Costs, delay and risk','',
'| Stress / rule | Default 2023–25 BTC | Worst 2023–25 BTC | Wins vs current |','|---|---:|---:|---:|']
for desc,fee,delay in [('0.3% each side',.003,0),('Extra 4h',.001,1),('0.3% + extra 4h',.003,1),('Extra 24h',.001,6)]:
 def values(n):return [r['periods']['2023-25']['btc'] for r in j['stress'] if r['name']==n and r['fee']==fee and r['delay']==delay]
 for n in N:
  a=values(n);lines.append(f'| {desc} · {label[n]} | {a[0]:.4f} | {min(a):.4f} | {countwin(a,values(C))}/8 |')
lines+=['','| Rule | 2023–25 BTC drawdown | Dollar drawdown | 2025 round trips |','|---|---:|---:|---:|']
for n in N:lines.append(f'| {label[n]} | {d(n,"2023-25")["btcDD"]*100:.2f}% | {d(n,"2023-25")["usdDD"]*100:.2f}% | {d(n,"2025")["roundTrips"]} |')
lines+=['','Drawdowns are sampled at four-hour closes. BTC preservation does not ensure dollar protection.','',
'## Decision and verification','',
'Keep the live strategy unchanged. A 24h breadth-change readout can be useful descriptive context, but the tested slope, acceleration and early-turn rules do not establish a sufficiently consistent trading improvement. '
'No claim is made that every conceivable breadth-shape rule has been exhausted.','',
f'Validation: {j["parityChecks"]} baseline ledger matches against the previously production-verified model; '
f'{j["prefixChecks"]} all-rule future-truncation checks; {j["independentLedgers"]} independent bar-by-bar ledgers, '
'plus separate fee/cash reconstruction. The frozen source hash matches the earlier study; the same 122 missing hourly timestamps in 27 gaps remain.','',
'Files: [predeclared protocol](PROTOCOL.md), [all 57 rules](candidates.csv), [full phase/stress and descriptive results](summary.json), '
'[trade ledger](trades.csv), [historical plot data](chart-data.csv). Reproduce with `evaluate.py`, then `report.py`.']
(O/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Wrote report and two figures')
