import assert from 'node:assert/strict';
import {fetchStock,mergeStock,sessionClose} from '../.github/scripts/mstr_feed.mjs';

// The observed Oct 15 failure: Yahoo revised Oct 14's opening by $0.056 overnight.
const time=Date.UTC(2026,9,14,13,30)/1000,now=Date.UTC(2026,9,15,4,20)/1000;
const saved={time,open:149.70399475097656,high:152,low:148,close:150,closeTime:sessionClose(time),complete:true};
const corrected={...saved,open:149.75999450683594};
assert.equal(mergeStock([saved],[corrected],now)[0].open,corrected.open);
assert.deepEqual(saved.open,149.70399475097656); // Do not mutate the cached input.
assert.throws(()=>mergeStock([saved],[corrected],saved.closeTime+86401),/history changed/);
assert.throws(()=>mergeStock([saved],[{...corrected,open:150}],now),/history changed/);
assert.throws(()=>mergeStock([saved],[{...corrected,high:153}],now),/history changed/);
assert.throws(()=>mergeStock([saved],[{...corrected,low:151}],now),/Invalid/);
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
console.log('PASS: overnight Yahoo correction recovers; old, large, invalid and split revisions remain blocked.');
