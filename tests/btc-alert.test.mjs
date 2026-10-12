import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadIndicators} from '../.github/scripts/btc_indicators.mjs';
import {calculate,newState,advance,bootstrap,drain,H4,DAY,dailyText,tradeText} from '../.github/scripts/btc_fast_strategy.mjs';
import {mergeCandles} from '../.github/scripts/avg_alert.mjs';
const root=resolve(import.meta.dirname,'..'), L=loadIndicators(root);
const seed=JSON.parse(readFileSync(resolve(root,'assets/btc/signal-snapshot.json'),'utf8'));
const B=seed.bars.map(([time,open,high,low,close])=>({time,open,high,low,close}));
const rows=calculate(B,L), expected=JSON.parse(readFileSync(resolve(root,'research/btc-bull-accumulation-2026/imacd-summary.json'),'utf8')).details.fast_s13_im100_e50;
let count=0;
for (let y=2018;y<=2026;y++) {
  const start=Date.UTC(y,0,1)/1000, end=y===2026?Date.UTC(2026,9,10)/1000:Date.UTC(y+1,0,1)/1000;
  const s=newState(start), trades=advance(s,rows,B,{until:end,notify:false}), e=expected[String(y)];
  assert.deepEqual(trades.map(t=>[t.side,t.time,t.price]),e.ledger.map(t=>[t.side,t.time,t.price]),String(y));
  let btc=1,cash=0;
  for (const t of trades) {if(t.side==='sell'){cash=btc*t.price*.999;btc=0;}else{btc=cash/(t.price*1.001);cash=0;}}
  const last=rows.filter(r=>r.time<end).at(-1);
  assert.ok(Math.abs(btc+cash/(last.close*1.001)-e.btc)<1e-9,String(y)); count+=trades.length;
}
// Causal prefixes include partially formed multi-day indicator candles.
for (const cut of [19003,23507,29002]) {
  const a=calculate(B.slice(0,cut),L);
  for(let i=cut-100;i<cut;i++) assert.deepEqual(a[i],rows[i]);
}
const future={...B.at(-1),time:Math.ceil(Date.now()/1000/H4)*H4,close:1};
assert.deepEqual(calculate([...B,future],L).at(-1),rows.at(-1));

const t=Date.UTC(2025,0,1)/1000;
const bar=(time,close=100,extra={})=>({time,open:100,high:110,low:80,close,closeTime:time+H4,breadth:.4,gate:true,eligible:false,...extra});
const synthetic=[bar(t,100,{eligible:true}),bar(t+H4,101,{breadth:.52}),bar(t+2*H4)];
let s=newState(t);
let trades=advance(s,synthetic,synthetic);
assert.deepEqual(trades.map(q=>[q.side,q.time,q.reason]),[['sell',t+H4,'weakness'],['buy',t+2*H4,'recovery']]);
const sent=s.outbox.length;advance(s,synthetic,synthetic);assert.equal(s.outbox.length,sent);
// Chunked workflow runs must match catch-up replay exactly.
let step=newState(t), chunked=[];
for(let i=0;i<synthetic.length;i++) {chunked.push(...advance(step,synthetic.slice(0,i+1),synthetic.slice(0,i+2)));step=JSON.parse(JSON.stringify(step));}
assert.deepEqual(chunked,trades);assert.deepEqual(step,s);
for (const [extra,reason] of [[{close:89},'target'],[{closeTime:t+H4+7*DAY},'timeout']]) {
  const q=newState(t);q.holding=false;q.sale=100;q.saleTime=t;
  const r=bar(t,100,extra), raw=[r,bar(r.closeTime)];
  assert.equal(advance(q,[r],raw)[0].reason,reason);
}
const daily=bar(t-H4,100,{breadth:.58});
s=newState(t-DAY);advance(s,[daily],[daily,bar(t)]);
assert.deepEqual(s.outbox.map(x=>x.text),['BTC breadth 58% · 2025-01-01 00:00 UTC']);
advance(s,[daily],[daily,bar(t)]);assert.equal(s.outbox.length,1);
const boot=bootstrap(rows,B);assert.equal(boot.outbox.filter(x=>x.id.startsWith('trade:')).length,0);
// Delivery failure retains remaining messages; successes are checkpointed individually.
s={outbox:[{text:'a'},{text:'b'}]};const delivered=[],saved=[];
await assert.rejects(drain(s,async m=>{if(m==='b')throw Error('network');delivered.push(m);},v=>saved.push(JSON.stringify(v))));
assert.deepEqual(delivered,['a']);assert.deepEqual(s.outbox,[{text:'b'}]);assert.equal(saved.length,1);
await drain(s,async m=>delivered.push(m),()=>{});assert.deepEqual(delivered,['a','b']);
assert.equal(dailyText(daily).split('\n').length,1);
assert.equal(tradeText({side:'buy',price:77383.47,time:t}),'BTC BUY · $77,383.47\n2025-01-01 00:00 UTC');
// Reject stale, mixed-source or gapped new history before any messages are sent.
const savedBars=[bar(t)];const incoming=[bar(t),bar(t+H4),bar(t+2*H4)];
assert.equal(mergeCandles(savedBars,incoming,t+2*H4+60).length,3);
assert.throws(()=>mergeCandles(savedBars,[bar(t+2*H4)],t+2*H4+60),/Missing/);
assert.throws(()=>mergeCandles(savedBars,[bar(t,99)],t+60),/mismatch/);
assert.throws(()=>mergeCandles(savedBars,[],t+2*H4+60),/behind/);
console.log(`PASS: ${count} Python-research trade fills across 2018–2026, annual BTC parity, causal prefixes, next-open execution, recovery/target/timeout, daily-only breadth, catch-up, duplicate suppression, bootstrap, delivery retries and data guards.`);
