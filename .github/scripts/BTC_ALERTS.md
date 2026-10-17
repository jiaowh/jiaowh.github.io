# BTC and MSTR Telegram alerts

Adopted October 14, 2026: BTC retains fast recovery; MSTR uses BTC fast + Vortex with the joint SMA200 bear exit. The first tab's asset selector and both notification runners import shared strategy modules. The MSTR breadth is calculated from BTC candles, not MSTR candles.

The existing `avg-alert.yml` workflow now runs `fast_s13_im100_e50`:

- iMACD lengths 14/21/34, signal SMA 13; timeframes 4/8/12/24/48/72h.
- 36 iMACD votes plus the original 14 daily SMA/momentum/Donchian votes.
- Daily SMA200 regime: two closes above +2% turn bullish, two below −2% turn bearish.
- Sell on a fresh transition into three 4h closes below 50% breadth, only when the regime is bullish.
- Buy after a close reaches the nominal 10% BTC-gain threshold, breadth exceeds 50%, or seven days since the sale.
- Full BTC/cash model; decisions use completed candles and model fills use the following 4h open. No brokerage orders are placed.

Telegram contains only these formats:

```
BTC breadth 60% · 2026-10-12 00:00 UTC
```

```
BTC BUY · $77,383.47
2026-09-18 04:00 UTC
```

Daily breadth is the completed 00:00 UTC candle (08:00 Singapore). The schedule checks at seven minutes after each 4h close. GitHub scheduling is best effort and can be substantially late; the timestamp and price identify the model's bar, not a real execution or the delivery time. Missed runs replay all intervening bars and queue each trade, rather than comparing only the final position. Errors remain in Actions logs and fail the run; no weekly, startup, funding or Telegram error messages.

The first website tab and this bot import the same `assets/btc/fast-strategy.mjs` model. Keep the first tab aligned whenever a newer strategy is adopted. The Indicators tab exposes the same current strategy votes. Average was retired from the page; its model is preserved in `research/btc-bull-accumulation-2026/legacy-average.js`. The other timeframe tabs retain their own methods until separately validated.

## State and migration

Use existing `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` secrets. `AVG_MODE` is no longer used. A new `btc-fast-v1-` cache namespace isolates old Average state. State includes the latest processed close, modeled BTC/cash position, actual model sale price/time, pending next-open action, unsent messages, and verified Binance candle history. Both Binance endpoints serve the same symbol; no cross-exchange substitution.

On first deployment, replay the model from January 2023 to initialize its current position without sending historical trades or a startup message. Subsequent closes generate notifications. If initialized just after the daily close, send that daily breadth. This model state is not the user's verified holdings.

The outbox is saved before sending, and each successful message is checkpointed. Failed deliveries retry on the next run. There is no Telegram idempotency key: if Telegram accepts a request but the response is lost, a retry can duplicate it. GitHub cache eviction resets the bot to silent bootstrap and can lose undelivered messages; the cache is not a permanent ledger. Cache keys include run attempt to avoid overwriting immutable entries on reruns. Failed API checks never advance the model with stale or gapped new candles.

## Verification

`node tests/btc-alert.test.mjs` compares all 117 default annual fills in 2018–2026 with the Python fast-model research ledger and reconciles ending BTC. It also checks causal prefixes, forming-candle exclusion, next-open fills, all three buybacks, midnight-only breadth, repeated runs, chunked catch-up, delivery failure, migration and feed guards.

`DRY_RUN=1 node .github/scripts/avg_alert.mjs` checks fresh public data without Telegram delivery or persistent writes. `CANDLES_FILE` and `STATE_FILE` support isolated local checks. Never put bot secrets or state in Git.

## MSTR method and delivery

- `assets/btc/mstr-strategy.mjs` uses 36 fast iMACD weights + 36 Vortex weights + 14 daily votes. Vortex uses BTC 4/8/12/24/48/72h and lengths 21/34/55; each of its 18 conditions has weight two. This is the research `legacy_add_vortex_x50_b50__joint200` rule.
- Keep the same fresh three-close 50% sell trigger, >50% recovery, BTC buyback target and seven-day timeout. The underlying BTC model continues while MSTR is in cash.
- Hold MSTR only when that model holds and either BTC or MSTR has a bullish daily SMA200 regime. Both bearish forces cash. MSTR's own regime uses 200 completed trading sessions and the same two-close ±2% buffer.
- Trade only at the next observed **daily stock opening**, using BTC signals and completed stock candles known strictly before that opening. This matches the principal daily-open research and is intentionally different from the hourly diagnostic. An intraday signal waits for the next trading session.
- Telegram sends `MSTR BUY · $price` or `MSTR SELL · $price`, followed only by the model fill's UTC timestamp. The price is a historical opening-price model fill, not an executable quote at delivery time. No orders are placed.
- Send `MSTR breadth NN% · timestamp` at 00:00 UTC alongside BTC breadth, because both breadths use BTC candles. There are no separate market-close, startup, weekly or error messages.
- Scheduled opening checks at 13:37 and 14:37 UTC cover US daylight/standard time. The extra 21:07 check captures winter stock closes; the BTC four-hour schedule remains. GitHub scheduling can be late.
- The separate `.alert-state/mstr.json` state bootstraps silently from January 2023. Subsequent missed runs replay every daily opening, preserve all trade messages and checkpoint the outbox. The BTC cache namespace is retained so existing BTC delivery state is not reset.
- Daily Yahoo OHLC are split adjusted and seeded with the same source as research. Incomplete stock candles may update, but completed historical price revisions and newly detected splits fail closed for manual review. No cross-provider fallback is used. Session closes handle US daylight saving time and the half-days in the audited sample.
- The workflow publishes verified `assets/btc/mstr-snapshot.json` updates for browser access and explicitly requests the repository's legacy GitHub Pages build. No candle changes means no data commit. The chart labels the stock and BTC timestamps so saved data are not presented as current.
- `DRY_RUN=1 node .github/scripts/mstr_alert.mjs` reads public feeds without sending or writing. `MSTR_STATE_FILE` and `MSTR_CANDLES_FILE` support isolated checks. `tests/mstr-strategy.test.mjs` reconciles 185 fills and ending units across eight overlapping annual/continuous research windows, and checks causal prefixes, partial sessions, bootstrap, retries, half-days and revisions.

The new MSTR rule is a historical research selection, not a promise of future outperformance. Daily-opening execution, split adjustment and the lack of cash interest/taxes match the published comparison. BTC's correction-only rule does not provide a separate bear liquidation signal.

## Previous failure

The old script extracted `computeEnsemble` from `btc.html` without extracting its new `ensRiskContext` dependency, causing `ReferenceError: ensRiskContext is not defined`. The old catch handler sent a Telegram error but did not set a failing exit code. The replacement extracts only the indicator primitives it uses and has annual research parity coverage; errors exit nonzero.
