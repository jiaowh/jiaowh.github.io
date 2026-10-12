"""Reproducible public parameter and mixture report from the bounded sweep."""
from pathlib import Path
import json, math

O=Path(__file__).resolve().parent
j=json.loads((O/'imacd-results.json').read_text())
B='original_s9_im100_timeout';R='original_s9_im100_e50'
S='original_s13_im100_timeout';F=j['selected']['recent'];W=j['selected']['weighted']
M='original_s9_im50_e50'
rows={n:[r for r in j['rows'] if r['name']==n] for n in j['rules']}
def base(n,k):return rows[n][0]['periods'][k]
def cell(n,k):return f"{base(n,k)['btc']:.4f}"+('*' if base(n,k)['cash'] else '')
def bounds(n,k):
    a=[r['periods'][k]['btc'] for r in rows[n]]
    return f'{min(a):.4f}–{max(a):.4f}'
def wins(n,ref=B,k='2023-25'):
    return sum(a['periods'][k]['btc']>b['periods'][k]['btc']+1e-9 for a,b in zip(rows[n],rows[ref]))
labels={B:'Current refined',R:'Current + >50% recovery',S:'Signal 13 only',F:'Fast iMACD, signal 13 + recovery',
        W:'Slow iMACD / MACD 50:50, signal 13',M:'Current iMACD / MACD 50:50 + recovery',
        'original_s9_im50_timeout':'Current iMACD / MACD 50:50, timeout',
        'macd_scaled_timeout':'Scaled MACD only','macd_classic_timeout':'Classic 12/26/9 MACD only',
        'imzero_macross_timeout':'iMACD zero + MACD signal-cross',
        'mazero_imcross_timeout':'MACD zero + iMACD signal-cross',
        'slow_s9_im50_timeout':'Slow iMACD / MACD 50:50, signal 9'}
lines=['# iMACD internal parameters and ordinary MACD mixtures','',
'Completed 12 October 2026 (Singapore). Frozen prices through 9 October 2026. '
'128 rules × eight candle alignments; every rule starts with 1 BTC in each test window. '
'0.10% cost per side; completed-bar decisions and next four-hour open fills. '
'Annual accounts reset; multi-year accounts carry continuously. * denotes ending cash marked as BTC after a purchase fee. '
'Annual results therefore need not multiply to the continuous result.','',
'**Finding:** internal parameters materially change the result. The recent-training winner earns 2.1072 BTC over 2023–2025 '
'and beats both existing controls in all eight alignments, but loses BTC in 2019–2021 and the partial 2026 test. '
'Mixing iMACD and MACD can improve individual periods; it does not dominate the original across periods. '
'These results support further consideration of a recent-cycle candidate, not a claim of always beating 1 BTC. '
'The active Average and refined strategy formulas remain unchanged.','',
'## What can be tuned?','',
'The existing iMACD ensemble uses lengths 21/34/55, nine-bar signal smoothing, and 4/8/12/24/48/72-hour timeframes. '
'For each length and timeframe it casts two votes: impulse >0 and impulse > its signal. '
'The impulse is the distance of a zero-lag typical-price average outside a smoothed high/low channel; it is zero inside that channel. '
'The channel and zero-lag average share the main length. The signal is an SMA of the impulse. '
'This implementation has no separate fast/slow pair: those belong to ordinary MACD. '
'[Original iMACD author description](https://www.tradingview.com/script/qt6xLfLi-Impulse-MACD-LazyBear/).','',
'Standard MACD subtracts a slow closing-price EMA from a fast EMA and smooths the result with an EMA signal. '
'[Fidelity MACD definition](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/macd). '
'Our scaled MACD block uses slow lengths 21/34/55, fast lengths 10/16/25 and signal 9, on the same six timeframes. '
'The classic control instead uses 12/26/9 at each timeframe, normalized to the same total block weight.','',
'## Controlled experiment','',
'Five length triplets: 14/21/34, 18/30/48, 21/34/55, 24/40/64 and 34/55/89. '
'Signal SMA lengths: 5, 9 and 13. For each set, test pure iMACD and 75/25, 50/50 and 25/75 iMACD/MACD mixtures. '
'Add scaled MACD, classic MACD and the two zero/cross slot swaps. Test each with timeout-only or additional >50% breadth recovery. '
'The 72% oscillator block and 28% daily block remain constant. A 50/50 mix means 36% total iMACD, 36% total MACD, '
'10% daily SMA, 10% daily momentum and 8% daily Donchian. MACD and iMACD remain correlated price transforms.','',
'All retain the buffered daily SMA200 gate, fresh three-close transition below 50% breadth, 10% nominal BTC buyback target '
'and seven-day timeout. The recovery variant adds a buyback when its own blended breadth closes >50%. '
'Target calculations retain the nominal 0.10% cost assumption even under higher-cost stress. '
'No bear-year calendar override is applied. [Declared protocol](IMACD_PROTOCOL.md).','',
'Earlier notes (`../quant/reports/Average strategy v2 research.md`, Round 5) tested the two slot swaps under the older '
'Average dollar/Sharpe objective and did not adopt them. The previous BTC study varied weights and indicator families '
'but kept iMACD lengths/smoothing fixed. This study addresses that missing parameter test.','',
'## Main comparison','',
'| Rule | 2020 BTC | 2025 BTC | Continuous 2023–2025 BTC | Eight-alignment cycle range | Beats current / prior recovery |',
'|---|---:|---:|---:|---:|---:|']
for n in [B,R,S,F,W,M,'original_s9_im50_timeout','imzero_macross_timeout','mazero_imcross_timeout','macd_scaled_timeout','macd_classic_timeout']:
    lines.append('| '+labels[n]+' | '+' | '.join(cell(n,k) for k in ['2020','2025','2023-25'])+f' | {bounds(n,"2023-25")} | {wins(n)}/8 · {wins(n,R)}/8 |')
