"""Render the frozen experiment into a readable report and standalone figure."""
from pathlib import Path
import json
from datetime import datetime,timezone
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

O=Path(__file__).resolve().parent
j=json.loads((O/'summary.json').read_text());full=json.loads((O/'results-full.json').read_text())
B=j['named']['equal'];P=j['selected']['recent'];A=j['selected']['balanced'];N=[B,P,A]
LABEL={B:'Current equal weights',P:'Double 72h',A:'Balanced selector'}
def r(n,k):return j['details'][n][k]
def value(n,k):return r(n,k)['btc']
def cell(n,k):return f"{value(n,k):.4f}"+('*' if r(n,k)['cash'] else '')
def date(t):return datetime.fromtimestamp(t,timezone.utc).strftime('%Y-%m-%d %H:%M')
def percent(x):return f'{x*100:+.2f}%'
def phase_rows(n):return [v for v in full['rows'] if v['name']==n]
def stress(n,fee,delay):return [v for v in j['stress'] if v['name']==n and v['fee']==fee and v['delay']==delay]

years=list(map(str,range(2018,2027)))
colors=['#6b7280','#0891b2','#a855f7']
fig,(ax,ph)=plt.subplots(2,1,figsize=(12,8.2),gridspec_kw={'height_ratios':[1.25,1]})
x=np.arange(len(years));w=.24
for i,n in enumerate(N):ax.bar(x+(i-1)*w,[value(n,k) for k in years],w,label=LABEL[n],color=colors[i])
ax.axhline(1,color='#374151',lw=1,ls='--');ax.set_xticks(x,[*years[:-1],'2026*']);ax.set_ylabel('Ending BTC from 1 BTC');ax.set_ylim(0,1.75)
ax.set_title('Annual accounts: double 72h improves several years, but still loses BTC in 2019',loc='left',fontsize=12)
ax.legend(ncol=3,frameon=False);ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True)
for i,n in enumerate(N):
    rr=phase_rows(n);ph.plot([v['phase'] for v in rr],[v['periods']['2023-25']['btc'] for v in rr],marker='o',color=colors[i],label=LABEL[n])
ph.set_xticks([v['phase'] for v in phase_rows(B)]);ph.set_xlabel('Candle boundary shift (hours; scenarios overlap)');ph.set_ylabel('2023–2025 ending BTC')
ph.set_title('Double 72h beats current in 6/8 alignments; its worst alignment is worse',loc='left',fontsize=12);ph.grid(alpha=.18)
for axis in [ax,ph]:axis.spines[['top','right']].set_visible(False)
fig.suptitle('Fast iMACD: timeframe weighting experiment',x=.07,ha='left',fontsize=17,fontweight='bold')
fig.text(.07,.02,'*2026 through 9 October. 0.1% costs each side; next-open execution. Annual resets; multi-year window is continuous.\n665 profiles, selected on 2023–2024; later periods are retrospective checks, not fresh out-of-sample evidence.',fontsize=9,color='#4b5563')
fig.tight_layout(rect=[.02,.075,.98,.94]);fig.savefig(O/'comparison.png',dpi=180);plt.close(fig)

lines=['# Fast iMACD timeframe weighting','',
'Completed 18 October 2026. **665 unique weight profiles × eight candle alignments.** '
'Frozen prices through 9 October 2026; 0.10% fees each side; next-four-hour-open execution. '
'All trading rules and the 72% iMACD /28% daily split remain fixed.','',
'**Finding:** the primary training selector chose the simplest useful change: double the 72-hour timeframe '
'and leave the other five equal. Default 2023–2025 accumulation rises from **2.1072 to 2.2566 BTC** '
'(+7.09% relative to the current ending balance). The 2020–2021 result rises from **0.9304 to 1.0838 BTC**. '
'It beats current in six of eight recent-cycle alignments, but has a worse worst-case alignment. '
'This is a promising candidate for prospective comparison, not an established universal upgrade. '
'The deployed BTC/MSTR chart and notification rules were not changed.','',
'![Annual results and candle timing sensitivity](comparison.png)','',
'## What changed','',
'Within each timeframe, the three iMACD lengths (14/21/34) and their two tests (>zero, >signal) '
'remain equal. Signal smoothing stays at 13. Multipliers are normalized **inside** the iMACD block; '
'we did not accidentally increase or decrease the daily indicators.','',
'| Timeframe | Current share of total breadth | Double 72h | Balanced selector |',
'|---|---:|---:|---:|']
for i,tf in enumerate([4,8,12,24,48,72]):
    lines.append(f'| {tf}h | '+' | '.join(f'{72*j["profiles"][n][i]/sum(j["profiles"][n]):.2f}%' for n in N)+' |')
