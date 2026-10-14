# Expanded MSTR investigation

Research completed October 12, 2026; price sample ends October 9, 2026. No live strategy changed.

**Result:** the strongest balanced candidate selected using 2021–2024 was the current BTC fast correction strategy with a separate cash override when **both BTC and MSTR are in bearish SMA200 regimes**. Its 2025–2026 ending value was **2.352 share equivalents**, versus **1.145** for the unchanged BTC strategy and **1.000** for holding. The same comparison using hourly stock opening fills was **2.335 versus 1.140**.

This is a useful candidate for handling both bull and bear markets, not an always-winning rule. It sacrificed much of the early-2023 rebound, and failed to beat holding in 2021 and 2023. The unmodified BTC fast strategy remained the bull-focused selection. There is no need to substitute a more complicated buyback indicator to obtain the main improvement.

## Exactly what changes

1. Continue running the existing BTC fast iMACD + recovery model, including its BTC-based target and timer, even while the MSTR portfolio is in cash.
2. Calculate a separate SMA200 regime for each asset. BTC uses 200 completed daily crypto candles; MSTR uses 200 completed trading sessions. Two closes above 102% of the average turn that regime bullish; two closes below 98% turn it bearish; otherwise retain the preceding regime.
3. Hold MSTR only when the BTC model wants to hold **and at least one of these SMA200 regimes is bullish**. When both are bearish, sell MSTR and hold cash. Re-enter after either regime turns bullish, provided the BTC model also wants to hold.
4. Evaluate available information before an opening and fill at an observed stock opening price. The main long-history experiment acts only at daily opens. The recent hourly experiment also acts at later regular-session hourly opens. No same-bar closing-price fill is assumed for a newly computed indicator.

This does not change the BTC strategy itself. It is an MSTR-specific combination of BTC correction timing and two-asset bear-market confirmation.

## Scope and comparison rules

Tested **74 fixed candidates**: BTC signals, MSTR SMA/EMA/MACD/iMACD/breadth/momentum/breakout/trailing-stop signals, relative strength, trend combinations, and 24 BTC-sell/MSTR-buyback combinations. Additional scheduled overnight experiments were evaluated separately. All trials remain in the saved output; failures were not discarded.

Use one split-adjusted share as the starting position; buy-and-hold always ends at one. Include 0.1% cost per transaction side, fractional shares, no leverage, no taxes and no interest on idle cash. If a period ends in cash, mark it as share equivalents at the final close after a hypothetical buy fee. These cash equivalents are not shares already repurchased, and a large relative-share gain during a crash is not a corresponding dollar profit.

Daily-open annual rows start afresh; continuous results carry cash and strategy state across year boundaries. Do not multiply the annual rows to reconstruct the continuous results. Initial holdings may be sold immediately when the pre-existing regime is bearish.

## Annual results: common daily-open execution

| Year | Current BTC fast | Joint SMA200 exit | MSTR daily iMACD | MSTR SMA200 only |
|---|---:|---:|---:|---:|
| 2018 | 1.067 | 0.951 * | 0.939 * | 0.954 * |
| 2019 | 0.963 | 0.790 | 0.746 * | 0.663 |
| 2020 | 0.904 | 0.997 | 0.934 | 0.991 |
| 2021 | 0.977 | 0.903 | 0.982 * | 0.972 * |
| 2022 | 1.000 | 3.819 * | 1.894 * | 3.882 * |
| 2023 | 1.565 | 0.981 | 0.426 | 0.541 |
| 2024 | 2.504 * | 2.504 * | 0.425 * | 1.000 |
| 2025 | 1.207 | 1.987 * | 1.571 * | 2.010 * |
| 2026 YTD | 0.949 | 1.202 | 1.188 | 0.858 |

* Ends in cash, valued as fee-net share equivalents. Earlier years before MSTR adopted Bitcoin in August 2020 reflect a different business regime.

