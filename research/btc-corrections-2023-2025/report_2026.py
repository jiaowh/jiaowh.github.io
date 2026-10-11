"""Validate cash ledgers independently, then publish the 2026 research report/chart."""
import json
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

O=Path(__file__).resolve().parent
J=json.loads((O/'bull-bear-2026-results.json').read_text())
D=J['detail'];S=J['summary'];fee=.001
# Independent replay from fills, without targets, indicators or simulate().
for name,windows in D.items():
    for window,r in windows.items():
        units,cash=1.,0.
        for f in r['fills']:
            units+=f['btc'];cash-=f['btc']*f['price']+abs(f['btc'])*f['price']*fee
            assert cash>=-1e-7 and units>=-1e-10
            if name=='dip20':assert units>=.8-1e-12
        assert abs(units-r['units'])<1e-10 and abs(cash-r['cash'])<1e-6
        assert abs(units+max(0,cash)/(r['price']*(1+fee))-r['btc'])<1e-9
        assert abs(1+r['cashTimingBTC']-r['tradingFeesBTC']-r['terminalFeeBTC']-r['btc'])<1e-9
# The sleeve must also agree with independent sale/buyback price-ratio compounding.
fills=D['dip20']['2023-25']['fills'];sleeve=.2;wins=0;pairrows=[]
assert len(fills)==34
for sell,buy in zip(fills[::2],fills[1::2]):
    assert sell['btc']<0 and buy['btc']>0
    assert abs(sleeve+sell['btc'])<1e-10
    ratio=sell['price']*(1-fee)/(buy['price']*(1+fee))
    sleeve*=ratio;wins+=ratio>1
    assert abs(sleeve-buy['btc'])<1e-10
    pairrows.append(f"| {sell['time']} | ${sell['price']:,.2f} | {buy['time']} | ${buy['price']:,.2f} | {(ratio-1)*100:+.2f}% |")
assert abs(.8+sleeve-D['dip20']['2023-25']['btc'])<1e-10 and wins==11

names={'hold':'Hold BTC','original':'Average, default 60% vol target','no_funding':'Average without funding trim',
 'binary':'Full in/out at >60% / <40%','slow200':'Buffered daily SMA200 only',
 'bull_hold':'Hold in SMA200 bull; Average otherwise','dip20':'80% core + experimental 20% dip sleeve'}
windows=['2020-21','2022','2023-25','2026 YTD','2023-26']
table='\n'.join('| '+names[n]+' | '+' | '.join(f"{D[n][w]['btc']:.4f}" for w in windows)+' |' for n in names)
align='\n'.join(f"| {w} | {S['dip20'][w]['mean']:.4f} | {S['dip20'][w]['min']:.4f}–{S['dip20'][w]['max']:.4f} | {S['dip20'][w]['wins']}/8 |" for w in ['2020-21','2019-22','2023-25','2023-26','2019-26'])
stress='\n'.join(f"| {float(f)*100:.2f}% | {lags['0']:.4f} | {lags['1']:.4f} |" for f,lags in J['stress']['dip20'].items())
annual='\n'.join(f"| {y} | {v['endBTC']:.4f} |" for y,v in D['original']['2023-26']['annualAttribution'].items())

plt.rcParams.update({'figure.facecolor':'#101820','axes.facecolor':'#101820','axes.edgecolor':'#6e8294',
 'axes.labelcolor':'#e5edf4','text.color':'#e5edf4','xtick.color':'#b6c5d2','ytick.color':'#b6c5d2','font.size':10})
fig,axes=plt.subplots(2,1,figsize=(11,7.4),gridspec_kw={'height_ratios':[2.5,1]},layout='constrained')
for name,col in [('original','#fb7185'),('dip20','#38bdf8')]:
    curve=D[name]['2023-26']['curve']
    axes[0].plot([datetime.fromtimestamp(t,timezone.utc) for t,v in curve],[v for t,v in curve],color=col,label=names[name],linewidth=1.5)
