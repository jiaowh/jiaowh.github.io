# Does fast iMACD + recovery transfer to MSTR?

Evaluation date: October 12, 2026. Prices through October 9, 2026. Frozen BTC parameters; no MSTR parameter optimization.

**Finding:** using BTC signals to time MSTR was promising in the 2023–2025 sample. It was not consistently better than holding, did not protect the 2022 bear market, and lost shares in 2026. Recalculating the indicators directly on MSTR produced a small, fragile 2025 advantage and no 2026 trades. These are different implementations.

## Measurement and execution

Start each annual test already holding one split-adjusted unit. Holding is always 1.0000. Values above one mean more shares than holding; below one mean fewer. The August 2024 ten-for-one stock split is already reflected in the historical OHLC: a literal pre-split share would become ten, so normalized units are essential. Cash at the endpoint is converted to share equivalents using the last close and a buy fee. Fractional shares are allowed.

Charge 0.1% per side. No borrowing, cash yield, tax, or leverage. Fills use the next available observed regular-session opening price, never a weekend or the same candle close that produced the signal. Auction execution at a quoted open is a model assumption; results are not actual brokerage fills. A larger 0.3% cost and delays are tested separately.

The BTC mirror retains the BTC price target and timer; it follows the latest BTC/cash model position. It is not an MSTR-specific 10% buyback target. Opposing BTC signals while MSTR is closed cancel before the next opening. The native version instead applies the target and timer to its actual MSTR sale.

## Annual BTC-signal mirror: consistent daily-open execution

Daily-open execution provides a long-history comparison. It does not claim that an intraday bot would achieve these same returns. Annual rows reset; continuous periods below carry state.

| Year | Fast + recovery | Original + recovery | Original, seven-day/target only |
|---|---:|---:|---:|
| 2018 | 1.0673 | 0.9561 | 0.9557 |
| 2019 | 0.9633 | 0.9502 | 0.9567 |
| 2020 | 0.9044 | 1.0522 | 1.0918 |
| 2021 | 0.9775 | 1.2940 | 1.4842 |
| 2022 | 1.0000 | 1.0000 | 1.0000 |
| 2023 | 1.5654 | 1.4652 | 1.4322 |
| 2024 | 2.5039 * | 2.1031 * | 1.8307 * |
| 2025 | 1.2067 | 1.2170 | 1.1665 |
| 2026 YTD | 0.9492 | 1.0000 | 1.0000 |

*Ended in cash; value is fee-net share equivalent. 2018–2019 and much of 2020 predate MSTR’s Bitcoin treasury strategy, so they represent a different business regime.

| Continuous period | Fast + recovery | Original + recovery | Original, target/timer |
|---|---:|---:|---:|
| 2020-21 | 0.8840 | 1.3615 | 1.6205 |
| 2023-25 | 4.5211 | 3.6192 | 2.5319 |
| 2025-26 | 1.1454 | 1.2170 | 1.1665 |
| 2024-26 | 2.7414 | 2.4700 | 1.7679 |

## Recent years with hourly opening fills

| Period | Follow BTC fast signals | Follow BTC original recovery | Native MSTR fast adaptation |
|---|---:|---:|---:|
| 2024 | 2.5495 * | 2.1262 * | Not tested: insufficient native warm-up for full year |
| 2025 | 1.2411 | 1.2049 | 1.0231 |
| 2026 | 0.9188 | 1.0000 | 1.0000 |
| 2025-26 | 1.1403 | 1.2049 | 1.0231 |

The native adaptation uses session-anchored 4h bars (09:30–13:30, then the remaining session). Its 8h/12h/24h groups each contain one trading session; 48h/72h contain two/three sessions. Some votes therefore duplicate one another. SMA200 means 200 trading sessions. This is an explicitly defined stock adaptation, not an identical 24/7 BTC clock or a universal result for all chart platforms.

Native fast had four completed trades in 2025 and only one winner. That winner gained 15.6% in shares, offsetting three losing buybacks. Changing multi-session group alignment moved its 2025 result from **0.9545 to 1.0231**. The original native recovery control ended at **0.6943**. Neither native version traded in 2026. There is no convincing robust edge from the native transfer in this small sample.

## Why it succeeds and fails

