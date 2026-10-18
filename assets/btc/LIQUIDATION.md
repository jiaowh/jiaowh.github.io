# Estimated liquidation map

Revised 18 October 2026. This tab is a relative volume-at-risk proxy, independent
of the BTC/MSTR strategy and Telegram alerts. It is not observed open interest,
position inventory, liquidation orders, or a probability of price reaching a level.

## Inputs and assumptions

- Closed BTCUSDT perpetual candles, Binance first; Bybit perpetual fallback.
- Binance quote turnover and taker-buy quote turnover supply the directional flow
  proxy. Aggressor buys/sells do **not** establish that new longs/shorts opened.
- Bybit's candle endpoint lacks the taker split: the fallback explicitly labels
  its 50/50 assumption. No spot-volume fallback is used as perpetual data.
- Each range retrieves seven additional calendar days to seed the book. Paging
  is capped at 1,000 rows per request, with chronological, contiguous, fresh,
  completed-candle validation. An unavailable feed clears the chart; retry is allowed.
- Assumed leverage tiers 10/25/50/100 have fixed weights .4/.3/.2/.1. These are
  illustrative assumptions, not inferred leverage distributions. Unchecking a
  tier removes it without reallocating its weight to the other tiers.
- Project close prices to `close * (1 ± 1/leverage)`, with ±0.15% price bands.
  This is an approximation, excluding maintenance margin, cross margin and fees.
  Band mass is conserved; portions outside the viewport are excluded, not clamped.
- Surviving mass decays with a three-calendar-day half-life, independent of candle
  interval. Long estimates at/above the candle low and short estimates at/below its
  high clear before new close-based estimates enter, including gap-crossed levels.

## Display

200 price bins, seven seed days, and wider estimate bands replace the old empty
initial book and 420 single-bin levels. Near-price mode frames the visible price
path plus 4% on each side; all-tiers mode includes the selected leverage offsets.
Balanced contrast spans positive-cell percentiles 5–99, strong-only 50–99, with
bounded log compression of the normalized density. The scale uses the entire
selected view; colours can change when the range or filters change. Stored model
columns at fixed bounds do not use future candles.

Side percentages are shares of the surviving proxy mass **inside the current
viewport**. Strongest levels are bin centres, not executable orders. Neither these
percentages nor hover heat scores measure trade confidence. The old 5% volume
multiplier and implied liquidation dollar totals have been removed.

Public schemas: [Binance futures klines](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data),
[Bybit linear klines](https://bybit-exchange.github.io/docs/v5/market/kline).

Validation: `tests/btc-liquidation.test.cjs` checks model accounting, sweep/decay,
warmup, causality, feed integrity and fallback. `tests/btc-liquidation-ui.test.cjs`
checks controls, desktop/mobile, failure clearing and recovery; `LIQ_LIVE=1` also
supports a live Binance browser smoke check. No trading-rule parameters changed.
