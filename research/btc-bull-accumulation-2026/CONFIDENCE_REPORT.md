# Recovery buybacks and signal confidence

Completed 11 October 2026. Tested 40 fixed rule combinations across eight candle alignments. The baseline matched the existing engine in all 72 annual/phase checks, including fills, BTC and drawdown. Every filter and recovery condition passed future-truncation checks at two dates. Synthetic checks verify next-open recovery fills, delayed-sale repricing, timeout and rejected-event behavior.

**Finding:** buying back when breadth first exceeds 50% is a promising research candidate. It improved default-alignment 2020 and 2023–2025 results, but worsened 2019 and was not chosen by the predeclared 2023–2024 robustness ranking. The extra sell filters did not establish a reliable high-confidence subset. No live rule has been replaced.

## Rules and accounting

All columns retain the bullish buffered daily SMA200 gate, a new transition into three closed 4h breadth readings below 50%, a 10% BTC target, seven-day maximum cash wait, and full-account next-open fills. Costs are 0.10% each side. The recovery variants additionally buy after a close with breadth strictly above their threshold. 50% exactly does not qualify; with 50 members, >50% means at least 26 bullish votes (52%). Buyback acts independently of the sale gate. The ADX variant requires completed-daily ADX14 >20 and -DI > +DI at the sale signal. Calendar bear exits are separate. Dollar losses can remain large while BTC units hold steady.

## Annual and continuous results

Each year starts separately with 1 BTC. Multi-year rows are continuous accounts; do not multiply annual rows when cash carries across a boundary. Ending cash is valued as BTC after its purchase fee; 2024 ends in cash in the baseline and both recovery variants. 2026 stops on October 9 UTC.

| Window | Current refined | Add >60% recovery | Add >50% recovery | ADX20 bearish filter |
|---|---:|---:|---:|---:|
| 2018 | 1.3661 BTC | 1.3661 BTC | 1.2729 BTC | 1.1098 BTC |
| 2019 | 0.9945 BTC | 0.9945 BTC | 0.9593 BTC | 0.9738 BTC |
| 2020 | 0.9073 BTC | 1.0223 BTC | 1.0426 BTC | 1.0844 BTC |
| 2021 | 1.1359 BTC | 1.0522 BTC | 1.1577 BTC | 1.0059 BTC |
| 2022 | 1.0000 BTC | 1.0000 BTC | 1.0000 BTC | 1.0000 BTC |
| 2023 | 1.2530 BTC | 1.1881 BTC | 1.2100 BTC | 1.0166 BTC |
| 2024 | 1.2120 BTC | 1.2120 BTC | 1.2702 BTC | 1.0455 BTC |
| 2025 | 1.1506 BTC | 1.1601 BTC | 1.2181 BTC | 1.1745 BTC |
| 2026 | 1.0000 BTC | 1.0000 BTC | 1.0000 BTC | 1.0000 BTC |
| 2015-17 | 0.8778 BTC | 1.0341 BTC | 1.0541 BTC | 0.7986 BTC |
| 2019-21 | 1.0250 BTC | 1.0698 BTC | 1.1579 BTC | 1.0622 BTC |
| 2020-21 | 1.0306 BTC | 1.0757 BTC | 1.2070 BTC | 1.0908 BTC |
| 2023–2024 training | 1.5186 BTC | 1.4400 BTC | 1.5370 BTC | 1.0628 BTC |
| 2023-25 | 1.6638 BTC | 1.5923 BTC | 1.8283 BTC | 1.1887 BTC |

## What happened to the July 2020 loss?

All three unfiltered variants sold July 21 at $9,315.28. The current rule bought July 28 at $10,881.62. The >60% rule bought July 23 at $9,518.16; the >50% rule bought July 22 at $9,390.00. The early exits still lost BTC on this particular trade, but cut the missed-rally damage substantially. The >50% rule changed full-year 2020 from 0.9073 to 1.0426 BTC. It also changed 2019 from 0.9945 to 0.9593 BTC: earlier recovery is not universally beneficial.

For continuous 2023–2025, >50% recovery increased ending BTC from 1.6638 to 1.8283 and reduced the default-alignment BTC-equivalent maximum drawdown from 18.38% to 13.49%. This is a hindsight diagnostic of a predeclared neighbor, not independent forecasting evidence.

## Selection and sensitivity

The declared selector maximized the 25th percentile of log BTC across eight alignments using only 2023–2024. It retained the baseline, both among recovery-only alternatives and across all 40 rules. Its training score expressed in BTC was 1.5795, versus 1.5582 for >50% recovery and 1.5442 for >60% recovery. The filter requiring at least five training round trips per alignment also retained the baseline. History was already inspected; 2025 is a retrospective chronological check, not a pristine holdout.

| Rule | 2020 BTC range | 2025 BTC range | 2023–2025 BTC range |
|---|---:|---:|---:|
| Current refined | 0.9073–1.1449 | 1.0637–1.1876 | 1.6541–2.0037 |
| Add >60% recovery | 0.9744–1.1449 | 1.0632–1.1825 | 1.5923–1.8864 |
| Add >50% recovery | 1.0016–1.1337 | 1.1208–1.2316 | 1.7644–1.9562 |
| ADX20 bearish filter | 1.0241–1.1522 | 0.9500–1.3044 | 1.0755–1.5836 |

