// Run: node tests/btc-average.test.cjs [research fixture.json]
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../btc.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // Parse the entire production script, including templates.
const context=vm.createContext({localStorage:{getItem:()=>null},Date});
vm.runInContext('const DAY=86400;'+script.slice(script.indexOf('function ema('),script.indexOf('// ---------- RSI'))+
  script.slice(script.indexOf('const ENS_TF='),script.indexOf('function makeView(')),context);
function levels(e){context.input=e;return Array.from(vm.runInContext('ensLevels(input)',context));}
const input=[NaN,.60,.62,.58,.60,.62,.64,.48,.50,.52,.54,.63,.40,.38,.60,.62];
const expected=[NaN,0,1,2/3,2/3,2/3,1,1/3,1/3,1/3,2/3,1,1/3,0,0,1];
assert.deepEqual(levels(input),expected);
assert.deepEqual(levels([.62,.48,.64,.20]),[1,1/3,1,0]); // skipped levels and abrupt exit
for(let n=1;n<=input.length;n++)assert.deepEqual(levels(input.slice(0,n)),expected.slice(0,n));
// Compare every possible vote and starting level against independently specified transitions.
for(const [prefix,start] of [[[.6],0],[[.62],1],[[.62,.58],2/3],[[.62,.48],1/3]]){
  for(let votes=0;votes<=50;votes++){
    const e=votes/50;
    const want=start===0?(votes>30?1:0):votes<20?0:
      start===1?(votes>=30?1:votes>=25?2/3:1/3):
      votes>=32?1:start===2/3?(votes>=25?2/3:1/3):(votes>=27?2/3:1/3);
    assert.equal(levels([...prefix,e]).at(-1),want);
  }
}
if(process.argv[2]){
  const f=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  context.bars=f.bars;context.funding=f.funding;
  const actual=vm.runInContext('computeEnsemble(bars,funding)',context);
  const compare=(a,b,label)=>{assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){
    if(b[i]===null)assert.ok(Number.isNaN(a[i]),label+' warmup '+i);
    else assert.ok(Math.abs(a[i]-b[i])<1e-9,label+' at '+i+': '+a[i]+' vs '+b[i]);
  }};
  compare(actual.E,f.E,'votes');compare(actual.lvl,f.lvl,'levels');
  for(const k of Object.keys(f.banded))compare(actual.banded[k],f.banded[k],k);
  const original=actual.banded.spot.at(-1);
  // Exercise the real card template at each buffered recovery and entry boundary.
  context.R=actual;
  vm.runInContext('const FAMS=Object.keys(ENS_FAM);const fx=x=>x.toFixed(2)+"×";const tstr=t=>new Date(t*1000).toISOString();'+
    script.slice(script.indexOf('  function card(mode){'),script.indexOf('  function onShow(){',script.indexOf('  function card(mode){'))),context);
  const n=actual.E.length-1;
  for(const [level,votes,phrase] of [[1/3,26,'1 more member turn long (53%+)'],[2/3,31,'1 more member turn long (63%+)'],[0,30,'1 more member turn long (above 60%)']]){
    actual.E[n]=votes/50;actual.lvl[n]=level;actual.inn[n]=level?1:0;
    for(const mode of ['spot','vt60','vt80']){
      const rendered=vm.runInContext(`card('${mode}')`,context);
      assert.ok(rendered.includes(phrase),phrase);
      assert.ok(!/undefined|NaN/.test(rendered));
      assert.ok(rendered.includes('27/50 and 32/50'));
    }
  }
  context.bars=[...f.bars,{time:Math.floor(Date.now()/1000/14400)*14400,open:1,high:1e9,low:1,close:1e9}];
  assert.equal(vm.runInContext('computeEnsemble(bars,funding).banded.spot.at(-1)',context),original);
  console.log('Production JS matches Python votes, levels and all three targets on '+f.bars.length+' bars; forming bar excluded; card thresholds/counts verified in all sizing modes.');
}
console.log('PASS: script syntax, exact thresholds, all 51 votes from each state, jumps, exits and prefix invariance.');
