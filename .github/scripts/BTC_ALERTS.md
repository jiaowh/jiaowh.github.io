# BTC Telegram alerts

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

The original 50-vote breadth remains on the website. This bot deliberately uses the faster researched model; its breadth can differ from the page.

## State and migration

Use existing `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` secrets. `AVG_MODE` is no longer used. A new `btc-fast-v1-` cache namespace isolates old Average state. State includes the latest processed close, modeled BTC/cash position, actual model sale price/time, pending next-open action, unsent messages, and verified Binance candle history. Both Binance endpoints serve the same symbol; no cross-exchange substitution.

On first deployment, replay the model from January 2023 to initialize its current position without sending historical trades or a startup message. Subsequent closes generate notifications. If initialized just after the daily close, send that daily breadth. This model state is not the user's verified holdings.

The outbox is saved before sending, and each successful message is checkpointed. Failed deliveries retry on the next run. There is no Telegram idempotency key: if Telegram accepts a request but the response is lost, a retry can duplicate it. GitHub cache eviction resets the bot to silent bootstrap and can lose undelivered messages; the cache is not a permanent ledger. Cache keys include run attempt to avoid overwriting immutable entries on reruns. Failed API checks never advance the model with stale or gapped new candles.

## Verification

`node tests/btc-alert.test.mjs` compares all 117 default annual fills in 2018–2026 with the Python fast-model research ledger and reconciles ending BTC. It also checks causal prefixes, forming-candle exclusion, next-open fills, all three buybacks, midnight-only breadth, repeated runs, chunked catch-up, delivery failure, migration and feed guards.

`DRY_RUN=1 node .github/scripts/avg_alert.mjs` checks fresh public data without Telegram delivery or persistent writes. `CANDLES_FILE` and `STATE_FILE` support isolated local checks. Never put bot secrets or state in Git.

## Previous failure

The old script extracted `computeEnsemble` from `btc.html` without extracting its new `ensRiskContext` dependency, causing `ReferenceError: ensRiskContext is not defined`. The old catch handler sent a Telegram error but did not set a failing exit code. The replacement extracts only the indicator primitives it uses and has annual research parity coverage; errors exit nonzero.
