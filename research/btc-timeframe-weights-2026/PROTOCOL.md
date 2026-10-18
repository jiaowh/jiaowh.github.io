# Timeframe weights for the deployed fast iMACD recovery strategy

Declared 18 October 2026 before scoring candidates.

Question: does redistribution **within** the 72% iMACD block improve fee-net BTC
accumulation? Keep the daily SMA/momentum/Donchian block at 10/10/8%, iMACD lengths
14/21/34 and signal 13. Both zero/cross votes and all three lengths retain equal
weight within each timeframe. Timeframes: 4/8/12/24/48/72 hours.

Each timeframe receives a multiplier from {0.5, 1, 2}; renormalize the six weights
to sum to 72%. Proportional vectors are identical and are deduplicated: 665 unique
weight profiles including equal weighting. No random search, zero weights,
indicator-length changes, threshold tuning or changing the daily block.

Retain the production rule: bullish daily SMA200 regime using ±2%/two closes;
fresh three-four-hour-close breadth weakness below 50%; next-open full sale;
buyback at the first close meeting the nominal 10% BTC target, >50% weighted
breadth recovery, or seven-day timer. Next-open buys. Strict 1e-12 threshold
tolerance. 0.1% per-side fees, no leverage, cash interest or taxes. This is the BTC
strategy; MSTR/Vortex weighting and its joint bear override are out of scope.

Use the existing frozen dataset through 9 October 2026 for exact comparison with
the deployed strategy's audited backtest. Report source dates, hash and historical
hourly gaps. Do not silently fill gaps or mix new prices into the experiment.

## Selection and evaluation

- Evaluate all profiles across the existing eight candle phases, 0/3/6/9/12/15/18/21
  hours, shifting daily boundaries too. These are dependent sensitivity scenarios.
- Primary selection: maximize the lower quartile of log ending BTC over continuous
  2023–2024, requiring five completed round trips in every phase. Tie-break toward
  weights closer to equal, then deterministic profile ID.
- Secondary selection: 60% annualized lower-quartile 2023–2024 log BTC, 30% 2019–2021,
  10% 2015–2017. Report this separately, not as a way to replace a losing primary.
- Show each calendar year 2018–2026, 2020–2021, 2023–2025, 2025–2026, and older bull
  windows. Each annual account starts with one BTC; multi-year accounts carry
  continuously. Ending cash is valued as purchasable BTC after the buy fee.
- 2025/2026 do not select weights. They have already been researched repeatedly;
  call this retrospective validation, never an untouched holdout.
- Publish all 665 base-phase outcomes and all phase outcomes in an ignored full
  result file; publish a compact phase summary and selected trade ledgers.
- Compare primary/secondary and named fast/slow/half-fast controls against equal.
  Stress 0.3% per-side costs, one extra 4h execution delay, both together, and a
  24h delay. Threshold targets still use the original nominal fee assumption.
- Check selected profiles shrunk 25/50/75% toward equal (diagnostics, not reselection),
  and top ten training profiles to see whether nearby choices agree.
- Decompose selected 2025 gains/losses by trade; examine whether a result depends
  on one exceptionally profitable completed trade.

## Validation and deployment

Match the equal-weight baseline's annual and continuous ledgers against the
existing fast-strategy report, already checked against production JavaScript.
Independently reconstruct all selected fee ledgers. Check future-truncated
indicators, signals and ledgers. Compare weighted sums and exact threshold ties.
Show both BTC and dollar drawdowns for shortlisted rules. Do not change the chart
or notification bot merely because one hindsight combination ranks highest.
