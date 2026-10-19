// Interactive display only. Trading decisions remain in the shared strategy modules.
const el=id=>document.getElementById(id);
const stamp=t=>new Date(t*1000).toISOString().slice(0,16).replace('T',' ')+' UTC';
const usd=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
let chart=null,last=null;
function create(id){return LightweightCharts.createChart(el(id),{
 autoSize:true,layout:{background:{color:'#0d1217'},textColor:'#6b7882',fontFamily:'IBM Plex Mono'},
 grid:{vertLines:{color:'#1e262e'},horzLines:{color:'#1e262e'}},rightPriceScale:{borderColor:'#1e262e',minimumWidth:82},
 timeScale:{borderColor:'#1e262e',timeVisible:true,secondsVisible:false},crosshair:{mode:0},
 handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
 handleScale:{axisPressedMouseMove:{time:true,price:true},axisDoubleClickReset:true,mouseWheel:true,pinch:true}
});}
function init(){
 const price=create('signalChart'),breadth=create('signalBreadth');
 breadth.priceScale('right').applyOptions({scaleMargins:{top:.06,bottom:.06}});
 const tint=price.addAreaSeries({priceScaleId:'regime',lineType:1,lineColor:'transparent',topColor:'rgba(63,185,80,.07)',bottomColor:'rgba(63,185,80,.07)',priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
 tint.applyOptions({autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:1}})});price.priceScale('regime').applyOptions({scaleMargins:{top:0,bottom:0}});
 const candles=price.addCandlestickSeries({upColor:'#3fb950',downColor:'#f85149',borderUpColor:'#3fb950',borderDownColor:'#f85149',wickUpColor:'#3fb950',wickDownColor:'#f85149'});
 const line=(color,extra={})=>price.addLineSeries({color,lineWidth:1,lineType:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,...extra});
 const ma=line('#ffb000',{lineWidth:2}),upper=line('#72808d',{lineStyle:2}),lower=line('#72808d',{lineStyle:2});
 const score=breadth.addLineSeries({color:'#38bdf8',lineWidth:2,lineType:1,priceLineVisible:false,priceFormat:{type:'custom',minMove:.1,formatter:v=>v.toFixed(1)+'%'}});
 score.applyOptions({autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})});
 score.createPriceLine({price:50,color:'#ffb000',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'50%'});
 chart={price,breadth,candles,ma,upper,lower,tint,score,key:null,byTime:new Map(),trades:new Map()};
 let rangeLock=false,crossLock=false;
 for(const pane of [price,breadth]){
  const other=pane===price?breadth:price,series=pane===price?score:candles;
  pane.timeScale().subscribeVisibleLogicalRangeChange(range=>{if(rangeLock||!range)return;rangeLock=true;try{other.timeScale().setVisibleLogicalRange(range);}finally{rangeLock=false;}});
  pane.subscribeCrosshairMove(event=>{if(crossLock)return;crossLock=true;try{
   const r=chart.byTime.get(event.time);
   if(r){read(r);const value=pane===price?r.breadth*100:r.close;if(Number.isFinite(value))other.setCrosshairPosition(value,r.time,series);}
   else other.clearCrosshairPosition();
  }finally{crossLock=false;}});
 }
}
function read(r){
 const trades=chart.trades.get(r.time)||[];
 el('signalRead').textContent=`${stamp(r.openOnly?r.time:r.closeTime)} · ${last.asset} ${usd(r.close)}${r.openOnly?' (opening price only)':''} · SMA200 ${usd(r.ma)} · ${r.gate?'Bullish':'Bearish'} · breadth ${Number.isFinite(r.breadth)?(r.breadth*100).toFixed(1)+'%':'—'}${trades.map(t=>` · ${t.side.toUpperCase()} ${usd(t.price)} · ${stamp(t.time)} · ${t.reason}`).join('')}`;
}
export function drawStrategyChart(data,trades,{asset,range}){
 last={data,trades,asset,range};
 if(!window.LightweightCharts)return;
 if(!chart)init();
 const plot=data.map(r=>({...r}));
 // An executed trade at the latest opening gets an open-only candle, never future H/L/C.
 const tail=plot.at(-1),opening=tail&&trades.find(t=>t.time===tail.closeTime&&t.time>tail.time);
 if(opening)plot.push({...tail,time:opening.time,closeTime:opening.time,open:opening.price,high:opening.price,low:opening.price,close:opening.price,openOnly:true});
 chart.byTime=new Map(plot.map(r=>[r.time,r]));chart.trades=new Map();
 for(const trade of trades){if(!chart.byTime.has(trade.time))continue;if(!chart.trades.has(trade.time))chart.trades.set(trade.time,[]);chart.trades.get(trade.time).push(trade);}
 chart.candles.setData(plot.map(({time,open,high,low,close})=>({time,open,high,low,close})));
 for(const [name,multiplier] of [['ma',1],['upper',1.02],['lower',.98]])chart[name].setData(plot.map(r=>Number.isFinite(r.ma)?{time:r.time,value:r.ma*multiplier}:{time:r.time}));
 chart.tint.setData(plot.map(r=>({time:r.time,value:r.gate?1:0})));
 chart.score.setData(plot.map(r=>Number.isFinite(r.breadth)?{time:r.time,value:r.breadth*100}:{time:r.time}));
 const markers=trades.filter(t=>chart.byTime.has(t.time)).map(t=>({time:t.time,id:`${t.side}:${t.time}`,position:t.side==='buy'?'belowBar':'aboveBar',shape:t.side==='buy'?'arrowUp':'arrowDown',color:t.side==='buy'?'#3fb950':'#f85149',text:t.side.toUpperCase(),size:1}));
 chart.candles.setMarkers(markers);
 el('signalChart').setAttribute('aria-label',`${asset} candles, daily SMA200 and model buy/sell trades`);
 el('signalBreadthLabel').textContent=asset==='MSTR'?'BTC fast + Vortex breadth':'Weighted BTC breadth · 72h ×2';
 const key=asset+':'+range;
 if(chart.key!==key){chart.key=key;resetStrategyChart();}
 if(plot.length)read(plot.at(-1));else el('signalRead').textContent='No completed bars in this period.';
}
export function resetStrategyChart(){
 if(!chart||!last?.data.length)return;
 for(const pane of [chart.price,chart.breadth])pane.priceScale('right').applyOptions({autoScale:true});
 const data=last.data,year=Number(last.range),end=data.at(-1).time;
 const visible=data.filter(r=>last.range==='90'?r.closeTime>data.at(-1).closeTime-90*86400:new Date(r.time*1000).getUTCFullYear()===year);
 if(!visible.length)return;
 chart.price.timeScale().setVisibleRange({from:visible[0].time,to:Math.min(end,visible.at(-1).time)+(last.asset==='BTC'?14400:86400)*3});
}
