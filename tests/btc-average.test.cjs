// Run: node tests/btc-average.test.cjs [research fixture.json]
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../btc.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // The live page still parses after retiring Average.
const legacy=fs.readFileSync(require('node:path').join(__dirname,'../research/btc-bull-accumulation-2026/legacy-average.js'),'utf8');
new vm.Script(legacy);
const context=vm.createContext({localStorage:{getItem:()=>null},Date});
vm.runInContext('const DAY=86400;'+script.slice(script.indexOf('function ema('),script.indexOf('// ---------- RSI'))+
  legacy.slice(legacy.indexOf('const ENS_TF='),legacy.indexOf('// Archived card template')),context);
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
// Display confirmation must wait for two COMPLETE daily closes, never an intraday low.
const start=Date.parse('2024-01-01')/1000;
const dailyBars=Array.from({length:52*6},(_,i)=>({time:start+i*14400,open:100,high:101,low:50,close:i<50*6?100:90}));
function risk(bars){context.riskBars=bars;return vm.runInContext('(()=>{const d=ensGroup(riskBars,DAY);return ensRiskContext(riskBars,d.bars,d.ends);})()',context);}
assert.equal(risk(dailyBars.slice(0,51*6-1)).below50.at(-1),0); // forming first down day
assert.equal(risk(dailyBars.slice(0,51*6)).below50.at(-1),1);
assert.equal(risk(dailyBars.slice(0,52*6-1)).below50.at(-1),1); // second day still forming
assert.equal(risk(dailyBars).below50.at(-1),2);
assert.ok(Number.isNaN(risk(dailyBars.filter((_,i)=>i!==50*6+2)).below50.at(-1))); // missing 4h bar
assert.ok(Number.isNaN(risk(dailyBars.filter((_,i)=>i<50*6||i>=51*6)).below50.at(-1))); // missing whole day
const fullRisk=risk(dailyBars);
for(const end of [49*6,50*6,51*6,52*6-1]){
  const prefix=risk(dailyBars.slice(0,end));
  for(const k of ['sma50','below50','dailyTime'])assert.deepEqual(Array.from(prefix[k]),Array.from(fullRisk[k].slice(0,end)));
}
// Distinguish a skipped reduction from a changed target, and stale from fresh funding.
const now=Date.now()/1000;
context.warningR={t:[now-28800,now-14400],E:[.7,.58],inn:[1,1],lvl:[1,2/3],members:Array(50).fill({}),
  f14:[.32,.32],fundLast:now,banded:{spot:[2/3,2/3]},pos:{spot:[2/3,.44]},
  risk:{sma50:[65000,65000],below50:[1,2],dailyTime:[start,start+86400]}};
const warningCard=()=>vm.runInContext('ensRiskCard(warningR,"spot")',context);
assert.match(warningCard(),/Reduction skipped by band/);
assert.match(warningCard(),/Confirmed trend damage/);
assert.match(warningCard(),/Elevated crowding/);
assert.match(warningCard(),/cannot verify your trades/);
context.warningR.fundLast=now-10*3600;
assert.match(warningCard(),/Stale funding reading/);
context.warningR.f14=[NaN,NaN];
assert.match(warningCard(),/Funding unavailable/);
assert.doesNotMatch(warningCard(),/undefined|NaN/);
context.warningR.pos.spot[1]=context.warningR.banded.spot[1]=1/3;
assert.match(warningCard(),/Target reduced/);
context.warningR.pos.spot[1]=context.warningR.banded.spot[1]=0;
assert.match(warningCard(),/Flat target/);
context.warningR.E[1]=.64;
assert.match(warningCard(),/Price weakness only/);
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
  // Real correction snapshots: blocked March trim and February's confirmed trend damage.
  const at=s=>actual.t.indexOf(Date.parse(s)/1000-14400);
  assert.equal(actual.risk.below50[at('2025-02-06')],2);
  assert.ok(actual.E[at('2025-02-06')]<.6);
  const march=at('2024-03-23');
  assert.ok(actual.pos.vt60[march]<actual.banded.vt60[march]);
  assert.equal(actual.banded.vt60[march],actual.banded.vt60[march-1]);
  const original=actual.banded.spot.at(-1);
  // Exercise the real card template at each buffered recovery and entry boundary.
  context.R=actual;
  vm.runInContext('const FAMS=Object.keys(ENS_FAM);const fx=x=>x.toFixed(2)+"×";const tstr=t=>new Date(t*1000).toISOString();'+
    legacy.slice(legacy.indexOf('  function card(mode){')),context);
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
  console.log('Archived Average JS matches Python votes, levels and all three targets on '+f.bars.length+' bars; forming bar excluded; card thresholds/counts verified in all sizing modes.');
}
console.log('PASS: script syntax, exact thresholds, all 51 votes from each state, jumps, exits and prefix invariance.');
console.log('PASS: risk confirmation uses complete consecutive days; gaps, forming days, causal prefixes, skipped targets and stale funding covered.');
// The accumulation objective counts BTC available after converting ALL ending cash.
context.sale=100000;context.fee=.001;context.gain=.01;
const buyback=vm.runInContext('accumulationBuybackPrice(sale,fee,gain)',context);
assert.ok(Math.abs((100000*(1-.001))/(buyback*(1+.001))-1.01)<1e-12);
assert.equal(vm.runInContext('accumulationBuybackPrice(100000,0,0)',context),100000);
const audit=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../assets/btc/accumulation-audit.json'),'utf8'));
for(const w of Object.values(audit.windows)){
  assert.equal(w.rows.hold.btc,1);
  assert.equal(w.rows.hold.cash,0);
  assert.ok(Math.abs(w.rows.core80.btc-(.8+.2*w.rows.legacy.btc))<1e-12);
  assert.ok(Math.abs(w.rows.legacy.curve.at(-1)[1]-w.rows.legacy.btc)<1e-6);
}
assert.ok(Math.abs(audit.windows.bull.rows.legacy.btc-.6783256696732558)<1e-9);
assert.ok(audit.windows.earlier.rows.legacy.btc>1);
assert.ok(audit.fees['0.006'].legacy<audit.fees['0.001'].legacy);
assert.ok(Math.abs(audit.windows.ytd2026.rows.legacy.btc-1.2178563065561496)<1e-9);
assert.ok(Math.abs(audit.windows.extended.rows.legacy.btc-.8277571494010092)<1e-9);
assert.ok(Math.abs(audit.windows.bull.rows.dip20.btc-1.0813821929)<1e-9);
assert.equal(audit.windows.ytd2026.rows.dip20.btc,1);
assert.equal(audit.windows.ytd2026.rows.dip20.trades,0);
assert.ok(audit.windows.oldbull.rows.dip20.btc<1);
assert.ok(audit.windows.extended.rows.dip20.usdDD<-.5);
for(const w of Object.values(audit.windows)){
  assert.ok(w.rows.dip20.units>=.8);
  assert.ok(Math.abs(w.rows.dip20.curve.at(-1)[1]-w.rows.dip20.btc)<1e-6);
}
for(const [key,window] of [['2023-25','bull'],['2026 YTD','ytd2026'],['2023-26','extended']]){
  const r=audit.extension.originalAttribution[key];
  assert.ok(Math.abs(1+r.cashTimingBTC-r.tradingFeesBTC-r.terminalFeeBTC-audit.windows[window].rows.legacy.btc)<1e-9);
}
console.log('PASS: BTC benchmark stays at 1, initial/final fees match audit, core sleeve identity and buyback hurdle verified.');
console.log('PASS: 2026 and continuous results, attribution identities, sleeve core, no-trade window and older-bull failure retained.');
