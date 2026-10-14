"""Produce the human-readable report, chart and trade export from summary.json."""
from pathlib import Path
import json, csv, datetime as dt
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

P=Path(__file__).resolve().parent
x=json.loads((P/'summary.json').read_text())
iso=lambda t:dt.datetime.fromtimestamp(t,dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
f=lambda v:f'{v:.4f}'
pct=lambda v:f'{v*100:.1f}%'
daily=x['dailyMirror'];hourly=x['hourlyMirror'];native=x['native']
lines=['# Does fast iMACD + recovery transfer to MSTR?', '',
'Evaluation date: October 12, 2026. Prices through October 9, 2026. Frozen BTC parameters; no MSTR parameter optimization.', '',
'**Finding:** using BTC signals to time MSTR was promising in the 2023–2025 sample. It was not consistently better than holding, did not protect the 2022 bear market, and lost shares in 2026. Recalculating the indicators directly on MSTR produced a small, fragile 2025 advantage and no 2026 trades. These are different implementations.', '',
'## Measurement and execution', '',
'Start each annual test already holding one split-adjusted unit. Holding is always 1.0000. Values above one mean more shares than holding; below one mean fewer. The August 2024 ten-for-one stock split is already reflected in the historical OHLC: a literal pre-split share would become ten, so normalized units are essential. Cash at the endpoint is converted to share equivalents using the last close and a buy fee. Fractional shares are allowed.', '',
'Charge 0.1% per side. No borrowing, cash yield, tax, or leverage. Fills use the next available observed regular-session opening price, never a weekend or the same candle close that produced the signal. Auction execution at a quoted open is a model assumption; results are not actual brokerage fills. A larger 0.3% cost and delays are tested separately.', '',
'The BTC mirror retains the BTC price target and timer; it follows the latest BTC/cash model position. It is not an MSTR-specific 10% buyback target. Opposing BTC signals while MSTR is closed cancel before the next opening. The native version instead applies the target and timer to its actual MSTR sale.', '',
'## Annual BTC-signal mirror: consistent daily-open execution', '',
'Daily-open execution provides a long-history comparison. It does not claim that an intraday bot would achieve these same returns. Annual rows reset; continuous periods below carry state.', '',
'| Year | Fast + recovery | Original + recovery | Original, seven-day/target only |',
'|---|---:|---:|---:|']
for y in map(str,range(2018,2027)):
    label=y+' YTD' if y=='2026' else y
    vals=[f(daily[r][y]['shares'])+(' *' if not daily[r][y]['holding'] else '') for r in ['fast_recovery','original_recovery','original_timeout']]
    lines.append('| '+label+' | '+' | '.join(vals)+' |')
lines+=['','*Ended in cash; value is fee-net share equivalent. 2018–2019 and much of 2020 predate MSTR’s Bitcoin treasury strategy, so they represent a different business regime.', '',
'| Continuous period | Fast + recovery | Original + recovery | Original, target/timer |',
'|---|---:|---:|---:|']
for y in ['2020-21','2023-25','2025-26','2024-26']:
    lines.append('| '+y+' | '+' | '.join(f(daily[r][y]['shares']) for r in ['fast_recovery','original_recovery','original_timeout'])+' |')
lines+=['','## Recent years with hourly opening fills', '',
'| Period | Follow BTC fast signals | Follow BTC original recovery | Native MSTR fast adaptation |',
'|---|---:|---:|---:|']
for y in ['2024','2025','2026','2025-26']:
    v=native['fast_recovery'].get(y)
    lines.append('| '+y+' | '+f(hourly['fast_recovery'][y]['shares'])+(' *' if not hourly['fast_recovery'][y]['holding'] else '')+' | '+f(hourly['original_recovery'][y]['shares'])+(' *' if not hourly['original_recovery'][y]['holding'] else '')+' | '+(f(v['shares']) if v else 'Not tested: insufficient native warm-up for full year')+' |')
lines+=['','The native adaptation uses session-anchored 4h bars (09:30–13:30, then the remaining session). Its 8h/12h/24h groups each contain one trading session; 48h/72h contain two/three sessions. Some votes therefore duplicate one another. SMA200 means 200 trading sessions. This is an explicitly defined stock adaptation, not an identical 24/7 BTC clock or a universal result for all chart platforms.', '',
'Native fast had four completed trades in 2025 and only one winner. That winner gained 15.6% in shares, offsetting three losing buybacks. Changing multi-session group alignment moved its 2025 result from **0.9545 to 1.0231**. The original native recovery control ended at **0.6943**. Neither native version traded in 2026. There is no convincing robust edge from the native transfer in this small sample.', '',
'## Why it succeeds and fails', '',
'- **2023–2025:** BTC weakness sometimes preceded a larger MSTR decline, increasing the shares bought back. In the daily-open 2024 run, the August 1–5 trade added 53.3%, April 15–18 added 23.1%, and April 25–May 1 added 20.5% in shares. The large August gain occurred before the August 8 split; it is not a split artifact. This is an observation about those trades, not proof that MSTR always amplifies BTC.',
'- **Rebound risk:** BTC recovery does not guarantee a cheaper MSTR entry. January 28–29, 2021 lost 17.6% of shares; October 2–9, 2024 lost 15.6%. Rapid recovery and forced timer entries can crystallize a loss.',
'- **2026:** the hourly BTC mirror sold September 16 at $125.74 and bought September 18 at $136.58, losing 8.12% of shares after costs. The BTC trigger and target are BTC-based; MSTR can move differently between the sale and re-entry.',
'- **Bear protection is absent:** SMA200 gates permission to start a correction trade. Turning bearish does not instruct this strategy to sell. In 2022 it made no trades, kept 1.0000 shares, and suffered a 74.3% dollar loss from the first regular-session opening to the last close. In 2026 its hourly sampled maximum dollar drawdown was 58.2%, essentially the holding drawdown. Preserving units does not preserve dollar capital.', '',
'## Robustness and practical limits', '',
'All eight previously used BTC clock offsets are reported. These reuse the same market history and are not eight independent statistical samples.', '',
'| Period / execution | Minimum shares | Maximum shares | Phases above 1 |',
'|---|---:|---:|---:|']
for period,method in [('2020-21','daily'),('2023-25','daily'),('2024','hourly'),('2025','hourly'),('2026','hourly')]:
    vals=[r[method]['shares'] for r in x['btcPhaseStress'] if r['period']==period]
    lines.append(f'| {period} / {method} | {min(vals):.4f} | {max(vals):.4f} | {sum(v>1 for v in vals)}/8 |')
lines+=['','For the 2023–2025 daily-open run, raising costs to 0.3% per side reduced 4.5211 to 4.0908 shares. Adding 24 hours to every signal reduced it to 2.2162. The positive result survives these separate stresses, but its magnitude is highly execution-sensitive. For hourly 2025–2026, a 24-hour delay reduced 1.1403 to 0.8887, reversing the apparent advantage.', '',
'The fast rule was previously chosen using BTC history, especially 2023–2024. Testing correlated MSTR prices in those same years is useful transfer evidence, but not a clean independent holdout. No rule here demonstrates an always-above-one guarantee or a complete bear-market system.', '',
'## Data quality and verification', '',
f"Yahoo daily OHLC and cached hourly history plus a fresh October update. Hourly coverage begins {x['audit']['firstIntraday'][:10]}. {x['audit']['sessions']} sessions audited; the largest non-fallback hourly-versus-daily closing-price discrepancy is {pct(x['audit']['maxDailyHourlyCloseError'])}. Sources and SHA-256 hashes are recorded in summary.json.", '',
'Yahoo omits the final half-hour on seven shortened sessions and much of January 30 / February 2, 2026; a fresh regular-session download confirmed the gaps. Those nine sessions use the observed whole-session daily candle and allow only its genuine opening fill. Seven are naturally shorter native bars; two are 6.5h fallback bars. Hourly/native results are therefore provisional, and not tick-level execution evidence. Daily-open results do not depend on these intraday repairs.', '',
'Checks completed:', '']
lines += ['- '+s for s in x['checks']]
lines+=['','## Sources and artifacts', '',
'- [Strategy: ten-for-one split, effective August 8, 2024](https://www.strategy.com/press/microstrategy-announces-10-for-1-stock-split_07-11-2024)',
'- [Company release: first Bitcoin treasury acquisition, August 11, 2020](https://www.nasdaq.com/press-release/microstrategy-adopts-bitcoin-as-primary-treasury-reserve-asset-2020-08-11)',
'- [Nasdaq: regular hours and extended-session limitations](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule)',
'- [Yahoo Finance: MSTR historical prices](https://finance.yahoo.com/quote/MSTR/history/)',
'- `PROTOCOL.md`: initial scope and explicitly labeled later diagnostics.',
'- `evaluate.py`: reproduce calculations, using the same adjacent quant dependencies as the BTC studies.',
'- `summary.json`: every tested result, ledger, phase diagnostic and data hash.',
'- `trades.csv`: readable export of base-case fills for each method, rule and period.',
'- `comparison.png`: overview of annual normalized share outcomes.', '',
'**Deployment decision:** promising BTC-guided MSTR accumulation evidence for 2023–2025; insufficient support to label this a universal MSTR strategy or automatically deploy it. The BTC site and Telegram strategy were not changed by this evaluation.', '']
(P/'REPORT.md').write_text('\n'.join(lines),encoding='utf-8')

with (P/'trades.csv').open('w',newline='',encoding='utf-8') as fp:
    w=csv.writer(fp);w.writerow(['method','rule','period','side','time_utc','signal_time_utc','split_adjusted_price','units_after','reason'])
    for method in ['dailyMirror','hourlyMirror','native']:
        for rule,periods in x[method].items():
            for period,r in periods.items():
                for t in r['ledger']:w.writerow([method,rule,period,t['side'],iso(t['time']),iso(t['decision']),t['price'],t['units'],t['reason']])

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,2,figsize=(13,5.2),gridspec_kw={'width_ratios':[1.7,1]})
years=list(map(str,range(2018,2027)));ix=np.arange(len(years));ax=axes[0]
for j,(rule,label,color) in enumerate([('fast_recovery','Fast + recovery','#167eab'),('original_recovery','Original + recovery','#a6b5be')]):
    ax.bar(ix+(j-.5)*.36,[daily[rule][y]['shares'] for y in years],.36,label=label,color=color)