lines += ['', 'Reference self-comparisons show zero wins by definition. Candle alignments shift both intraday and daily boundaries; '
'they use overlapping prices and are not eight independent samples.','',
'## Selection and annual results','',
'The recent selector maximizes the lower quartile of annualized log BTC across alignments in 2023–2024. '
'It selects **14/21/34 iMACD lengths, signal SMA 13, plus >50% early recovery**. '
'Its training lower-quartile BTC is '+f"{math.exp(j['scores'][F]['recent']*2):.4f}"+' versus '+f"{math.exp(j['scores'][B]['recent']*2):.4f}"+' for current. '
'The recency-weighted selector uses 60% that score, 30% annualized 2019–2021, 10% annualized 2015–2017. '
'It selects **34/55/89 iMACD lengths, signal 13, mixed 50/50 with scaled MACD, timeout only**. '
'Both selectors exclude 2025/2026, but all of this history was previously examined. This is retrospective testing with accumulated selection risk, '
'not untouched out-of-sample evidence. Signal 13 is the upper boundary tested, not an established global optimum.','',
'| Window, starting 1 BTC | Current | Prior recovery | Signal 13 only | Recent-selected fast | Weighted-selected mix |',
'|---|---:|---:|---:|---:|---:|']
for k in [*map(str,range(2018,2027)),'2015-17','2019-21','2020-21','train','2023-25']:
    lines.append('| '+('2026 through Oct 9' if k=='2026' else '2023–2024 training' if k=='train' else k)+' | '+' | '.join(cell(n,k) for n in [B,R,S,F,W])+' |')
lines += ['', '**Simple smoothing change:** signal 9→13 alone leaves the timeframes, main lengths and trade rules unchanged. '
'It improves default 2019 from 0.9945 to 1.1011 and 2020 from 0.9073 to 1.0780. Both years finish >1 in all eight alignments. '
'However, 2025 falls from 1.1506 to 1.1388, 2021 also weakens, and the 2015–2017 default remains below 1. '
'Its recent-cycle gain beats current in only four alignments and the prior recovery candidate in two. '
'It does not remove the worst July 2020 mistake: both versions lose 14.57% BTC on the same July 21 sale and seven-day buyback. '
'Much of the annual improvement comes from March: signal 13 earns 32.23% on its March 9 sale/buyback, versus 10.50% '
'on the original March 8 trade. The nominal target is a decision threshold, not a limit order or a cap on the realized gain; '
'the next-open execution during a sharp crash can differ considerably. The smoother signal compensates for the July loss elsewhere.','',
'**Recent-selected faster iMACD:** 2023–2025 reaches 2.1072 BTC (+110.72%) and ranges 1.8771–2.1882. '
'The 2025 result is 1.2256 with ten completed round trips, five winners and 9.43% BTC drawdown; current has eight trips, four winners and 14.99% drawdown. '
'A win rate around half can still add BTC because the gains and losses differ in size. '
'The full 2019–2021 default is 0.9283 and its 2020 and 2021 standalone defaults are both approximately 0.9646. '
'Faster is not universally better.','',
'**50/50 default mixture plus recovery:** 1.9300 BTC over the recent cycle and 1.2313 in 2025 look attractive, '
'but the cycle range is 1.6725–1.9300. It beats the prior recovery candidate in only one alignment and loses in two 2020 alignments. '
'That is weaker sensitivity evidence than the faster pure-iMACD candidate.','',
'**Bear-year interpretation:** a fresh 2022 account makes no trades for the displayed candidates and finishes at 1 BTC; '
'that means it experienced the price decline while holding, not that it protected dollar capital. '
'The recent-selected candidate finishes partial 2026 at 0.9774 BTC after a losing trade; current finishes at 1 with no trades. '
'This bull-gated tactical strategy is not a standalone bear-market exit system.','',
'## Nearby settings, not just the winner','',
'All rows below use pure iMACD within the 72% oscillator block and >50% recovery. '
'Only lengths and signal smoothing change. Full 128-rule outcomes are in the downloadable summary.','',
'| Main lengths | Signal | 2020 BTC | 2025 BTC | 2023–2025 BTC | Cycle alignment range |',
'|---|---:|---:|---:|---:|---:|']
lengths={'fast':'14/21/34','nearfast':'18/30/48','original':'21/34/55','nearslow':'24/40/64','slow':'34/55/89'}
for l in lengths:
    for s in [5,9,13]:
        n=f'{l}_s{s}_im100_e50'
        lines.append(f'| {lengths[l]} | {s} | '+' | '.join(cell(n,k) for k in ['2020','2025','2023-25'])+f' | {bounds(n,"2023-25")} |')