axes[0].axhline(1,color='#ffb000',linestyle='--',label='Hold 1 BTC')
axes[0].set(title='BTC owned or purchasable after fees · January 2023–October 9, 2026',ylabel='BTC per initial BTC')
axes[0].legend(loc='lower left',facecolor='#101820',labelcolor='#e5edf4',fontsize=9)
axes[0].grid(alpha=.12)
r=D['original']['2023-25'];labels=['Starting BTC','Cash timing','All fees','Ending BTC']
vals=[1,r['cashTimingBTC'],-r['tradingFeesBTC']-r['terminalFeeBTC'],r['btc']]
bottoms=[0,1+vals[1],r['btc'],0]
axes[1].bar(labels,[1,-vals[1],-vals[2],r['btc']],bottom=bottoms,color=['#94a3b8','#fb7185','#fb7185','#38bdf8'],width=.5)
for i,v in enumerate(vals):axes[1].text(i,bottoms[i]+abs(v)+.03,f'{v:+.4f}' if i in [1,2] else f'{v:.4f}',ha='center')
axes[1].set(title='Why Average lost BTC in 2023–2025',ylim=(0,1.19),ylabel='BTC')
axes[1].grid(axis='y',alpha=.12)
fig.savefig(O/'bull-bear-2026.png',dpi=170);plt.close(fig)

