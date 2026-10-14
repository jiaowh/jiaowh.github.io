// BTC fast + Vortex timing, with the BTC/MSTR joint SMA200 cash override.
// Daily stock opening execution, matching the principal research comparison.
import {calculate,advance,newState,H4,DAY} from './fast-strategy.mjs';
export const STRATEGY='mstr-btc-vortex-joint200-daily-v1';
export const START=Date.UTC(2023,0,1)/1000;
export const stamp=t=>new Date(t*1000).toISOString().slice(0,16).replace('T',' ')+' UTC';
export const tradeText=t=>`MSTR ${t.side.toUpperCase()} · $${t.price.toLocaleString('en-US',{maximumFractionDigits:2})}\n${stamp(t.time)}`;
export const dailyText=r=>`MSTR breadth ${Math.round(r.breadth*100)}% · ${stamp(r.closeTime)}`;
export const calculateBTC=(input,indicators,now)=>calculate(input,indicators,now,{vortex:true});

// Latest information strictly before an opening; never use that session's close.
export function before(rows,time,key='closeTime') {
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid][key]<time)lo=mid+1;else hi=mid;}
  return rows[lo-1];
}
export function stockRegimes(raw,now=Date.now()/1000) {
  let sum=0,gate=false,up=0,down=0;
  return raw.filter(b=>b.closeTime<=now).map((b,i,a)=>{
    sum+=b.close;if(i>=200)sum-=a[i-200].close;
    const ma=i>=199 ? sum/200 : NaN;
    up=b.close>ma*1.02 ? up+1 : 0;down=b.close<ma*.98 ? down+1 : 0;
    if(down>=2)gate=false;else if(up>=2)gate=true;
    return {...b,ma,gate};
  });
}
export function replay(btcRaw,btcRows,stockRaw,{start=START,until=Infinity,now=Date.now()/1000}={}) {
  btcRows=btcRows.filter(r=>r.closeTime<=now);
  btcRaw=btcRaw.filter(r=>r.time<=now);
  const btcState=newState(start),btcTrades=advance(btcState,btcRows,btcRaw,{notify:false,until});
  const regimes=stockRegimes(stockRaw,now),trades=[],sessions=[];
  let holding=true;
  for(const b of stockRaw) {
    if(b.time<start||b.time>=until||b.time>now)continue;
    const btc=before(btcRows,b.time),stock=before(regimes,b.time),target=before(btcTrades,b.time,'time');
    // Require the most recent scheduled BTC close; stop before any missing history.
    if(!btc||b.time-btc.closeTime>H4)break;
    if(!stock||!Number.isFinite(stock.ma))throw Error('MSTR SMA200 history unavailable');
    const gate=btc.gate||stock.gate,want=(!target||target.side==='buy')&&gate;
    if(want!==holding){holding=want;trades.push({side:want?'buy':'sell',time:b.time,price:b.open,reason:gate?'BTC target':'joint SMA200'});}
    sessions.push({...b,ma:stock.ma,gate,breadth:btc.breadth,holding});
  }
  return {trades,sessions,holding,btcState,regimes};
}
export function alertState(result,rows,now,prior=null) {
  const last=rows.at(-1);
  if(!last||!Number.isFinite(last.breadth)||now-last.closeTime>=H4)throw Error('MSTR BTC feed is stale');
  const fresh=prior?.strategy!==STRATEGY;
  const state=fresh ? {strategy:STRATEGY,lastOpen:0,lastDaily:0,outbox:[]} : structuredClone(prior);
  if(!Array.isArray(state.outbox)||!Number.isFinite(state.lastOpen)||!Number.isFinite(state.lastDaily))throw Error('Invalid MSTR state');
  const session=result.sessions.at(-1);
  if(!session)throw Error('MSTR sessions unavailable');
  if(session.time<state.lastOpen)throw Error('MSTR history predates state');
  if(!fresh)for(const t of result.trades)if(t.time>state.lastOpen)state.outbox.push({id:`mstr:trade:${t.time}:${t.side}`,text:tradeText(t)});
  for(const r of rows)if(r.closeTime%DAY===0&&r.closeTime>state.lastDaily&&(!fresh||now-r.closeTime<H4)){
    state.outbox.push({id:`mstr:daily:${r.closeTime}`,text:dailyText(r)});
  }
  state.lastOpen=session.time;state.lastDaily=last.closeTime;state.holding=result.holding;
  return state;
}
