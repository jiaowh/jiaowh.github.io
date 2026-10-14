"""Publish expanded findings and all candidate outcomes without re-selection."""
from pathlib import Path
import json,csv,datetime as dt
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

P=Path(__file__).resolve().parent
x=json.loads((P/'expanded-summary.json').read_text());v=json.loads((P/'expanded-validation.json').read_text())
selected=x['selected']['balanced'];res=x['results'];base='fast_recovery'
dates=lambda t:dt.datetime.fromtimestamp(t,dt.timezone.utc)
iso=lambda t:dates(t).strftime('%Y-%m-%d %H:%M UTC')
cell=lambda r:f"{r['shares']:.3f}"+(' *' if not r['holding'] else '')
pct=lambda v:f'{v*100:.1f}%'
labels={base:'Current BTC fast recovery',selected:'BTC fast + joint SMA200 exit',
        'original_recovery':'Original BTC recovery', 'mstr_imacd6':'MSTR daily fast iMACD',
        'mstr_sma200_b0':'MSTR SMA200', 'tactical_ma20_g10_btc_t14':'BTC sell + MSTR target / BTC recovery',
        'relative_sma50':'MSTR/BTC price-ratio trend'}

lines=['# Expanded MSTR investigation', '',
'Research completed October 12, 2026; price sample ends October 9, 2026. No live strategy changed.', '',
'**Result:** the strongest balanced candidate selected using 2021–2024 was the current BTC fast correction strategy with a separate cash override when **both BTC and MSTR are in bearish SMA200 regimes**. Its 2025–2026 ending value was **2.352 share equivalents**, versus **1.145** for the unchanged BTC strategy and **1.000** for holding. The same comparison using hourly stock opening fills was **2.335 versus 1.140**.', '',
'This is a useful candidate for handling both bull and bear markets, not an always-winning rule. It sacrificed much of the early-2023 rebound, and failed to beat holding in 2021 and 2023. The unmodified BTC fast strategy remained the bull-focused selection. There is no need to substitute a more complicated buyback indicator to obtain the main improvement.', '',
'## Exactly what changes', '',
'1. Continue running the existing BTC fast iMACD + recovery model, including its BTC-based target and timer, even while the MSTR portfolio is in cash.',
'2. Calculate a separate SMA200 regime for each asset. BTC uses 200 completed daily crypto candles; MSTR uses 200 completed trading sessions. Two closes above 102% of the average turn that regime bullish; two closes below 98% turn it bearish; otherwise retain the preceding regime.',
'3. Hold MSTR only when the BTC model wants to hold **and at least one of these SMA200 regimes is bullish**. When both are bearish, sell MSTR and hold cash. Re-enter after either regime turns bullish, provided the BTC model also wants to hold.',
'4. Evaluate available information before an opening and fill at an observed stock opening price. The main long-history experiment acts only at daily opens. The recent hourly experiment also acts at later regular-session hourly opens. No same-bar closing-price fill is assumed for a newly computed indicator.', '',
'This does not change the BTC strategy itself. It is an MSTR-specific combination of BTC correction timing and two-asset bear-market confirmation.', '',
'## Scope and comparison rules', '',
f"Tested **{x['candidateCount']} fixed candidates**: BTC signals, MSTR SMA/EMA/MACD/iMACD/breadth/momentum/breakout/trailing-stop signals, relative strength, trend combinations, and 24 BTC-sell/MSTR-buyback combinations. Additional scheduled overnight experiments were evaluated separately. All trials remain in the saved output; failures were not discarded.", '',
'Use one split-adjusted share as the starting position; buy-and-hold always ends at one. Include 0.1% cost per transaction side, fractional shares, no leverage, no taxes and no interest on idle cash. If a period ends in cash, mark it as share equivalents at the final close after a hypothetical buy fee. These cash equivalents are not shares already repurchased, and a large relative-share gain during a crash is not a corresponding dollar profit.', '',
'Daily-open annual rows start afresh; continuous results carry cash and strategy state across year boundaries. Do not multiply the annual rows to reconstruct the continuous results. Initial holdings may be sold immediately when the pre-existing regime is bearish.', '',
'## Annual results: common daily-open execution', '',
'| Year | Current BTC fast | Joint SMA200 exit | MSTR daily iMACD | MSTR SMA200 only |',
'|---|---:|---:|---:|---:|']
for year in map(str,range(2018,2027)):
    lines.append('| '+year+(' YTD' if year=='2026' else '')+' | '+' | '.join(cell(res[n][year]) for n in [base,selected,'mstr_imacd6','mstr_sma200_b0'])+' |')