report=f'''BTC accumulation: loss attribution, 2026 and bull-market alternatives
=====================================================================

Audit: 10 October 2026. Data ends **10 October 2026 00:00 UTC, exclusive**, covering completed bars through October 9. This is a partial-year 2026 test, not a full-year result. Dollar prices are Binance BTC/USDT; USDT is treated as dollar cash without modeling a depeg.

**Answer:** Average benefited from the 2026 decline, but including it does not repair the 2023–2025 BTC shortfall. A fresh 1 BTC on January 1, 2026 becomes **1.217856 BTC**. The continuous January 2023 portfolio ends at **0.827757 BTC**, still **17.22% behind holding**. Bear-market gains can compensate for bull-market opportunity cost in some windows: the 2019–October 2026 run ends at **1.5223 BTC**. That depends heavily on the starting period and is not evidence of reliable accumulation in every regime.

![BTC equity and exact loss attribution](bull-bear-2026.png)

Why BTC was lost
---------------

The exact 2023–2025 reconciliation per original BTC is:

`1 − 0.290857490 cash-timing loss − 0.030138515 trading fees − 0.000678326 ending conversion fee = 0.678325670 BTC`

About **90.4% of the shortfall was cash timing**, and **9.6% fees**. This is a within-ledger accounting decomposition, not a hypothetical zero-fee strategy return. Fees can also affect later trades and compounding.

Holding BTC leaves BTC units constant. Holding cash changes its BTC purchasing power whenever price changes. The backtest measures those changes both across each open and from that open to its close. Trading fees are measured in BTC at each fill; ending cash is converted at the final close including its purchase fee. The resulting identity is checked to numerical tolerance for every detailed run.

The original model sells as trends weaken, often stays underinvested during a rally, and waits for trend recovery before repurchasing. That helped dollar drawdowns, but did not reliably sell higher than it repurchased over the full period. Important examples:

- March–April 2023: the March 1–April 27 interval with cash exposure contributed approximately **−0.1004 BTC** from cash timing alone. This interval includes partial resizing, not a single all-in/all-out trade.
- February–May 2024: elevated funding triggered an early trim while BTC was still around $57k. The rally continued toward $74k. The February 28–May 16 cash-exposure interval cost approximately **0.0473 BTC** in net timing despite the subsequent correction.
- August 2024: the final exit was near $61,498 before the $49k low, but the original strategy repurchased near $62,948 on September 20. Successfully avoiding the worst fall did not make that final exit/re-entry pair BTC-positive after fees.
- February–April 2025 worked better: final exit near $97,370, re-entry near $93,443. The continued 2025 run gained BTC overall, but could not recover the 2023–2024 deficit.

The continuous portfolio's year-end BTC purchasing power, without resetting holdings or injecting funds:

| Through | BTC equivalent |
| --- | ---: |
{annual}

The 2026 row ends October 9. Annual marks include hypothetical cash-conversion fees for reporting; cash is not actually converted at every year-end. Thus multiplying separately restarted annual tests is not the continuous portfolio ledger.

Removing the funding trim changes 2023–2025 ending BTC from 0.6783 to **0.6877**; removing staged sizing, funding and volatility sizing together in the binary comparison yields **0.7016**. Neither repairs the loss. In the previous audit, full-size spot and the default volatility target had almost identical recent performance. The central issue is trend-exit/re-entry opportunity cost, not one funding threshold or the 60% volatility target alone.

2026 helps because sustained downtrends reward cash
--------------------------------------------------

In the fresh 2026 test, Average's cash timing adds **0.226549 BTC**, while trading fees consume **0.008693 BTC**, yielding 1.217856 BTC. Its worst dollar drawdown at 4h closes is **8.03%**, versus approximately **39.98%** for holding BTC. It still whipsaws: the January 1 opening sale near $87,648 was followed by a January 14 buy near $95,414.

Later exits and re-entries were productive: full exit January 21 near $88,428 followed by buying April 14 near $74,546; full exit May 18 near $77,074 followed by buying August 20 near $69,335. Earlier partial reductions and subsequent trades are included in the reported totals. The entire year's result is not inferred from those two favorable pairs.

Fixed alternatives, not an optimized threshold search
----------------------------------------------------

Every cell below starts with **1 BTC at that window's start**. All cash is counted as fee-net purchasable BTC at the end. No deposits, leverage, cash yield or perpetual funding payments. The spot strategy uses funding only as a signal. Fee: **0.10% per side**. Decisions use completed bars, with fills at the following 4h open. Dollar drawdowns use 4h closes, which can miss worse intrabar losses. Spread, slippage, taxes and exchange/custody risks are not in the base ledger.

| Model | 2020–2021 | 2022 | 2023–2025 | 2026 through Oct 9 | Jan 2023–Oct 9, 2026 |
| --- | ---: | ---: | ---: | ---: | ---: |
{table}

These seven models were specified before viewing this run's outputs; no grid search was performed. However, the original strategy and historical episodes had already been examined. This is exploratory model selection on reused history, **not an untouched holdout or a forward test**. The 2023–2025 interval includes declining periods; calendar labels never feed the trade rules.

The SMA200 regime turns on after two successive daily closes >102% of the current daily SMA200, and turns off after two successive daily closes <98% of it; otherwise it retains state, initially off. The standalone model is full BTC when on and cash when off. The hybrid uses full BTC when on and the original Average target otherwise. Both disappointing results are retained: merely adding a slow regime switch did not solve the accumulation problem.

Promising recent candidate: preserve the core, buy back the sleeve sooner
-----------------------------------------------------------------------

The experimental dip sleeve has these exact rules:

1. Keep **0.8 of the original BTC units** untouched. Start with the remaining **0.2 BTC** invested. Never transfer from or rebalance the core.
2. While the buffered SMA200 regime described above is on, sell the entire current sleeve after the closed 4h ensemble crosses from at least 40% to below 40%. Execute at the next open. Starting mid-signal does not create an immediate sale; a new crossing is required.
3. Buy back the sleeve at the next open after either a close reaches `sale_price × (1 − fee) / ((1 + fee) × 1.05)`, or the ensemble exceeds 60%, whichever occurs first. The first condition seeks **5% more sleeve BTC**, not 5% more total portfolio BTC. Gaps can change the realized result.
4. A new crossing below 40% can trigger another sale while the slow regime is on; no recovery above 60% is needed to re-arm. While cash remains from an earlier sale, the buyback rules remain active even if the regime turns off. New sales are disabled while the slow regime is off.
5. No funding trim, volatility sizing, shorting or leverage in this sleeve.

The structural difference is the explicit buyback hurdle: it can repurchase after a meaningful dip rather than wait for a strong trend recovery. It still buys higher after false breakdowns. In 2023–2025 it completed **17 round trips, 11 positive and 6 negative**, growing the sleeve from 0.2 to 0.281382 BTC, for **1.081382 BTC total**. Independent sale/buy price-ratio compounding matches the cash ledger exactly.

It does not capture entire crashes. It repurchased on August 5, 2024 near **$58,161**, before the $49k low. After selling February 5, 2025 near **$97,370**, it repurchased February 25 near **$91,552**, before the later $77k/$74.5k lows. It earns BTC from a smaller move while remaining exposed to later price losses.

Sensitivity and failure cases
-----------------------------

Eight bar/day alignments, offset by 0, 3, 6, 9, 12, 15, 18 and 21 hours; fee 0.10% per side:

| Dip-sleeve window | Mean ending BTC | Range | Alignments >1 BTC |
| --- | ---: | ---: | ---: |
{align}

Recent gains survive all eight alignments, but **2020–2021 does not show a dependable accumulation edge**: the page alignment ends at 0.9780 BTC and the alignment average is 0.9973 BTC. At 0.60% fees per side, its 2020–2021 eight-alignment mean falls to about **0.9746 BTC**; the 2019–2022 mean falls to **0.9899 BTC**. This is not a universal bull-market solution.

Cost and execution-delay stress for the sleeve, January 2023–October 9, 2026, page alignment:

| Fee per side | Normal next-open fill | One additional 4h bar of delay |
| --- | ---: | ---: |
{stress}

The higher fees are a cost stress, not an explicit order-book slippage model. Additional delay sometimes improves results, so it is sensitivity evidence rather than a worst-case execution guarantee. At 0.60% fees, the recent eight-alignment mean remains approximately **1.0467 BTC**.

Starting each month January 2019–October 2025, the candidate beat holding in **54/82** overlapping 12-month windows, median **1.0194 BTC**, worst **0.9460 BTC**. Average won 36/82, median 0.9282 BTC. These windows overlap substantially and do not provide independent probabilities of success.

**Dollar risk remains large.** The sleeve made no trades during 2026 in these tests and held 1 BTC throughout. Its 2026 dollar drawdown was approximately **40%**, versus **8%** for Average. The continuous 2023–October 2026 sleeve portfolio had a **53.0%** dollar drawdown, versus **21.4%** for Average. Its older 2019–2022 dollar drawdown was approximately **76.5%**. Keeping BTC and protecting dollar wealth are different objectives; the fixed core intentionally remains exposed.

Noise and warning signals
-------------------------

The [earlier correction audit](REPORT.md) tested alerts explicitly. Sub-60% breadth produced 19 episodes, of which 7 preceded an additional 10% fall within 30 days. Requiring two daily closes below SMA50 reduced that to 16 episodes with 6 hits: fewer interruptions, almost unchanged precision. Funding above 15% had 0/3 hits under that definition. Samples are small and overlapping.

Therefore no tested warning cleanly predicts both crashes without noise. The sleeve uses existing trend deterioration as a trigger, limits the amount exposed to a false sale, and defines a buyback rule. Its favorable recent outcome does not establish that the warning itself predicts crashes. The new SMA200 filter has not been isolated in a matched sleeve ablation, so this study cannot attribute the sleeve's improvement specifically to that filter rather than to its sizing, triggers and buyback rule jointly.

Data, verification and reproduction
----------------------------------

- Original cached Binance hourly/4h history and funding fixture documented in [the original audit](REPORT.md); historical JS signals and independent Python arrays match. The latest production replay contains **20,029 4h bars**.
- Public [Binance spot candle endpoint](https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&startTime=1790467200000&endTime=1791590399999&limit=1000) and [funding history endpoint](https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=1788998400000&endTime=1791590400000&limit=1000) extend the cache through October 9. Exact requested sources and raw responses are in `extension-2026.json`. Seven overlapping 4h candles matched before appending; all recent 4h timestamps are continuous.
- The hourly cache omits **2023-03-24 13:00 UTC**. No price was fabricated. All default 4h bars remain present; alternate alignments inherit this source limitation. Earlier historical gaps are also preserved by the existing grid implementation.
- Two truncated-history checks verify unchanged earlier candidate signal arrays; the original replay also matches the production fixture. Core-floor and nonnegative-cash assertions execute throughout all simulations.
- `report_2026.py` independently reconstructs each detailed ending balance solely from its fills and final price, checks attribution identities, and checks the recent sleeve's entire 17-pair compounded BTC result.
- Scripts: `fetch_2026.py` → `extend_2026.cjs` → `bull_bear_2026.py` → `accumulation.py` → `report_2026.py`. The Python research requires the existing adjacent `quant/research_notes/ensemble_v2/core.py`, cached hourly history and original fixture; it is not a standalone data download for the entire period. `export.cjs` creates the original production replay if absent.
- Outputs: `bull-bear-2026-results.json` contains all variants, alignments, fee tests, detailed page-alignment fills, annual attribution and curves. The page's default historical comparison remains Average; the dip sleeve is clearly experimental and does not replace the live model.

Recent sleeve round trips
-------------------------

Times UTC. Gain is on sleeve BTC after both 0.10% fees, not on total portfolio BTC.

| Sale time | Sale price | Buy time | Buy price | Sleeve BTC change |
| --- | ---: | --- | ---: | ---: |
{chr(10).join(pairrows)}
'''
(O/'BULL_BEAR_2026.md').write_text(report,encoding='utf-8')
print('PASS: independent fill ledgers, attribution identities, core floor and 17 round-trip BTC ratios; report and chart written.')
