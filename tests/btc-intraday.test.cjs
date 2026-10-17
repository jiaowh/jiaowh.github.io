const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../btc.html'),'utf8');
const math=src.slice(src.indexOf('function ema('),src.indexOf('// =================================================================',src.indexOf('function scalpTrades(')));
const api=new Function(math+'\nreturn {scalpFrame,impulseMACD,scalpTrades,setScan:fn=>{scalpScan=fn;}};')();
const B=Array.from({length:1500},(_,i)=>({time:i*300,open:100+i*.01,high:102+i*.01+Math.sin(i/11),low:98+i*.01+Math.sin(i/11),close:100+i*.01+Math.sin(i/11)}));
for(const length of [14,21,34])for(const signal of [9,13]){
  const frame=api.scalpFrame(B,300,{length,signal}),want=api.impulseMACD(B,length,signal);
  assert.deepEqual(frame.md,want.md);assert.deepEqual(frame.sb,want.sb);
  const prefix=api.scalpFrame(B.slice(0,1250),300,{length,signal});
  assert.deepEqual(prefix.turns,frame.turns.filter(t=>t.confirm<1250));
}
const f={n:5,barSecs:300,t:[0,300,600,900,1200],o:[100,105,104,106,103],h:[101,130,107,108,109],l:[90,80,100,101,102],cl:[100,106,106,107,108],atr:[1,1,1,1,1]};
api.setScan(()=>[{dir:'long',confirmI:0,dotI:0},{dir:'long',confirmI:0,dotI:0},{dir:'long',confirmI:1,dotI:1}]);
let t=api.scalpTrades(f,{},undefined,{sl_pad_atr:0,tp_r:1.5,time_stop:2});
assert.equal(t.length,2);assert.equal(t[0].entry,105);assert.equal(t[0].entryI,1);assert.equal(t[0].exitI,1);assert.equal(t[0].exitPx,90); // stop first on entry-bar double touch
assert.equal(t[1].entryI,2);assert.equal(t[1].exitI,3);assert.equal(t[1].why,'time'); // two actual holding bars
assert.ok(Math.abs(t[0].net-100*(90*.9988/(105*1.0012)-1))<1e-12);
const gap={...f,o:[100,85,104,106,103]};
t=api.scalpTrades(gap,{},undefined,{sl_pad_atr:0});assert.equal(t.length,1);assert.equal(t[0].entryI,2); // invalid next-open stop skipped
api.setScan(()=>[{dir:'long',confirmI:0,dotI:0}]);
t=api.scalpTrades({...f,h:[101,110,107,108,109],l:[90,99,80,101,102],o:[100,105,85,106,103]},{});
assert.equal(t[0].exitPx,85); // stop gaps fill at worse open
console.log('PASS: all six iMACD settings, causal turns, next-open entry, no overlapping positions, same-bar stop priority, stop gaps, invalid entry and exact fees.');
