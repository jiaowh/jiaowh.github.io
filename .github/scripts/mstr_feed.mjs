// Same split-adjusted daily source as the research; no cross-provider fallback.
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
    // Yahoo can finalize the latest session's opening price overnight/weekends.
    // An open-only correction inside the unchanged daily range cannot change our
    // close-based SMA regime or BTC-based decisions. Keep the time/size limits for
    // other OHLC revisions, and reject revisions to older completed sessions.
    const fields=['open','high','low','close'];
    if(old&&old.closeTime<=now&&old.complete!==false&&fields.some(k=>Math.abs(old[k]-b[k])>.021)){
      const openOnly=b.closeTime===old.closeTime&&['high','low','close'].every(k=>Math.abs(old[k]-b[k])<=1e-6)&&b.open>=old.low&&b.open<=old.high;
      const small=now-old.closeTime<=86400&&fields.every(k=>Math.abs(old[k]-b[k])<=Math.max(.021,old[k]*.001));
      const changes=fields.filter(k=>old[k]!==b[k]).map(k=>`${k} ${old[k]} -> ${b[k]}`).join(', ');
      if(old.time!==latestClosed||(!openOnly&&!small))throw Error(`MSTR history changed at ${new Date(b.time*1000).toISOString()} (${changes}); review split/source before updating`);
      console.warn(`MSTR recent-session ${openOnly?'opening-price ':''}correction ${new Date(b.time*1000).toISOString()}: ${changes}`);
    }
    map.set(b.time,{...b,complete:b.closeTime<=now});
  }
  return [...map.values()].sort((a,b)=>a.time-b.time);
}
export async function fetchStock(saved,now) {
  const start=Math.floor(saved.at(-1).time-7*86400),end=Math.floor(now);
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/MSTR?period1=${start}&period2=${end}&interval=1d&includePrePost=false&events=splits`;
  const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`MSTR feed HTTP ${response.status}`);
  const payload=await response.json(),r=payload.chart?.result?.[0],q=r?.indicators?.quote?.[0];
  if(r?.meta?.symbol!=='MSTR'||!q||!r.timestamp?.length)throw Error('Invalid MSTR feed response');
  if(Object.keys(r.events?.splits||{}).length)throw Error('MSTR split detected; rebuild adjusted history before resuming');
  const incoming=r.timestamp.flatMap((time,i)=>{
    if(time>now)return [];
    const values=['open','high','low','close'].map(k=>q[k][i]);
    if(values.some(v=>!Number.isFinite(v)))throw Error('MSTR session has missing prices');
    return [{time,open:values[0],high:values[1],low:values[2],close:values[3],closeTime:sessionClose(time)}];
  });
  if(!incoming.length||incoming.at(-1).time<saved.at(-1).time)throw Error('MSTR feed is behind saved history');
  // During/after an announced regular session, require that session's opening candle.
  const regular=r.meta.currentTradingPeriod?.regular;
  if(regular?.start<=now&&now-regular.start<86400&&incoming.at(-1).time<regular.start)throw Error('MSTR current opening candle unavailable');
  return mergeStock(saved,incoming,now);
}
