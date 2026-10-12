"""Publish the compact diagnostic, retaining full experiment outputs locally."""
from pathlib import Path
import json,math
O=Path(__file__).resolve().parent
j=json.loads((O/'confidence-results.json').read_text())
names=['none_timeout','none_e60','none_e50','adx20_timeout']
labels={'none_timeout':'Current refined','none_e60':'Add >60% recovery','none_e50':'Add >50% recovery','adx20_timeout':'ADX20 bearish filter'}
def value(n,k):return j['summary'][n][k]['base']['btc']
lines=['# Recovery buybacks and signal confidence','',
'Completed 11 October 2026. Tested 40 fixed rule combinations across eight candle alignments. '
'The baseline matched the existing engine in all 72 annual/phase checks, including fills, BTC and drawdown. '
'Every filter and recovery condition passed future-truncation checks at two dates. Synthetic checks verify next-open recovery fills, delayed-sale repricing, timeout and rejected-event behavior.','',
'**Finding:** buying back when breadth first exceeds 50% is a promising research candidate. '
'It improved default-alignment 2020 and 2023–2025 results, but worsened 2019 and was not chosen by the predeclared 2023–2024 robustness ranking. '
'The extra sell filters did not establish a reliable high-confidence subset. No live rule has been replaced.','',
'## Rules and accounting','',
'All columns retain the bullish buffered daily SMA200 gate, a new transition into three closed 4h breadth readings below 50%, '
'a 10% BTC target, seven-day maximum cash wait, and full-account next-open fills. Costs are 0.10% each side. '
'The recovery variants additionally buy after a close with breadth strictly above their threshold. '
'50% exactly does not qualify; with 50 members, >50% means at least 26 bullish votes (52%). '
'Buyback acts independently of the sale gate. The ADX variant requires completed-daily ADX14 >20 and -DI > +DI at the sale signal. '
'Calendar bear exits are separate. Dollar losses can remain large while BTC units hold steady.','',
'## Annual and continuous results','',
'Each year starts separately with 1 BTC. Multi-year rows are continuous accounts; do not multiply annual rows when cash carries across a boundary. '
'Ending cash is valued as BTC after its purchase fee; 2024 ends in cash in the baseline and both recovery variants. 2026 stops on October 9 UTC.','',
'| Window | Current refined | Add >60% recovery | Add >50% recovery | ADX20 bearish filter |',
'|---|---:|---:|---:|---:|']
for k in [*map(str,range(2018,2027)),'2015-17','2019-21','2020-21','train','2023-25']:
    lines.append('| '+('2023–2024 training' if k=='train' else k)+' | '+' | '.join(f'{value(n,k):.4f} BTC' for n in names)+' |')
lines += ['', '## What happened to the July 2020 loss?', '',
'All three unfiltered variants sold July 21 at $9,315.28. The current rule bought July 28 at $10,881.62. '
'The >60% rule bought July 23 at $9,518.16; the >50% rule bought July 22 at $9,390.00. '
'The early exits still lost BTC on this particular trade, but cut the missed-rally damage substantially. '
'The >50% rule changed full-year 2020 from 0.9073 to 1.0426 BTC. It also changed 2019 from 0.9945 to 0.9593 BTC: earlier recovery is not universally beneficial.', '',
'For continuous 2023–2025, >50% recovery increased ending BTC from 1.6638 to 1.8283 and reduced the default-alignment BTC-equivalent maximum drawdown from 18.38% to 13.49%. '
'This is a hindsight diagnostic of a predeclared neighbor, not independent forecasting evidence.', '',
'## Selection and sensitivity', '',
'The declared selector maximized the 25th percentile of log BTC across eight alignments using only 2023–2024. '
'It retained the baseline, both among recovery-only alternatives and across all 40 rules. '
'Its training score expressed in BTC was 1.5795, versus 1.5582 for >50% recovery and 1.5442 for >60% recovery. '
'The filter requiring at least five training round trips per alignment also retained the baseline. '
'History was already inspected; 2025 is a retrospective chronological check, not a pristine holdout.', '',
'| Rule | 2020 BTC range | 2025 BTC range | 2023–2025 BTC range |',
'|---|---:|---:|---:|']
for n in names:
    lines.append('| '+labels[n]+' | '+' | '.join(f"{j['summary'][n][k]['minimum']:.4f}–{j['summary'][n][k]['maximum']:.4f}" for k in ['2020','2025','2023-25'])+' |')
lines += ['', 'Stress results for the >50% recovery candidate (ranges across eight alignments):','',
'| Execution assumption | 2020 | 2025 | 2023–2025 |','|---|---:|---:|---:|']
for fee,delay,label in [(.003,0,'0.30% cost per side'),(.001,1,'Extra 4h delay'),(.001,6,'Extra 24h delay'),(.003,1,'0.30% cost + extra 4h delay')]:
    rr=[r for r in j['stress'] if r['name']=='none_e50' and r['fee']==fee and r['delay']==delay]
    lines.append('| '+label+' | '+' | '.join(f"{min(r['periods'][k]['btc'] for r in rr):.4f}–{max(r['periods'][k]['btc'] for r in rr):.4f}" for k in ['2020','2025','2023-25'])+' |')
