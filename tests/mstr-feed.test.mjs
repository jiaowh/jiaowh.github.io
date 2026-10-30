import assert from 'node:assert/strict';
import {fetchStock,mergeStock,sessionClose} from '../.github/scripts/mstr_feed.mjs';

// The observed Oct 15 failure: Yahoo revised Oct 14's opening by $0.056 overnight.
const time=Date.UTC(2026,9,14,13,30)/1000,now=Date.UTC(2026,9,15,4,20)/1000;
const saved={time,open:149.70399475097656,high:152,low:148,close:150,closeTime:sessionClose(time),complete:true};
const corrected={...saved,open:149.75999450683594};
assert.equal(mergeStock([saved],[corrected],now)[0].open,corrected.open);
assert.deepEqual(saved.open,149.70399475097656); // Do not mutate the cached input.
assert.equal(mergeStock([saved],[corrected],saved.closeTime+86401)[0].open,corrected.open);
assert.equal(mergeStock([saved],[{...corrected,open:150}],now)[0].open,150);
assert.throws(()=>mergeStock([saved],[{...corrected,high:153}],now),/history changed/);
assert.throws(()=>mergeStock([saved],[{...corrected,low:151}],now),/Invalid/);
assert.throws(()=>mergeStock([saved],[{...corrected,open:153}],now),/Invalid/);
assert.doesNotThrow(()=>mergeStock([saved],[{...saved,close:150.05}],now));
assert.throws(()=>mergeStock([saved],[{...saved,close:150.05}],saved.closeTime+86401),/history changed/);
// Oct 17 failure: a 0.13% opening-only correction exceeded the old 0.1% cap.
const fridayTime=Date.UTC(2026,9,16,13,30)/1000;
const friday={time:fridayTime,open:146.13999938964844,high:146.8300018310547,low:134.11000061035156,close:136.8300018310547,closeTime:sessionClose(fridayTime),complete:true};
const finalized={...friday,open:145.9499969482422};
const weekend=friday.closeTime+2*86400;
assert.equal(mergeStock([friday],[finalized],weekend)[0].open,finalized.open);
assert.throws(()=>mergeStock([friday],[{...finalized,close:136.9}],weekend),/history changed/);
const monday={...friday,time:friday.time+3*86400,closeTime:friday.closeTime+3*86400};
assert.throws(()=>mergeStock([friday,monday],[finalized],monday.closeTime+60),/history changed/);
const older={...saved,time:time-86400,closeTime:saved.closeTime-86400};
assert.throws(()=>mergeStock([older,saved],[{...older,open:corrected.open}],now),/history changed/);
const forming={...saved,time:time+86400,closeTime:saved.closeTime+86400,complete:false};
assert.equal(mergeStock([saved,forming],[corrected],forming.time+60)[0].open,corrected.open);
assert.doesNotThrow(()=>mergeStock([{...saved,complete:false}],[{...saved,high:160,close:159}],now));

const originalFetch=globalThis.fetch;
try {
  let splits={};
  globalThis.fetch=async()=>({ok:true,json:async()=>({chart:{result:[{
    meta:{symbol:'MSTR',currentTradingPeriod:{regular:{start:time}}},
    timestamp:[time],events:{splits},indicators:{quote:[{
      open:[corrected.open],high:[corrected.high],low:[corrected.low],close:[corrected.close]
    }]}
  }]}})});
  assert.equal((await fetchStock([saved],now))[0].open,corrected.open);
  splits={[time]:{numerator:10,denominator:1}};
  await assert.rejects(fetchStock([saved],now),/split detected/);
} finally {globalThis.fetch=originalFetch;}
// Oct 20: Yahoo returns the finalized Oct 19 O/H/L, but close is null.
// A verified completed cache is usable; a forming/new/conflicting bar is not.
try {
  let quotes={open:[saved.open],high:[saved.high],low:[saved.low],close:[null]};
  let regularStart=time;
  globalThis.fetch=async()=>({ok:true,json:async()=>({chart:{result:[{
    meta:{symbol:'MSTR',currentTradingPeriod:{regular:{start:regularStart}}},
    timestamp:[time],indicators:{quote:[quotes]}
  }]}})});
  assert.deepEqual(await fetchStock([saved],now),[saved]);
  await assert.rejects(fetchStock([older],now),/no matching completed candle/);
  await assert.rejects(fetchStock([{...saved,complete:false}],now),/no matching completed candle/);
  await assert.rejects(fetchStock([saved],saved.closeTime-1),/no matching completed candle/);
  quotes={...quotes,high:[saved.high+1]};
  await assert.rejects(fetchStock([saved],now),/no matching completed candle/);
  quotes={open:[null],high:[null],low:[null],close:[null]};
  await assert.rejects(fetchStock([saved],now),/no matching completed candle/);
  quotes={open:[saved.open],high:[saved.high],low:[saved.low],close:[null]};
  regularStart=time+86400;
  await assert.rejects(fetchStock([saved],regularStart+60),/current opening candle unavailable/);
  quotes={...quotes,close:[saved.close+.05]};regularStart=time;
  assert.equal((await fetchStock([saved],now))[0].close,saved.close+.05);
} finally {globalThis.fetch=originalFetch;}
console.log('PASS: missing close reuses only an exact matching completed candle; new, forming, conflicting and stale sessions remain blocked.');
console.log('PASS: both observed Yahoo opening revisions and weekend finalization recover; older history, invalid ranges, split events and material HLC revisions remain blocked.');

