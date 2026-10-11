/* Uses the same 50-vote ensemble as the Average tab; daily gate and transitions
 * match research/btc-bull-accumulation-2026/refine.py. All times are bar CLOSES. */
window.BTC_SIGNALS = (() => {
  const el = id => document.getElementById(id);
  const stamp = t => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const usd = x => '$' + x.toLocaleString('en-US', {maximumFractionDigits: 0});
  const percent = x => (x * 100).toFixed(0) + '%';
  let bars = [], rows = [], busy = false, loaded = false, shown = false;

  function calculate(input) {
    const B = input.filter(b => b.time + 14400 <= Date.now() / 1000);
    const R = computeEnsemble(B, null);
    if (!R) throw new Error('Not enough history for the ensemble.');
    const D = ensGroup(B, 86400), ma = smaN(D.bars.map(b => b.close), 200);
    const daily = []; let gate = false, up = 0, down = 0, dailyTime = null;
    for (let j = 0; j < D.bars.length; j++) {
      const end = D.ends[j];
      // Preserve the research dataset's historical aggregation. The refresh
      // path below rejects missing NEW bars rather than silently bridging gaps.
      up = D.bars[j].close > ma[j] * 1.02 ? up + 1 : 0;
      down = D.bars[j].close < ma[j] * .98 ? down + 1 : 0;
      if (down >= 2) gate = false;
      else if (up >= 2) gate = true;
      dailyTime = B[end].time + 14400;
      daily.push({ma: ma[j], gate, dailyClose: D.bars[j].close, dailyTime, up, down});
    }
    let j = -1, streak = 0, priorConfirmed = false, activation = null;
    return B.map((b, i) => {
      while (j + 1 < D.ends.length && D.ends[j + 1] <= i) j++;
      const d = j < 0 ? {ma: NaN, gate: false} : daily[j];
      streak = R.E[i] < .5 ? streak + 1 : 0;
      const confirmed = streak >= 3, event = confirmed && !priorConfirmed;
      priorConfirmed = confirmed;
      const previousGate = i > 0 && (j >= 0 && (D.ends[j] === i ? daily[j - 1]?.gate : d.gate));
      if (d.gate && !previousGate) activation = b.time + 14400;
      return {...d, time: b.time, closeTime: b.time + 14400, close: b.close,
        breadth: R.E[i], streak, confirmed, event, eligible: event && d.gate, activation};
    });
  }

  function describe(r) {
    if (r.eligible) return 'New eligible sell signal. If the tactical account holds BTC, sell at the next 4h open.';
    if (r.confirmed) return r.gate ? 'Weakness is already confirmed, but this is not a new transition. No new sell signal.' : 'Weakness is confirmed, but the SMA200 filter is bearish. No tactical sell signal.';
    if (!r.gate) return 'SMA200 filter is bearish. This bull-market overlay does not trigger a new sale.';
    if (r.streak) return `Waiting for confirmation: ${r.streak} of 3 consecutive closes below 50%.`;
    return 'No new sell signal. SMA200 filter is bullish, but breadth is not below 50%.';
  }

  function render() {
    if (!rows.length) return;
    const r = rows.at(-1), votes = Math.round(r.breadth * 50);
    el('signalCards').innerHTML = `
      <div class="signal-card"><small>DAILY SMA200 FILTER · LATEST</small><strong style="color:var(--${r.gate ? 'up' : 'down'})">${r.gate ? 'Bullish' : 'Bearish'}</strong><p>SMA200 ${usd(r.ma)}<br>Latest daily close ${usd(r.dailyClose)}<br>Upper / lower thresholds ${usd(r.ma * 1.02)} / ${usd(r.ma * .98)}</p></div>
      <div class="signal-card"><small>4H BREADTH · LATEST</small><strong>${percent(r.breadth)} <span style="font-size:14px;color:var(--muted)">${votes}/50 votes</span></strong><p>Last three closes: ${rows.slice(-3).map(v => percent(v.breadth)).join(' → ')}<br>50% exactly is not below the threshold.</p></div>
      <div class="signal-card"><small>WEAKNESS CONFIRMATION · LATEST</small><strong>${Math.min(3, r.streak)} / 3 closes</strong><p>${r.streak > 3 ? `Weakness has continued for ${r.streak} bars.` : 'Consecutive closed 4h bars below 50%.'}<br>${r.eligible ? 'New transition with bullish filter.' : 'No new eligible sale on this bar.'}</p></div>`;
    el('signalDecision').textContent = `${describe(r)} Latest 4h close: ${stamp(r.closeTime)}. Daily reading: ${stamp(r.dailyTime)}.`;
    const range = el('signalRange').value, year = Number(range);
    const visible = rows.filter(r => range === '90' ? r.closeTime > rows.at(-1).closeTime - 90 * 86400 : new Date(r.time * 1000).getUTCFullYear() === year);
    const bullish = visible.filter(r => r.gate), weak = bullish.filter(r => r.breadth < .5), confirmed = bullish.filter(r => r.confirmed), signals = visible.filter(r => r.eligible);
    el('signalCounts').textContent = `Selected window: ${bullish.length.toLocaleString()} bullish-filter bars · ${weak.length.toLocaleString()} also below 50% · ${confirmed.length.toLocaleString()} also in confirmed weakness · ${signals.length} new eligible sell signals. Counts use completed 4h bars; cards above always show the latest data.`;
    draw(visible);
  }

  function draw(data) {
    if (!data.length) { el('signalChart').textContent = 'No completed bars in this period.'; return; }
    const W = Math.max(300, el('signalChart').clientWidth), H = W < 600 ? 400 : 440;
    const left = 12, right = W - 66, top = 30, bottom = H * .60, btop = H * .72, bbottom = H - 32;
    const t0 = data[0].closeTime, t1 = data.at(-1).closeTime;
    const prices = data.flatMap(r => [r.close, r.ma * .98, r.ma * 1.02]).filter(Number.isFinite);
    const lo = Math.min(...prices) * .97, hi = Math.max(...prices) * 1.03;
    const x = t => left + (t - t0) / Math.max(14400, t1 - t0) * (right - left);
    const y = p => bottom - (p - lo) / (hi - lo) * (bottom - top);
    const ey = e => bbottom - e * (bbottom - btop);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="BTC price, daily SMA200 and its thresholds, with breadth below. Green shading shows the bullish filter.">`;
    let start = null;
    data.forEach((r, i) => {
      if (r.gate && start === null) start = x(r.closeTime);
      if (start !== null && (!r.gate || i === data.length - 1)) {
        svg += `<rect x="${start}" y="${top}" width="${Math.max(1, x(r.closeTime) - start)}" height="${bbottom - top}" fill="#3fb950" opacity=".07"/>`; start = null;
      }
    });
    for (let k = 0; k < 4; k++) {
      const p = lo + (hi - lo) * k / 3;
      svg += `<path d="M${left} ${y(p)}H${right}" stroke="#26313b"/><text x="${right + 6}" y="${y(p) + 4}">${(p / 1000).toFixed(1)}k</text>`;
    }
    for (const e of [0, .5, 1]) svg += `<path d="M${left} ${ey(e)}H${right}" stroke="${e === .5 ? '#ffb000' : '#26313b'}" stroke-dasharray="${e === .5 ? '5 4' : '0'}"/><text x="${right + 6}" y="${ey(e) + 4}">${percent(e)}</text>`;
    const line = (value, Y, color, dash = '', step = false) => {
      let d = '', prev = null;
      for (const r of data) {
        const v = value(r); if (!Number.isFinite(v)) { prev = null; continue; }
        const xx = x(r.closeTime).toFixed(2), yy = Y(v).toFixed(2);
        d += prev === null ? `M${xx} ${yy}` : step ? `H${xx}V${yy}` : `L${xx} ${yy}`; prev = v;
      }
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="${dash}"/>`;
    };
    svg += line(r => r.ma * 1.02, y, '#72808d', '4 4', true) + line(r => r.ma * .98, y, '#72808d', '4 4', true);
    svg += line(r => r.ma, y, '#ffb000', '', true) + line(r => r.close, y, '#e6edf3');
    svg += line(r => r.breadth, ey, '#38bdf8', '', true);
    for (const r of data.filter(r => r.eligible)) {
      const xx = x(r.closeTime), yy = y(r.close) - 10;
      svg += `<path class="signal-marker" d="M${xx - 5} ${yy - 7}h10l-5 8z" fill="#f85149"><title>${stamp(r.closeTime)} — new eligible sell signal</title></path>`;
    }
    const labels = W < 600 ? 3 : 5;
    for (let i = 0; i < labels; i++) {
      const t = t0 + (t1 - t0) * i / (labels - 1);
      svg += `<text x="${x(t)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === labels - 1 ? 'end' : 'middle'}">${new Date(t * 1000).toISOString().slice(5, 10)}</text>`;
    }
    svg += `<text x="${left}" y="17">BTC / USDT · daily SMA200</text><text x="${left}" y="${btop - 15}">Breadth · 50 bullish/flat members</text><path id="signalCursor" stroke="#94a3b8" stroke-dasharray="3 3"/><rect id="signalHit" x="${left}" y="${top}" width="${right - left}" height="${bbottom - top}" fill="transparent"/></svg>`;
    el('signalChart').innerHTML = svg;
    const inspect = event => {
      const box = el('signalChart').querySelector('svg').getBoundingClientRect();
      const xx = Math.max(left, Math.min(right, (event.clientX - box.left) * W / box.width));
      const target = t0 + (xx - left) / (right - left) * (t1 - t0);
      let low = 0, high = data.length - 1;
      while (low < high) { const mid = (low + high) >> 1; if (data[mid].closeTime < target) low = mid + 1; else high = mid; }
      const i = low > 0 && target - data[low - 1].closeTime < data[low].closeTime - target ? low - 1 : low, r = data[i];
      el('signalCursor').setAttribute('d', `M${x(r.closeTime)} ${top}V${bbottom}`);
      el('signalRead').textContent = `${stamp(r.closeTime)} · BTC ${usd(r.close)} · SMA200 ${usd(r.ma)} · ${r.gate ? 'bullish' : 'bearish'} filter · breadth ${percent(r.breadth)} · ${Math.min(r.streak, 3)}/3 weak closes. ${describe(r)}`;
    };
    el('signalHit').onpointermove = inspect;
    el('signalHit').onclick = inspect;
    el('signalRead').textContent = 'Hover or tap the chart to inspect a closed 4h bar. Chart timestamps are UTC close times; year selection uses each bar’s opening year.';
  }

  function updateYears() {
    const old = el('signalRange').value;
    const year = new Date(rows.at(-1).time * 1000).getUTCFullYear();
    el('signalRange').innerHTML = '<option value="90">Last 90 days</option>' + Array.from({length: year - 2017}, (_, i) => year - i).map(y => `<option value="${y}">${y}${y === year ? ' · through latest close' : ''}</option>`).join('');
    el('signalRange').value = old || '90';
  }

  async function load() {
    const response = await fetch('assets/btc/signal-snapshot.json');
    if (!response.ok) throw new Error('Saved signal history could not be loaded.');
    const seed = await response.json();
    bars = seed.bars.map(([time, open, high, low, close]) => ({time, open, high, low, close}));
    rows = calculate(bars); loaded = true; updateYears(); render();
    el('signalSource').textContent = `Saved snapshot through ${stamp(rows.at(-1).closeTime)}. Checking for newer completed candles…`;
  }

  async function refresh() {
    if (busy) return; busy = true; el('signalRefresh').disabled = true;
    try {
      if (!loaded) await load();
      el('signalSource').textContent = `Checking Binance… displayed data through ${stamp(rows.at(-1).closeTime)}.`;
      const merged = new Map(bars.map(b => [b.time, b]));
      let start = bars.at(-1).time * 1000;
      const cutoff = Date.now();
      // Only commit a complete refresh. Never combine exchanges or skip a gap.
      for (let page = 0; ; page++) {
        if (page >= 100) throw new Error('Catch-up limit reached; saved snapshot retained.');
        const url = `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=4h&startTime=${start}&endTime=${cutoff}&limit=1000`;
        const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error(`Binance returned ${response.status}.`);
        const result = await response.json();
        if (!Array.isArray(result)) throw new Error('Unexpected candle response.');
        for (const k of result) {
          const b = {time: +k[0] / 1000, open: +k[1], high: +k[2], low: +k[3], close: +k[4]};
          if (b.time * 1000 + 14400000 > cutoff) continue;
          if (![b.time, b.open, b.high, b.low, b.close].every(Number.isFinite) || b.close <= 0) throw new Error('Invalid candle.');
          const old = merged.get(b.time);
          if (old && ['open', 'high', 'low', 'close'].some(k => Math.abs(old[k] - b[k]) > .02)) throw new Error('Candle source differs from the saved history.');
          merged.set(b.time, b);
        }
        if (result.length < 1000) break;
        const next = +result.at(-1)[0] + 14400000;
        if (next <= start) throw new Error('Candle feed did not advance.');
        start = next;
      }
      const next = [...merged.values()].sort((a, b) => a.time - b.time);
      for (let i = bars.length; i < next.length; i++) if (next[i].time !== next[i - 1].time + 14400) throw new Error('Missing new 4h candle; last complete history retained.');
      rows = calculate(next); bars = next; updateYears(); render();
      const stale = cutoff / 1000 - rows.at(-1).closeTime >= 14400;
      el('signalSource').textContent = `${stale ? 'Feed is behind' : 'Binance checked'} · closed candles through ${stamp(rows.at(-1).closeTime)} · checked ${stamp(cutoff / 1000)}. Refreshes every five minutes while this tab is open. Earlier history uses the research dataset.`;
    } catch (error) {
      el('signalSource').textContent = `${loaded ? `Refresh unavailable. Showing saved/last verified data through ${stamp(rows.at(-1).closeTime)}.` : 'Signal history unavailable.'} ${error.message}`;
    } finally { busy = false; el('signalRefresh').disabled = false; }
  }
  function onShow() { shown = true; if (!loaded) refresh(); else render(); }
  el('signalRefresh').onclick = refresh;
  el('signalRange').onchange = render;
  new ResizeObserver(() => { if (shown && !el('panel_signals').hidden) render(); }).observe(el('signalChart'));
  setInterval(() => { if (shown && !el('panel_signals').hidden) refresh(); }, 300000);
  // Standalone entry link; does not change the page's default tab.
  if (new URLSearchParams(location.search).get('tab') === 'signals') setTimeout(() => showTab('signals'), 0);
  return {onShow, refresh, calculate};
})();
