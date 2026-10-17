# 5-minute and 1-hour iMACD tuning

Completed 17 October 2026. Frozen BTCUSDT spot data: January 2020–September 2026. **No replacement passed the predeclared promotion checks.** Daily/4h alignment is a display change; Telegram retains the adopted accumulation strategy.

## What was tested

108 candidates per timeframe: lengths 14/21/34, smoothing 9/13, three entry families, targets 1/1.5/2R and two time exits. The 5m higher-timeframe gate is 1h; the 1h gate is 4h. Families are legacy oversold-turn/divergence/Bollinger confluence, oversold turns with a higher-timeframe SMA200 gate, and positive-impulse upward signal crossovers with that SMA200 gate. Long-only spot, no leverage. [Frozen protocol](PROTOCOL.md).

Select on 2020–2024 only, requiring 100/30 training trades (5m/1h), maximizing the weakest annual USD return and then mean trade return. Validation is 2025–September 2026. This is retrospective testing on previously researched history, not untouched prospective evidence. Starting capital is one BTC converted to cash at the first open; this evaluates a standalone long/cash trading sleeve. It is **not** the current BTC-holding accumulation strategy.

## Validation results

| Timeframe / rule | Trades | Net per trade | USD return | Ending BTC | Closing-equity drawdown |
|---|---:|---:|---:|---:|---:|
| 5m original / scaled control | 67 | -0.37% | -22.40% | 0.8673 | -23.47% |
| 5m training-selected | 69 | -0.27% | -17.72% | 0.9197 | -19.76% |
| 5m best validation mean, hindsight only | 139 | -0.15% | -18.79% | 0.9077 | -22.33% |
| 1h original / scaled control | 4 | -0.75% | -3.32% | 1.0806 | -9.07% |
| 1h training-selected | 23 | -0.33% | -7.82% | 1.0302 | -12.82% |
| 1h best validation mean, hindsight only | 57 | +0.42% | +23.58% | 1.3812 | -15.01% |

5m: **0/108** candidates had positive validation mean net returns. The training-selected change is iMACD **34/13**, the original confluence entry, **2R**, and **8 hours**. It reduces the loss relative to 34/9, 1.5R, 8 hours, but still loses. Its mean gross return is approximately −0.034% per trade even without costs. The best validation-picked 5m variant earns approximately +0.095% gross per trade, insufficient for the assumed 0.24% round-trip cost. Parameters do not repair a weak entry edge.

1h: **18/108** candidates had positive validation means, but the training-selected rule (34/13 oversold turn, higher-timeframe SMA200 gate, 2R, 48 hours) failed. The more promising **21/13 positive-impulse crossover, 4h SMA200 gate, 2R, 168 hours** is a hindsight discovery. Its 57 validation trades average +0.415%, but its month-block 95% mean interval is approximately **−0.119% to +1.082% per trade**. It stays positive in both validation halves, with higher costs and delayed entry, yet that does not undo selection after seeing validation. A seven-day expiry also makes it an hourly-entry swing model, not a short scalp.

## Annual BTC accounting

Each year starts fresh with 1 BTC; ending cash is converted back after fees. Hold is always 1 BTC. Annual rows do not multiply to the continuous result because positions are reset. 2026 stops September 30.

| Year | 5m control | 5m training-selected | 1h scaled control | 1h training-selected | 1h hindsight crossover |
|---|---:|---:|---:|---:|---:|
| 2020 | 0.2253 | 0.2200 | 0.2482 | 0.2482 | 0.2482 |
| 2021 | 0.5830 | 0.5807 | 0.6243 | 0.6243 | 0.6243 |
| 2022 | 2.2684 | 2.4575 | 2.7715 | 2.9216 | 2.5305 |
| 2023 | 0.3465 | 0.3609 | 0.3964 | 0.4124 | 0.3860 |
| 2024 | 0.4301 | 0.4110 | 0.4642 | 0.4763 | 0.5597 |
| 2025 | 0.9864 | 1.0125 | 1.0202 | 1.0672 | 1.1838 |
| 2026 YTD | 0.8771 | 0.9061 | 1.0567 | 0.9630 | 1.1640 |

