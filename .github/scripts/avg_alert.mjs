// GitHub Actions Telegram runner. Only daily breadth and model BUY/SELL alerts.
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadIndicators} from './btc_indicators.mjs';
import {STRATEGY,LEGACY_STRATEGY,EQUAL_TIMEFRAME_WEIGHTS,H4,calculate,bootstrap,advance,drain,migrateLegacy} from './btc_fast_strategy.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const STATE=process.env.STATE_FILE||resolve(ROOT,'.alert-state/fast.json');
const CANDLES=resolve(dirname(STATE),'candles.json'), DRY=process.env.DRY_RUN==='1';
function read(path) {return JSON.parse(readFileSync(path,'utf8'));}
function save(path,value) {
  mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path+'.tmp',JSON.stringify(value));renameSync(path+'.tmp',path);
}

export function mergeCandles(saved,incoming,now) {
  const m=new Map(saved.map(b=>[b.time,b]));
  for (const b of incoming) {
    if (b.time>Math.floor(now/H4)*H4) continue;
    if (![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)||b.time%H4!==0||
        Math.min(b.open,b.high,b.low,b.close)<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)) throw Error('Invalid candle');
    const prior=m.get(b.time);
    if (prior && ['open','high','low','close'].some(k=>Math.abs(prior[k]-b[k])>.02)) throw Error('Candle history mismatch');
    m.set(b.time,b);
  }
  const bars=[...m.values()].sort((a,b)=>a.time-b.time);
  for (let i=saved.length;i<bars.length;i++) if (bars[i].time!==bars[i-1].time+H4) throw Error('Missing new candle');
  const latest=Math.floor(now/H4)*H4;
  if (!m.has(latest-H4)||!m.has(latest)) throw Error('Feed is behind; current close/open required');
  return bars;
}

export async function candles(saved,now) {
  // Both endpoints serve Binance BTCUSDT. Do not silently change exchanges.
  for (const host of ['data-api.binance.vision','api.binance.com']) {
    try {
      let start=saved.at(-1).time*1000; const incoming=[];
      for (let page=0;page<100;page++) {
        const url=`https://${host}/api/v3/klines?symbol=BTCUSDT&interval=4h&startTime=${start}&endTime=${Math.floor(now*1000)}&limit=1000`;
        const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
        if (!r.ok) throw Error(`Candle feed HTTP ${r.status}`);
        const a=await r.json(); if (!Array.isArray(a)) throw Error('Invalid feed response');
        incoming.push(...a.map(k=>({time:+k[0]/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4]})));
        if (a.length<1000) return mergeCandles(saved,incoming,now);
        const next=+a.at(-1)[0]+H4*1000;
        if (next<=start) throw Error('Feed did not advance'); start=next;
      }
      throw Error('Catch-up limit exceeded');
    } catch(e) {console.error(host,e.message);}
  }
  throw Error('No verified fresh Binance candles');
}

async function send(text) {
  if (DRY) {console.log(text);return;}
  const r=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),
    body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text,disable_web_page_preview:true})});
  const result=await r.json();
  if (!r.ok||result.ok!==true) throw Error(`Telegram delivery failed (${r.status})`);
}

export async function main() {
  if (!DRY&&(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_CHAT_ID)) throw Error('Telegram secrets missing');
  const now=Date.now()/1000;
  const seed=read(resolve(ROOT,'assets/btc/signal-snapshot.json')).bars.map(([time,open,high,low,close])=>({time,open,high,low,close}));
  const saved=existsSync(CANDLES)?read(CANDLES):seed;
  const raw=process.env.CANDLES_FILE?mergeCandles(saved,read(process.env.CANDLES_FILE),now):await candles(saved,now);
  const indicators=loadIndicators(ROOT),rows=calculate(raw,indicators,now);
  if (!Number.isFinite(rows.at(-1)?.breadth)) throw Error('Insufficient indicator history');
  // Corrupt or unknown state fails closed. Only a missing cache bootstraps silently.
  let state=existsSync(STATE)?read(STATE):null;
  if (state) {
    if(![STRATEGY,LEGACY_STRATEGY].includes(state.strategy))throw Error('Unknown BTC strategy state');
    if (!Array.isArray(state.outbox)||!Number.isFinite(state.lastClose)||typeof state.holding!=='boolean'||
        (!state.holding&&(!(state.sale>0)||!Number.isFinite(state.saleTime)))) throw Error('Invalid strategy state');
    if (state.lastClose>rows.at(-1).closeTime) throw Error('Feed predates saved state');
    if(state.strategy===LEGACY_STRATEGY){
      const legacyRows=calculate(raw,indicators,now,{timeframeWeights:EQUAL_TIMEFRAME_WEIGHTS});
      state=migrateLegacy(state,legacyRows,rows,raw);
      console.log(`Adopted double-72h weights at ${new Date(state.migratedAt*1000).toISOString()}; carried position and unsent alerts.`);
    }else advance(state,rows,raw);
  } else {state=bootstrap(rows,raw);console.log('Initialized fast iMACD model; historical trade notifications suppressed.');}
  if (DRY) {await drain(state,send,()=>{});console.log(`Dry run: no persistent changes; ${STRATEGY}; model ${state.holding?'BTC':'cash'}.`);return;}
  save(CANDLES,raw.filter(b=>b.time+H4<=now));
  save(STATE,state); // persist the outbox before any external delivery
  await drain(state,send,s=>save(STATE,s));
  console.log(`Checked ${new Date(now*1000).toISOString()}; ${STRATEGY}; model ${state.holding?'BTC':'cash'}.`);
}

if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  // Operational errors go to Actions logs only, never Telegram.
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
}
