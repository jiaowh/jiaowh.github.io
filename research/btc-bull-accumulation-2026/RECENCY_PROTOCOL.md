# Recent-cycle preference: declared before this run

The user proposes giving the 2023–2025 cycle more relevance as Bitcoin matures. Keep the original 216-rule grid and execution assumptions; do not add tuned thresholds in this comparison.

Compare the established 20%-breadth / 5%-BTC-gain candidate with two selection procedures:

- Recent-only: maximize the 25th percentile, across eight candle alignments, of annualized log BTC growth in 2023–2024.
- Recent-weighted: use the same score with illustrative weights 60% on 2023–2024, 30% on 2019–2021 and 10% on 2015–2017. Annualize because the training windows differ in length. These weights express a preference, not an estimated optimal forecast. Earlier-cycle losses do not automatically disqualify a rule.

Choose parameters without using 2025 returns, then evaluate each fixed selected rule on a fresh 1 BTC in 2025 across the eight alignments. Also report continuous 2023–2025 results, but those mix training and evaluation. All years were already inspected in earlier research, so 2025 is a chronological diagnostic, not a pristine holdout.

For context report the highest default-alignment 2023–2025 result from the existing grid, explicitly selected using the full evaluation period. Test selected models at 0.30% costs and with additional 4-hour and 24-hour execution delays. These are separate stresses. Retain all trials and scores.

Compare realized daily-close volatility and price drawdowns across the three cycles. These descriptive metrics can support a change in market behavior, but cannot identify the cause as maturity or establish a monotonic future trend. Do not change the calendar framework, original live Average signals or default candidate automatically.