| Continuous period | Current BTC fast | Joint SMA200 exit | Holding |
|---|---:|---:|---:|
| 2020-21 | 0.884 | 0.901 | 1.000 |
| 2023-25 | 4.521 | 4.665 * | 1.000 |
| 2025–Oct 9, 2026 | 1.145 | 2.352 | 1.000 |
| Aug 11, 2020–Oct 9, 2026 | 4.329 | 19.135 | 1.000 |
| 2023–Oct 9, 2026 | 4.291 | 5.522 | 1.000 |

## What the improved result actually comes from

**2022 protection:** an annual portfolio starting in MSTR sells when both regimes are already bearish and stays in cash. Its end-of-year cash could buy **3.819 shares**, but its dollar return was **−1.7%**, versus **−74.3%** for holding. The sampled dollar drawdown fell from **75.5% to 3.0%**. These are annual-start results; they do not imply the same small drawdown for someone invested before 2022.

**The major 2025–2026 trade:** the combined daily-open rule sold on **October 30, 2025 at $269.99** and repurchased on **August 24, 2026 at $121.84**. That completed cash leg multiplied shares by **2.212** after costs. The unchanged BTC rule had no independent long-duration bear exit.

**Later-period dollar result:** over January 2025–October 9, 2026 the combined rule returned **+21.0% in dollars**, while holding returned **−48.6%**. Its daily-close sampled maximum dollar drawdown was **34.4%**, compared with **78.4%** for the unchanged BTC correction strategy and **81.9%** for holding. This is still substantial risk.

**The price of the protection:** in the fresh 2023 annual test it sold at **$14.57 on January 3** and re-entered at **$23.20 on January 17**. That missed rebound reduced shares to **0.627** before later correction trades recovered the annual result to **0.981**. Unmodified BTC fast finished that year at **1.565**. In 2021, the combined rule ended at **0.903**. A slow confirmed trend filter can avoid a long decline and still buy back late after a sharp reversal.

## Other methods

The following representatives were chosen within each family using the same pre-2025 balanced score, rather than choosing the best 2025–2026 row after seeing it.

| Representative | 2022 | 2023 | 2024 | 2025 | 2026 YTD | Continuous 2025–2026 |
|---|---:|---:|---:|---:|---:|---:|
| btc_breadth50_50 | 1.677 * | 0.934 | 0.815 * | 1.517 * | 1.334 | 1.994 |
| Original BTC recovery | 1.000 | 1.465 | 2.103 * | 1.217 | 1.000 | 1.217 |
| BTC sell + MSTR target / BTC recovery | 3.819 * | 0.957 | 1.494 * | 1.897 * | 1.202 | 2.246 |
| BTC fast + joint SMA200 exit | 3.819 * | 0.981 | 2.504 * | 1.987 * | 1.202 | 2.352 |
| btc_sma100 | 2.395 * | 0.542 | 0.590 | 1.295 * | 0.989 | 1.261 |
| hold | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| trend_either_btc200_mstr200 | 3.819 * | 0.627 | 1.000 | 1.643 * | 1.266 | 2.049 |
| mstr_macd6_13_5_cross | 2.166 * | 0.838 | 0.698 * | 1.006 | 0.985 * | 0.991 * |
| MSTR daily fast iMACD | 1.894 * | 0.426 | 0.425 * | 1.571 * | 1.188 | 1.838 |
| mstr_donch20_10 | 2.011 * | 0.418 | 0.704 * | 1.276 * | 0.946 * | 1.189 * |
| mstr_mom252 | 3.269 * | 0.467 | 1.000 | 1.536 * | 1.000 * | 1.512 * |
| mstr_trail30 | 2.356 * | 0.499 | 0.579 | 0.788 * | 1.253 | 0.973 |
| MSTR SMA200 | 3.882 * | 0.541 | 1.000 | 2.010 * | 0.858 | 1.698 |
| MSTR/BTC price-ratio trend | 1.768 * | 0.382 | 0.638 * | 2.425 * | 0.894 | 2.134 |

