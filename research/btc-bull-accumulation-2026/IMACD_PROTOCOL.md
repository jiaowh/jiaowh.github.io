# iMACD parameter and MACD mixture experiment

Declared 11 October 2026 before running this grid. All history has already been explored in prior research: this is retrospective selection, not a pristine holdout.

Keep six timeframes (4/8/12/24/48/72 hours), 72% oscillator-block weight and 28% original daily votes. iMACD uses SMMA high/low, double-EMA zero-lag typical price, and an SMA signal. Test five length triplets: 14/21/34, 18/30/48, 21/34/55 (current), 24/40/64, 34/55/89. Test signal lengths 5/9/13. For each of the 15 parameter sets, test pure iMACD and oscillator-block mixtures with 25/50/75% iMACD, the balance ordinary MACD. Ordinary MACD in these mixtures uses slow lengths 21/34/55, fast round(12/26 × slow), and nine-bar EMA signal on closing price.

Four additional controls: pure scaled MACD, pure classic 12/26/9 MACD (equal timeframe weights), iMACD trend-zero + MACD signal-cross votes, and MACD trend-zero + iMACD signal-cross votes. Slot swaps use current iMACD lengths/smoothing. Total 64 breadth definitions × two recovery modes = 128 rules. Recovery is either the existing seven-day timeout or an additional breadth >50% early buyback.

All other rules stay fixed: daily buffered SMA200 gate, fresh three-close transition below 50% breadth, full-account sale next four-hour open, 10% nominal BTC-gain buyback or seven-day timeout, 0.10% cost per side. Use the audited confidence.py engine and frozen hourly inputs through 9 October 2026. No calendar cash override. Every annual test starts with 1 BTC; multi-year tests carry continuously. Ending cash is fee-net BTC equivalent, not BTC already held.

Run all rules on eight candle alignments. Rank using lower-quartile annualized log BTC in 2023–2024 (recent selector), and 60% that score + 30% 2019–2021 + 10% 2015–2017 (weighted selector). Neither selector uses 2025 or 2026. Also identify the best pure-iMACD, mixed and slot-swap rule within each declared selector, without claiming subgroup rankings are independent evidence. Report all trials, neighboring parameter results, annual 2018–2026 and continuous bull windows.

Stress selected rules and original controls at 0.30% cost per side, an extra 4h/24h execution delay, and combined 0.30% plus 4h. Alignments are sensitivity checks of overlapping history, not independent samples. Verify default iMACD and scaled MACD breadth and ledger parity, and all-breadth causal prefixes. No automatic promotion to the live strategy based on a backtest winner.