lines += ['', '* Ends in cash, valued as fee-net share equivalents. Earlier years before MSTR adopted Bitcoin in August 2020 reflect a different business regime.', '',
'| Continuous period | Current BTC fast | Joint SMA200 exit | Holding |', '|---|---:|---:|---:|']
for period in ['2020-21','2023-25','validation','treasury']:
    title={'validation':'2025–Oct 9, 2026','treasury':'Aug 11, 2020–Oct 9, 2026'}.get(period,period)
    lines.append('| '+title+' | '+cell(res[base][period])+' | '+cell(res[selected][period])+' | 1.000 |')
lines += ['| 2023–Oct 9, 2026 | '+cell(v['continuous2023to2026'][base])+' | '+cell(v['continuous2023to2026'][selected])+' | 1.000 |', '',
'## What the improved result actually comes from', '',
'**2022 protection:** an annual portfolio starting in MSTR sells when both regimes are already bearish and stays in cash. Its end-of-year cash could buy **3.819 shares**, but its dollar return was **−1.7%**, versus **−74.3%** for holding. The sampled dollar drawdown fell from **75.5% to 3.0%**. These are annual-start results; they do not imply the same small drawdown for someone invested before 2022.', '',
'**The major 2025–2026 trade:** the combined daily-open rule sold on **October 30, 2025 at $269.99** and repurchased on **August 24, 2026 at $121.84**. That completed cash leg multiplied shares by **2.212** after costs. The unchanged BTC rule had no independent long-duration bear exit.', '',
'**Later-period dollar result:** over January 2025–October 9, 2026 the combined rule returned **+21.0% in dollars**, while holding returned **−48.6%**. Its daily-close sampled maximum dollar drawdown was **34.4%**, compared with **78.4%** for the unchanged BTC correction strategy and **81.9%** for holding. This is still substantial risk.', '',
'**The price of the protection:** in the fresh 2023 annual test it sold at **$14.57 on January 3** and re-entered at **$23.20 on January 17**. That missed rebound reduced shares to **0.627** before later correction trades recovered the annual result to **0.981**. Unmodified BTC fast finished that year at **1.565**. In 2021, the combined rule ended at **0.903**. A slow confirmed trend filter can avoid a long decline and still buy back late after a sharp reversal.', '',
'## Other methods', '',
'The following representatives were chosen within each family using the same pre-2025 balanced score, rather than choosing the best 2025–2026 row after seeing it.', '',
'| Representative | 2022 | 2023 | 2024 | 2025 | 2026 YTD | Continuous 2025–2026 |',
'|---|---:|---:|---:|---:|---:|---:|']
for family,name in x['selected']['families'].items():
    lines.append('| '+labels.get(name,name)+' | '+' | '.join(cell(res[name][p]) for p in ['2022','2023','2024','2025','2026','validation'])+' |')
lines+=['',
'- **MSTR-only daily iMACD:** protected parts of bear periods, but retained only 0.426 and 0.425 shares in 2023 and 2024. It gave up too much of the bull runs. This six-vote daily rule differs from the earlier native multi-timeframe adaptation, whose results were also fragile.',
'- **MSTR SMA200 alone:** effective in 2022/2025, but late into 2023 and below holding again in 2026. Combining the assets helps compared with forcing MSTR alone to decide every regime.',
'- **Fast/classic MACD, breakouts, momentum, trailing stops:** some good individual periods, but none provided the strongest preselected balance of share accumulation and regime coverage.',
'- **MSTR-specific buyback targets:** the preselected tactical representative finished 2025–2026 at 2.246 versus 2.352 for the simpler combined rule. Some other tactical settings reached 2.642 in that later period; choosing those because of this result would be additional hindsight selection. They were not promoted.',
'- **MSTR/BTC relative strength:** useful in some declines, but its selected representative ended 2023 at 0.382 and 2024 at 0.638. It is not a dependable bull-market accumulation rule. This ratio is not mNAV: capital structure and changing shares outstanding matter. Strategy itself says its equity is not required to track its Bitcoin holdings. [Strategy annual report](https://www.sec.gov/Archives/edgar/data/1050446/000105044626000020/mstr-20251231.htm)', '',
'## Selection discipline and adaptive selection', '',
'Before running the expanded candidates, define the balanced score as half the mean and half the minimum of log annual share outcomes for 2021–2024. Hold is eligible. This selected `fast_either200`. A separate bull-only score on 2023–2024 selected the unchanged `fast_recovery`. Freeze both before presenting 2025–2026. The method is retrospectively chronological: these prices have already been examined in prior research, so this is not an untouched holdout.', '',
'A rule that picked a new winner every January using only the preceding three years did worse than keeping the fixed strategies. Its actual continuous portfolio ended 2023–2026 at **1.933 shares**, versus **4.291** for unchanged fast and **5.522** for the fixed combined rule (the latter was selected after 2024). The fixed rule comparisons describe the same historical period but cannot claim an equally early selection date. Adaptive portfolio holdings and fees carry across switches; there is no annual reset.', '',
'| Year | Rule picked from preceding three years | Continuous portfolio share-equivalent multiplier during year |',
'|---|---|---:|']
for year,r in v['walkSegments'].items():lines.append(f"| {year} | {r['rule']} | {r['multiplier']:.3f} |")
lines+=['','The automatic annual selector lost shares in 2023 and switched away from bear protection before the 2026 test. These results argue against automatically replacing a strategy with the most recent backtest winner.', '',
'## Execution and robustness', '',
'| Joint-exit test, continuous 2025–2026 | Ending share equivalents |', '|---|---:|',
f"| Daily opens, 0.1%/side | {res[selected]['validation']['shares']:.3f} |"]
for fee,delay in [(.003,0),(.005,0),(.001,1),(.003,1)]:
    r=next(r for r in x['stress'] if r['name']==selected and r['period']=='validation' and r['fee']==fee and r['extraSessions']==delay)
    lines.append(f"| Daily opens, {fee*100:.1f}%/side, {delay} extra session | {r['result']['shares']:.3f} |")