Stress results for the >50% recovery candidate (ranges across eight alignments):

| Execution assumption | 2020 | 2025 | 2023–2025 |
|---|---:|---:|---:|
| 0.30% cost per side | 0.9701–1.1024 | 1.0811–1.1928 | 1.6093–1.7986 |
| Extra 4h delay | 1.0047–1.1262 | 1.0967–1.2440 | 1.6836–2.1272 |
| Extra 24h delay | 1.2642–1.3574 | 1.0230–1.1528 | 1.3823–2.0051 |
| 0.30% cost + extra 4h delay | 0.9691–1.0951 | 1.0537–1.2000 | 1.5475–1.9325 |

The 2020 improvement is fragile under higher costs: some alignments fall below 1 BTC. 2025 and the full recent cycle remain above 1 BTC in all listed candidate stresses. A favorable delayed-fill outcome does not mean delays are beneficial in general.

## Strong versus weak signals

We tested additional price damage, support breaks, volatility-scaled damage, trend strength/direction, directional efficiency, agreement among indicator families, and a two-of-three combination. These are candidate filters, not confidence probabilities. All are price-derived and correlated.

For this diagnostic, every original eligible event receives an isolated seven-day/target round trip, even if another hypothetical trade overlaps. Thus the 2025 population has 10 labeled events although the real baseline account takes eight round trips. Signals whose round trip crosses a period boundary are excluded from that period. Win means fee-net BTC gain, not successful crash prediction.

| Extra filter | 2018–2022 accepted wins/events | 2023–2024 accepted wins/events | 2025 accepted wins/events | 2025 mean BTC return/event |
|---|---:|---:|---:|---:|
| None | 16/27 | 11/13 | 6/10 | +2.50% |
| Daily close below SMA20 | 11/21 | 9/11 | 5/9 | +1.35% |
| Daily close below SMA50 | 13/24 | 7/8 | 5/9 | +2.36% |
| Break prior ten-day support | 3/7 | 4/6 | 1/3 | -0.26% |
| Below SMA20 by half ATR14 | 8/16 | 6/8 | 2/5 | -0.10% |
| ADX >20 and bearish DI | 8/16 | 4/5 | 3/3 | +5.56% |
| ADX >25 and bearish DI | 0/3 | 0/0 | 2/2 | +7.20% |
| Directional efficiency ≥0.30, down | 1/2 | 0/0 | 0/0 | — |
| Three bearish families | 4/6 | 0/1 | 2/3 | +4.55% |
| Two of three confirmations | 8/16 | 7/9 | 3/5 | +2.72% |

**ADX20 is worth observing, but not calling proven.** It admitted three winners in 2025. The descriptive 95% Wilson interval for 3/3 spans about 44%–100%, even before accounting for correlated events or multiple testing. Its older-period events won only 8/16. In actual portfolio replay, changing candle alignment made its 2025 result range from 0.9500 to 1.3044 BTC. Default continuous 2023–2025 performance was only 1.1887 BTC versus 1.6638 without the filter, although BTC drawdown was lower (6.78% versus 18.38%). The filter trades off participation for lower drawdown; it does not establish more reliable accumulation.

**Support breaks and extra confirmations can arrive too late.** The tested support-break subset won 1/3 events in 2025. The half-ATR damage subset won 2/5. Waiting for more visible damage can sell after much of the decline is over, before a rebound. This is an interpretation consistent with these outcomes, not proof that every support or volatility rule fails.

## Research sources and what they do establish

- [Fidelity on ADX](https://www.fidelity.com/viewpoints/active-investor/average-directional-index-ADX): ADX measures strength; directional-movement lines supply direction. A high ADX alone is not bearish. Educational thresholds motivated the tests; they do not validate this strategy.
- [Fidelity on ATR](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr): ATR measures volatility, not direction. Volatility-scaled damage is a way to normalize a move, not infer that it must continue.
- [CME on open interest](https://www.cmegroup.com/education/courses/introduction-to-futures/open-interest): participation can complement price-trend analysis. Volume, open interest and funding warrant separate tests with consistent historical coverage and publication-time lags. They were not backtested in this batch; no predictive success is claimed.
- [Bailey et al., The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf): repeatedly searching historical data can select false positives. Forty new variants are additional research trials, not forty independent validations.

## Practical interpretation

The most useful new candidate is a faster buyback after breadth exceeds 50%, while keeping the target and timeout. The strongest evidence concerns limiting missed-rally damage, not predicting crashes with certainty. Keep the current rule as the reference and label this alternative experimental; compare forward signals and executable fills before replacing it. The ADX filter can be displayed as context, but should not be turned into an invented “high-confidence” percentage or automatically justify a larger position.

Reproduce with `confidence.py`, then `confidence_report.py`; Python/NumPy and the same adjacent quant research inputs are required. See [the declared protocol](CONFIDENCE_PROTOCOL.md). Full trial outputs remain locally in the ignored `confidence-results.json`; the compact [published summary](confidence-summary.json) retains all rule scores, phase/window summaries and accepted/rejected event diagnostics.
