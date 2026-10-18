// Shared chart + Telegram model: fast iMACD, double 72h, >50% recovery. No orders.
export const LEGACY_STRATEGY = 'fast-imacd-14-21-34-s13-e50-v1';
export const STRATEGY = 'fast-imacd-14-21-34-s13-72h2x-e50-v2';
export const EQUAL_TIMEFRAME_WEIGHTS = Object.freeze([1,1,1,1,1,1]);
export const BTC_TIMEFRAME_WEIGHTS = Object.freeze([1,1,1,1,1,2]);
export const H4 = 14400, DAY = 86400;
const EPS = 1e-12;

export function calculate(input, indicators, now = Date.now() / 1000, {vortex = false, details = false, timeframeWeights = vortex ? EQUAL_TIMEFRAME_WEIGHTS : BTC_TIMEFRAME_WEIGHTS} = {}) {
  if(timeframeWeights.length!==6||timeframeWeights.some(w=>!Number.isFinite(w)||w<=0))throw Error('Invalid timeframe weights');
  const weightSum=timeframeWeights.reduce((s,w)=>s+w,0);
  const B = input.filter(b => b.time + H4 <= now), n = B.length;
  const {impulseMACD, smaN, ensGroup, ensSpread} = indicators;
  const members = [], definitions = [];
  const add=(values,group,label,weight=1)=>{
    members.push({values,weight});
    if(details)definitions.push({values,group,label,weight});
  };
  for (const tf of [4,8,12,24,48,72]) {
    const {bars,ends} = ensGroup(B,tf*3600);
    for (const len of [14,21,34]) {
      const {md,sb} = impulseMACD(bars,len,13);
      for (const cross of [false,true]) add(ensSpread(md.map((v,i) =>
        Number.isFinite(sb[i]) ? +(v > (cross ? sb[i] : 0)) : NaN),ends,n),`${tf}h`,`iMACD ${len} ${cross?'above signal':'above zero'}`,6*timeframeWeights[[4,8,12,24,48,72].indexOf(tf)]/weightSum);
    }
  }
  const {bars:D,ends} = ensGroup(B,DAY), c = D.map(b => b.close);
  for (const len of [20,50,100,150,200]) {
    const ma = smaN(c,len);
    add(ensSpread(c.map((v,i) => Number.isFinite(ma[i]) ? +(v>ma[i]) : NaN),ends,n),'Daily averages',`Price above SMA${len}`);
  }
  for (const len of [14,28,56,84,168]) add(ensSpread(c.map((v,i) => i<len ? NaN : +(v>c[i-len])),ends,n),'Daily momentum',`Momentum ${len}d`);
  for (const len of [10,20,50,100]) {
    const v = Array(c.length).fill(NaN), exit = Math.floor(len/2); let held = 0;
    for (let i=len;i<c.length;i++) {
      const hi = Math.max(...D.slice(i-len,i).map(b => b.high));
      const lo = Math.min(...D.slice(i-exit,i).map(b => b.low));
      if (c[i]>hi) held=1; else if (c[i]<lo) held=0;
      v[i]=held;
    }
    add(ensSpread(v,ends,n),'Daily breakouts',`Donchian ${len}/${exit}`);
  }
  if (vortex) for (const tf of [4,8,12,24,48,72]) {
    const {bars,ends:ve} = ensGroup(B,tf*3600);
    for (const len of [21,34,55]) {
      const moves=bars.map((b,i)=>i ? Math.abs(b.high-bars[i-1].low)-Math.abs(b.low-bars[i-1].high) : 0);
      let sum=0;
      const votes=moves.map((v,i)=>{sum+=v;if(i>=len)sum-=moves[i-len];return i<len+1 ? NaN : +(sum>0);});
      const spread=ensSpread(votes,ve,n);
      add(spread,`${tf}h`,`Vortex ${len}`,2); // 18 directional conditions, weight two.
    }
  }
  const ma=smaN(c,200); let gate=false, up=0, down=0;
  const gates=c.map((v,i) => {
    up=v>ma[i]*1.02 ? up+1 : 0; down=v<ma[i]*.98 ? down+1 : 0;
    if (down>=2) gate=false; else if (up>=2) gate=true;
    return +gate;
  });
  const G=ensSpread(gates,ends,n), MA=ensSpread(ma,ends,n); let weak=0, previous=false;
  const totalWeight=members.reduce((s,m)=>s+m.weight,0);
  return B.map((b,i) => {
    const E=members.reduce((s,m) => s+m.values[i]*m.weight,0)/totalWeight;
    weak=E<.5-EPS ? weak+1 : 0;
    const confirmed=weak>=3, eligible=confirmed&&!previous&&G[i]===1;
    previous=confirmed;
    const row={...b,closeTime:b.time+H4,breadth:E,ma:MA[i],gate:G[i]===1,eligible,confirmed,streak:weak};
    if(details&&i===n-1)row.members=definitions.map(({values,...member})=>({...member,bullish:Number.isFinite(values[i])?values[i]===1:null}));
    return row;
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
export function advance(state, rows, raw, {notify=true, until=Infinity, dailyAfter=-Infinity}={}) {
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
    if (notify && r.closeTime>dailyAfter && r.closeTime%DAY===0) state.outbox.push({id:`daily:${r.closeTime}`,text:dailyText(r)});
    state.lastClose=r.closeTime;
  }
  fill();
  return trades;
}

export function migrateLegacy(prior, legacyRows, rows, raw) {
  if(prior.strategy!==LEGACY_STRATEGY)throw Error('Unsupported BTC migration');
  const state=structuredClone(prior),last=rows.at(-1);
  if(!last||last.closeTime!==legacyRows.at(-1)?.closeTime||prior.lastClose>last.closeTime)throw Error('Invalid migration history');
  // Finish missed old-rule closes and preserve its unsent messages and cash lot.
  advance(state,legacyRows,raw);
  if(state.pending)throw Error('Migration needs the latest opening price');
  // Adopt at the latest completed close, never replay historical new-rule trades.
  state.strategy=STRATEGY;
  state.lastClose=last.closeTime-1;
  advance(state,[last],raw,{dailyAfter:last.closeTime});
  if(state.pending)throw Error('Migration needs the latest opening price');
  // If today's breadth is still queued, update its value without resending it.
  for(const message of state.outbox)if(message.id===`daily:${last.closeTime}`)message.text=dailyText(last);
  state.migratedAt=last.closeTime;
  return state;
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