- **2023–2025:** BTC weakness sometimes preceded a larger MSTR decline, increasing the shares bought back. In the daily-open 2024 run, the August 1–5 trade added 53.3%, April 15–18 added 23.1%, and April 25–May 1 added 20.5% in shares. The large August gain occurred before the August 8 split; it is not a split artifact. This is an observation about those trades, not proof that MSTR always amplifies BTC.
- **Rebound risk:** BTC recovery does not guarantee a cheaper MSTR entry. January 28–29, 2021 lost 17.6% of shares; October 2–9, 2024 lost 15.6%. Rapid recovery and forced timer entries can crystallize a loss.
- **2026:** the hourly BTC mirror sold September 16 at $125.74 and bought September 18 at $136.58, losing 8.12% of shares after costs. The BTC trigger and target are BTC-based; MSTR can move differently between the sale and re-entry.
- **Bear protection is absent:** SMA200 gates permission to start a correction trade. Turning bearish does not instruct this strategy to sell. In 2022 it made no trades, kept 1.0000 shares, and suffered a 74.3% dollar loss from the first regular-session opening to the last close. In 2026 its hourly sampled maximum dollar drawdown was 58.2%, essentially the holding drawdown. Preserving units does not preserve dollar capital.

## Robustness and practical limits

All eight previously used BTC clock offsets are reported. These reuse the same market history and are not eight independent statistical samples.

| Period / execution | Minimum shares | Maximum shares | Phases above 1 |
|---|---:|---:|---:|
| 2020-21 / daily | 0.8294 | 1.1331 | 3/8 |
| 2023-25 / daily | 3.3889 | 4.9415 | 8/8 |
| 2024 / hourly | 2.1062 | 2.5860 | 8/8 |
| 2025 / hourly | 1.0984 | 1.3734 | 8/8 |
| 2026 / hourly | 0.9188 | 0.9876 | 0/8 |

For the 2023–2025 daily-open run, raising costs to 0.3% per side reduced 4.5211 to 4.0908 shares. Adding 24 hours to every signal reduced it to 2.2162. The positive result survives these separate stresses, but its magnitude is highly execution-sensitive. For hourly 2025–2026, a 24-hour delay reduced 1.1403 to 0.8887, reversing the apparent advantage.

The fast rule was previously chosen using BTC history, especially 2023–2024. Testing correlated MSTR prices in those same years is useful transfer evidence, but not a clean independent holdout. No rule here demonstrates an always-above-one guarantee or a complete bear-market system.

## Data quality and verification

Yahoo daily OHLC and cached hourly history plus a fresh October update. Hourly coverage begins 2023-11-02. 736 sessions audited; the largest non-fallback hourly-versus-daily closing-price discrepancy is 0.5%. Sources and SHA-256 hashes are recorded in summary.json.

Yahoo omits the final half-hour on seven shortened sessions and much of January 30 / February 2, 2026; a fresh regular-session download confirmed the gaps. Those nine sessions use the observed whole-session daily candle and allow only its genuine opening fill. Seven are naturally shorter native bars; two are 6.5h fallback bars. Hourly/native results are therefore provisional, and not tick-level execution evidence. Daily-open results do not depend on these intraday repairs.

Checks completed:

- BTC indicator/replay equals saved BTC research for overlapping periods and all three rules
- Native fast_recovery: two causal prefix checks pass
- Native original_recovery: two causal prefix checks pass
- Closed-market sell and recovery cancel before the next stock open
- Every ledger reconciles fee-net shares and executes on an observed bar at/after its decision

## Sources and artifacts

- [Strategy: ten-for-one split, effective August 8, 2024](https://www.strategy.com/press/microstrategy-announces-10-for-1-stock-split_07-11-2024)
- [Company release: first Bitcoin treasury acquisition, August 11, 2020](https://www.nasdaq.com/press-release/microstrategy-adopts-bitcoin-as-primary-treasury-reserve-asset-2020-08-11)
- [Nasdaq: regular hours and extended-session limitations](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule)
- [Yahoo Finance: MSTR historical prices](https://finance.yahoo.com/quote/MSTR/history/)
- `PROTOCOL.md`: initial scope and explicitly labeled later diagnostics.
- `evaluate.py`: reproduce calculations, using the same adjacent quant dependencies as the BTC studies.
- `summary.json`: every tested result, ledger, phase diagnostic and data hash.
- `trades.csv`: readable export of base-case fills for each method, rule and period.
- `comparison.png`: overview of annual normalized share outcomes.

**Deployment decision:** promising BTC-guided MSTR accumulation evidence for 2023–2025; insufficient support to label this a universal MSTR strategy or automatically deploy it. The BTC site and Telegram strategy were not changed by this evaluation.
