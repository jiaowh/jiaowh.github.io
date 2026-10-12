# Recovery buybacks and stronger sell signals

Declared 11 October 2026 before this experiment. All history has already been
examined, including the July 2020 missed rally. These are retrospective tests,
not untouched holdouts or calibrated live probabilities.

Keep the refined baseline: buffered daily SMA200 gate; new transition into
three consecutive 4h breadth closes below 50%; next-open full-account fills;
10% BTC target; seven-day maximum wait; 0.10% fee each side. Calendar exits
remain separate. Gate and extra filter must pass on the original transition
bar: a rejected event does not become a delayed sale during the same weakness.

Four recovery modes: original timeout only; additionally breadth above 50%;
additionally above 60%; additionally three closes above 60%. Always retain
the existing price target and seven-day timeout. Threshold comparisons strict.

Ten sell filters: none; latest completed daily close below SMA20; below SMA50;
4h close below the lowest low of the ten daily bars preceding the latest
completed daily bar; daily close below SMA20 minus half ATR14; daily ADX14
above 20 or above 25 with -DI > +DI; daily efficiency20 >= 0.30 with negative
20-day price change; at least three of the four ensemble families below 50%;
at least two of (below SMA20, ten-day support break, ADX20 bearish).
Total 40 configurations. Features use only completed bars. No claim that the
four families or 50 underlying members are independent votes.

Selection: maximize the 25th percentile of log ending BTC across eight candle
alignments in 2023–2024 only; ties favor baseline ordering. Report 2025 after
selection, every fresh year 2018–2026 (through October 9), continuous 2023–2025,
and earlier bull cycles 2015–2017, 2019–2021 and 2020–2021. Report both the full
grid winner and recovery-only winner; no adoption based on this ranking alone.
Also report a predeclared minimum of five completed round trips in each training
alignment to flag tiny-sample selections (not to silently remove them).

Stress selected rules with 0.30% per-side costs, extra 4h and 24h execution
delay, and 0.30% costs combined with extra 4h delay. Keep the nominal target
fixed and use actual delayed sale prices. Record BTC drawdown and losing
trades, not only winning percentages. Test baseline parity with the previous
engine for all years and phases, and features under future truncation.

For signal-quality diagnostics, label every baseline eligible event using an
isolated original-rule round trip, accepting it even if another theoretical
trade overlaps. Compare accepted/rejected signals per filter in 2018–2022,
2023–2024 and 2025. Report n, wins, mean and worst BTC return and descriptive
Wilson intervals. These events can overlap and are correlated; the intervals
do not establish independent statistical significance or live confidence.

Research sources (methods, not evidence of a BTC trading edge):
- Fidelity ADX: https://www.fidelity.com/viewpoints/active-investor/average-directional-index-ADX
- Fidelity ATR: https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr
- CME open interest: https://www.cmegroup.com/education/courses/introduction-to-futures/open-interest
- Bailey et al., backtest overfitting: https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf

Volume/open-interest/funding confirmation is research context only in this
batch: no consistent independent multi-venue history has been validated here.
Do not substitute an incomplete feed or fabricate an edge for those inputs.

Post-run diagnostic extension: the fixed training selection retained the
baseline. Inspect >50% recovery (a predeclared neighbor) and ADX20/negative-DI
filter with timeout in the same execution stresses, because their first-run
results warrant explanation. These are explicitly post-selection diagnostics,
not new chronological winners; do not change the original ranking or thresholds.