lines += ['', 'The daily 28% remains SMA 10%, momentum 10%, Donchian 8%. '
'The balanced selector uses relative multipliers **2/2/2/1/1/4**, or equivalently 1/1/1/0.5/0.5/2. '
'A 50% weighted breadth reading is a score threshold, not a 50% probability.','',
'## Selection and annual results','',
'The primary selector uses the lower quartile of 2023–2024 log BTC across the eight alignments, '
'requiring at least five completed trades per alignment. The secondary selector combines 60% recent, '
'30% 2019–2021 and 10% 2015–2017 annualized lower-quartile scores. Neither uses 2025/2026 to select '
'weights, but those years and the strategy itself were studied previously.','',
'Every annual account starts with 1 BTC. Multi-year windows carry continuously, so annual figures '
'need not multiply to the multi-year balance. * means cash valued as purchasable BTC after its buy fee.','',
'| Window | Current | Double 72h | Balanced selector |','|---|---:|---:|---:|']
for k in [*years,'2020-21','train','2023-25','2025-26','2015-17','2019-21']:
    label='2026 through Oct 9' if k=='2026' else '2023–2024 selection' if k=='train' else k
    lines.append(f'| {label} | '+' | '.join(cell(n,k) for n in N)+' |')
lines += ['', '**2026 is not a successful bear-market cash exit.** Double 72h takes no trades through October 9 '
'and holds its initial 1 BTC. It avoids the current model’s September 16–18 loss of 2.26% BTC, '
f'but still experiences **{abs(r(P,"2026")["usdDD"])*100:.2f}% dollar drawdown** and a '
f'**{r(P,"2026")["usdReturn"]*100:.2f}%** dollar return. Neither weighting scheme adds a bear exit.','',
'## Does it survive candle timing?','',
'| Window | Current range | Double 72h range | Beats current | Balanced range | Beats current |',
'|---|---:|---:|---:|---:|---:|']
for k in ['2020-21','train','2023-25','2025','2025-26']:
    def bounds(n):
        q=j['summary'][n][k];return f'{q["minimum"]:.4f}–{q["maximum"]:.4f}'
    lines.append(f'| {k} | {bounds(B)} | {bounds(P)} | {j["summary"][P][k]["winsVsEqual"]}/8 | {bounds(A)} | {j["summary"][A][k]["winsVsEqual"]}/8 |')
lines += ['', 'Double 72h’s recent-cycle minimum is **1.7599**, below current’s **1.8771**. '
'Its 2025 minimum is also lower (1.0883 vs 1.1397). These scenarios overlap; six wins out of eight '
'is not a 75% probability of future outperformance.','',
'## Fees and delayed execution','',
'Double 72h, compared against current under the **same** stress:','',
'| Stress | Current 2023–25 | Double 72h 2023–25 | Phase wins | Double 72h minimum | 2025–26 minimum |',
'|---|---:|---:|---:|---:|---:|']
for label,fee,delay in [('0.3% per side',.003,0),('Extra 4h',.001,1),('0.3% + extra 4h',.003,1),('Extra 24h',.001,6)]:
    a,b=stress(P,fee,delay),stress(B,fee,delay)
    wins=sum(x['periods']['2023-25']['btc']>y['periods']['2023-25']['btc']+1e-9 for x,y in zip(a,b))
    lines.append(f'| {label} | {b[0]["periods"]["2023-25"]["btc"]:.4f} | {a[0]["periods"]["2023-25"]["btc"]:.4f} | {wins}/8 | {min(v["periods"]["2023-25"]["btc"] for v in a):.4f} | {min(v["periods"]["2025-26"]["btc"] for v in a):.4f} |')
