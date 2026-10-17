import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadIndicators} from '../.github/scripts/btc_indicators.mjs';
import {calculateBTC,replay,alertState,STRATEGY,stockRegimes} from '../assets/btc/mstr-strategy.mjs';
import {mergeStock,sessionClose} from '../.github/scripts/mstr_feed.mjs';
const root=resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const B=read('assets/btc/signal-snapshot.json').bars.map(([time,open,high,low,close])=>({time,open,high,low,close}));
const D=read('assets/btc/mstr-snapshot.json').bars.map(([time,open,high,low,close,closeTime])=>({time,open,high,low,close,closeTime}));
const end=Date.UTC(2026,9,10)/1000,L=loadIndicators(root),rows=calculateBTC(B,L,end);
const research=read('research/mstr-fast-recovery-2026/ichimoku-results.json');
const name='legacy_add_vortex_x50_b50__joint200';let fills=0;
for(const period of ['2020-21','2022','2023','2024','2025','2026','2023-25','validation']){
  const y=period==='validation'?2025:Number(period.slice(0,4)),start=Date.UTC(y,0,1)/1000;
  const until=period==='2020-21'?Date.UTC(2022,0,1)/1000:period==='2023-25'?Date.UTC(2026,0,1)/1000:period==='validation'||period==='2026'?end:Date.UTC(y+1,0,1)/1000;
  const r=replay(B,rows,D,{start,until,now:end}),want=research.detailsMSTR[name][period];
  assert.deepEqual(r.trades.map(t=>[t.side,t.time,t.price]),want.ledger.map(t=>[t.side,t.time,t.price]),period);
  let units=1,cash=0;
  for(const t of r.trades){if(t.side==='sell'){cash=units*t.price*.999;units=0;}else{units=cash/(t.price*1.001);cash=0;}}
  const last=D.filter(b=>b.time>=start&&b.time<until).at(-1);
  assert.ok(Math.abs(units+cash/(last.close*1.001)-want.shares)<1e-9,period);fills+=r.trades.length;
}
for(const cut of [19003,23507,29002]){
  const prefix=calculateBTC(B.slice(0,cut),L,end);
  for(let i=cut-100;i<cut;i++)assert.deepEqual(prefix[i],rows[i]);
}
// Only the opening price of a forming stock candle can affect the current session target.
const truncated=D.slice(0,-1),last=D.at(-1),now=last.time+60;
const original=replay(B,rows,D,{now});
const changed=replay(B,rows,[...truncated,{...last,close:1,high:99999,low:1}],{now});
assert.deepEqual(changed.trades,original.trades);
assert.deepEqual(changed.regimes,original.regimes);
assert.equal(changed.holding,original.holding);
assert.equal(stockRegimes(D,now).at(-1).time,truncated.at(-1).time);
// Opening revisions affect modeled fill prices, not signal directions/timestamps.
const revisedOpens=D.map(b=>({...b,open:(b.low+b.high)/2}));
const normalReplay=replay(B,rows,D,{now:end}),openReplay=replay(B,rows,revisedOpens,{now:end});
assert.deepEqual(openReplay.trades.map(t=>[t.side,t.time]),normalReplay.trades.map(t=>[t.side,t.time]));
assert.deepEqual(openReplay.sessions.map(s=>[s.time,s.gate,s.holding,s.breadth]),normalReplay.sessions.map(s=>[s.time,s.gate,s.holding,s.breadth]));
const t=Date.UTC(2026,9,9)/1000,daily={closeTime:t,breadth:.6};
const result={sessions:[{time:t-3600}],holding:false,trades:[{time:t-3600,side:'sell',price:100}]};
const boot=alertState(result,[daily],t+60);assert.equal(boot.outbox.length,1);assert.match(boot.outbox[0].text,/^MSTR breadth 60%/);
const prior={strategy:STRATEGY,lastOpen:t-86400,lastDaily:t-86400,outbox:[]};
const s=alertState(result,[daily],t+60,prior);assert.equal(s.outbox.length,2);
assert.deepEqual(alertState(result,[daily],t+60,s),s);
// An already processed trade is neither re-sent nor rewritten on price correction.
assert.deepEqual(alertState({...result,trades:[{...result.trades[0],price:99}]},[daily],t+60,s),s);
assert.throws(()=>alertState(result,[daily],t+14400,s),/stale/);
// The published snapshot advances independently of the frozen research end date.
const feedNow=last.closeTime+86401;
assert.throws(()=>mergeStock([last],[{...last,close:last.close+1,high:Math.max(last.high,last.close+1)}],feedNow),/history changed/);
assert.doesNotThrow(()=>mergeStock([{...last,complete:false}],[{...last,close:last.open}],feedNow));
assert.equal(sessionClose(Date.UTC(2025,10,28,14,30)/1000),Date.UTC(2025,10,28,18)/1000);
assert.equal(sessionClose(Date.UTC(2025,6,3,13,30)/1000),Date.UTC(2025,6,3,17)/1000);
console.log(`PASS: ${fills} MSTR fills and fee-net units match independent research, causal prefixes, forming-stock exclusion, half days, bootstrap, catch-up, retry outbox and data revision guards.`);
