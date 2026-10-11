const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),old=JSON.parse(fs.readFileSync(path.join(__dirname,'production.json'),'utf8'));
const fixture=JSON.parse(fs.readFileSync(old.fixturePath,'utf8')),extra=JSON.parse(fs.readFileSync(path.join(__dirname,'extension-2026.json'),'utf8'));
assert.ok(extra.bars?.length&&extra.stamps?.length,'Both price and funding extensions required');
const bars=new Map(old.bars.map(b=>[b.time,b]));let overlap=0;
for(const b of extra.bars){if(bars.has(b.time)){for(const k of ['open','high','low','close'])assert.ok(Math.abs(b[k]-bars.get(b.time)[k])<.011,'Overlapping prices differ');overlap++;}else bars.set(b.time,b);}
const funding=new Map(fixture.funding.stamps);for(const [t,r] of extra.stamps)if(!funding.has(t))funding.set(t,r);
const input=[...bars.values()].sort((a,b)=>a.time-b.time);
assert.equal(input.at(-1).time+14400,extra.endExclusive/1000);
for(let i=1;i<input.length;i++)if(input[i].time>=Date.parse('2023-01-01')/1000)assert.equal(input[i].time-input[i-1].time,14400);
const html=fs.readFileSync(path.join(root,'btc.html'),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ctx=vm.createContext({Date,localStorage:{getItem:()=>null},bars:input,funding:{src:'Binance (early BitMEX warmup)',stamps:[...funding].sort((a,b)=>a[0]-b[0])}});
vm.runInContext('const DAY=86400;'+script.slice(script.indexOf('function ema('),script.indexOf('// ---------- RSI'))+script.slice(script.indexOf('const ENS_TF='),script.indexOf('function makeView(')),ctx);
const r=vm.runInContext('computeEnsemble(bars,funding)',ctx);
for(const key of ['E','lvl'])old[key].forEach((x,i)=>assert.ok(x===null?Number.isNaN(r[key][i]):Math.abs(x-r[key][i])<1e-9));
old.banded.vt60.forEach((x,i)=>assert.ok(x===null?Number.isNaN(r.banded.vt60[i]):Math.abs(x-r.banded.vt60[i])<1e-9));
fs.writeFileSync(path.join(__dirname,'production-2026.json'),JSON.stringify({bars:input,...r,funding:ctx.funding,sourceHash:require('node:crypto').createHash('sha256').update(html).digest('hex')}));
console.log('PASS: '+overlap+' overlapping bars match; continuous data through '+new Date((input.at(-1).time+14400)*1000).toISOString()+'; existing votes and targets unchanged. '+r.t.length+' total bars.');
