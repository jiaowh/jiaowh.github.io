// fast_s13_im100_e50: fixed, versioned notification model. No order execution.
export const STRATEGY = 'fast-imacd-14-21-34-s13-e50-v1';
export const H4 = 14400, DAY = 86400;
const EPS = 1e-12;

export function calculate(input, indicators, now = Date.now() / 1000) {
  const B = input.filter(b => b.time + H4 <= now), n = B.length;
  const {impulseMACD, smaN, ensGroup, ensSpread} = indicators;
  const members = [];
  for (const tf of [4,8,12,24,48,72]) {
    const {bars,ends} = ensGroup(B,tf*3600);
    for (const len of [14,21,34]) {
      const {md,sb} = impulseMACD(bars,len,13);
      for (const cross of [false,true]) members.push(ensSpread(md.map((v,i) =>
        Number.isFinite(sb[i]) ? +(v > (cross ? sb[i] : 0)) : NaN),ends,n));
    }
  }
  const {bars:D,ends} = ensGroup(B,DAY), c = D.map(b => b.close);
  for (const len of [20,50,100,150,200]) {
    const ma = smaN(c,len);
    members.push(ensSpread(c.map((v,i) => Number.isFinite(ma[i]) ? +(v>ma[i]) : NaN),ends,n));
  }
  for (const len of [14,28,56,84,168]) members.push(ensSpread(c.map((v,i) => i<len ? NaN : +(v>c[i-len])),ends,n));
  for (const len of [10,20,50,100]) {
    const v = Array(c.length).fill(NaN), exit = Math.floor(len/2); let held = 0;
    for (let i=len;i<c.length;i++) {
      const hi = Math.max(...D.slice(i-len,i).map(b => b.high));
      const lo = Math.min(...D.slice(i-exit,i).map(b => b.low));
      if (c[i]>hi) held=1; else if (c[i]<lo) held=0;
      v[i]=held;
    }
    members.push(ensSpread(v,ends,n));
  }
  const ma=smaN(c,200); let gate=false, up=0, down=0;
  const gates=c.map((v,i) => {
    up=v>ma[i]*1.02 ? up+1 : 0; down=v<ma[i]*.98 ? down+1 : 0;
    if (down>=2) gate=false; else if (up>=2) gate=true;
    return +gate;
  });
  const G=ensSpread(gates,ends,n); let weak=0, previous=false;
  return B.map((b,i) => {
    const E=members.reduce((s,v) => s+v[i],0)/50;
    weak=E<.5-EPS ? weak+1 : 0;
    const confirmed=weak>=3, eligible=confirmed&&!previous&&G[i]===1;
    previous=confirmed;
    return {...b,closeTime:b.time+H4,breadth:E,gate:G[i]===1,eligible};
  });
}

export function newState(start) {
  return {strategy:STRATEGY,lastClose:start,holding:true,sale:null,saleTime:null,pending:null,outbox:[]};
}
const stamp = t => new Date(t*1000).toISOString().slice(0,16).replace('T',' ')+' UTC';
export const dailyText = r => `BTC breadth ${Math.round(r.breadth*100)}% · ${stamp(r.closeTime)}`;
export const tradeText = t => `BTC ${t.side.toUpperCase()} · $${t.price.toLocaleString('en-US',{maximumFractionDigits:2})}\n${stamp(t.time)}`;

// Process every intervening close, not just the latest target. This preserves
// sell/buy pairs during missed workflow runs. Next-open prices are model fills.
export function advance(state, rows, raw, {notify=true, until=Infinity}={}) {
  const opens=new Map(raw.filter(b => b.time<until).map(b => [b.time,b.open])), trades=[];
  function fill() {
    const p=state.pending;
    if (!p || !opens.has(p.time)) return;
    const price=opens.get(p.time), trade={...p,price};
    state.holding=p.side==='buy';
    if (!state.holding) {state.sale=price;state.saleTime=p.time;}
    state.pending=null; trades.push(trade);
    if (notify) state.outbox.push({id:`trade:${p.time}:${p.side}`,text:tradeText(trade)});
  }
  for (const r of rows) {
    if (r.closeTime<=state.lastClose || r.time>=until) continue;
    fill();
    if (state.pending) throw Error('Missing next-open price');
    if (state.holding) {
      if (r.eligible) state.pending={side:'sell',time:r.closeTime,reason:'weakness'};
    } else {
      const target=r.close<=state.sale*.999/(1.001*1.1);
      const recovery=r.breadth>.5+EPS, timeout=r.closeTime-state.saleTime>=7*DAY;
      if (target||recovery||timeout) state.pending={side:'buy',time:r.closeTime,reason:target?'target':recovery?'recovery':'timeout'};
    }
    if (notify && r.closeTime%DAY===0) state.outbox.push({id:`daily:${r.closeTime}`,text:dailyText(r)});
    state.lastClose=r.closeTime;
  }
  fill();
  return trades;
}

export function bootstrap(rows, raw) {
  // Carry the researched model from 2023; do not flood Telegram with old trades.
  const state=newState(Date.UTC(2023,0,1)/1000);
  advance(state,rows,raw,{notify:false});
  const last=rows.at(-1);
  if (last.closeTime%DAY===0) state.outbox.push({id:`daily:${last.closeTime}`,text:dailyText(last)});
  return state;
}

export async function drain(state, send, save) {
  while (state.outbox.length) {
    await send(state.outbox[0].text);
    state.outbox.shift();
    save(state); // retain unsent messages if a later send fails
  }
}
