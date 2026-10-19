# Breadth momentum protocol

Declared 19 October 2026 before scoring. No production changes.

Test whether the SHAPE of the current weighted BTC indicator-agreement breadth
adds useful timing beyond the 50% level. This is not cross-asset market breadth.
Keep weights [1,1,1,1,1,2], lengths 14/21/34 signal13, 72/28 family split, daily
SMA200 buffered gate, three-close weakness event, 10% BTC buyback target and
seven-day timeout fixed. Costs 0.1%/side, next-open fills; source/hash and gaps
match the frozen history through 9 October 2026.

Predeclare 57 candidates including production:
- 9 sale filters: breadth change over 3/6/12 four-hour bars below 0/-5/-10 pp.
- 2 sale filters: negative change and negative change-of-change over 3/6 bars.
- 2 sale filters: falling on >=2 of last 3 or >=4 of last 6 steps.
- 2 sale filters: EMA3<EMA12 or EMA6<EMA24 of breadth.
- 6 sale filters: >=10/20 pp below rolling 6/12/42-bar breadth peak.
- 8 extra early-sale triggers: breadth below 60/65% but still >=50%, change over
  6/12 bars <=-10/-20 pp, two consecutive qualifying closes, fresh event + daily
  bullish gate. Existing sale events remain enabled.
- 6 recovery filters: >50% AND change over 3/6/12 bars >0/+5 pp.
- 2 recovery filters: rising on >=2 of last 3 or >=4 of last 6 steps.
- 2 recovery filters: EMA3>EMA12 or EMA6>EMA24.
- 2 recovery filters: positive change and positive acceleration over 3/6 bars.
- 6 extra early recovery conditions: breadth >40% and change over 3/6/12 bars
  >10/15 pp, OR normal >50% recovery.
- 9 combinations: sale filter {6-bar falling, EMA3<12, >=20 pp below 12-bar peak}
  crossed with recovery {6-bar rising, EMA3>12, extra early 6-bar/+10 pp recovery}.

Filters accept/reject the original fresh sale event; they do not create a deferred
sale later in a weak run. All recoveries retain target and timeout as alternatives.
Changes are in percentage points, not percent returns. Acceleration is change of
N-bar breadth change over another N bars. Rolling peaks include only current/past
closed bars. Rise/fall counts treat unchanged steps as neither. EMA starts at the
first finite reading. No centered smoothing or hindsight pivot signals.

Selection: maximum lower-quartile annualized log BTC in 2023-2024 over eight
0/3/6/9/12/15/18/21h boundary shifts, minimum five round trips in every alignment.
Tie-break fewer modifications, then rule ID. Report best sale-only, recovery-only,
and overall candidates without selecting on 2025/2026. All history was researched
before; later years are retrospective checks, NOT pristine holdouts.

Evaluate annual 2018-2026 and continuous 2020-21/2023-25/2025-26 for all rules.
Shortlist fee stress 0.3%, +4h delay, both, +24h delay. Report losses, BTC/dollar
drawdown, fees, trade counts and changed trades. Baseline parity with production
research; all-feature future truncation, independent ledger reconstruction and
an independent bar-by-bar simulator for shortlisted base-phase fills.

Additional descriptive diagnostic: sample every sixth four-hour close with
breadth 45-55%, split by 24h change falling below -5 pp, flat within +/-5 pp,
rising above +5 pp. Record next-open-to-24h and seven-day price returns, and
whether price falls 10% within seven days. Report sample counts, all regimes vs
bullish regime, 2018-2022 / 2023-2024 / 2025-2026 separately. Seven-day windows
overlap; do not interpret sample win rates as independent or calibrated confidence.

No promotion without >=6/8 recent-cycle wins vs current, no worse recent minimum,
2020-21 >1 BTC in every alignment, and >=6/8 recent wins at 0.3% fees. Even a pass
is retrospective evidence, not certainty. Publish all trials and keep live unchanged.
