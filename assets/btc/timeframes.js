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

const el=id=>document.getElementById(id),usd=n=>'$'+n.toLocaleString('en-US',{maximumFractionDigits:0});
const stamp=t=>new Date(t*1000).toISOString().slice(0,16).replace('T',' ')+' UTC';
const dot=v=>`<i class="indicator-dot ${v===null?'is-unknown':v?'is-up':'is-down'}" aria-hidden="true"></i>`;
let active=null;
function render(){
  if(!active||el('panel_'+active).hidden)return;
  const data=window.BTC_SIGNALS?.snapshot(),frame=active;
  if(!data?.rows.length)return;
  const length=Number(el('tfLength_'+frame).value),all=timeframeRows(data.bars,data.rows,frame,length,{impulseMACD});
  const latest=all.at(-1),current=data.rows.at(-1),days=Number(el('tfRange_'+frame).value);
  if(!latest)return;
  const known=Number.isFinite(latest.sb),zero=known?latest.md>0:null,cross=known?latest.md>latest.sb:null;
  el('tfStatus_'+frame).innerHTML=`<span>${dot(current.gate)}Daily regime <b>${current.gate?'Bullish':'Bearish'}</b></span><span>BTC breadth <b>${Math.round(current.breadth*100)}%</b></span><span>${dot(zero)}Above zero <b>${known?(zero?'Yes':'No'):'—'}</b></span><span>${dot(cross)}Above signal <b>${known?(cross?'Yes':'No'):'—'}</b></span>`;
  el('tfSource_'+frame).textContent=data.source;
  el('tfSource_'+frame).title='Same closed Binance candles and confirmed daily SMA200 regime as SMA200 + breadth. These oscillator conditions are individual breadth votes.';
  draw(frame,all,length,days);
}
const charts=new Map();
function createPane(id,frame){
  const chart=LightweightCharts.createChart(el(id),{
    autoSize:true,
    layout:{background:{color:'#0d1217'},textColor:'#6b7882',fontFamily:'IBM Plex Mono'},
    grid:{vertLines:{color:'#1e262e'},horzLines:{color:'#1e262e'}},
    rightPriceScale:{borderColor:'#1e262e',minimumWidth:72},
    timeScale:{borderColor:'#1e262e',timeVisible:frame==='h',secondsVisible:false},
    crosshair:{mode:0},
    handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
    handleScale:{axisPressedMouseMove:{time:true,price:true},axisDoubleClickReset:true,mouseWheel:true,pinch:true}
  });
  return chart;
}
function draw(frame,data,length,days){
  if(!window.LightweightCharts)return;
  let v=charts.get(frame);
  if(!v){
    const price=createPane('tfChart_'+frame,frame),im=createPane('tfImacd_'+frame,frame),osc=createPane('tfRsi_'+frame,frame);
    const candles=price.addCandlestickSeries({upColor:'#3fb950',downColor:'#f85149',borderUpColor:'#3fb950',borderDownColor:'#f85149',wickUpColor:'#3fb950',wickDownColor:'#f85149'});
    const line=(chart,color,title)=>chart.addLineSeries({color,title,lineWidth:2,priceLineVisible:false});
    v={panes:[price,im,osc],candles,ma:line(price,'#ffb000','SMA200'),md:line(im,'#ffb000','iMACD'),sb:line(im,'#6f9fcf','Signal'),rsi:line(osc,'#a78bfa','RSI'),data:[],days:null};
    v.md.createPriceLine({price:0,color:'#33404a',lineWidth:1,lineStyle:2,axisLabelVisible:true});
    v.rsi.applyOptions({autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})});
    for(const [level,color] of [[70,'#f85149'],[50,'#33404a'],[30,'#3fb950']])v.rsi.createPriceLine({price:level,color,lineWidth:1,lineStyle:2,axisLabelVisible:level!==50});
    let lock=false;
    for(const pane of v.panes){
      pane.timeScale().subscribeVisibleLogicalRangeChange(range=>{
        if(lock||!range)return;lock=true;
        try{for(const other of v.panes)if(other!==pane)other.timeScale().setVisibleLogicalRange(range);}finally{lock=false;}
      });
      pane.subscribeCrosshairMove(event=>{
        const b=v.byTime?.get(event.time);if(b)read(frame,b);
      });
    }
    charts.set(frame,v);
  }
  const values=rsi(data.map(b=>b.close),14);
  v.data=data.map((b,i)=>({...b,rsi:values[i]}));v.byTime=new Map(v.data.map(b=>[b.time,b]));
  v.candles.setData(data.map(({time,open,high,low,close})=>({time,open,high,low,close})));
  for(const key of ['ma','md','sb','rsi'])v[key].setData(v.data.map(b=>Number.isFinite(b[key])?{time:b.time,value:b[key]}:{time:b.time}));
  el('tfImacd_'+frame).setAttribute('aria-label',`Impulse MACD ${length}/13`);
  el('tfRsiValue_'+frame).textContent=Number.isFinite(values.at(-1))?values.at(-1).toFixed(1):'—';
  if(v.days!==days){v.days=days;reset(frame);}
  read(frame,v.data.at(-1));
}
function read(frame,b){
  const value=n=>Number.isFinite(n)?n.toFixed(1):'—';
  el('tfRead_'+frame).textContent=`${stamp(b.closeTime)} · close ${usd(b.close)} · daily SMA200 ${Number.isFinite(b.ma)?usd(b.ma):'—'} · impulse ${value(b.md)} · signal ${value(b.sb)} · RSI ${value(b.rsi)}`;
}
function reset(frame){
  const v=charts.get(frame);if(!v?.data.length)return;
  for(const pane of v.panes)pane.priceScale('right').applyOptions({autoScale:true});
  const end=v.data.at(-1).time,span=frame==='d'?86400:14400;
  v.panes[0].timeScale().setVisibleRange({from:Math.max(v.data[0].time,end-v.days*86400+span),to:end});
}
for(const frame of ['d','h']){
  el('tfLength_'+frame).onchange=render;el('tfRange_'+frame).onchange=render;
  el('tfReset_'+frame).onclick=()=>reset(frame);
  el('tfRefresh_'+frame).onclick=()=>window.BTC_SIGNALS?.refresh();
}
window.addEventListener('btc:signals',render);
window.addEventListener('btc:chart-ready',render);
window.BTC_TIMEFRAMES={onShow(frame){active=frame;render();}};