ax.set_xticks(ix,years,rotation=35);ax.set_title('BTC signals traded in MSTR: daily-open fills',loc='left',fontweight='bold');ax.legend(frameon=False,fontsize=9);ax.set_ylim(0,2.9)
ax=axes[1];ys=['2025','2026'];ix=np.arange(2)
for j,(method,label,color) in enumerate([('hourlyMirror','Use BTC signals','#167eab'),('native','Native MSTR adaptation','#da8744')]):
    vals=[x[method]['fast_recovery'][y]['shares'] for y in ys]
    bars=ax.bar(ix+(j-.5)*.34,vals,.34,label=label,color=color)
    ax.bar_label(bars,labels=[f'{v:.3f}' for v in vals],padding=4)
ax.set_xticks(ix,['2025','2026 YTD']);ax.set_ylim(0,1.6);ax.set_title('Fast rule: hourly opening fills',loc='left',fontweight='bold');ax.legend(frameon=False,fontsize=9)
for ax in axes:
    ax.axhline(1,color='#414141',linestyle='--',linewidth=1);ax.set_ylabel('Ending share equivalents (holding = 1)');ax.grid(axis='y',alpha=.15);ax.set_axisbelow(True)
fig.suptitle('MSTR: strong recent BTC-guided results, no consistent all-regime advantage',fontweight='bold',fontsize=14,y=1.01)
fig.text(.01,-.01,'Each year starts with one split-adjusted unit. 0.1% cost per side. 2026 through Oct 9. 2024 ends in cash, valued in shares.\nNative session conventions differ from BTC; missing intraday sessions use daily data. Retrospective results, not realized fills.',fontsize=9,color='#555555')
fig.tight_layout();fig.savefig(P/'comparison.png',dpi=170,bbox_inches='tight');plt.close(fig)
print('Wrote REPORT.md, trades.csv, comparison.png')