for r in v['intraday']:
    if r['name']==selected and r['period']=='validation':lines.append(f"| Hourly opens, {r['fee']*100:.1f}%/side, {r['extraBars']} extra available bar | {r['result']['shares']:.3f} |")
lines+=['',
'Across eight BTC candle phases, the combined 2025–2026 daily-open result ranged from **2.156 to 2.784**. Across twelve neighboring combinations of SMA150/200 and 1%/2%/3% bands, it ranged from **1.356 to 2.366**; all twelve exceeded holding over that combined period. However, only six of twelve beat holding in 2026 alone, and every neighbor lost shares in the fresh 2023 annual test. Neighbors were diagnostics only; the selected rule was not changed.', '',
'Removing the best completed cash leg from the selected rule reduces 2025–2026 from **2.352 to 1.064** shares. The result survives, but most of the excess came from one long bear-market avoidance trade. Removing the best completed trade from 2023–2025 leaves **3.044**, versus its original 4.665.', '',
'A conditional moving-block bootstrap of the selected rule’s 2025–2026 daily log share changes gives approximately **12–14%** of resamples below holding, with very wide 90% intervals (roughly **0.62–8.46**, depending on block length). These resamples do not adjust for selecting among 74 rules or prior research, and are not probabilities of future profit. They do not establish certainty.', '',
'## Overnight experiments', '',
'The existing notes and [Elm Wealth’s overnight study](https://elmwealth.com/night-shift/) motivate checking a different source of returns: holding overnight and avoiding some daytime exposure. This does not depend on fast iMACD being an early crash detector.', '',
'The modeled trade is scheduled before the closing auction: buy at its recorded price and sell at the next observed premarket opening, or at the next regular opening. No unobserved overnight price is invented. Missing premarket observations fall back to the actual regular opening. These are quote-based model fills, not measured bid/ask execution.', '',
'| Exit time (ET), overnight only | 2024 at 0.1%/side | 2025 at 0.1%/side | 2026 at 0.1%/side | 2025–2026 at 0.1%/side | 2025–2026 at 0.3%/side |',
'|---|---:|---:|---:|---:|---:|']
def night(period,exit_hour,fee,overlay=False):
    return next(r['result'] for r in x['sessions'] if r['period']==period and r['exitHour']==exit_hour and r['fee']==fee and r['overlay']==overlay)
for hour in [None,4,6,8]:
    title='09:30 regular open' if hour is None else f'{hour:02d}:00 premarket'
    vals=[night(p,hour,.001)['shares'] for p in ['2024','2025','2026','validation']]+[night('validation',hour,.003)['shares']]
    lines.append('| '+title+' | '+' | '.join(f'{z:.3f}' for z in vals)+' |')
