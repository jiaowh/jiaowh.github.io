BTC accumulation objective re-evaluation — 10 October 2026
========================================================

The objective is to finish with more BTC than simply holding the BTC already owned. Smaller dollar drawdowns, a higher dollar balance, or a smoother equity curve do not by themselves achieve it.

The page now opens with BTC accounting. Holding is the baseline; the Average model is research rather than a recommended allocation. Its signals and historical accounting remain available for inspection. No new timing model has been promoted on these results.

Every window starts with exactly **1 BTC**, without external deposits, leverage, borrowing or yield. Cash is always counted at the BTC it could purchase at that time, including the purchase fee. The initial sale from the starting BTC, if the model requires one, also incurs a fee. This makes the terminal result directly comparable with holding 1 BTC.

| Model | 2019–2022 ending BTC | 2023–2025 ending BTC | 2019–2025 ending BTC |
| --- | ---: | ---: | ---: |
| Hold BTC | 1.000000 | 1.000000 | 1.000000 |
| Previous Average, 60% volatility target | 1.835280 | 0.678326 | 1.247457 |
| Full in / out, 60% / 40% vote | 2.374117 | 0.701559 | 1.668981 |
| Hold 80%; apply Average to 20% | 1.167056 | 0.935665 | 1.049491 |

The earlier interval includes the 2022 bear market. Both full-portfolio timing models gained BTC over that interval and the combined seven-year interval, but both lost BTC in the requested 2023–2025 interval. The combined win does not demonstrate a dependable ability to add BTC in a rising market. Neither does the recent loss prove that the balance must decline in every market regime.

The simpler full-in/full-out model uses the same 50-member vote: enter above 60%, exit below 40%, retain state between thresholds. It removes intermediate position steps, funding trims and volatility sizing. This is one fixed comparison, not an optimized threshold search. It still ends the recent period about 30% behind holding.

The core/sleeve comparison holds 0.8 of the original BTC throughout. Only the 0.2 BTC sleeve follows Average, without transferring money from the core. Its terminal accounting is exactly `0.8 + 0.2 × Average ending BTC`. It reduces the scale of the loss; it does not fix the underlying timing edge. No 80/20 allocation is recommended by this comparison.

Starting once each month from January 2019 through December 2024, for fixed 12-month holds:

| Model | Windows beating 1 BTC | Median ending BTC | Worst ending BTC |
| --- | ---: | ---: | ---: |
| Average | 26 / 72 | 0.874913 | 0.431453 |
| Full in / out | 27 / 72 | 0.920482 | 0.689286 |

These windows overlap heavily and are not independent trials. They describe sensitivity to the start date, not the probability of winning a future trade.

Fee sensitivity for 2023–2025:

| Fee per side | Average ending BTC | Full in / out ending BTC |
| --- | ---: | ---: |
| 0.10% | 0.678326 | 0.701559 |
| 0.30% | 0.621497 | 0.658066 |
| 0.60% | 0.545054 | 0.597828 |

Trades use signals available at the preceding closed 4h bar and execute at the next open. The initial target is the target known immediately before the window starts. Fixed BTC units are held between rebalances; the ending cash-to-BTC conversion is hypothetical. Dollar/USDT spreads, slippage and taxes are excluded. The benchmark starts already owning BTC and has no trading fees. The model pays no perpetual funding because the portfolio is spot only.

At each close the comparison is `BTC held + cash / (BTC price × (1 + fee))`. Cash is not treated as missing capital, a successful completed trade, or a preserved BTC balance. An unfinished cash position can be deeply behind holding even if all completed round trips look profitable.

The buyback calculator uses `sale price × (1 − sale fee) / ((1 + buy fee) × (1 + desired BTC gain))`. At a $100,000 sale and 0.10% per side, the break-even buyback is approximately $99,800.20. Adding 1% BTC requires approximately $98,812.08 or lower. There is no signal in that arithmetic that prices will actually reach the hurdle.

The page’s success criterion is positive net BTC versus holding across several market regimes and starting dates, followed by a genuinely forward evaluation. No untouched holdout is claimed: the historical data and original models have already been used extensively in research. These comparisons use the page's single candle alignment. Earlier eight-alignment research demonstrated timing sensitivity; this new BTC audit does not remove it. A promising retrospective result should remain research until it has earned that distinction.

Benchmark choice and net-of-fee reporting follow the principles in the SEC investor bulletins on [performance claims](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-47) and [fees](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/updated). The numeric results here are local calculations, not sourced from those publications.

Reproduction: run `accumulation.py` with Python and NumPy after generating the original `production.json` using `export.cjs`. The script reads the frozen audit arrays, then writes `assets/btc/accumulation-audit.json`, its browser script, and `accumulation-results.json`. No indicator thresholds were fitted. Tests confirm the benchmark remains exactly 1 BTC, core/sleeve arithmetic, terminal legacy value, fee sensitivity, and buyback fee math. The earlier correction report remains an account of the dollar-risk audit, with its different normalization explicitly distinguished here.
