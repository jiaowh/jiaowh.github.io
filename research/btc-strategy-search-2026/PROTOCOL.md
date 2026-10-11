# Expanded BTC strategy search, 10 October 2026

Exploratory search requested by the user after the previous small sleeve failed older bull and bear requirements. All periods have already been discussed or researched; none is an untouched holdout.

Before running the expanded grid, the target screen is fixed as:

- Ending fee-net BTC >1 from a fresh 1 BTC in BOTH 2020–2021 and 2023–2025.
- Ending fee-net BTC >1 in BOTH 2022 and 2026 through October 9.
- Worst 4h-closing dollar drawdown in EACH bear window at most 75% of buy-and-hold's magnitude. This is an explicit material-improvement screen, not a promise of safety or zero loss.
- No leverage, shorting, new deposits or cash yield. All starting and ending cash conversions count. Signals use closed bars; trades occur at the next 4h open. Base cost 0.10% each side.

The fixed candidate grid in `search.py` spans price/SMA or EMA bands, fast/slow MA crosses, asymmetric Donchian entry/exit, rate-of-change momentum, ATR trailing direction, percentage trailing exits, RSI momentum, RSI strength sales/retracement buybacks with bear exits, ensemble thresholds, and explicit dip-buyback rules with a regime restriction. Every tested configuration is saved, including failures. The buyback signal hurdle is fixed assuming 0.10% fees; higher execution-cost tests do not retune that signal.

Additional validation after screening: eight candle/day offsets; 0.30% and 0.60% per-side cost; extra 4h and 24h execution delays; neighboring parameters; individual years; old 2014–2018 history; monthly rolling start dates; forward chronological annual parameter selection using only earlier observations. Temporal selection tests still reuse historically known data and are not live out-of-sample evidence.

The earlier Bitstamp history is a cached source spliced to Binance in August 2017, rescaled by the existing core library. Older results have a different venue/data provenance. Gaps are preserved; no fabricated prices. Latest data is the Binance extension already audited through October 9.

Published sources motivating the families, not supplying claimed performance for our implementation:

- [Corbet et al., technical trading rules](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3454216): moving-average and range-breakout families.
- [Hudson and Urquhart, technical trading and cryptocurrencies](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3387950): many rules, data-snooping controls, and absence of Bitcoin predictability in their out-of-sample test.
- [Monash, Trend-following Strategies for Crypto Investors](https://www.monash.edu/__data/assets/pdf_file/0011/3744821/Trend-following-Strategies-for-Crypto-Investors.pdf): multiple trend horizons, costs, volatility and drawdown measures.
- [Svogun and Rudys, adjustable-band moving averages](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4663472): banded moving-average comparisons.

No live strategy is switched based on the grid winner. A model passing selected historical windows is only a candidate; selecting those windows and parameters introduces selection bias.

## Second batch, declared after the first batch failed

The initial 335 configurations produced zero passes. The next batch explicitly tests the architecture missing from the first grid: new-crossing dip sales in a bull regime, with a separate full-position bear exit and a faster bear recovery rule. It combines six sale triggers (ensemble crossing below 20/30/40/50%, or daily RSI14 reversing below 70/80), four BTC buyback hurdles (3/5/10/15%), two bull regimes (buffered daily SMA100/200), seven bear exits (none, below SMA50/100/200 with 2% buffer, below falling SMA200, death cross plus below SMA50, 25% drawdown from 180-day closing high), and two bear re-entries (ensemble >60% or price >102% SMA20, also requiring the bear condition to clear). Total 672 additional configurations. A dip position converts to bear mode if the bear exit condition develops while waiting. Losing the bull regime alone does not force a sale; the separate bear rule does. All failures remain in `hybrid-results.json`.

The initial buyback family used a level exit, which can sell again immediately after a dip buyback while breadth remains weak. The second batch uses new crossings and is a distinct model, not a correction to previously reported results. Neither batch changes the already audited 20% sleeve.

## Third batch: fixed allocation to two independent models

The 672 hybrid tests also produced no complete passes. Some new-crossing bull dip models added substantial BTC in both bull periods but did not protect dollars during bears. A separate fixed-allocation experiment now tests whether a trend-defense sleeve can supply bear protection while the dip sleeve earns BTC during bull periods. This is an adaptive research step, not independent validation.

Use all 32 ensemble-trigger / hurdle / bull-regime variants without a forced bear exit from batch two, combined with five defense models (ensemble 60/40, ensemble 60/50, ensemble 50/40, SMA50 without buffer, SMA100 with 2% buffer). Fixed initial allocations to the dip model: 1/3, 1/2, or 2/3; the remainder goes to defense. The two accounts run independently without transfers or periodic rebalancing. Both can sell all their BTC. Costs are charged separately even for offsetting trades. Total 480 allocations. Drawdowns are recomputed from the combined 4h equity path, not averaged from component drawdown statistics.

## Fourth batch: on-chain valuation, not more price indicators

The nine passing blends did not pass all eight candle alignments; none passed the full screen on more than four. Add Coin Metrics MVRV (market capitalization divided by realized capitalization), with each daily observation delayed until two days after its date. This is a conservative publication lag, not proof against historical revisions. Public source definitions: [Coin Metrics](https://github.com/coinmetrics/docs-website/blob/master/asset-metrics/market/capmvrvcur.md), [Glassnode research](https://research.glassnode.com/mastering-the-mvrv-ratio/).

Grid: upper valuation 2/2.5/3/3.5, lower 1/1.5/2 with lower < upper; exit immediately above upper or after a close below SMA20/50 when valuation exceeded upper within 90 days; re-enter below lower, optionally allowing a recovery above SMA20 while valuation is below upper. Independent bear defense: none, price below falling SMA200, or valuation below its 200-day average plus price below SMA50; bear exits re-enter only once the bear condition clears and price exceeds SMA50. 198 rules. Also test MVRV crossing its 20/50/100/200-day average, with 0/5/10% bands and one/two daily confirmations: 24 rules. Total 222 additional configurations.

The research grid subclasses the cached aggregation code to prevent the high/low of an unfinished final day from entering the last completed day's range. Historical completed groups are unchanged. Prefix checks include intraday truncations. The page implementation is not modified by this research-only correction.

## Chronological selector, specified before evaluating its outputs

Using all 1,709 configurations plus holding, select each January from 2019–2026 using only the previous four complete calendar years. Maximize the minimum of the four annual fee-net BTC multiples; break ties with their geometric BTC growth and then fewer trades. Holding is eligible. This explicitly tests a mechanical way to prefer consistent BTC accumulation rather than choosing a different historical winner for each future year. At each January rotation, remaining cash is physically converted to BTC at that January open with a fee, then allocated to the new model; any initial sale required by that model also pays its fee. The final remaining cash is converted at the end-of-test close. No future-year returns enter selection, but the candidate grid itself was developed on previously examined history, so this remains retrospective validation, not an untouched holdout.
