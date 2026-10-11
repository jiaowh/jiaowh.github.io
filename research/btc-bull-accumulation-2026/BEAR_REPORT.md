# Bear-year test of the selected bull accumulation rule

Completed 11 October 2026. Uses the same frozen data through 9 October 2026 UTC, the same selected `e20_ma200_gain0.05_trend` rule and 0.10% fee per side. No new parameter selection.

Two distinct tests:

1. **Standalone overlay:** disable the calendar restriction and run the selected tactical rule during a bear year. Start each year fully invested with a fresh 1 BTC, with warmed indicators and no inherited cash. Completed-bar decisions fill at the next 4-hour open.
2. **Calendar cash benchmark:** start with 1 BTC, sell at the first open of the bear calendar year, then hold cash. Ending BTC equivalent includes the hypothetical purchase fee. No interest is earned. This is a valuation of cash, not an actual purchase or a sale at the cycle's exact peak.

| Bear window | Hold BTC | Standalone overlay BTC | Overlay dollar return | Overlay maximum dollar drawdown | Sell Jan 1, remain cash: ending BTC equivalent |
|---|---:|---:|---:|---:|---:|
| 2014 | 1.0000 | 1.2118 | −46.86% | −63.95% | 2.2758 |
| 2018 | 1.0000 | 1.2563 | −66.08% | −76.65% | 3.6966 |
| 2022 | 1.0000 | 1.0000 | −64.21% | −67.21% | 2.7883 |
| 2026 through October 9 | 1.0000 | 1.0000 | −5.72% | −39.98% | 1.0585 |

The standalone rule completes two round trips in 2014 and three in 2018. It makes **no trades in 2022 or 2026 through the cutoff**, so in those windows it simply holds the starting BTC. Its SMA200 regime is a condition allowing tactical sales, not a command to sell when the regime turns bearish. The rule therefore cannot be treated as a standalone bear defense.

The standalone outcomes across eight candle alignments are 1.0525–1.2430 BTC in 2014, 1.1795–1.3896 in 2018, and exactly 1 BTC in both 2022 and 2026 so far. Adding coins in 2018 still coincides with a 76.65% peak-to-trough dollar drawdown. BTC accumulation and dollar protection are different outcomes.

The cash benchmark's dollar balance remains constant after the initial 0.10% sale fee; its BTC purchasing power moves inversely with price. The final hypothetical BTC purchase fee is included in the table. The 2026 peak-to-trough decline was much greater than its year-to-cutoff decline, so exiting on January 1 produces only 5.85% more BTC equivalent at this cutoff, despite the roughly 40% holding drawdown within the year. We do not substitute the year's lowest price for the actual cutoff.

## Full bull window followed by its calendar bear exit

These are separate fresh accounts beginning with 1 BTC in the first year shown. Run the selected overlay for the three supplied bull years; at the first open of year four, sell any remaining BTC and retain any existing cash. If the overlay is already cash at the transition, do not add a fictional sell or duplicate its fees.

| Start | Bear-year endpoint | Actual ending BTC | Ending cash | Fee-net BTC equivalent at endpoint |
|---|---|---:|---:|---:|
| January 2015 | End 2018 | 0 | $14,602.88 | **3.9397** |
| January 2019 | End 2022 | 0 | $60,266.25 | **3.6395** |
| January 2023 | October 9, 2026 | 0 | $116,695.44 | **1.4108** |

Thus the standalone overlay does not solve bear-market dollar losses. The combined framework historically obtains bear protection from its **calendar exit**, with the overlay contributing the bull-window accumulation. Calendar timing is the supplied framework, not a newly proven prediction that future bear markets will follow the same years. The standalone stress deliberately operates outside the overlay's intended bull windows and does not change its live interpretation for 2026.

Reproduce with `python research/btc-bull-accumulation-2026/bears.py` using the same local dependencies and cached inputs described in the [main report](REPORT.md). [All results, fill histories and alignment checks](bear-results.json) are retained. The simulator independently reconciles each sale/buy pair to ending BTC after fees; cash equivalents use `initial sale proceeds / (last price × 1.001)`.