The very low BTC balances in strong bull years reflect spending most of the year in cash. A positive USD trading return does not establish BTC accumulation. Conversely, remaining in cash can increase BTC purchasing power during a price decline even while individual trades lose money. The hourly hindsight winner still ends 2023 and 2024 well below 1 BTC; it is not a substitute for the main accumulation strategy.

## Fees, uncertainty and execution

| Rule | Zero-cost mean | Base mean | Higher-cost mean | One-bar-delay mean | Block 95% interval |
|---|---:|---:|---:|---:|---:|
| 5m selected | -0.03% | -0.27% | -0.43% | -0.24% | -0.46% to -0.01% |
| 5m hindsight | +0.09% | -0.15% | -0.30% | -0.13% | -0.27% to -0.02% |
| 1h selected | -0.09% | -0.33% | -0.49% | -0.39% | -0.84% to +0.14% |
| 1h hindsight | +0.66% | +0.42% | +0.25% | +0.43% | -0.12% to +1.08% |

Costs are 0.12% per side (fee plus execution allowance), stressed to 0.20% per side; they are modeling assumptions, not a verified account fee tier. Enter at the next open, skip invalid stop geometry, anchor target to actual entry, resolve double-touch bars stop-first, and fill stops gapped through at the worse open. One position at a time. At reporting boundaries liquidate any remaining position. These repair the old page preview’s same-close/overlapping-trade assumptions, so this control is the old **signal rule under corrected execution**, not an exact replay of its former displayed P&L.

The 1h old tab had no standalone trade ledger; its control scales the 5m confluence rule to 1h with a 4h gate and 48-hour exit. The mean confidence intervals resample active calendar-month blocks 3,000 times. They do not correct for searching many strategies. No order-book spread, intrabar path, manual latency distribution or forward paper execution was observed.

## Data coverage limits

81 official monthly archives were checksum-verified: 709,458 five-minute candles, 462 missing five-minute intervals. Hourly/4h aggregation accepts only complete contiguous groups. Setups require 1,000 continuous prior candles on both timeframes. This deliberately conservative gap rule removes much early history; it removes **all eligible 1h setups in 2020 and 2021**. Those hourly annual rows are cash-only accounting, not successful earlier-cycle trading tests. Do not claim robustness across those bull markets.

| Year | 5m eligible fraction | 1h eligible fraction |
|---|---:|---:|
| 2020 | 39.8% | 0.0% |
| 2021 | 37.0% | 0.0% |
| 2022 | 100.0% | 79.9% |
| 2023 | 88.6% | 54.3% |
| 2024 | 100.0% | 100.0% |
| 2025 | 100.0% | 100.0% |
| 2026 | 100.0% | 100.0% |

All 2025/2026 candles are eligible after warm-up. The 1h training selector therefore relies substantially on 2022–2024. Missing-data treatment should be investigated in a separately declared study before treating the early-year comparison as informative. No data were filled or interpolated. Checksum verification establishes downloaded-file integrity, not immunity to later exchange revisions. [Official data format and timestamp units](https://github.com/binance/binance-public-data).

## Page changes and decision

Daily and 4h show closed strategy candles, the confirmed daily SMA200 regime, and selectable iMACD 14/21/34 with signal 13. Their two oscillator conditions reconcile with the corresponding breadth votes. The 1h and 5m tabs remain research tools with length/signal controls. 5m also exposes the tested target/time choices and uses next-open, single-position modeled fills. Turning points and divergences display at confirmation, not the earlier pivot. Preview candles cover a shorter window and may use fallback exchanges, so the preview is not the full Binance research ledger. Default research settings are retained because neither training-selected candidate passed validation. No new Telegram rules.

Verification: 24 truncated-prefix comparisons across all length/signal pairs and both timeframes; indexed confluence scan checked against the original; shared page indicator calculations; synthetic fill/fee/overlap/gap tests; browser checks for setting changes and mobile layout. [Data audit](data-audit.json), [signal audit](signal-audit.json), [complete metrics](results.json), [all candidates](candidates.csv), [validation trades](validation-trades.csv).

Reproduce: `python data.py`, `node --max-old-space-size=4096 signals.cjs`, `python evaluate.py`, `python report.py`. Requires NumPy/Numba and the page source; large raw archives and intermediate arrays remain ignored.