lines += ['', 'The fast-length signal-9 neighbor also holds up in the recent cycle (minimum 1.8447 BTC), '
'so the selected result is not an isolated winning point. Signal 5 is substantially more alignment-sensitive. '
'Changing the length triplet to the nearby 18/30/48 with signal 13 reduces the minimum to 1.6799, so parameter sensitivity remains material.','',
'## Execution stress','',
'Ranges below cover the same eight alignments. Costs combine the per-side friction assumption; delay means extra bars after the usual next-open fill.','',
'| Candidate | Stress | 2020 BTC range | 2025 BTC range | 2023–2025 BTC range |',
'|---|---|---:|---:|---:|']
for n in [F,S,W,R]:
    for fee,d,label in [(.003,0,'0.30% each side'),(.001,1,'Extra 4h'),(.001,6,'Extra 24h'),(.003,1,'0.30% + extra 4h')]:
        rr=[r for r in j['stress'] if r['name']==n and r['fee']==fee and r['delay']==d]
        lines.append('| '+labels[n]+' | '+label+' | '+' | '.join(f"{min(r['periods'][k]['btc'] for r in rr):.4f}–{max(r['periods'][k]['btc'] for r in rr):.4f}" for k in ['2020','2025','2023-25'])+' |')
lines += ['', 'The fast recent-selected candidate remains above 1 BTC in all tested 2025 and recent-cycle stresses, '
'but older losses persist. Signal-13-only drops below 1 in a 2025 alignment under higher costs or 24h delay. '
'The weighted mixed candidate also drops below 1 in a 2025 alignment at higher costs. '
'None of these results proves future profits or superiority at every execution time.','',
'## Verification and reproducibility','',
f"{j['parityChecks']} annual ledger comparisons reproduce the original timeout and recovery controls across eight alignments. "
f"{j['prefixChecks']} breadth-prefix checks (64 definitions at two historical cutoffs) verify that later prices do not change earlier signals. "
'Original iMACD breadth and scaled MACD breadth match prior implementations. The account engine independently reconciles each cash leg. '
'The hourly source has one previously documented missing hour on 24 March 2023; it is retained, not fabricated. '
'These checks detect implementation errors but cannot remove historical selection bias.','',
'Run `imacd_tuning.py`, then `imacd_report.py` using the existing Python research environment and adjacent quant modules. '
'[Protocol](IMACD_PROTOCOL.md) · [All rule/phase results, selected ledgers and stress summary](imacd-summary.json). '
'Large intermediate raw results remain locally ignored.','']
(O/'IMACD_REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
summary=dict(asOf='2026-10-09',completed='2026-10-12',rules=j['rules'],selected=j['selected'],subgroups=j['subgroups'],
             scores=j['scores'],rows=j['rows'],details=j['details'],stress=j['stress'],
             parityChecks=j['parityChecks'],prefixChecks=j['prefixChecks'],
             notes='Retrospective; no live strategy replacement. Annual accounts reset. Cash is fee-net BTC equivalent. Alignments are not independent.')
(O/'imacd-summary.json').write_text(json.dumps(summary,separators=(',',':')),encoding='utf-8')
print('Wrote IMACD_REPORT.md and imacd-summary.json')
