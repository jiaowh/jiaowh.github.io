/* Shared fast iMACD + recovery strategy, identical to Telegram. */
import {calculate as fastCalculate, advance, newState} from './fast-strategy.mjs';
import {calculateBTC, replay as mstrReplay, stockRegimes, before} from './mstr-strategy.mjs';
window.BTC_SIGNALS = (() => {
  const el = id => document.getElementById(id);
  const stamp = t => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const usd = x => '$' + x.toLocaleString('en-US', {maximumFractionDigits: 0});
  const percent = x => (x * 100).toFixed(0) + '%';
  let bars = [], rows = [], liveOpen = null, busy = false, loaded = false, shown = false;
  let stock = [], vortexRows = [], stockChecked = 0, stockError = '';
  const asset = () => el('signalAsset').value;

  function calculate(input) {
    return fastCalculate(input, {impulseMACD, smaN, ensGroup, ensSpread},undefined,{details:true});
  }

  function replay(input, calculated, start = Date.UTC(2023, 0, 1) / 1000) {
    return advance(newState(start), calculated, input, {notify: false});
  }

  function render() {
    if (!rows.length) return;
    renderIndicators();
    const isStock=asset()==='MSTR', total=isStock?86:50;
    let view=rows,r=rows.at(-1),trades;
    const range = el('signalRange').value, year = Number(range);
    const start = year >= 2018 && year < 2023 ? Date.UTC(year, 0, 1) / 1000 : Date.UTC(2023, 0, 1) / 1000;
    const raw=liveOpen?[...bars,liveOpen]:bars;
    if(isStock){
      if(!stock.length){el('signalCards').textContent='MSTR history unavailable.';el('signalChart').textContent='Try refresh.';return;}
      const now=Date.now()/1000, result=mstrReplay(raw,vortexRows,stock,{start,now}),regimes=stockRegimes(stock,now);
      view=result.sessions.map(s=>{
        const complete=s.closeTime<=now,at=complete?s.closeTime:s.time,b=before(vortexRows,at+1),m=before(regimes,at+1);
        return {...s,closeTime:at,close:complete?s.close:s.open,ma:m?.ma??s.ma,gate:!!(b?.gate||m?.gate),breadth:b?.breadth??s.breadth};
      });
      r={...view.at(-1),...vortexRows.at(-1),ma:regimes.at(-1)?.ma,gate:!!(vortexRows.at(-1)?.gate||regimes.at(-1)?.gate)};
      trades=result.trades;
      el('signalStockSource').textContent=`${stockError?'Update unavailable · ':''}MSTR ${result.holding?'hold':'cash'} · stock close ${stamp(regimes.at(-1).closeTime)} · BTC close ${stamp(vortexRows.at(-1).closeTime)}`;
      el('signalStockSource').title=`Daily opening model. Snapshot checked ${stamp(stockChecked)}. ${stockError}`;
    }else trades=replay(raw,rows,start);
    el('signalStockSource').hidden=!isStock;
    el('signalPriceLabel').textContent=asset();
    el('signalBTCResults').hidden=isStock;el('signalMSTRResults').hidden=!isStock;
    const votes = Math.round(r.breadth * total);
    el('signalCards').innerHTML = `
      <div class="signal-card" title="${isStock?'Bullish if either BTC or MSTR is bullish. Both bearish forces cash. ':''}Two daily closes above SMA200 +2% turn bullish; two below −2% turn bearish."><small>${isStock?'JOINT ':''}SMA200 REGIME</small><strong style="color:var(--${r.gate ? 'up' : 'down'})">${r.gate ? 'Bullish' : 'Bearish'}</strong><span>${asset()} SMA200 ${usd(r.ma)}</span></div>
      <div class="signal-card" title="${isStock?'BTC-based: 36 fast iMACD + 36 Vortex weights + 14 daily votes.':'Fast iMACD 14/21/34, signal 13 + recovery.'} Same method as Telegram; not a crash probability."><small>${isStock?'BTC FAST + VORTEX':'FAST iMACD + RECOVERY'}</small><strong>${percent(r.breadth)}</strong><span>${votes} / ${total} bullish ${isStock?'vote weights':'votes'}</span></div>`;
    const visible = view.filter(r => range === '90' ? r.closeTime > view.at(-1).closeTime - 90 * 86400 : new Date(r.time * 1000).getUTCFullYear() === year);
    draw(visible, trades);
  }

  const dot = value => `<i class="indicator-dot ${value===null?'is-unknown':value?'is-up':'is-down'}" aria-hidden="true"></i>`;
  const status = value => value===null?'Unavailable':value?'Bullish':'Bearish';
  function syncIndicatorSource() {
    el('indicatorSource').textContent=el('signalSource').textContent;
    el('indicatorSource').title=el('signalSource').title;
  }
  function renderIndicators() {
    const isStock=asset()==='MSTR',r=(isStock?vortexRows:rows).at(-1);
    if(!r?.members)return;
    const total=r.members.reduce((s,m)=>s+m.weight,0),known=r.members.every(m=>m.bullish!==null);
    const votes=r.members.reduce((s,m)=>s+(m.bullish?m.weight:0),0);
    const m=isStock?stockRegimes(stock,Date.now()/1000).at(-1):null;
    const btcGate=Number.isFinite(r.ma)?r.gate:null,mstrGate=Number.isFinite(m?.ma)?m.gate:null;
    const gate=isStock?(mstrGate===null?null:btcGate||mstrGate):btcGate;
    el('indicatorSummary').innerHTML=`
      <div class="signal-card"><small>${isStock?'BTC FAST + VORTEX':'FAST iMACD + RECOVERY'}</small><strong>${known?percent(r.breadth):'—'}</strong><span>${known?votes:'—'} / ${total} bullish ${isStock?'vote weights · Vortex ×2':'votes'}</span></div>
      <div class="signal-card"><small>${isStock?'JOINT ':''}SMA200 REGIME</small><strong class="indicator-regime">${dot(gate)}${status(gate)}</strong><span>${isStock?'Bullish when either asset is bullish':'Two daily closes beyond the ±2% band'}</span></div>`;
    const rule=(label,value,detail)=>`<div class="indicator-rule">${dot(value)}<span>${label}</span><b>${detail??status(value)}</b></div>`;
    el('indicatorRules').innerHTML=rule('BTC SMA200',btcGate,Number.isFinite(r.ma)?usd(r.ma):'Unavailable')+
      (isStock?rule('MSTR SMA200',mstrGate,Number.isFinite(m?.ma)?usd(m.ma):'Unavailable'):'')+
      rule('Breadth above 50%',known?r.breadth>.5+1e-12:null,known?(r.breadth>.5+1e-12?'Yes':'No'):'Unavailable')+
      rule('Closes below 50%',known?!r.confirmed:null,known?`${r.streak} / 3`:'Unavailable');
    el('indicatorRules').title='SMA200 uses the confirmed daily regime. Three weak BTC closes confirm weakness; a sale also needs the bullish BTC gate and a fresh signal. Breadth above 50% can trigger an early buyback.';
    el('indicatorStockSource').hidden=!isStock;
    el('indicatorStockSource').textContent=m?`${stockError?'Update unavailable · ':''}MSTR close ${stamp(m.closeTime)}`:'MSTR history unavailable';
    const groups=['4h','8h','12h','24h','48h','72h','Daily averages','Daily momentum','Daily breakouts'];
    el('indicatorGroups').innerHTML=groups.map(group=>{
      const members=r.members.filter(v=>v.group===group),sum=members.reduce((s,m)=>s+m.weight,0),yes=members.reduce((s,m)=>s+(m.bullish?m.weight:0),0);
      return `<section class="indicator-group"><h3>${group}<span>${members.every(m=>m.bullish!==null)?yes:'—'} / ${sum}</span></h3><ul>${members.map(m=>`<li class="indicator-item" data-bullish="${m.bullish}" data-weight="${m.weight}" data-group="${group}" title="${status(m.bullish)}${m.weight>1?' · two breadth votes':''}">${dot(m.bullish)}<span>${m.label}</span>${m.weight>1?'<small>×2</small>':''}<span class="sr-only">${status(m.bullish)}</span></li>`).join('')}</ul></section>`;
    }).join('');
    syncIndicatorSource();
  }

  function draw(data, trades) {
    if (!data.length) { el('signalChart').textContent = 'No completed bars in this period.'; return; }
    const W = Math.max(300, el('signalChart').clientWidth), H = W < 600 ? 400 : 440;
    const left = 12, right = W - 66, top = 30, bottom = H * .60, btop = H * .72, bbottom = H - 32;
    const t0 = asset()==='MSTR'?data[0].time:data[0].closeTime, t1 = data.at(-1).closeTime;
    const prices = data.flatMap(r => [r.close, r.ma * .98, r.ma * 1.02]).filter(Number.isFinite);
    const lo = Math.min(...prices) * .97, hi = Math.max(...prices) * 1.03;
    const x = t => left + (t - t0) / Math.max(14400, t1 - t0) * (right - left);
    const y = p => bottom - (p - lo) / (hi - lo) * (bottom - top);
    const ey = e => bbottom - e * (bbottom - btop);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${asset()} price, daily SMA200 and its thresholds, with BTC-based breadth below. Green shading shows the bullish filter.">`;
    let start = null;
    data.forEach((r, i) => {
      if (r.gate && start === null) start = x(r.closeTime);
      if (start !== null && (!r.gate || i === data.length - 1)) {
        svg += `<rect x="${start}" y="${top}" width="${Math.max(1, x(r.closeTime) - start)}" height="${bbottom - top}" fill="#3fb950" opacity=".07"/>`; start = null;
      }
    });
    for (let k = 0; k < 4; k++) {
      const p = lo + (hi - lo) * k / 3;
      svg += `<path d="M${left} ${y(p)}H${right}" stroke="#26313b"/><text x="${right + 6}" y="${y(p) + 4}">${asset()==='MSTR'?p.toFixed(0):(p / 1000).toFixed(1)+'k'}</text>`;
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
    const visibleTrades = trades.filter(t => t.time >= t0 && t.time <= t1);
    for (const trade of visibleTrades) {
      const xx = x(trade.time), buy = trade.side === 'buy', yy = y(trade.price) + (buy ? 12 : -12);
      const shape = buy ? `M${xx - 5} ${yy + 7}h10l-5 -8z` : `M${xx - 5} ${yy - 7}h10l-5 8z`;
      svg += `<path class="signal-marker" data-side="${trade.side}" data-time="${trade.time}" d="${shape}" fill="${buy ? '#3fb950' : '#f85149'}"><title>${trade.side.toUpperCase()} ${usd(trade.price)} · ${stamp(trade.time)} · ${trade.reason}</title></path>`;
    }
    const labels = W < 600 ? 3 : 5;
    for (let i = 0; i < labels; i++) {
      const t = t0 + (t1 - t0) * i / (labels - 1);
      svg += `<text x="${x(t)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === labels - 1 ? 'end' : 'middle'}">${new Date(t * 1000).toISOString().slice(5, 10)}</text>`;
    }
    svg += `<text x="${left}" y="17">${asset()==='MSTR'?'MSTR / USD':'BTC / USDT'} · daily SMA200</text><text x="${left}" y="${btop - 15}">${asset()==='MSTR'?'BTC fast + Vortex · 86 weights':'Fast iMACD breadth · 50 votes'}</text><path id="signalCursor" stroke="#94a3b8" stroke-dasharray="3 3"/><rect id="signalHit" x="${left}" y="${top}" width="${right - left}" height="${bbottom - top}" fill="transparent"/></svg>`;
    el('signalChart').innerHTML = svg;
    const inspect = event => {
      const box = el('signalChart').querySelector('svg').getBoundingClientRect();
      const xx = Math.max(left, Math.min(right, (event.clientX - box.left) * W / box.width));
      const target = t0 + (xx - left) / (right - left) * (t1 - t0);
      let low = 0, high = data.length - 1;
      while (low < high) { const mid = (low + high) >> 1; if (data[mid].closeTime < target) low = mid + 1; else high = mid; }
      const i = low > 0 && target - data[low - 1].closeTime < data[low].closeTime - target ? low - 1 : low, r = data[i];
      el('signalCursor').setAttribute('d', `M${x(r.closeTime)} ${top}V${bbottom}`);
      el('signalRead').textContent = `${stamp(r.closeTime)} · ${asset()} ${usd(r.close)} · SMA200 ${usd(r.ma)} · ${r.gate ? 'Bullish' : 'Bearish'} · breadth ${percent(r.breadth)}${visibleTrades.filter(t => t.time >= r.time && t.time <= r.closeTime).map(t => ` · ${t.side.toUpperCase()} ${usd(t.price)}`).join('')}`;
    };
    el('signalHit').onpointermove = inspect;
    el('signalHit').onclick = inspect;
    el('signalRead').textContent = `Hover or tap · ▲ buy · ▼ sell · modeled ${asset()==='MSTR'?'daily':'4h'} opening trades`;
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
    rows = calculate(bars); vortexRows=calculateBTC(bars,{impulseMACD,smaN,ensGroup,ensSpread},undefined,{details:true}); loaded = true; updateYears(); render();
    el('signalSource').textContent = `Saved · ${stamp(rows.at(-1).closeTime)} · updating…`;
  }

  async function refresh() {
    if (busy) return; busy = true; el('signalRefresh').disabled = true;el('indicatorRefresh').disabled=true;
    try {
      if (!loaded) await load();
      try{
        const response=await fetch('assets/btc/mstr-snapshot.json',{cache:'no-store'});
        if(!response.ok)throw Error('MSTR snapshot unavailable');
        const data=await response.json();
        stock=data.bars.map(([time,open,high,low,close,closeTime])=>({time,open,high,low,close,closeTime}));stockChecked=data.checkedAt;stockError='';
      }catch(e){stockError=e.message;}
      render();
      el('signalSource').textContent = `Checking… · last close ${stamp(rows.at(-1).closeTime)}`;
      const merged = new Map(bars.map(b => [b.time, b]));
      let start = bars.at(-1).time * 1000;
      const cutoff = Date.now();
      let nextOpen = null;
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
          if (b.time * 1000 + 14400000 > cutoff) {
            if (b.time === Math.floor(cutoff / 14400000) * 14400 && Number.isFinite(b.open) && b.open > 0)
              nextOpen = {time: b.time, open: b.open};
            continue;
          }
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
      rows = calculate(next); vortexRows=calculateBTC(next,{impulseMACD,smaN,ensGroup,ensSpread},undefined,{details:true}); bars = next; liveOpen = nextOpen; updateYears(); render();
      const stale = cutoff / 1000 - rows.at(-1).closeTime >= 14400;
      el('signalSource').textContent = `${stale ? 'Feed is behind' : 'Binance checked'} · last close ${stamp(rows.at(-1).closeTime)}`;
      el('signalSource').title = `Checked ${stamp(cutoff / 1000)}. Closed candles only; auto-refresh every five minutes.`;
    } catch (error) {
      el('signalSource').textContent = loaded ? `Refresh unavailable · saved close ${stamp(rows.at(-1).closeTime)}` : 'Signal history unavailable. Try refresh.';
      el('signalSource').title = error.message;
    } finally { busy = false; el('signalRefresh').disabled = false;el('indicatorRefresh').disabled=false;syncIndicatorSource(); }
  }
  function onShow() { shown = true; if (!loaded) refresh(); else render(); }
  el('signalRefresh').onclick = refresh;
  el('indicatorRefresh').onclick = refresh;
  el('signalRange').onchange = render;
  el('signalAsset').onchange = ()=>{el('indicatorAsset').value=asset();render();};
  el('indicatorAsset').onchange = ()=>{el('signalAsset').value=el('indicatorAsset').value;render();};
  new ResizeObserver(() => { if (shown && !el('panel_signals').hidden) render(); }).observe(el('signalChart'));
  setInterval(() => { if (shown && (!el('panel_signals').hidden||!el('panel_indicators').hidden)) refresh(); }, 300000);
  // Signals is the default; explicit links to other tabs still work.
  setTimeout(() => showTab(new URLSearchParams(location.search).get('tab') || 'signals'), 0);
  return {onShow, refresh, calculate, replay};
})();
