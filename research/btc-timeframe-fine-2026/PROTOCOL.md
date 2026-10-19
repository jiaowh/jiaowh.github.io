# Fine timeframe-weight protocol

Declared 19 October 2026 before scoring this experiment.

Objective: improve fee-net BTC accumulation over the deployed [1,1,1,1,1,2]
weights (4/8/12/24/48/72h), without changing indicator lengths, signal 13,
72% iMACD / 28% daily split, 50% threshold, SMA200 regime, or recovery rules.
MSTR is out of scope. No live rule changes during this experiment.

Use the same audited frozen hourly history through 9 October 2026 and verify its
hash. Preserve known gaps. 0.1% fee each side, next-open fills. Annual accounts
reset to 1 BTC; continuous multi-year windows do not reset.

## Bounded search (not every possible real-valued multiplier)

1. Joint local grid: first five multipliers each {0.75,1,1.25}; 72h multiplier
   {1.50,1.75,2,2.25,2.50,2.75,3}. 1,701 raw combinations.
2. One-at-a-time scans around production: each first-five multiplier 0.50..1.50
   in 0.05 increments; 72h 0.50..3.50 in 0.05 increments. Include equal weights.
3. Select the top three distinct profiles from steps 1/2 on training ONLY. Test
   all 3^6 neighbors around each: +/-0.05 for the first five multipliers and
   +/-0.10 for 72h, including zero offset. This is a bounded second stage,
   not an indefinite optimization loop. Canonical integer ratios remove duplicates.

All candidates are scored across eight 0/3/6/9/12/15/18/21-hour alignments on
2023-2024. Score is lower-quartile annualized log ending BTC, requiring at least
five completed round trips in every alignment. Tie-break by distance of normalized
weights to production, then canonical ID. No 2025/2026 results select weights.
Separately retain the best training-ranked 72h-only adjustment for simplicity.

## Evaluation after selection

Compare production, equal, joint winner and 72h-only winner for every year
2018-2026, 2020-21, 2023-25, 2025-26 and older windows. Show all eight alignments,
BTC and dollar drawdowns, fees, trade counts and exact ledgers. Stress 0.3% fee
per side, one extra 4h delay, both combined, and extra 24h delay. Evaluate twelve
one-coordinate +/-5% perturbations of each winner without reselection. Report
2025 trade differences and contribution of the best round trip.

Promotion evidence requires: >=6/8 recent-cycle wins against production, a recent
worst alignment no worse than production, 2020-21 above 1 BTC in all alignments,
and continued recent-cycle improvement in >=6/8 alignments at 0.3% fee. Failure
means no validated replacement; do not promote a different runner-up post hoc.
Passing is supporting retrospective evidence, not proof or automatic deployment.

All history has been researched previously; this is NOT untouched out-of-sample
validation. More tuning increases selection bias. Eight alignments overlap and
are not eight independent markets. No claimed probability of future profits.

## Reproducibility

Publish all candidate weights/training scores, shortlist annual/phase/stress
results, comparison figure and selected trade ledgers. Ignore bulky intermediate
outputs and caches. Match baseline to prior report, independently reconstruct
selected cash/BTC ledgers, test future-truncated signals, and reconcile shortlisted
base-phase trades with the production JavaScript calculator using supplied weights.
