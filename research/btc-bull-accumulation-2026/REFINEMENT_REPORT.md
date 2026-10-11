# Focused parameter refinement after the 2025 trade review

Completed 11 October 2026. This adds 192 configurations to the earlier searches; it does not erase their selection bias. The [protocol](REFINEMENT_PROTOCOL.md) was saved before the run. All history was already viewed, so chronological checks here are retrospective, not untouched forward validation.

## Improvement found

Selecting using only 2023–2024 scores chooses **50% breadth, three consecutive weak 4-hour closes, a 10% BTC target and a seven-day timeout**. Retain the buffered SMA200 gate. Sell at the next open after the third weak close; a fresh transition into the confirmed weak state is required for another sale. Buy after the gain target is reached or seven days have elapsed, filling at the next open. Trade the full spot/cash account, paying 0.10% per side. The calendar bear exit remains separate.

| Default-alignment test | Original 1-close / 14-day rule | Refined 3-close / 7-day rule |
|---|---:|---:|
| Fresh 1 BTC, 2023–2024 selection window | 1.5427 | 1.5186 |
| Fresh 1 BTC, 2025 chronological check | 0.9739 | **1.1506** |
| Continuous 2023–2025 | 1.6224 | **1.6638** |
| Fresh 1 BTC, July–December 2025 | 0.9990 | **1.1943** |
| Fresh 1 BTC, 2020–2021 diagnostic | 1.1228 | **1.0306** |

The refined rule's 2023–2024 default result is slightly lower, but its lower-quartile performance across eight candle alignments is higher, which is the declared selection objective. This same rule also tops the full-cycle lower-quartile score, but that later observation did not determine the chronological selection.

Continuing the refined account into 2025 adds **9.56% BTC equivalent** at the default alignment, with positive growth on all eight alignments (1.48%–14.75%). A fresh January account gains 15.06%; inherited cash/positions and pending orders explain why these differ. No account reset is used to claim continuous returns.

## What actually fixes part of the problem?

| Change in isolation | Fresh 2025 BTC | Continuous 2023–2025 BTC |
|---|---:|---:|
| Original: one close, 14 days | 0.9739 | 1.6224 |
| Three closes, still 14 days | 0.9878 | 1.5543 |
| One close, shorten to seven days | 1.1269 | 1.6109 |
| Three closes and seven days | **1.1506** | **1.6638** |

Most of the improvement comes from shorter cash waits. Three-close confirmation changes execution timing, but **does not reduce the default 2025 trade count**: both versions have eight completed round trips, four winners and four losers. Cash exposure falls from 25.98% of the year to 14.34%. Maximum BTC-equivalent drawdown improves from 20.25% to 14.99%, but remains substantial.

For example, the old September trade sells near $112,651 and waits until October 7 to buy near $124,659. The refined rule sells eight hours later near $113,090 and buys September 30 near $113,699. That avoids much of the missed rally. It still sells after weakness: the refined January sale is near $93,222 and its buyback near $99,800, a losing trade. This is not a solution that identifies every top and bottom.

## Sensitivity checks

| Separate stress | Fresh 2025 range across eight alignments | Full 2023–2025 range |
|---|---:|---:|
| Base: 0.10% each side | **1.0637–1.1876** | **1.6541–2.0037** |
| 0.30% each side | **1.0302–1.1502** | **1.5148–1.8497** |
| Extra 4-hour execution delay | **1.0830–1.2125** | **1.6551–2.0733** |
| Extra 24-hour execution delay | **1.0648–1.1285** | **1.1079–1.8936** |

All eight alignments remain above 1 BTC in these two windows under each separate stress. The July–December 2025 test is weaker with an extra day of delay: one alignment ends at 0.9959 BTC. Cost and delay were not combined. Delayed execution recomputes the buyback target from the actual sale price; cost stress retains the nominal target price formula. These checks do not model exchange outages or order-book depth.

Nearby settings are not uniformly successful. The 7.5% BTC target with the same three-close/seven-day rule also gains in 2025 across alignments (1.0494–1.1476). However, replacing seven days with three days gives 0.9822–1.0805; with 14 days, 0.9064–1.1263. Lowering the breadth threshold to 40% gives 0.9425–1.1454. The selected timeout is therefore not evidence of a broad parameter region that always wins.

## Other selections and failed optimization goals

- Optimizing the lower-quartile score directly on 2025 picks 30% breadth, three-close confirmation, a 5% BTC target and a 28-day timeout. It gives **1.3350 BTC** in 2025 but only **0.8498 BTC** in 2023–2024. This is a hindsight fit and not the selected improvement above.
- Selecting using January 2024–June 2025 instead chooses 20% breadth, one close, a 10% target and breadth recovery above 60%. Its subsequent July–December result is 1.0152 BTC at the default alignment, but 0.9459–1.1114 across alignments. More frequent retuning is not automatically better.
- The earlier conservative 20%/5%/breadth-recovery candidate still earns more in fresh 2025 (1.2025 BTC) than the refined rule, while accumulating less over the full 2023–2025 window (1.3327 BTC). There is no single winner on every metric and start date.

## Chart and verification

The [interactive trade explorer](../../btc-trades.html?rule=refined) now has a **Rule** selector for the original and refined models, retaining all 2018–2026 yearly and continuous-account views. The original remains the default when no rule is specified; this comparison does not change the live Average model or the calendar framework.

`refine.py` retains every configuration, selection score, window and stress result in [refinement-results.json](refinement-results.json). Its engine matches the previous engine's exact fills and fee-net BTC in 16 annual reference comparisons, and its confirmation events pass future-truncation checks. Each round trip independently reconciles its price ratio after fees. The chart generator matches both engines on all 18 model/year overlays and checks continuous 2023–2025 endpoints. The browser test covers 88 model/year/account/strategy views, marker counts, year-crossing fills, zoom, mobile layout and empty-trade years.

This is a stronger historical candidate for the recent-cycle objective, with remaining losses and tuning risk. It is not a guarantee of more BTC in every future year.
