# Family weights and alternative indicators for BTC accumulation

Declared 11 October 2026 before running this experiment. All history has been
examined in prior research. A new parameter search does not create an untouched
holdout. This test targets BTC accumulation under the current tactical overlay,
not the older Average strategy's dollar Sharpe/volatility objective.

Prior notes reviewed: adjacent quant reports `iMACD ensemble.md` (weighting
addendum), `Average strategy v2 research.md` (rounds 5 and 5b), and scripts
`r20_tfweight.py`, `r25_indicator_screen.py`. Prior results did not favor equal
families or dropping iMACD under the old mapping; band-channel indicators were
the closest alternative. Reuse the exact earlier indicator definitions.

Sixteen breadth variants, fixed before scoring:
1. Existing 50-vote average (72/10/10/8% iMACD/SMA/momentum/Donchian).
2–5. iMACD at 50%, 25%, 0%, 90%, with remaining weight split equally among the
other three families. 25% is the equal-family version.
6. iMACD only.
7. Fourteen daily votes only, equal weight per member (5/5/4 by family).
8–9. Only slow (24/48/72h) or fast (4/8/12h) iMACD at 50%, other families equal.
10. Existing member weights except half weight for 4h/8h iMACD.
11–13. Replace the 36-vote iMACD block with the prior research's band-channel,
classic MACD or RSI block, retaining the fourteen daily members.
14. 80% original breadth plus 20% band-channel family.
15. 35% iMACD, 35% band channels, remaining 30% split equally.
16. Five equal families: iMACD/SMA/momentum/Donchian/band channels.

The band-channel block contains Keltner and Bollinger breakout/hysteresis
rules. All alternative blocks use the same six timeframes and three lengths
as the earlier indicator screen. RSI is a trend-state family, not automatic
selling at 70 or buying at 30. Nothing is a new independent market-data input.

For each breadth, test exit thresholds 40/45/50%, confirmation of 1/3 closes,
and recovery timeout only / breadth >50% / breadth >60%. Total 288 rules.
Keep the daily SMA200 buffered gate, 10% BTC target and seven-day timeout.
Only a fresh transition into confirmed weakness can sell; no delayed sale
when a filter becomes eligible during persistent weakness. Strict thresholds;
avoid numerical floating-point ties using 1e-12 tolerance for weighted votes.
Next-open spot/cash fills, 0.10% costs per side. Calendar exits stay separate.

Report fixed-rule breadth substitutions at exit50/confirm3/timeout to isolate
the weighting effect from parameter tuning. Two selectors: recent-only uses
25th percentile log BTC across eight alignments on 2023–2024; recent-weighted
uses 60% annualized 2023–2024 +30% 2019–2021 +10% 2015–2017 (each a 25th
percentile across alignments). Do not score 2025 or 2026. Examine all fresh
years 2018–2026 through October 9 and continuous bull windows after selection.
Report training round-trip counts and cash endpoints. All years are fresh
1-BTC accounts unless marked continuous.

Stress the selected rules, the current baseline, prior >50% recovery candidate,
and fixed equal-family/50%-iMACD/no-iMACD/band-replacement controls at 0.30%
per-side costs, extra 4h delay, extra 24h delay, and combined cost/4h delay.
Do not adopt solely on the strongest hindsight result. Show earlier-cycle
failures and neighbor behavior; retain every attempted configuration locally.

Checks: match the existing baseline and recovery candidate across all years
and phases; verify all breadths/events/recovery conditions under future
truncation; check weighted sums, threshold ties, and independent fee ledger.
References describe indicator definitions, not proof of predictive edge:
https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI
https://www.cmegroup.com/education/courses/technical-analysis/oscillators-macd-rsi-stochastics
