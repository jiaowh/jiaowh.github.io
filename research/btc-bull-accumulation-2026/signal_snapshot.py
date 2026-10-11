"""Build the signal tab's warm-start candles and an independent parity fixture.

Usage: python signal_snapshot.py [path-to-current-position.json]
Without an argument, uses the frozen research data. The optional file supplies
the same complete 4h history extended with verified public Binance candles.
"""
from bull import *
from refine import prepare

if __name__ == '__main__':
    G = Grid(0, a1h=data())
    bars = [[int(t), float(o), float(h), float(l), float(c)]
            for t, o, h, l, c in zip(G.real, G.o, G.h, G.l, G.c)]
    if len(sys.argv) > 1:
        fresh = json.loads(Path(sys.argv[1]).read_text())
        bars = [[b[k] for k in ['time', 'open', 'high', 'low', 'close']] for b in fresh['bars']]
    out = {'asOf': int(bars[-1][0] + 14400),
           'source': 'Research history: rescaled Bitstamp before 2017; Binance BTCUSDT thereafter',
           'bars': bars}
    (ROOT/'assets/btc/signal-snapshot.json').write_text(json.dumps(out, separators=(',', ':')))
    # Independent historical arrays for verifying the browser implementation.
    E, gate, events = prepare(G)
    _, _, c, ends, _ = G.daily()
    ma = G.spread(sma(c, 200), ends)
    rows = [[int(G.real[i]), float(E[i]), float(ma[i]), bool(gate[i]), bool(events[(.5, 3)][i] and gate[i])]
            for i in range(G.n) if G.real[i] >= ts('2018-01-01')]
    (O/'signal-parity.json').write_text(json.dumps(rows, separators=(',', ':')))
    print('Signal snapshot:', len(bars), 'bars; parity:', len(rows), 'bars')