// Oct 28-30 recurring failures: Oct 27 open +$0.145 and low -$0.01,
// followed by a new Oct 29 session whose daily close is null.
const oct27=Date.UTC(2026,9,27,13,30)/1000,oct29=oct27+2*86400;
const prior={time:oct27,open:139.93499755859375,high:142,low:138.6999969482422,close:141.39999389648438,closeTime:sessionClose(oct27),complete:true};
const revised={...prior,open:140.0800018310547,low:138.69000244140625};
const catchup=Date.UTC(2026,9,30,1)/1000;
assert.deepEqual(mergeStock([prior],[revised],catchup),[revised]);
assert.equal(mergeStock([prior],[{...revised,close:141.4}],catchup)[0].close,141.4);
assert.throws(()=>mergeStock([prior],[{...revised,close:141.41}],catchup),/history changed/);
assert.throws(()=>mergeStock([prior],[{...revised,low:138.6}],catchup),/history changed/);
assert.throws(()=>mergeStock([prior],[{...revised,close:141.45}],catchup),/history changed/);
assert.throws(()=>mergeStock([prior,{...revised,time:oct29,closeTime:sessionClose(oct29)}],[revised],catchup),/history changed/);
try {
  const baseMeta={symbol:'MSTR',regularMarketTime:sessionClose(oct29),regularMarketPrice:141.62,
    currentTradingPeriod:{regular:{start:oct29,end:sessionClose(oct29)}}};
  const baseQuotes={open:[revised.open,139.60000610351562,141.4219970703125],
    high:[142,145.3000030517578,144.75999450683594],low:[revised.low,138.6699981689453,138.8800048828125],
    close:[prior.close,145.16000366210938,null]};
  let meta=structuredClone(baseMeta),quotes=structuredClone(baseQuotes),splits={};
  globalThis.fetch=async()=>({ok:true,json:async()=>({chart:{result:[{
    meta,timestamp:[oct27,oct27+86400,oct29],events:{splits},indicators:{quote:[quotes]}
  }]}})});
  const recovered=await fetchStock([prior],catchup);
  assert.equal(recovered.length,3);
  assert.deepEqual(recovered[0],revised);
  assert.equal(recovered.at(-1).close,141.62);
  assert.equal(recovered.at(-1).complete,true);
  assert.equal(prior.open,139.93499755859375);
  // A forming cache can be completed from the verified closing quote, not itself.
  const formingLast={...recovered.at(-1),close:140,complete:false};
  assert.equal((await fetchStock([revised,formingLast],catchup)).at(-1).close,141.62);
  for(const bad of [
    {regularMarketTime:sessionClose(oct29)-1}, // intraday quote
    {regularMarketTime:sessionClose(oct29)+60}, // after hours
    {regularMarketTime:sessionClose(oct29)-86400}, // stale quote
    {regularMarketPrice:null},{regularMarketPrice:Infinity},{regularMarketPrice:200},
    {currentTradingPeriod:{regular:{start:oct27,end:sessionClose(oct27)}}},
    {currentTradingPeriod:{regular:{start:oct29,end:sessionClose(oct29)+3600}}}
  ]){
    meta={...structuredClone(baseMeta),...bad};
    await assert.rejects(fetchStock([prior],catchup),/missing prices/);
  }
  meta=structuredClone(baseMeta);
  await assert.rejects(fetchStock([prior],sessionClose(oct29)-1),/missing prices/);
  quotes={...baseQuotes,high:[142,145.3000030517578,null]};
  await assert.rejects(fetchStock([prior],catchup),/missing prices/);
  // A non-null daily close takes precedence over metadata.
  quotes={...baseQuotes,close:[prior.close,145.16000366210938,141.63]};
  assert.equal((await fetchStock([prior],catchup)).at(-1).close,141.63);
  splits={[oct29]:{numerator:10,denominator:1}};
  await assert.rejects(fetchStock([prior],catchup),/split detected/);
} finally {globalThis.fetch=originalFetch;}
console.log('PASS: Oct 27-29 catch-up recovers; same-session closing quote required; stale/intraday/after-hours/out-of-range quotes and material revisions rejected.');
