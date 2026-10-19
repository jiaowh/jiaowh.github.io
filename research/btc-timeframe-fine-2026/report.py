"""Publish fine-weight comparison without changing the live strategy."""
from pathlib import Path
import json,csv
from datetime import datetime,timezone
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
O=Path(__file__).resolve().parent
j=json.loads((O/'summary.json').read_text());full=json.loads((O/'results-full.json').read_text());v=json.loads((O/'production-validation.json').read_text())
L=j['labels'];C=L['current'];F=L['fine'];S=L['only72'];N=[C,F,S]
label={C:'Current: 72h x2',F:'Fine joint winner',S:'72h-only: x1.95',L['equal']:'Previous equal'}
def detail(n,k):return j['details'][n][k]
def vals(n,k):return [r['periods'][k]['btc'] for r in j['summary'][n]]
def cell(n,k):return f"{detail(n,k)['btc']:.4f}"+('*' if detail(n,k)['cash'] else '')
def wins(a,b):return sum(x>y+1e-9 for x,y in zip(a,b))
def ties(a,b):return sum(abs(x-y)<=1e-9 for x,y in zip(a,b))
def date(t):return datetime.fromtimestamp(t,timezone.utc).strftime('%Y-%m-%d %H:%M')
def weight(n):return ', '.join(f'{x:g}' for x in j['profiles'][n])
def stress(n,fee,delay,k):return [r['periods'][k]['btc'] for r in j['stress'] if r['name']==n and r['fee']==fee and r['delay']==delay]
years=list(map(str,range(2018,2027)));colors=['#0891b2','#a855f7','#d97706']
fig,axes=plt.subplots(3,1,figsize=(12,12),gridspec_kw={'height_ratios':[1,1,.9]})
x=np.arange(len(years));bw=.25
for i,n in enumerate(N):axes[0].bar(x+(i-1)*bw,[detail(n,k)['btc'] for k in years],bw,label=label[n],color=colors[i])
axes[0].axhline(1,ls='--',color='#374151',lw=1);axes[0].set_xticks(x,years[:-1]+['2026*']);axes[0].set_ylabel('BTC from 1 BTC');axes[0].legend(ncol=3,frameon=False);axes[0].set_title('Annual results: finer joint weights add losses in 2021 and 2026',loc='left')
for i,n in enumerate(N):axes[1].plot([r['phase'] for r in j['summary'][n]],vals(n,'2023-25'),marker='o',color=colors[i],label=label[n])
axes[1].set_xlabel('Candle boundary shift (hours; overlapping scenarios)');axes[1].set_ylabel('2023-2025 BTC');axes[1].set_title('Joint winner improves 5/8 alignments, but worsens the default and worst case',loc='left')
sweep=sorted([r for r in full['sweeps'] if r['axis']==5],key=lambda r:r['value'])
axes[2].plot([r['value'] for r in sweep],[np.exp(full['scores'][r['name']]['score']*2) for r in sweep],color='#0891b2',marker='.',lw=1)
axes[2].axvline(2,color='#374151',ls='--',label='Current 2x');axes[2].axvline(1.95,color='#d97706',ls=':',label='Training winner 1.95x');axes[2].legend(frameon=False)
axes[2].set_xlabel('72-hour multiplier (other five fixed at 1x)');axes[2].set_ylabel('Training lower-quartile BTC*');axes[2].set_title('Fine 0.05 steps: the training peak is close to current settings',loc='left')
for ax in axes:ax.spines[['top','right']].set_visible(False);ax.grid(alpha=.15);ax.set_axisbelow(True)
fig.suptitle('BTC timeframe multiplier fine tuning: retain the current weights',x=.08,ha='left',fontsize=17,fontweight='bold')
fig.text(.08,.015,'4,010 distinct profiles; selection uses 2023-2024 only. *2026 through Oct 9; training quartile is interpolated in log space.\n0.1% fee each side, next-open fills. Retrospective evidence; no future-profit guarantee. Annual accounts reset.',fontsize=9,color='#4b5563')
fig.tight_layout(rect=[.02,.06,.98,.96]);fig.savefig(O/'comparison.png',dpi=160);plt.close(fig)
lines=['# Fine tuning BTC timeframe multipliers','',
'Completed 19 October 2026. **Decision: retain the live weights [1, 1, 1, 1, 1, 2].** '
'The strongest training-ranked finer profile improves 2023-2024 but weakens several later and older results. '
'Neither shortlisted adjustment passes the predeclared replacement criteria. No chart or Telegram trading rules were changed.','',
'![Comparison](comparison.png)','',
'## What was tested','',
f'**{j["count"]:,} distinct profiles × 8 alignments = {j["count"]*8:,} training simulations.** '
f'Stage 1 contained {j["stage1"]:,} deduplicated joint-grid/one-axis/control profiles. '
f'Stage 2 added {j["stage2"]:,} distinct neighbors around the three training-only leaders. '
'The joint grid used 0.75/1/1.25 for 4h–48h and 1.5–3 in 0.25 steps for 72h; one-axis scans used 0.05 steps, '
'and the second joint pass used ±0.05 for 4h–48h and ±0.10 for 72h. This is a bounded local search, not all real-valued weights.','',
'The ranking maximizes the lower quartile of annualized log BTC in 2023–2024, requiring five round trips in every alignment. '
'Ties prefer proximity to production. The 2025/2026 and other annual results are evaluated after selection. '
'All years have previously been researched, so this is retrospective validation rather than an untouched holdout. '
'The 72% iMACD / 28% daily split, all indicator parameters, sale threshold and buyback rules stay fixed.','',
'| Profile | Multipliers: 4h, 8h, 12h, 24h, 48h, 72h | Training score |','|---|---|---:|']
for n in N:lines.append(f'| {label[n]} | {weight(n)} | {j["scores"][n]["score"]:.6f} |')
lines+=['','Fine winner total breadth shares: '+', '.join(f'{tf}h {72*w/sum(j["profiles"][F]):.2f}%' for tf,w in zip([4,8,12,24,48,72],j['profiles'][F]))+'. Daily indicators retain 28%.','',
'## Every year and continuous windows','',
'Each annual account starts with 1 BTC. Continuous windows carry positions across years. * = ending cash valued as purchasable BTC after the buy fee. '
'2026 ends October 9, matching the frozen dataset used in the original study.','',
'| Window | Current 2× | Fine joint | 72h 1.95× | Previous equal |','|---|---:|---:|---:|---:|']
for k in years+['train','2020-21','2023-25','2025-26','2019-21','2015-17']:
 lines.append('| '+('2023–2024 training' if k=='train' else k)+' | '+' | '.join(cell(n,k) for n in [*N,L['equal']])+' |')