- **MSTR-only daily iMACD:** protected parts of bear periods, but retained only 0.426 and 0.425 shares in 2023 and 2024. It gave up too much of the bull runs. This six-vote daily rule differs from the earlier native multi-timeframe adaptation, whose results were also fragile.
- **MSTR SMA200 alone:** effective in 2022/2025, but late into 2023 and below holding again in 2026. Combining the assets helps compared with forcing MSTR alone to decide every regime.
- **Fast/classic MACD, breakouts, momentum, trailing stops:** some good individual periods, but none provided the strongest preselected balance of share accumulation and regime coverage.
- **MSTR-specific buyback targets:** the preselected tactical representative finished 2025–2026 at 2.246 versus 2.352 for the simpler combined rule. Some other tactical settings reached 2.642 in that later period; choosing those because of this result would be additional hindsight selection. They were not promoted.
- **MSTR/BTC relative strength:** useful in some declines, but its selected representative ended 2023 at 0.382 and 2024 at 0.638. It is not a dependable bull-market accumulation rule. This ratio is not mNAV: capital structure and changing shares outstanding matter. Strategy itself says its equity is not required to track its Bitcoin holdings. [Strategy annual report](https://www.sec.gov/Archives/edgar/data/1050446/000105044626000020/mstr-20251231.htm)

## Selection discipline and adaptive selection

Before running the expanded candidates, define the balanced score as half the mean and half the minimum of log annual share outcomes for 2021–2024. Hold is eligible. This selected `fast_either200`. A separate bull-only score on 2023–2024 selected the unchanged `fast_recovery`. Freeze both before presenting 2025–2026. The method is retrospectively chronological: these prices have already been examined in prior research, so this is not an untouched holdout.

A rule that picked a new winner every January using only the preceding three years did worse than keeping the fixed strategies. Its actual continuous portfolio ended 2023–2026 at **1.933 shares**, versus **4.291** for unchanged fast and **5.522** for the fixed combined rule (the latter was selected after 2024). The fixed rule comparisons describe the same historical period but cannot claim an equally early selection date. Adaptive portfolio holdings and fees carry across switches; there is no annual reset.

| Year | Rule picked from preceding three years | Continuous portfolio share-equivalent multiplier during year |
|---|---|---:|
| 2023 | tactical_ma20_g20_mstr_t14 | 0.779 |
| 2024 | tactical_ma20_g20_btc_t14 | 1.301 |
| 2025 | tactical_none_g10_btc_t14 | 2.044 |
| 2026 | fast_recovery | 0.933 |

The automatic annual selector lost shares in 2023 and switched away from bear protection before the 2026 test. These results argue against automatically replacing a strategy with the most recent backtest winner.

## Execution and robustness

| Joint-exit test, continuous 2025–2026 | Ending share equivalents |
|---|---:|
| Daily opens, 0.1%/side | 2.352 |
| Daily opens, 0.3%/side, 0 extra session | 2.251 |
| Daily opens, 0.5%/side, 0 extra session | 2.154 |
| Daily opens, 0.1%/side, 1 extra session | 1.439 |
| Daily opens, 0.3%/side, 1 extra session | 1.377 |
| Hourly opens, 0.1%/side, 0 extra available bar | 2.335 |
| Hourly opens, 0.3%/side, 0 extra available bar | 2.226 |
| Hourly opens, 0.5%/side, 0 extra available bar | 2.122 |
| Hourly opens, 0.1%/side, 1 extra available bar | 1.886 |
| Hourly opens, 0.3%/side, 1 extra available bar | 1.798 |

Across eight BTC candle phases, the combined 2025–2026 daily-open result ranged from **2.156 to 2.784**. Across twelve neighboring combinations of SMA150/200 and 1%/2%/3% bands, it ranged from **1.356 to 2.366**; all twelve exceeded holding over that combined period. However, only six of twelve beat holding in 2026 alone, and every neighbor lost shares in the fresh 2023 annual test. Neighbors were diagnostics only; the selected rule was not changed.

Removing the best completed cash leg from the selected rule reduces 2025–2026 from **2.352 to 1.064** shares. The result survives, but most of the excess came from one long bear-market avoidance trade. Removing the best completed trade from 2023–2025 leaves **3.044**, versus its original 4.665.

A conditional moving-block bootstrap of the selected rule’s 2025–2026 daily log share changes gives approximately **12–14%** of resamples below holding, with very wide 90% intervals (roughly **0.62–8.46**, depending on block length). These resamples do not adjust for selecting among 74 rules or prior research, and are not probabilities of future profit. They do not establish certainty.

## Overnight experiments

The existing notes and [Elm Wealth’s overnight study](https://elmwealth.com/night-shift/) motivate checking a different source of returns: holding overnight and avoiding some daytime exposure. This does not depend on fast iMACD being an early crash detector.

The modeled trade is scheduled before the closing auction: buy at its recorded price and sell at the next observed premarket opening, or at the next regular opening. No unobserved overnight price is invented. Missing premarket observations fall back to the actual regular opening. These are quote-based model fills, not measured bid/ask execution.

| Exit time (ET), overnight only | 2024 at 0.1%/side | 2025 at 0.1%/side | 2026 at 0.1%/side | 2025–2026 at 0.1%/side | 2025–2026 at 0.3%/side |
|---|---:|---:|---:|---:|---:|
| 09:30 regular open | 0.811 | 1.325 | 0.684 | 0.906 | 0.153 |
| 04:00 premarket | 1.535 | 2.054 | 1.047 | 2.150 | 0.364 |
| 06:00 premarket | 0.948 | 2.256 | 1.273 | 2.872 | 0.486 |
| 08:00 premarket | 1.031 | 1.492 | 1.105 | 1.649 | 0.279 |

The 04:00 version makes **444 round trips** in 2025–2026: 2.150 shares at 0.1%/side becomes **0.364** at 0.3%/side. A 06:00 exit looks stronger in these later years, but it was weaker in 2024; selecting the later-period winner is not validation. Staying in MSTR during the day when the BTC fast model is bullish, and otherwise holding only overnight, yielded only 1.068 shares for the 04:00 version in 2025–2026, falling to 0.928 at 0.3%/side. It does not beat the simpler joint-regime candidate on this evidence.

Premarket spreads, available size and auction participation must be measured before interpreting this as executable. These experiments do not justify a high-turnover default bot.

## Verification and limitations

The frozen dataset, stock split handling and nine intraday daily-candle fallbacks are documented in REPORT.md and summary.json. The main long-history results use actual daily openings and do not depend on repaired hourly bars. Hourly confirmation remains provisional, with recorded-price assumptions and no intrabar drawdown measurement. No cash interest, leverage or taxes are included.

No reliable point-in-time mNAV series was established for this expanded study, so a premium-based trading rule was not invented. The economic distinction between MSTR and BTC is real; the company’s annual report explains that equity premiums and capital structure can cause returns to diverge from its Bitcoin holdings. Historical price-ratio signals were tested under their correct name.

Trend-based protection was motivated by broad [time-series momentum research](https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum), but multi-asset trend evidence is not proof of an MSTR-specific edge.

Completed checks:

- 39 baseline period/rule share outcomes match the preceding study
- All daily candidate inputs match two truncated-history prefixes
- Perturbing current/future stock OHLC cannot change that morning's indicator decision
- Every fill and cash leg reconciles independently to ending share equivalents
- Five hourly control periods match prior hourly mirror results
- MSTR daily regimes become available after their actual regular-session close
- Stock/crypto SMA regimes, BTC trade targets and stock fill clocks are mapped separately
- Neighbor diagnostics do not change the selected candidate

**Research decision:** retain BTC fast as the bull-focused reference and advance the joint SMA200 exit as the strongest candidate for MSTR across bull and bear periods. Do not call it guaranteed, do not replace the BTC strategy on this MSTR evidence, and do not automatically choose new parameters from the latest profitable backtest. No live site or bot change was made.

Files: EXPANDED_PROTOCOL.md; expanded.py; expanded_validation.py; expanded-overview.json (all 74 candidates and compact validation); expanded-candidates.csv; expanded-trades.csv; expanded-comparison.png; expanded-trades.png. The larger reproducible expanded-summary.json / expanded-validation.json curve dumps remain local and ignored by Git.
