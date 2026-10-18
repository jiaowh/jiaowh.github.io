// In-memory research variant of the production calculation; no live file changes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadIndicators} from '../../.github/scripts/btc_indicators.mjs';
import {calculate as liveCalculate} from '../../assets/btc/fast-strategy.mjs';
const root=resolve(import.meta.dirname,'../..'),out=import.meta.dirname;
let source=readFileSync(resolve(root,'assets/btc/fast-strategy.mjs'),'utf8');
function replace(a,b){assert.equal(source.split(a).length,2,'Expected exactly one production anchor');source=source.replace(a,b);}
replace('{vortex = false, details = false}', '{vortex = false, details = false, tfWeights = [1,1,1,1,1,1]}');
replace('for(let i=0;i<weight;i++)members.push(values);', `
    const tfIndex=[4,8,12,24,48,72].indexOf(Number(group.replace('h','')));
    const normalized=label.startsWith('iMACD') && tfIndex>=0 ? 6*tfWeights[tfIndex]/tfWeights.reduce((s,v)=>s+v,0) : weight;
    members.push({values,weight:normalized});`);
replace('members.reduce((s,v) => s+v[i],0)/members.length', 'members.reduce((s,v) => s+v.values[i]*v.weight,0)/members.reduce((s,v)=>s+v.weight,0)');
const {calculate,newState,advance}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const summary=JSON.parse(readFileSync(resolve(out,'summary.json'),'utf8'));
const seed=JSON.parse(readFileSync(resolve(root,'assets/btc/signal-snapshot.json'),'utf8'));
const raw=seed.bars.map(([time,open,high,low,close])=>({time,open,high,low,close}));
const indicators=loadIndicators(root),original=liveCalculate(raw,indicators);
let ledgers=0,fills=0;
for(const n of new Set([summary.named.equal,...Object.values(summary.selected)])){
  const rows=calculate(raw,indicators,undefined,{tfWeights:summary.profiles[n]});
  if(n===summary.named.equal)for(let i=0;i<rows.length;i++){
    assert.equal(rows[i].eligible,original[i].eligible);
    assert.ok(Number.isNaN(rows[i].breadth)&&Number.isNaN(original[i].breadth)||Math.abs(rows[i].breadth-original[i].breadth)<1e-12);
  }
  for(const [period,[start,end]] of Object.entries(summary.periods)){
    const a=Date.parse(start)/1000,z=Date.parse(end)/1000,s=newState(a);
    const trades=advance(s,rows,raw,{until:z,notify:false}),expected=summary.details[n][period];
    assert.deepEqual(trades.map(t=>[t.side,t.time,t.price]),expected.ledger.map(t=>[t.side,t.time,t.price]),`${n} ${period}`);
    let btc=1,cash=0;
    for(const t of trades){if(t.side==='sell'){cash=btc*t.price*.999;btc=0;}else{btc=cash/(t.price*1.001);cash=0;}}
    const last=rows.filter(r=>r.time<z).at(-1);
    assert.ok(Math.abs(btc+cash/(last.close*1.001)-expected.btc)<1e-9);
    ledgers++;fills+=trades.length;
  }
}
const result={ledgers,fills,profiles:3,productionChanged:false};
writeFileSync(resolve(out,'production-validation.json'),JSON.stringify(result,null,2)+'\n');
console.log(`PASS: ${ledgers} Python/production-JavaScript ledgers, ${fills} fills and ending BTC match; live strategy files untouched.`);