lines+=['','## Candle alignment and costs','',
'Eight alignments shift four-hour and daily boundaries together. These scenarios overlap; their win counts are not probabilities.','',
'| Window / profile | Default BTC | Median BTC | Worst–best BTC | Wins / ties / losses vs current |','|---|---:|---:|---|---|']
for k in ['train','2020-21','2023-25','2025-26']:
 for n in N:
  a,b=vals(n,k),vals(C,k);w,t=wins(a,b),ties(a,b)
  lines.append(f'| {k} · {label[n]} | {a[0]:.4f} | {np.median(a):.4f} | {min(a):.4f}–{max(a):.4f} | {w} / {t} / {8-w-t} |')
lines+=['','The fine joint winner improves the median recent-cycle result, so it is not uniformly worse. '
'But its default recent-cycle result drops and its worst alignment falls below current. The 1.95× change mostly ties current on recent history.','',
'| Stress / profile | Default 2023–25 BTC | Worst 2023–25 BTC | Wins vs current | Worst 2025–26 BTC |','|---|---:|---:|---:|---:|']
for desc,fee,delay in [('0.3% each side',.003,0),('Extra 4h',.001,1),('0.3% + extra 4h',.003,1),('Extra 24h',.001,6)]:
 for n in N:
  a,b=stress(n,fee,delay,'2023-25'),stress(C,fee,delay,'2023-25')
  lines.append(f'| {desc} · {label[n]} | {a[0]:.4f} | {min(a):.4f} | {wins(a,b)}/8 | {min(stress(n,fee,delay,"2025-26")):.4f} |')