lines += ['', 'The 2020 improvement is fragile under higher costs: some alignments fall below 1 BTC. '
'2025 and the full recent cycle remain above 1 BTC in all listed candidate stresses. '
'A favorable delayed-fill outcome does not mean delays are beneficial in general.', '',
'## Strong versus weak signals', '',
'We tested additional price damage, support breaks, volatility-scaled damage, trend strength/direction, '
'directional efficiency, agreement among indicator families, and a two-of-three combination. '
'These are candidate filters, not confidence probabilities. All are price-derived and correlated.', '',
'For this diagnostic, every original eligible event receives an isolated seven-day/target round trip, even if another hypothetical trade overlaps. '
'Thus the 2025 population has 10 labeled events although the real baseline account takes eight round trips. '
'Signals whose round trip crosses a period boundary are excluded from that period. Win means fee-net BTC gain, not successful crash prediction.', '',
'| Extra filter | 2018–2022 accepted wins/events | 2023–2024 accepted wins/events | 2025 accepted wins/events | 2025 mean BTC return/event |',
'|---|---:|---:|---:|---:|']
filter_labels={'none':'None','ma20':'Daily close below SMA20','ma50':'Daily close below SMA50','support10':'Break prior ten-day support','atrhalf':'Below SMA20 by half ATR14','adx20':'ADX >20 and bearish DI','adx25':'ADX >25 and bearish DI','efficiency':'Directional efficiency ≥0.30, down','family3':'Three bearish families','confluence2':'Two of three confirmations'}
for f,label in filter_labels.items():
    stats=[j['quality'][w][f]['accepted'] for w in ['older','train','2025']]
    lines.append('| '+label+' | '+' | '.join(f"{s.get('wins',0)}/{s['n']}" for s in stats)+' | '+(f"{stats[-1]['mean']*100:+.2f}%" if stats[-1]['n'] else '—')+' |')
lines += ['', '**ADX20 is worth observing, but not calling proven.** It admitted three winners in 2025. '
'The descriptive 95% Wilson interval for 3/3 spans about 44%–100%, even before accounting for correlated events or multiple testing. '
'Its older-period events won only 8/16. In actual portfolio replay, changing candle alignment made its 2025 result range from 0.9500 to 1.3044 BTC. '
'Default continuous 2023–2025 performance was only 1.1887 BTC versus 1.6638 without the filter, although BTC drawdown was lower (6.78% versus 18.38%). '
'The filter trades off participation for lower drawdown; it does not establish more reliable accumulation.', '',
'**Support breaks and extra confirmations can arrive too late.** The tested support-break subset won 1/3 events in 2025. '
'The half-ATR damage subset won 2/5. Waiting for more visible damage can sell after much of the decline is over, before a rebound. '
'This is an interpretation consistent with these outcomes, not proof that every support or volatility rule fails.', '',
'## Research sources and what they do establish', '',
'- [Fidelity on ADX](https://www.fidelity.com/viewpoints/active-investor/average-directional-index-ADX): ADX measures strength; directional-movement lines supply direction. A high ADX alone is not bearish. Educational thresholds motivated the tests; they do not validate this strategy.',
'- [Fidelity on ATR](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr): ATR measures volatility, not direction. Volatility-scaled damage is a way to normalize a move, not infer that it must continue.',
'- [CME on open interest](https://www.cmegroup.com/education/courses/introduction-to-futures/open-interest): participation can complement price-trend analysis. Volume, open interest and funding warrant separate tests with consistent historical coverage and publication-time lags. They were not backtested in this batch; no predictive success is claimed.',
'- [Bailey et al., The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf): repeatedly searching historical data can select false positives. Forty new variants are additional research trials, not forty independent validations.', '',
'## Practical interpretation', '',
'The most useful new candidate is a faster buyback after breadth exceeds 50%, while keeping the target and timeout. '
'The strongest evidence concerns limiting missed-rally damage, not predicting crashes with certainty. '
'Keep the current rule as the reference and label this alternative experimental; compare forward signals and executable fills before replacing it. '
'The ADX filter can be displayed as context, but should not be turned into an invented “high-confidence” percentage or automatically justify a larger position.', '',
'Reproduce with `confidence.py`, then `confidence_report.py`; Python/NumPy and the same adjacent quant research inputs are required. '
'See [the declared protocol](CONFIDENCE_PROTOCOL.md). Full trial outputs remain locally in the ignored `confidence-results.json`; '
'the compact [published summary](confidence-summary.json) retains all rule scores, phase/window summaries and accepted/rejected event diagnostics.']
(O/'CONFIDENCE_REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
compact={k:j[k] for k in ['selected','scores','summary','quality','parityChecks']}
compact['allRules']={n:{k:{'base':next(r['periods'][k] for r in j['rows'] if r['name']==n and r['phase']==0),
 'minimum':min(r['periods'][k]['btc'] for r in j['rows'] if r['name']==n),
 'maximum':max(r['periods'][k]['btc'] for r in j['rows'] if r['name']==n)} for k in ['train','2025','2023-25']} for n in j['scores']}
compact['stress']=j['stress']
(O/'confidence-summary.json').write_text(json.dumps(compact,separators=(',',':')))
print('Published CONFIDENCE_REPORT.md and confidence-summary.json')