lines+=['',
'The 04:00 version makes **444 round trips** in 2025–2026: 2.150 shares at 0.1%/side becomes **0.364** at 0.3%/side. A 06:00 exit looks stronger in these later years, but it was weaker in 2024; selecting the later-period winner is not validation. Staying in MSTR during the day when the BTC fast model is bullish, and otherwise holding only overnight, yielded only 1.068 shares for the 04:00 version in 2025–2026, falling to 0.928 at 0.3%/side. It does not beat the simpler joint-regime candidate on this evidence.', '',
'Premarket spreads, available size and auction participation must be measured before interpreting this as executable. These experiments do not justify a high-turnover default bot.', '',
'## Verification and limitations', '',
'The frozen dataset, stock split handling and nine intraday daily-candle fallbacks are documented in REPORT.md and summary.json. The main long-history results use actual daily openings and do not depend on repaired hourly bars. Hourly confirmation remains provisional, with recorded-price assumptions and no intrabar drawdown measurement. No cash interest, leverage or taxes are included.', '',
'No reliable point-in-time mNAV series was established for this expanded study, so a premium-based trading rule was not invented. The economic distinction between MSTR and BTC is real; the company’s annual report explains that equity premiums and capital structure can cause returns to diverge from its Bitcoin holdings. Historical price-ratio signals were tested under their correct name.', '',
'Trend-based protection was motivated by broad [time-series momentum research](https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum), but multi-asset trend evidence is not proof of an MSTR-specific edge.', '',
'Completed checks:', '']
lines+=['- '+s for s in x['checks']+v['checks']]
lines+=['',
'**Research decision:** retain BTC fast as the bull-focused reference and advance the joint SMA200 exit as the strongest candidate for MSTR across bull and bear periods. Do not call it guaranteed, do not replace the BTC strategy on this MSTR evidence, and do not automatically choose new parameters from the latest profitable backtest. No live site or bot change was made.', '',
 'Files: EXPANDED_PROTOCOL.md; expanded.py; expanded_validation.py; expanded-overview.json (all 74 candidates and compact validation); expanded-candidates.csv; expanded-trades.csv; expanded-comparison.png; expanded-trades.png. The larger reproducible expanded-summary.json / expanded-validation.json curve dumps remain local and ignored by Git.', '']
(P/'EXPANDED_REPORT.md').write_text('\n'.join(lines),encoding='utf-8')

overview={k:val for k,val in x.items() if k not in ['details','walkForward']}
overview['walkForward']={k:val for k,val in x['walkForward'].items() if k not in ['curve','ledger','pairs']}
overview['validation']={k:val for k,val in v.items() if k not in ['intraday','continuous2023to2026']}
overview['validation']['intraday']=[{**r,'result':{k:val for k,val in r['result'].items() if k not in ['curve','ledger','pairs']}} for r in v['intraday']]
overview['validation']['continuous2023to2026']={n:{k:val for k,val in r.items() if k not in ['curve','ledger','pairs']} for n,r in v['continuous2023to2026'].items()}
(P/'expanded-overview.json').write_text(json.dumps(overview,separators=(',',':')))

with (P/'expanded-candidates.csv').open('w',newline='',encoding='utf-8') as fp:
    keys=['shares','holding','trades','roundTrips','wins','usdReturn','holdReturn','usdDD','holdDD','shareDD']
    w=csv.writer(fp);w.writerow(['candidate','family','period',*keys])
    for n,rows in res.items():
        for period,r in rows.items():w.writerow([n,x['definitions'][n]['family'],period,*[r[k] for k in keys]])
with (P/'expanded-trades.csv').open('w',newline='',encoding='utf-8') as fp:
    w=csv.writer(fp);w.writerow(['candidate','period','side','timeUTC','informationCutoffUTC','adjustedPrice','unitsAfter','reason'])
    for n,rows in x['details'].items():
        for period,r in rows.items():
            for t in r['ledger']:w.writerow([n,period,t['side'],iso(t['time']),iso(t['decision']),t['price'],t['units'],t['reason']])

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,ax=plt.subplots(2,1,figsize=(12,8),gridspec_kw={'height_ratios':[1,1.05]})
years=list(map(str,range(2021,2027)));ix=np.arange(len(years));colors=['#85949e','#127da1','#d88747']
for j,n in enumerate([base,selected,'mstr_imacd6']):
    vals=[res[n][year]['shares'] for year in years]
    bars=ax[0].bar(ix+(j-1)*.25,vals,.25,label=labels[n],color=colors[j])
    ax[0].bar_label(bars,labels=[f'{z:.2f}' for z in vals],fontsize=8,padding=2)
