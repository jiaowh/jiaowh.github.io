# iMACD internal parameters and ordinary MACD mixtures

Completed 12 October 2026 (Singapore). Frozen prices through 9 October 2026. 128 rules × eight candle alignments; every rule starts with 1 BTC in each test window. 0.10% cost per side; completed-bar decisions and next four-hour open fills. Annual accounts reset; multi-year accounts carry continuously. * denotes ending cash marked as BTC after a purchase fee. Annual results therefore need not multiply to the continuous result.

**Finding:** internal parameters materially change the result. The recent-training winner earns 2.1072 BTC over 2023–2025 and beats both existing controls in all eight alignments, but loses BTC in 2019–2021 and the partial 2026 test. Mixing iMACD and MACD can improve individual periods; it does not dominate the original across periods. These results support further consideration of a recent-cycle candidate, not a claim of always beating 1 BTC. The active Average and refined strategy formulas remain unchanged.

## What can be tuned?

The existing iMACD ensemble uses lengths 21/34/55, nine-bar signal smoothing, and 4/8/12/24/48/72-hour timeframes. For each length and timeframe it casts two votes: impulse >0 and impulse > its signal. The impulse is the distance of a zero-lag typical-price average outside a smoothed high/low channel; it is zero inside that channel. The channel and zero-lag average share the main length. The signal is an SMA of the impulse. This implementation has no separate fast/slow pair: those belong to ordinary MACD. [Original iMACD author description](https://www.tradingview.com/script/qt6xLfLi-Impulse-MACD-LazyBear/).

Standard MACD subtracts a slow closing-price EMA from a fast EMA and smooths the result with an EMA signal. [Fidelity MACD definition](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/macd). Our scaled MACD block uses slow lengths 21/34/55, fast lengths 10/16/25 and signal 9, on the same six timeframes. The classic control instead uses 12/26/9 at each timeframe, normalized to the same total block weight.

## Controlled experiment

Five length triplets: 14/21/34, 18/30/48, 21/34/55, 24/40/64 and 34/55/89. Signal SMA lengths: 5, 9 and 13. For each set, test pure iMACD and 75/25, 50/50 and 25/75 iMACD/MACD mixtures. Add scaled MACD, classic MACD and the two zero/cross slot swaps. Test each with timeout-only or additional >50% breadth recovery. The 72% oscillator block and 28% daily block remain constant. A 50/50 mix means 36% total iMACD, 36% total MACD, 10% daily SMA, 10% daily momentum and 8% daily Donchian. MACD and iMACD remain correlated price transforms.

All retain the buffered daily SMA200 gate, fresh three-close transition below 50% breadth, 10% nominal BTC buyback target and seven-day timeout. The recovery variant adds a buyback when its own blended breadth closes >50%. Target calculations retain the nominal 0.10% cost assumption even under higher-cost stress. No bear-year calendar override is applied. [Declared protocol](IMACD_PROTOCOL.md).

Earlier notes (`../quant/reports/Average strategy v2 research.md`, Round 5) tested the two slot swaps under the older Average dollar/Sharpe objective and did not adopt them. The previous BTC study varied weights and indicator families but kept iMACD lengths/smoothing fixed. This study addresses that missing parameter test.

## Main comparison

| Rule | 2020 BTC | 2025 BTC | Continuous 2023–2025 BTC | Eight-alignment cycle range | Beats current / prior recovery |
|---|---:|---:|---:|---:|---:|
| Current refined | 0.9073 | 1.1506 | 1.6638 | 1.6541–2.0037 | 0/8 · 1/8 |
| Current + >50% recovery | 1.0426 | 1.2181 | 1.8283 | 1.7644–1.9562 | 7/8 · 0/8 |
| Signal 13 only | 1.0780 | 1.1388 | 1.8767 | 1.6565–1.8861 | 4/8 · 2/8 |
| Fast iMACD, signal 13 + recovery | 0.9646 | 1.2256 | 2.1072 | 1.8771–2.1882 | 8/8 · 8/8 |
| Slow iMACD / MACD 50:50, signal 13 | 0.9868 | 1.1140 | 1.8421 | 1.6891–1.9648 | 5/8 · 4/8 |
| Current iMACD / MACD 50:50 + recovery | 0.9955 | 1.2313 | 1.9300 | 1.6725–1.9300 | 4/8 · 1/8 |
| Current iMACD / MACD 50:50, timeout | 1.0913 | 1.1141 | 1.5932 | 1.5932–1.9011 | 4/8 · 2/8 |
| iMACD zero + MACD signal-cross | 1.0813 | 1.1235 | 1.7971 | 1.6011–1.9668 | 4/8 · 2/8 |
| MACD zero + iMACD signal-cross | 1.0895 | 1.0946 | 1.5306 | 1.5306–1.9069 | 2/8 · 2/8 |
| Scaled MACD only | 1.0456 | 1.0620 | 1.7269 | 1.6070–1.8497 | 4/8 · 2/8 |
| Classic 12/26/9 MACD only | 0.7584 | 1.0939 | 1.6940 | 1.1535–1.8034 | 1/8 · 0/8 |

Reference self-comparisons show zero wins by definition. Candle alignments shift both intraday and daily boundaries; they use overlapping prices and are not eight independent samples.

## Selection and annual results

The recent selector maximizes the lower quartile of annualized log BTC across alignments in 2023–2024. It selects **14/21/34 iMACD lengths, signal SMA 13, plus >50% early recovery**. Its training lower-quartile BTC is 1.7496 versus 1.5795 for current. The recency-weighted selector uses 60% that score, 30% annualized 2019–2021, 10% annualized 2015–2017. It selects **34/55/89 iMACD lengths, signal 13, mixed 50/50 with scaled MACD, timeout only**. Both selectors exclude 2025/2026, but all of this history was previously examined. This is retrospective testing with accumulated selection risk, not untouched out-of-sample evidence. Signal 13 is the upper boundary tested, not an established global optimum.

| Window, starting 1 BTC | Current | Prior recovery | Signal 13 only | Recent-selected fast | Weighted-selected mix |
|---|---:|---:|---:|---:|---:|
| 2018 | 1.3661 | 1.2729 | 1.3680 | 1.1493 | 1.2568 |
| 2019 | 0.9945 | 0.9593 | 1.1011 | 0.9977 | 1.0869 |
| 2020 | 0.9073 | 1.0426 | 1.0780 | 0.9646 | 0.9868 |
| 2021 | 1.1359 | 1.1577 | 1.0726 | 0.9646 | 1.6717* |
| 2022 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| 2023 | 1.2530 | 1.2100 | 1.2559 | 1.2855 | 1.2697 |
| 2024 | 1.2120* | 1.2702* | 1.3780* | 1.3863* | 1.3677* |
| 2025 | 1.1506 | 1.2181 | 1.1388 | 1.2256 | 1.1140 |
| 2026 through Oct 9 | 1.0000 | 1.0000 | 1.0000 | 0.9774 | 1.0000 |
| 2015-17 | 0.8778 | 1.0541 | 0.8898 | 1.1340* | 0.7507 |
| 2019-21 | 1.0250 | 1.1579 | 1.2731 | 0.9283 | 1.7931* |
| 2020-21 | 1.0306 | 1.2070 | 1.1562 | 0.9304 | 1.6497* |
| 2023–2024 training | 1.5186* | 1.5370* | 1.7306* | 1.7820* | 1.7366* |
| 2023-25 | 1.6638 | 1.8283 | 1.8767 | 2.1072 | 1.8421 |

**Simple smoothing change:** signal 9→13 alone leaves the timeframes, main lengths and trade rules unchanged. It improves default 2019 from 0.9945 to 1.1011 and 2020 from 0.9073 to 1.0780. Both years finish >1 in all eight alignments. However, 2025 falls from 1.1506 to 1.1388, 2021 also weakens, and the 2015–2017 default remains below 1. Its recent-cycle gain beats current in only four alignments and the prior recovery candidate in two. It does not remove the worst July 2020 mistake: both versions lose 14.57% BTC on the same July 21 sale and seven-day buyback. Much of the annual improvement comes from March: signal 13 earns 32.23% on its March 9 sale/buyback, versus 10.50% on the original March 8 trade. The nominal target is a decision threshold, not a limit order or a cap on the realized gain; the next-open execution during a sharp crash can differ considerably. The smoother signal compensates for the July loss elsewhere.

**Recent-selected faster iMACD:** 2023–2025 reaches 2.1072 BTC (+110.72%) and ranges 1.8771–2.1882. The 2025 result is 1.2256 with ten completed round trips, five winners and 9.43% BTC drawdown; current has eight trips, four winners and 14.99% drawdown. A win rate around half can still add BTC because the gains and losses differ in size. The full 2019–2021 default is 0.9283 and its 2020 and 2021 standalone defaults are both approximately 0.9646. Faster is not universally better.

**50/50 default mixture plus recovery:** 1.9300 BTC over the recent cycle and 1.2313 in 2025 look attractive, but the cycle range is 1.6725–1.9300. It beats the prior recovery candidate in only one alignment and loses in two 2020 alignments. That is weaker sensitivity evidence than the faster pure-iMACD candidate.

**Bear-year interpretation:** a fresh 2022 account makes no trades for the displayed candidates and finishes at 1 BTC; that means it experienced the price decline while holding, not that it protected dollar capital. The recent-selected candidate finishes partial 2026 at 0.9774 BTC after a losing trade; current finishes at 1 with no trades. This bull-gated tactical strategy is not a standalone bear-market exit system.

## Nearby settings, not just the winner

All rows below use pure iMACD within the 72% oscillator block and >50% recovery. Only lengths and signal smoothing change. Full 128-rule outcomes are in the downloadable summary.

| Main lengths | Signal | 2020 BTC | 2025 BTC | 2023–2025 BTC | Cycle alignment range |
|---|---:|---:|---:|---:|---:|
| 14/21/34 | 5 | 1.0448 | 1.2984 | 1.9506 | 1.4534–2.1125 |
| 14/21/34 | 9 | 1.1534 | 1.2080 | 1.9462 | 1.8447–2.1123 |
| 14/21/34 | 13 | 0.9646 | 1.2256 | 2.1072 | 1.8771–2.1882 |
| 18/30/48 | 5 | 0.8914 | 1.2075 | 1.7907 | 1.5192–1.9139 |
| 18/30/48 | 9 | 1.0347 | 1.2218 | 1.9476 | 1.5785–2.0856 |
| 18/30/48 | 13 | 1.0283 | 1.2245 | 2.0765 | 1.6799–2.1276 |
| 21/34/55 | 5 | 0.8327 | 1.1914 | 1.7336 | 1.4623–1.8206 |
| 21/34/55 | 9 | 1.0426 | 1.2181 | 1.8283 | 1.7644–1.9562 |
| 21/34/55 | 13 | 1.2313 | 1.2056 | 1.9665 | 1.6332–1.9665 |
| 24/40/64 | 5 | 0.9088 | 1.1631 | 1.6670 | 1.5822–1.8535 |
| 24/40/64 | 9 | 1.0266 | 1.1243 | 1.7701 | 1.7057–1.8233 |
| 24/40/64 | 13 | 1.0176 | 1.1079 | 1.8444 | 1.7742–1.9385 |
| 34/55/89 | 5 | 0.8853 | 1.1654 | 1.7146 | 1.4284–1.7810 |
| 34/55/89 | 9 | 1.1184 | 1.1713 | 1.7623 | 1.5414–1.9542 |
| 34/55/89 | 13 | 1.2599 | 1.1944 | 1.7524 | 1.4294–1.9982 |

The fast-length signal-9 neighbor also holds up in the recent cycle (minimum 1.8447 BTC), so the selected result is not an isolated winning point. Signal 5 is substantially more alignment-sensitive. Changing the length triplet to the nearby 18/30/48 with signal 13 reduces the minimum to 1.6799, so parameter sensitivity remains material.

## Execution stress

Ranges below cover the same eight alignments. Costs combine the per-side friction assumption; delay means extra bars after the usual next-open fill.

| Candidate | Stress | 2020 BTC range | 2025 BTC range | 2023–2025 BTC range |
|---|---|---:|---:|---:|
| Fast iMACD, signal 13 + recovery | 0.30% each side | 0.9097–1.0734 | 1.0889–1.2590 | 1.6917–1.9642 |
| Fast iMACD, signal 13 + recovery | Extra 4h | 0.9630–1.1032 | 1.1533–1.2474 | 1.7119–2.3621 |
| Fast iMACD, signal 13 + recovery | Extra 24h | 0.8440–1.4121 | 1.0135–1.2413 | 1.4362–1.9328 |
| Fast iMACD, signal 13 + recovery | 0.30% + extra 4h | 0.9289–1.0642 | 1.1125–1.2033 | 1.5366–2.1203 |
| Signal 13 only | 0.30% each side | 1.0022–1.0787 | 0.9813–1.1139 | 1.5291–1.7411 |
| Signal 13 only | Extra 4h | 1.0497–1.3290 | 1.0463–1.1500 | 1.6021–1.9212 |
| Signal 13 only | Extra 24h | 1.1394–1.3377 | 0.9589–1.2138 | 1.2455–1.8393 |
| Signal 13 only | 0.30% + extra 4h | 1.0166–1.2923 | 1.0134–1.1093 | 1.4789–1.7735 |
| Slow iMACD / MACD 50:50, signal 13 | 0.30% each side | 0.9423–1.2234 | 0.9724–1.1276 | 1.5468–1.8065 |
| Slow iMACD / MACD 50:50, signal 13 | Extra 4h | 1.1002–1.2699 | 1.0347–1.1806 | 1.6946–1.8923 |
| Slow iMACD / MACD 50:50, signal 13 | Extra 24h | 1.0637–1.1651 | 1.0311–1.1355 | 1.3553–1.6274 |
| Slow iMACD / MACD 50:50, signal 13 | 0.30% + extra 4h | 1.0656–1.2348 | 0.9941–1.1298 | 1.5519–1.7191 |
| Current + >50% recovery | 0.30% each side | 0.9701–1.1024 | 1.0811–1.1928 | 1.6093–1.7986 |
| Current + >50% recovery | Extra 4h | 1.0047–1.1262 | 1.0967–1.2440 | 1.6836–2.1272 |
| Current + >50% recovery | Extra 24h | 1.2642–1.3574 | 1.0230–1.1528 | 1.3823–2.0051 |
| Current + >50% recovery | 0.30% + extra 4h | 0.9691–1.0951 | 1.0537–1.2000 | 1.5475–1.9325 |

The fast recent-selected candidate remains above 1 BTC in all tested 2025 and recent-cycle stresses, but older losses persist. Signal-13-only drops below 1 in a 2025 alignment under higher costs or 24h delay. The weighted mixed candidate also drops below 1 in a 2025 alignment at higher costs. None of these results proves future profits or superiority at every execution time.

## Verification and reproducibility

144 annual ledger comparisons reproduce the original timeout and recovery controls across eight alignments. 128 breadth-prefix checks (64 definitions at two historical cutoffs) verify that later prices do not change earlier signals. Original iMACD breadth and scaled MACD breadth match prior implementations. The account engine independently reconciles each cash leg. The hourly source has one previously documented missing hour on 24 March 2023; it is retained, not fabricated. These checks detect implementation errors but cannot remove historical selection bias.

Run `imacd_tuning.py`, then `imacd_report.py` using the existing Python research environment and adjacent quant modules. [Protocol](IMACD_PROTOCOL.md) · [All rule/phase results, selected ledgers and stress summary](imacd-summary.json). Large intermediate raw results remain locally ignored.
