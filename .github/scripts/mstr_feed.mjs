// Same split-adjusted daily source as the research; no cross-provider fallback.
import {fetchMarketJSON} from './market_fetch.mjs';
export function sessionClose(time) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date(time*1000)).map(p=>[p.type,p.value]));
  const y=+parts.year,m=+parts.month,d=+parts.day,date=new Date(Date.UTC(y,m-1,d));
  const nov1=new Date(Date.UTC(y,10,1)),thanksgiving=1+(4-nov1.getUTCDay()+7)%7+21;
  const half=(m===11&&d===thanksgiving+1)||(m===7&&d===3&&date.getUTCDay()>=1&&date.getUTCDay()<=4)||(m===12&&d===24&&date.getUTCDay()>=1&&date.getUTCDay()<=4);
  return time+(half?3.5:6.5)*3600;
}
export function mergeStock(saved,incoming,now) {
  const map=new Map(saved.map(b=>[b.time,b]));
  const latestClosed=saved.reduce((t,b)=>b.closeTime<=now&&b.complete!==false?Math.max(t,b.time):t,-Infinity);
  for(const b of incoming){
    if(b.time>now)continue;
    if(![b.time,b.open,b.high,b.low,b.close,b.closeTime].every(Number.isFinite)||Math.min(b.open,b.high,b.low,b.close)<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)||b.closeTime<=b.time)throw Error('Invalid MSTR candle');
    const old=map.get(b.time);
    const fields=['open','high','low','close'];
    if(old&&old.closeTime<=now&&old.complete!==false){
      if(b.closeTime!==old.closeTime)throw Error('MSTR completed session timing changed');
      // Completed candles are observations used by the live model, not a mirror
      // of later Yahoo edits. O/H/L revisions cannot change our close-based gate.
      // Retain the original candle (and modeled fill price) instead of accepting
      // revised prices or repeatedly widening arbitrary cent limits. Float32 vs
      // decimal close roundoff is not a changed closing price.
      const sameClose=Math.abs(old.close-b.close)<=Math.max(1e-6,Math.abs(old.close)*1e-7);
      if(sameClose){
        if(['open','high','low'].some(k=>Math.abs(old[k]-b[k])>.021))
          console.warn(`MSTR retained verified candle ${new Date(b.time*1000).toISOString()}; source revised O/H/L with unchanged close`);
        continue;
      }
    }
    // Actual close revisions retain the existing latest-session, age and size
    // limits. Split detection and candle validation also remain mandatory.
    if(old&&old.closeTime<=now&&old.complete!==false&&fields.some(k=>Math.abs(old[k]-b[k])>.021)){
      const small=now-old.closeTime<=86400&&fields.every(k=>Math.abs(old[k]-b[k])<=Math.max(.021,old[k]*.001));
      const changes=fields.filter(k=>old[k]!==b[k]).map(k=>`${k} ${old[k]} -> ${b[k]}`).join(', ');
      if(old.time!==latestClosed||!small)throw Error(`MSTR history changed at ${new Date(b.time*1000).toISOString()} (${changes}); review split/source before updating`);
      console.warn(`MSTR recent-session correction ${new Date(b.time*1000).toISOString()}: ${changes}`);
    }
    map.set(b.time,{...b,complete:b.closeTime<=now});
  }
  return [...map.values()].sort((a,b)=>a.time-b.time);
}
export async function fetchStock(saved,now) {
  const start=Math.floor(saved.at(-1).time-7*86400),end=Math.floor(now);
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/MSTR?period1=${start}&period2=${end}&interval=1d&includePrePost=false&events=splits`;
  const payload=await fetchMarketJSON(url,{headers:{'User-Agent':'Mozilla/5.0'}}),r=payload.chart?.result?.[0],q=r?.indicators?.quote?.[0];
  if(r?.meta?.symbol!=='MSTR'||!q||!r.timestamp?.length)throw Error('Invalid MSTR feed response');
  if(Object.keys(r.events?.splits||{}).length)throw Error('MSTR split detected; rebuild adjusted history before resuming');
  const regular=r.meta.currentTradingPeriod?.regular;
  const savedByTime=new Map(saved.map(b=>[b.time,b]));
  const incoming=r.timestamp.flatMap((time,i)=>{
    if(time>now)return [];
    const values=['open','high','low','close'].map(k=>q[k][i]);
    // A null daily close can coexist with Yahoo's valid same-session closing quote.
    // Use it only at the exact regular-session end, never an intraday/after-hours
    // price or another session's quote. Normal merge/revision guards still apply.
    if(values[3]===null&&values.slice(0,3).every(Number.isFinite)&&
        regular?.start===time&&regular.end===sessionClose(time)&&now>=regular.end&&
        r.meta.regularMarketTime===regular.end&&Number.isFinite(r.meta.regularMarketPrice)&&
        r.meta.regularMarketPrice>0&&r.meta.regularMarketPrice>=values[2]&&r.meta.regularMarketPrice<=values[1]){
      values[3]=r.meta.regularMarketPrice;
      console.warn(`MSTR daily close omitted at ${new Date(time*1000).toISOString()}; used Yahoo quote timestamped at regular-session close`);
    }
    if(values.some(v=>!Number.isFinite(v))){
      // Yahoo sometimes blanks the close of an already finalized session (Oct 20).
      // Reuse that exact completed candle if its verified close still fits the
      // returned range. O/H/L may have been revised since it was saved.
      // Never finalize an intraday cache or invent a price for a new session.
      const old=savedByTime.get(time);
      if(values[3]===null&&values.slice(0,3).every(Number.isFinite)&&
          old?.complete===true&&old.closeTime<=now&&old.closeTime===sessionClose(time)&&
          Number.isFinite(old.close)&&values[2]>0&&values[0]>=values[2]&&values[0]<=values[1]&&
          old.close>=values[2]&&old.close<=values[1]){
        console.warn(`MSTR source omitted close at ${new Date(time*1000).toISOString()}; retained matching completed candle`);
        return [{...old}];
      }
      throw Error(`MSTR session has missing prices at ${new Date(time*1000).toISOString()}; no matching completed candle`);
    }
    return [{time,open:values[0],high:values[1],low:values[2],close:values[3],closeTime:sessionClose(time)}];
  });
  if(!incoming.length||incoming.at(-1).time<saved.at(-1).time)throw Error('MSTR feed is behind saved history');
  // During/after an announced regular session, require that session's opening candle.
  if(regular?.start<=now&&now-regular.start<86400&&incoming.at(-1).time<regular.start)throw Error('MSTR current opening candle unavailable');
  return mergeStock(saved,incoming,now);
}
