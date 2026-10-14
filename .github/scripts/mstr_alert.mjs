import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadIndicators} from './btc_indicators.mjs';
import {candles,mergeCandles} from './avg_alert.mjs';
import {fetchStock,mergeStock} from './mstr_feed.mjs';
import {calculateBTC,replay,alertState,STRATEGY} from '../../assets/btc/mstr-strategy.mjs';
import {drain,H4} from '../../assets/btc/fast-strategy.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),DRY=process.env.DRY_RUN==='1';
const STATE=process.env.MSTR_STATE_FILE||resolve(ROOT,'.alert-state/mstr.json');
const FEED=resolve(dirname(STATE),'mstr-candles.json'),SNAPSHOT=resolve(ROOT,'assets/btc/mstr-snapshot.json');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
function save(p,v){mkdirSync(dirname(p),{recursive:true});writeFileSync(p+'.tmp',JSON.stringify(v));renameSync(p+'.tmp',p);}
const unpack=bars=>bars.map(([time,open,high,low,close,closeTime,complete])=>({time,open,high,low,close,closeTime,complete:complete!==false}));
export async function main(){
  if(!DRY&&(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_CHAT_ID))throw Error('Telegram secrets missing');
  const now=Date.now()/1000,seed=read(resolve(ROOT,'assets/btc/signal-snapshot.json')).bars.map(([time,open,high,low,close])=>({time,open,high,low,close}));
  const btcPath=resolve(dirname(STATE),'candles.json'),saved=existsSync(btcPath)?read(btcPath):seed;
  const btcRaw=process.env.CANDLES_FILE?mergeCandles(saved,read(process.env.CANDLES_FILE),now):await candles(saved,now);
  const stockSaved=existsSync(FEED)?read(FEED):unpack(read(SNAPSHOT).bars);
  const stock=process.env.MSTR_CANDLES_FILE?mergeStock(stockSaved,unpack(read(process.env.MSTR_CANDLES_FILE).bars),now):await fetchStock(stockSaved,now);
  const rows=calculateBTC(btcRaw,loadIndicators(ROOT),now),result=replay(btcRaw,rows,stock,{now});
  const state=alertState(result,rows,now,existsSync(STATE)?read(STATE):null);
  if(!DRY){
    save(FEED,stock);save(STATE,state);
    const published=read(SNAPSHOT),bars=stock.map(b=>[b.time,b.open,b.high,b.low,b.close,b.closeTime,b.complete]);
    if(JSON.stringify(published.bars)!==JSON.stringify(bars))save(SNAPSHOT,{strategy:STRATEGY,source:'Yahoo MSTR split-adjusted daily OHLC',checkedAt:Math.floor(now),asOf:stock.filter(b=>b.closeTime<=now).at(-1).closeTime,bars});
  }
  await drain(state,async text=>{
    if(DRY){console.log(text);return;}
    const r=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text,disable_web_page_preview:true})});
    const body=await r.json();if(!r.ok||body.ok!==true)throw Error(`Telegram delivery failed (${r.status})`);
  },s=>{if(!DRY)save(STATE,s);});
  console.log(`${DRY?'Dry run; no writes. ':''}${STRATEGY}; ${result.holding?'MSTR':'cash'}; ${result.trades.length} historical model trades.`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
