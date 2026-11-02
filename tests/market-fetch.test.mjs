import assert from 'node:assert/strict';
import {fetchMarketJSON} from '../.github/scripts/market_fetch.mjs';

async function scenario(sequence){
  const waits=[],signals=[];let calls=0;
  const result=await fetchMarketJSON('https://market.example/prices',{
    sleep:async ms=>waits.push(ms),fetchImpl:async(url,options)=>{
      assert.equal(options.method,undefined); // GET only, no delivery retry.
      signals.push(options.signal);calls++;
      const next=sequence.shift();if(next instanceof Error)throw next;
      return next;
    }
  }).then(value=>({value}),error=>({error}));
  return {...result,waits,signals,calls};
}
const ok=()=>({ok:true,json:async()=>({price:123})});
const http=(status,after)=>({ok:false,status,headers:{get:()=>after}});
let r=await scenario([new TypeError('network unavailable'),http(503),ok()]);
assert.deepEqual(r.value,{price:123});assert.equal(r.calls,3);assert.deepEqual(r.waits,[2000,5000]);
assert.equal(new Set(r.signals).size,3); // A fresh timeout for each attempt.
r=await scenario([http(429,'8'),ok()]);assert.deepEqual(r.waits,[8000]);assert.equal(r.calls,2);
r=await scenario([http(429,'120'),ok()]);assert.equal(r.calls,1);assert.match(r.error.message,/429/);
r=await scenario([http(403),ok()]);assert.equal(r.calls,1);assert.match(r.error.message,/403/);
r=await scenario([new DOMException('timeout','TimeoutError'),ok()]);assert.equal(r.calls,2);
r=await scenario([{ok:true,json:async()=>{throw new SyntaxError('truncated JSON');}},ok()]);assert.equal(r.calls,2);
r=await scenario([http(502),http(503),http(504)]);assert.equal(r.calls,3);assert.match(r.error.message,/504/);
r=await scenario([new Error('programming error'),ok()]);assert.equal(r.calls,1);
r=await scenario([{ok:true,json:async()=>({bad:'data'})}]);assert.equal(r.calls,1);assert.deepEqual(r.value,{bad:'data'});
console.log('PASS: transient market reads retry with fresh timeouts; permanent failures, long rate limits and application data are not silently retried.');
