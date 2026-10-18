// Daily/4h inspection of the same closed candles and daily regime as the strategy.
export function timeframeRows(bars, rows, frame, length, indicators) {
  const byTime=new Map(rows.map(r=>[r.time,r])),closed=bars.filter(b=>byTime.has(b.time));
  let candles=closed;
  if(frame==='d'){
    const groups=new Map();
    for(const b of closed){const day=Math.floor(b.time/86400)*86400;if(!groups.has(day))groups.set(day,[]);groups.get(day).push(b);}
    candles=[];
    for(const [time,day] of groups)if(day.length===6&&day.every((b,i)=>b.time===time+i*14400)){
      candles.push({time,open:day[0].open,high:Math.max(...day.map(b=>b.high)),low:Math.min(...day.map(b=>b.low)),close:day.at(-1).close});
    }
  }
  const {md,sb}=indicators.impulseMACD(candles,length,13),span=frame==='d'?86400:14400;
  return candles.map((b,i)=>{const r=byTime.get(b.time+span-14400);return {...b,closeTime:b.time+span,ma:r.ma,gate:r.gate,md:md[i],sb:sb[i]};});
}

const el=id=>document.getElementById(id);
const dot=v=>`<i class="indicator-dot ${v===null?'is-unknown':v?'is-up':'is-down'}" aria-hidden="true"></i>`;
let active=null;
const views=new Map();
function render(){
  if(!active||el('panel_'+active).hidden)return;
  const data=window.BTC_SIGNALS?.snapshot(),frame=active,view=VIEWS[frame];
  if(!data?.rows.length||!view)return;
  const length=Number(el('iLength_'+frame).value),signal=Number(el('iSignal_'+frame).value);
  const all=timeframeRows(data.bars,data.rows,frame,length,{impulseMACD});
  if(!all.length)return;
  const {md,sb}=impulseMACD(all,length,signal),current=data.rows.at(-1);
  const known=Number.isFinite(sb.at(-1)),zero=known?md.at(-1)>0:null,cross=known?md.at(-1)>sb.at(-1):null;
  el('tfStatus_'+frame).innerHTML=`<span>${dot(current.gate)}Daily strategy <b>${current.gate?'Bullish':'Bearish'}</b></span><span>BTC breadth <b>${Math.round(current.breadth*100)}%</b></span><span>${dot(zero)}Above zero <b>${known?(zero?'Yes':'No'):'—'}</b></span><span>${dot(cross)}Above signal <b>${known?(cross?'Yes':'No'):'—'}</b></span>`;
  el('tfSource_'+frame).textContent=data.source;
  const state=views.get(frame)||{};
  // Reuse the original interactive chart with all its overlays and controls.
  if(state.bars!==data.bars){
    view.setCandles(all.slice(-(frame==='d'?4000:3000)).map(({time,open,high,low,close})=>({time,open,high,low,close})),data.source);
    state.bars=data.bars;
  }
  const days=Number(el('tfRange_'+frame).value);
  views.set(frame,state);
  if(state.days!==days){state.days=days;reset(frame);}
}
function reset(frame){
  const view=VIEWS[frame],bars=view?.getCandles();if(!bars?.length)return;
  const end=bars.at(-1).time,span=frame==='d'?86400:14400;
  view.resetScale();
  view.setVisibleRange(Math.max(bars[0].time,end-Number(el('tfRange_'+frame).value)*86400+span),end+span*3);
}
for(const frame of ['d','h']){
  for(const prefix of ['iLength_','iSignal_'])el(prefix+frame).addEventListener('change',render);
  el('tfRange_'+frame).onchange=render;
  el('tfReset_'+frame).onclick=()=>reset(frame);
  el('tfRefresh_'+frame).onclick=()=>window.BTC_SIGNALS?.refresh();
}
window.addEventListener('btc:signals',render);
window.addEventListener('btc:chart-ready',render);
window.BTC_TIMEFRAMES={onShow(frame){active=frame;render();}};
