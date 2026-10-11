// Run with Node: replay the actual production JavaScript, without a browser.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'btc.html'),'utf8');
const script=source.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const fixturePath=path.resolve(root,'../quant/research_notes/ensemble_v2/runs/r18_verify_20260930T065706Z_3615/fixture.json');
const f=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const ctx=vm.createContext({localStorage:{getItem:()=>null},Date});
vm.runInContext('const DAY=86400;'+script.slice(script.indexOf('function ema('),script.indexOf('// ---------- RSI'))+script.slice(script.indexOf('const ENS_TF='),script.indexOf('function makeView(')),ctx);
ctx.bars=f.bars;ctx.funding=f.funding;
const R=vm.runInContext('computeEnsemble(bars,funding)',ctx);
for(const [a,b] of [[R.E,f.E],[R.lvl,f.lvl],...Object.keys(R.banded).map(k=>[R.banded[k],f.banded[k]])]){
  assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(b[i]===null?Number.isNaN(x):Math.abs(x-b[i])<1e-9));
}
// Prefix checks at the two focus corrections: future observations cannot change signals.
for(const date of ['2024-04-01','2024-08-01','2025-02-01','2025-04-01']){
  const n=f.bars.findIndex(b=>b.time>=Date.parse(date)/1000);ctx.bars=f.bars.slice(0,n);
  const p=vm.runInContext('computeEnsemble(bars,funding)',ctx);
  for(const k of ['E','lvl','f14'])p[k].forEach((v,i)=>assert.ok(Number.isNaN(v)&&Number.isNaN(R[k][i])||Math.abs(v-R[k][i])<1e-9));
  p.banded.vt60.forEach((v,i)=>assert.ok(Number.isNaN(v)&&Number.isNaN(R.banded.vt60[i])||Math.abs(v-R.banded.vt60[i])<1e-9));
}
fs.writeFileSync(path.join(__dirname,'production.json'),JSON.stringify({bars:f.bars,...R,sourceHash:require('node:crypto').createHash('sha256').update(source).digest('hex'),fixturePath}));
const hashFile=p=>require('node:crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inputs=[path.join(root,'btc.html'),fixturePath,path.resolve(root,'../quant/research_notes/imacd_ensemble/btc_1h.npy'),path.resolve(root,'../quant/research_notes/ensemble_v2/core.py')];
fs.writeFileSync(path.join(__dirname,'provenance.json'),JSON.stringify({researchDate:'2026-10-10',inputs:inputs.map(p=>({path:p,sha256:hashFile(p)}))},null,2));
console.log('PASS: production votes, levels, all three positions match independent fixture; four prefix checks. Exported '+R.t.length+' bars.');