ax[0].axhline(1,ls='--',color='#555',lw=1);ax[0].set_xticks(ix,years[:-1]+['2026 YTD']);ax[0].set_ylim(0,4.65);ax[0].legend(frameon=False,ncol=3,fontsize=9)
ax[0].set_title('Annual ending share equivalents — each year starts with one',loc='left',fontweight='bold')
for n,color in [(base,colors[0]),(selected,colors[1])]:
    curve=v['continuous2023to2026'][n]['curve'];ax[1].plot([dates(r[0]) for r in curve],[r[1] for r in curve],color=color,label=labels[n],lw=1.6)
walk=x['walkForward']['curve'];ax[1].plot([dates(r[0]) for r in walk],[r[1] for r in walk],color='#b78c43',label='Annual strategy re-selection',lw=1.3)
ax[1].axhline(1,ls='--',color='#555',lw=1,label='Holding');ax[1].xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'));ax[1].legend(frameon=False,ncol=2,fontsize=9)
ax[1].set_title('Continuous from January 2023 — selection dates differ; retrospective comparison',loc='left',fontweight='bold')
for a in ax:a.set_ylabel('Share equivalents');a.grid(axis='y',alpha=.2);a.set_axisbelow(True)
fig.suptitle('MSTR: a separate bear exit helps, but can miss a sharp recovery',fontsize=15,fontweight='bold')
fig.text(.01,.006,'Daily-opening fills; 0.1% per side; through Oct 9, 2026. Cash marked as fee-net share equivalents.\nThe fixed joint-exit candidate was selected using 2021–2024. Earlier outcomes are not prospective validation.',fontsize=9,color='#555')
fig.tight_layout(rect=[0,.05,1,.96]);fig.savefig(P/'expanded-comparison.png',dpi=160);plt.close(fig)

D=np.array(json.loads((P/'cache/MSTR_1d.json').read_text())['bars']);a=dt.datetime(2025,1,1,tzinfo=dt.timezone.utc).timestamp();D=D[D[:,0]>=a]
fig,axes=plt.subplots(2,1,figsize=(12,7.3),sharex=True,gridspec_kw={'height_ratios':[1.5,1]})
t=[dates(r[0]) for r in D];axes[0].plot(t,D[:,4],color='#354852',lw=1.4,label='MSTR close')
r=x['details'][selected]['validation'];fills=r['ledger']
for s,b in zip(fills[::2],fills[1::2]):axes[0].axvspan(dates(s['time']),dates(b['time']),color='#d8e7ed',alpha=.65)
for side,color,marker in [('sell','#cb624f','v'),('buy','#118c77','^')]:
    rows=[f for f in fills if f['side']==side];axes[0].scatter([dates(f['time']) for f in rows],[f['price'] for f in rows],color=color,marker=marker,s=42,zorder=3,label=side.upper()+' at next open')
axes[0].annotate('Bear exit\nOct 30: $269.99',xy=(dates(fills[-4]['time']),fills[-4]['price']),xytext=(dt.datetime(2025,11,10,tzinfo=dt.timezone.utc),340),arrowprops={'arrowstyle':'->','color':'#777'},fontsize=9)
axes[0].annotate('Re-entry\nAug 24: $121.84',xy=(dates(fills[-3]['time']),fills[-3]['price']),xytext=(dt.datetime(2026,5,10,tzinfo=dt.timezone.utc),215),arrowprops={'arrowstyle':'->','color':'#777'},fontsize=9)
axes[0].set_ylabel('MSTR price ($, adjusted)');axes[0].legend(frameon=False,ncol=3,fontsize=9);axes[0].set_title('Joint SMA200 exit: shaded periods are cash',loc='left',fontweight='bold')
for n,color in [(base,colors[0]),(selected,colors[1])]:
    curve=x['details'][n]['validation']['curve'];axes[1].plot([dates(z[0]) for z in curve],[z[1] for z in curve],label=labels[n],color=color,lw=1.6)
axes[1].axhline(1,ls='--',color='#555',lw=1,label='Holding');axes[1].set_ylabel('Share equivalents');axes[1].legend(frameon=False,fontsize=9);axes[1].xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'))
for ax in axes:ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True)
fig.suptitle('Most of the improvement came from avoiding one long decline',fontweight='bold',fontsize=15)
fig.text(.01,.01,'One share at January 2025; 0.1% per side. Cash marked in shares fluctuates with MSTR even while dollar cash is unchanged.\nDaily-open model fills through Oct 9, 2026; this is a researched candidate, not deployed trades.',fontsize=9,color='#555')
fig.tight_layout(rect=[0,.06,1,.96]);fig.savefig(P/'expanded-trades.png',dpi=170);plt.close(fig)
print('Expanded report, candidate/trade exports and two figures saved.')