lines+=['','## Predeclared replacement checks','',
'| Candidate | ≥6/8 recent wins | Recent worst no worse | 2020–21 all >1 BTC | ≥6/8 high-fee wins | Pass |','|---|---|---|---|---|---|']
for key,n in j['selected'].items():
 p=j['promotion'][key];lines.append('| '+label[n]+' | '+' | '.join('Yes' if x else 'No' for x in [*p['checks'].values(),p['passed']])+' |')
lines+=['','No substitute runner-up was selected after looking at 2025/2026. Neither candidate meets the required evidence for a live switch.','',
'## Nearby settings and loss mechanisms','',
'Each selected candidate was perturbed one coordinate at a time by ±5%, giving 12 additional sensitivity scenarios without reselection.','',
'| Center | Neighbors beating current, default 2023–25 | Neighbor default 2023–25 range | Worst result across neighbors/alignments |','|---|---:|---|---:|']
for n in [F,S]:
 rows=[r for r in j['perturbations'] if r['name']==n];a=[r['phases'][0]['periods']['2023-25']['btc'] for r in rows];allv=[p['periods']['2023-25']['btc'] for r in rows for p in r['phases']]
 lines.append(f'| {label[n]} | {sum(x>detail(C,"2023-25")["btc"]+1e-9 for x in a)}/12 | {min(a):.4f}–{max(a):.4f} | {min(allv):.4f} |')
lines+=['','Smaller multiplier steps do not produce smoothly better trades: crossing the 50% boundary can create, skip or move an entire sale/buyback pair. '
'The fine profile changes emphasis toward 8h/12h and away from 24h/48h. In 2025 it makes '
f'{detail(F,"2025")["roundTrips"]} round trips versus {detail(C,"2025")["roundTrips"]} currently; in 2026 it adds '
f'{detail(F,"2026")["roundTrips"]} losing round trip while current makes none in the frozen window.','',
'| Fine-profile sale UTC | Buyback UTC | BTC change | Trigger |','|---|---|---:|---|']
for k in ['2025','2026']:
 for p in detail(F,k)['pairs']:lines.append(f'| {date(p["sale"])} | {date(p["buy"])} | {p["gain"]*100:+.2f}% | {p["reason"]} |')
lines+=['','## Risk and concentration','',
'| Period / profile | BTC drawdown | Dollar drawdown | Dollar return | BTC without best completed leg |','|---|---:|---:|---:|---:|']
for k in ['2023-25','2025','2026']:
 for n in N:
  r=detail(n,k);lines.append(f'| {k} · {label[n]} | {r["btcDD"]*100:.2f}% | {r["usdDD"]*100:.2f}% | {r["usdReturn"]*100:+.2f}% | {r["btcWithoutBestLeg"]:.4f} |')
lines+=['','Drawdowns are sampled at four-hour closes, not intrabar extremes. Removing the best leg is a fixed-ledger concentration diagnostic, not a simulation with new decisions. '
'Accumulating BTC does not guarantee protection against dollar losses; the current rule still holds through much of bear markets.','',
'## Validation and limits','',
f'- {j["parityChecks"]} prior-report baseline ledger/balance matches.\n'
f'- {j["prefixChecks"]} selected-profile/raw-history truncation checks, including event/recovery/ledger consistency.\n'
f'- Independent cash/BTC reconstruction for every shortlisted period and alignment.\n'
f'- {v["ledgers"]} Python/production-JavaScript ledgers and {v["fills"]:,} exact fills reconcile; buyback reasons and fee-net ending BTC agree.\n'
'- Frozen hourly-data hash matches the prior study. The same 122 missing hourly timestamps across 27 gaps from 2018 onward remain; they are not filled.','',
'More parameter trials can increase selection bias; this experiment does not estimate a probability of future outperformance. '
'See [Bailey et al., The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf). '
'Neither historical profits nor passing software checks establish a future trading edge.','',
'Files: [protocol](PROTOCOL.md), [all candidate weights and training results](candidates.csv), [selected trades](trades.csv), '
'[phase/stress details](summary.json), [production validation](production-validation.json), [data audit](data-audit.json). '
'Run `evaluate.py`, then `verify-production.mjs`, then `report.py`. Large search intermediates remain ignored.']
(O/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Wrote REPORT.md and comparison.png')