lines += ['', 'At 0.3% per side, double 72h still finishes 2020–2021 above 1 BTC in all eight phases '
'(minimum 1.0166). But an extra 4h delay reduces recent-cycle phase wins to 4/8. '
'A 24h delay produces a 2025–2026 loss in its worst phase (0.8830 BTC). Execution sensitivity remains.','',
'## What improved in 2025?','',
'Double 72h makes **eight round trips**, versus ten for current. It skips the losing June 6–7 '
'and August 3–4 trades. The June 18 exit becomes June 21, with a small loss still present. '
'Other differences include a slightly earlier January recovery, later October 12 exit, '
'and earlier October 28 exit before November’s buyback. This is not simply delaying every trade.','',
'| Double 72h sale (UTC) | Buyback (UTC) | BTC change | Buyback trigger |',
'|---|---|---:|---|']
for p in r(P,'2025')['pairs']:lines.append(f'| {date(p["sale"])} | {date(p["buy"])} | {percent(p["gain"])} | {p["reason"]} |')
lines += ['', 'These gains compound. The 2025 result rises from 1.2256 to 1.2735 BTC; sampled BTC drawdown '
f'changes from {r(B,"2025")["btcDD"]*100:.2f}% to {r(P,"2025")["btcDD"]*100:.2f}%, '
f'and dollar drawdown from {r(B,"2025")["usdDD"]*100:.2f}% to {r(P,"2025")["usdDD"]*100:.2f}%.','',
'Removing each rule’s single best completed cash-leg multiplier from its fixed 2023–2025 ledger '
f'leaves {r(B,"2023-25")["btcWithoutBestLeg"]:.4f} BTC for current and {r(P,"2023-25")["btcWithoutBestLeg"]:.4f} '
'for double 72h. The difference is not entirely one exceptional trade. This is a concentration '
'diagnostic, not a rerun with changed decisions.','',
'## Simpler controls and nearby weights','',
'| Profile | 2020–21 | 2023–25 | 2025 | 2026 |','|---|---:|---:|---:|---:|']
for label,n in j['named'].items():lines.append(f'| {label} | '+' | '.join(cell(n,k) for k in ['2020-21','2023-25','2025','2026'])+' |')
lines += ['', 'Halving 4h/8h weights or doubling the whole slow group gives up recent-cycle BTC. '
'The result favors the 72h timeframe specifically, not a blanket preference for all slow signals.','',
'| Move selected weights toward equal | 2023–2025 BTC | 2025 BTC |',
'|---|---:|---:|']
for q in j['shrink']:
    if q['name']==P and q['phase']==0:lines.append(f'| {q["towardEqual"]*100:.0f}% | {q["periods"]["2023-25"]["btc"]:.4f} | {q["periods"]["2025"]["btc"]:.4f} |')
lines += ['', 'The 25% and 50% shrinkage diagnostics retain a default recent-cycle improvement; '
'75% shrinkage falls slightly below current. The discrete trading threshold makes outcomes non-smooth.','',
'Top ten **training-ranked**, without reselection on later results:','',
'| Relative weights: 4/8/12/24/48/72h | 2023–2025 BTC | Phase wins vs current |',
'|---|---:|---:|']
for n in j['topTen']:lines.append(f'| {"/".join(map(str,j["profiles"][n]))} | {j["summary"][n]["2023-25"]["base"]["btc"]:.4f} | {j["summary"][n]["2023-25"]["winsVsEqual"]}/8 |')
audit=j['audit'];validation=json.loads((O/'production-validation.json').read_text())
lines += ['', '## Data, reproducibility and decision','',
f'The shared historical input contains {audit["missingHours2018Plus"]} missing hourly timestamps across '
f'{len(audit["gaps2018Plus"])} gaps from 2018 onward, mostly in 2018–2021; the only 2023+ gap is one '
'hour on March 24, 2023. We preserve the same input and aggregation behavior for exact comparison '
'with the deployed model. No gap filling was added. Older-cycle robustness remains conditional on '
'that history; this study does not independently certify data completeness. Pre-2017 inputs use the '
'existing rescaled Bitstamp splice; 2018+ uses Binance. See [the input audit](data-audit.json).','',
f'Validation passed: **{j["parityChecks"]} baseline report comparisons**, **{j["prefixChecks"]} '
'future-truncation profile checks**, independent selected fee accounting, and '
f'**{validation["ledgers"]} Python/production-JavaScript ledgers ({validation["fills"]} fills)**. '
'The JavaScript check instruments an in-memory copy of the production calculator; it does not edit '
'the live strategy. Selected truncated ledgers also match their full-history prefixes.','',
'**Decision:** retain double 72h as the primary candidate for forward comparison. Its simplicity, '
'improved default recent/older cycles and higher-cost survival make it stronger than the broad '
'fast/slow alternatives tested here. The lower worst-case recent result, execution sensitivity and '
'repeated use of the same history prevent treating it as a validated live replacement. The balanced '
'profile is a separate trade-off; it improves 2020–2021 more but worsens 2019 and still loses BTC in 2026.','',
'Searching many configurations can fit historical noise. '
'[Bailey et al., The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf) '
'explains this selection problem; this study does not compute a selection-adjusted probability of profit.','',
'Files: [protocol](PROTOCOL.md), [all 665 candidates](candidates.csv), [selected trade ledgers](trades.csv), '
'[phase/stress summary](summary.json). Full all-phase outcomes remain in locally ignored '
'`results-full.json`. Reproduce with `evaluate.py`, `verify-production.mjs`, then `report.py`, using '
'the adjacent quant repository and frozen inputs referenced by the existing research engine.']
lines += ['', '## Adoption on 18 October 2026', '',
'After reviewing these results, the user authorized deploying double 72h for BTC. The first tab, Indicators tab and Telegram now share the weighted calculator. MSTR retains equal iMACD timeframe weights and its Vortex blend. Migration carries the existing position, sale details and unsent alerts, then evaluates the new rule at the latest completed close. The limitations documented above remain applicable. The production verifier now compares the adopted calculation directly against the frozen Python ledgers.']
(O/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Created REPORT.md and comparison.png')
