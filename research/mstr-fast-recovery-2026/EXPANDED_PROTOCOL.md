# Expanded MSTR investigation — 2026-10-12

Specified before running the expanded candidates. Keep data frozen through October 9, 2026 and costs at 0.1% each side; use regular-session daily openings for the long-history comparison. Cash earns zero. No leverage, shorts, options, or assumed mNAV history. Main measure is fee-net ending share equivalents relative to holding one split-adjusted unit. Also report dollar return/drawdown and trade counts. Annual resets and continuous periods are separate.

## Fixed candidate families

- Controls: hold, BTC fast recovery, BTC original recovery and target/timer original.
- MSTR-only daily trends: SMA50/100/150/200 with 0% or 2% bands, two-close confirmation; EMA20/50 and 50/200; classic MACD12/26/9 and fast MACD6/13/5, line-zero and signal crossover; six-vote daily fast iMACD (14/21/34, signal13); 14-vote daily SMA/momentum/Donchian breadth and equal-vote combined 20-member breadth, using 40/60 hysteresis with two-close confirmation; 63/126/252-session momentum; Donchian20/10 and55/20; 20%/30% closing-price trailing exits with SMA50 recovery.
- BTC-only regime: daily SMA100/150/200 with ±2% bands, two-close confirmation; fast breadth 40/60 hysteresis and 50/50 confirmation.
- Relative strength: MSTR price divided by the BTC closing price actually available at each MSTR close, compared with its SMA50/100. This is a price-ratio signal, NOT mNAV.
- Hybrids: BTC fast desired position AND MSTR SMA50/100/150/200 regime; BTC fast AND BTC SMA200; BTC fast AND either/both BTC/MSTR SMA200; fast AND relative-strength50/100. Also BTC SMA200 combined with MSTR SMA100/150/200, either/both, without correction timing.
- Tactical hybrid: BTC fresh weakness events; optional MSTR<SMA20 or relative-strength<SMA50 confirmation; MSTR-specific 10%/20% additional-share buyback target; recover on BTC breadth>50% or MSTR classic MACD line>signal; 7/14-calendar-day timeout. All 24 combinations include a separate bear override: cash when BOTH BTC and MSTR SMA200 regimes are bearish, and re-enter on either becoming bullish. Timer cannot override a bear exit. Nominal buyback target retains the original 0.1% cost convention under cost stresses.
- The previous native multi-timeframe MSTR test remains a recent-history control; new MSTR-only daily candidates have enough historical data to test 2022.

Use only information available before each daily opening; an MSTR daily indicator is available after that session closes, never at that session's open. BTC signals can update overnight. A fresh BTC event first becomes actionable at the next stock opening; confirmation conditions use the last closed stock session. Stock buyback prices are prior closes, not intraday lows. Fill fees and share arithmetic must reconcile independently.

## Selection and validation

Retain every candidate, including failures. Select one balanced candidate on 2021–2024 only by `0.5 * mean(log annual shares) + 0.5 * min(log annual shares)`. Hold is eligible. Separately select a bull-focused candidate by mean log share outcome in 2023–2024. Freeze these choices before reporting 2025–2026. Because those histories were previously examined and MSTR correlates with the BTC tuning sample, call this retrospective chronological validation, not untouched out-of-sample evidence.

For an adaptive diagnostic, each January choose by the same balanced score using only the previous three calendar years, for 2023–2026. Evaluate the changing rules on one continuous portfolio, with actual opening transactions when rules change, and no fee-free year-boundary reset. Signal states may warm up on older data; trading decisions cannot use later data.

For shortlisted candidates, test costs of 0.3% and 0.5%, one-extra-session execution delay, removal of the single best completed trade (diagnostic only), alternate BTC clock phases when applicable, and equal-date intraday execution where the candidate permits it. Report the risk of missing a bull rebound along with bear gains. Use prefix checks, baseline parity, and ledger reconciliation.

## Session alternatives, independently reported

Test scheduled MSTR overnight exposure: enter at the known closing auction and exit at next regular open (long history), or first observed premarket04/06/08 ET open (recent history only). The closing auction order is scheduled, not conditional on its unknown closing price. For an overlay, stay in MSTR during the day only if BTC fast position is bullish; otherwise hold overnight only. BTC state for scheduled auction decisions must be known before the auction. Do not assume access to unobserved overnight prints. Costs 0.1/0.3/0.5% each side; no best-exit-time optimization. These are separate high-turnover experiments, not candidates for the long-history model selection.

The existing site and bot stay unchanged during research. Save a report, all candidate results, and shortlisted trade ledgers. Do not claim certainty or promote a strategy because it is the best hindsight row.
