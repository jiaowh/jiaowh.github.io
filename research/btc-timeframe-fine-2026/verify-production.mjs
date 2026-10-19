import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadIndicators} from '../../.github/scripts/btc_indicators.mjs';
import {calculate,newState,advance,BTC_TIMEFRAME_WEIGHTS} from '../../assets/btc/fast-strategy.mjs';
const root=resolve(import.meta.dirname,'../..'),out=import.meta.dirname;
const summary=JSON.parse(readFileSync(resolve(out,'summary.json'),'utf8'));
const seed=JSON.parse(readFileSync(resolve(root,'assets/btc/signal-snapshot.json'),'utf8'));
const raw=seed.bars.map(([time,open,high,low,close])=>({time,open,high,low,close}));
const indicators=loadIndicators(root);let ledgers=0,fills=0;
assert.deepEqual(BTC_TIMEFRAME_WEIGHTS,[1,1,1,1,1,2]);
for(const n of new Set(Object.values(summary.labels))){
 const rows=calculate(raw,indicators,undefined,{timeframeWeights:summary.profiles[n],details:true});
 const members=rows.at(-1).members,im=members.filter(m=>m.group.endsWith('h'));
 assert.ok(Math.abs(im.reduce((s,m)=>s+m.weight,0)-36)<1e-10);
 assert.ok(Math.abs(members.reduce((s,m)=>s+m.weight,0)-50)<1e-10);
 for(const [period,[start,end]] of Object.entries(summary.periods)){
  const a=Date.parse(start)/1000,z=Date.parse(end)/1000,s=newState(a);
  const trades=advance(s,rows,raw,{until:z,notify:false}),expected=summary.details[n][period];
  assert.deepEqual(trades.map(t=>[t.side,t.time,t.price]),expected.ledger.map(t=>[t.side,t.time,t.price]),`${n} ${period}`);
  assert.deepEqual(trades.filter(t=>t.side==='buy').map(t=>t.reason),expected.ledger.filter(t=>t.side==='buy').map(t=>t.reason));
  let btc=1,cash=0;
  for(const t of trades){if(t.side==='sell'){cash=btc*t.price*.999;btc=0;}else{btc=cash/(t.price*1.001);cash=0;}}
  const last=rows.filter(r=>r.time<z).at(-1);assert.ok(Math.abs(btc+cash/(last.close*1.001)-expected.btc)<1e-9);
  ledgers++;fills+=trades.length;
 }
}
const result={profiles:new Set(Object.values(summary.labels)).size,ledgers,fills,liveWeights:BTC_TIMEFRAME_WEIGHTS};
writeFileSync(resolve(out,'production-validation.json'),JSON.stringify(result,null,2)+'\n');
console.log('PASS:',JSON.stringify(result));
