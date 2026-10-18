// Relative volume-at-risk proxy, not observed positions or liquidation notional.
// Klines do not reveal leverage, entries, margin mode or whether trades open/close.
(function(root){
  'use strict';
  const seconds={'5m':300,'15m':900,'1h':3600,'4h':14400};
  const RANGES={'24h':{interval:'5m',limit:288},'48h':{interval:'5m',limit:576},'7d':{interval:'15m',limit:672},'1mo':{interval:'1h',limit:720},'3mo':{interval:'4h',limit:540}};
  function validate(data,step,now,count){
    const bars=[...new Map(data.map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time).filter(b=>b.time+step<=now).slice(-count);
    if(bars.length<count)throw Error('Insufficient history');
    for(let i=0;i<bars.length;i++){
      const b=bars[i];
      if(!['time','high','low','close','vol','buy'].every(k=>Number.isFinite(b[k]))||b.low<=0||b.high<b.low||b.close<b.low||b.close>b.high||b.vol<0||b.buy<0||b.buy>b.vol*1.000001)throw Error('Invalid candle');
      if(i&&b.time-bars[i-1].time!==step)throw Error('History has gaps');
    }
    if(now-(bars.at(-1).time+step)>=step)throw Error('Stale candles');
    return bars;
  }
  async function fetchHistory(rg,{now=Date.now()/1000,request=fetch}={}){
    const step=seconds[rg.interval],warm=Math.ceil(7*86400/step),count=rg.limit+warm;
    const sources=[{name:'Binance perp',split:'taker-flow proxy',base:'https://fapi.binance.com/fapi/v1/klines'},
      {name:'Bybit perp',split:'50/50 side assumption',base:'https://api.bybit.com/v5/market/kline'}];
    const failures=[];
    for(const source of sources){
      try{
        let end=Math.floor(now/step)*step*1000-1;const all=[];
        while(all.length<count){
          const limit=Math.min(1000,count-all.length),bybit=source.name.startsWith('Bybit');
          const params=new URLSearchParams(bybit?{category:'linear',symbol:'BTCUSDT',interval:String(step/60),limit,end}:{symbol:'BTCUSDT',interval:rg.interval,limit,endTime:end});
          const response=await request(source.base+'?'+params,{signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw Error('HTTP '+response.status);
          const payload=await response.json(),rows=bybit?payload.result?.list:payload;
          if(bybit&&payload.retCode!==0)throw Error('Exchange error');
          if(!Array.isArray(rows)||!rows.length)throw Error('Empty history');
          const page=rows.map(k=>({time:+k[0]/1000,high:+k[2],low:+k[3],close:+k[4],vol:+k[bybit?6:7],buy:bybit?+k[6]/2:+k[10]}));
          const next=Math.min(...page.map(b=>b.time))*1000-1;
          if(next>=end)throw Error('History did not advance');
          all.push(...page);end=next;
        }
        return {src:source.name,split:source.split,data:validate(all,step,now,count),warm,step};
      }catch(e){failures.push(source.name+': '+e.message);}
    }
    throw Error(failures.join('; '));
  }
  function build(data,{bins=200,lo,hi,tiers,start=0,halfLife=3*86400}={}){
    if(!(hi>lo)||!Number.isInteger(bins)||bins<1||!(halfLife>0))throw Error('Invalid grid');
    const long=new Float64Array(bins),short=new Float64Array(bins),grid=[],width=(hi-lo)/bins;
    const price=b=>lo+(b+.5)*width;
    function add(book,center,amount,close,isLong){
      // A bounded uncertainty band around an assumed entry/leverage, conserving
      // volume. Do not clamp out-of-view prices into bright edge artefacts.
      const radius=center*.0015,points=[];let total=0;
      for(let b=Math.max(0,Math.floor((center-radius-lo)/width));b<=Math.min(bins-1,Math.floor((center+radius-lo)/width));b++){
        const p=price(b);if(isLong?p>=close:p<=close)continue;
        const overlap=Math.max(0,Math.min(lo+(b+1)*width,center+radius)-Math.max(lo+b*width,center-radius));
        if(overlap){points.push([b,overlap]);total+=overlap;}
      }
      // Fraction outside the visible price window is intentionally excluded.
      const denom=Math.max(2*radius,total);
      for(const [b,w] of points)book[b]+=amount*w/denom;
    }
    for(let i=0;i<data.length;i++){
      const c=data[i],decay=i?Math.pow(.5,(c.time-data[i-1].time)/halfLife):1;
      for(let b=0;b<bins;b++){
        long[b]*=decay;short[b]*=decay;
        // Directional sweep also clears levels jumped over by a price gap.
        if(lo+(b+1)*width>=c.low)long[b]=0;
        if(lo+b*width<=c.high)short[b]=0;
      }
      for(const t of tiers){add(long,c.close*(1-1/t.L),c.buy*t.w,c.close,true);add(short,c.close*(1+1/t.L),Math.max(0,c.vol-c.buy)*t.w,c.close,false);}
      if(i>=start)grid.push(Float64Array.from(long,(v,b)=>v+short[b]));
    }
    return {grid,long,short};
  }
  const api={RANGES,seconds,validate,fetchHistory,build};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.LiquidationModel=api;
})(globalThis);
