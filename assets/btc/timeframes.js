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
  const view=all.filter(b=>b.closeTime>latest.closeTime-days*86400);
  const known=Number.isFinite(latest.sb),zero=known?latest.md>0:null,cross=known?latest.md>latest.sb:null;
  el('tfStatus_'+frame).innerHTML=`<span>${dot(current.gate)}Daily regime <b>${current.gate?'Bullish':'Bearish'}</b></span><span>BTC breadth <b>${Math.round(current.breadth*100)}%</b></span><span>${dot(zero)}Above zero <b>${known?(zero?'Yes':'No'):'—'}</b></span><span>${dot(cross)}Above signal <b>${known?(cross?'Yes':'No'):'—'}</b></span>`;
  el('tfSource_'+frame).textContent=data.source;
  el('tfSource_'+frame).title='Same closed Binance candles and confirmed daily SMA200 regime as SMA200 + breadth. These oscillator conditions are individual breadth votes.';
  draw(frame,view,length);
}
function draw(frame,data,length){
  const box=el('tfChart_'+frame),W=Math.max(300,box.clientWidth),H=540,L=12,R=70,T=22,B=510;
  const width=W-L-R,n=data.length,step=width/n,x=i=>L+(i+.5)*step;
  const prices=data.flatMap(b=>[b.low,b.high,b.ma]).filter(Number.isFinite),lo=Math.min(...prices),hi=Math.max(...prices),pad=(hi-lo)*.08||1;
  const y=p=>T+(hi+pad-p)/(hi-lo+2*pad)*280;
  const values=data.flatMap(b=>[b.md,b.sb]).filter(Number.isFinite),max=Math.max(1,...values.map(Math.abs))*1.1;
  const osc=v=>420-v/max*76;
  const path=(key,scale)=>{let pen=false;return data.map((b,i)=>{if(!Number.isFinite(b[key])){pen=false;return '';}const cmd=pen?'L':'M';pen=true;return `${cmd}${x(i).toFixed(2)},${scale(b[key]).toFixed(2)}`;}).join('');};
  const ticks=Array.from({length:5},(_,i)=>{const p=lo+(hi-lo)*i/4;return `<line x1="${L}" x2="${W-R}" y1="${y(p)}" y2="${y(p)}" stroke="var(--grid)"/><text x="${W-R+6}" y="${y(p)+4}">${usd(p)}</text>`;}).join('');
  const candles=data.map((b,i)=>{const color=b.close>=b.open?'var(--up)':'var(--down)',w=Math.max(.8,Math.min(9,step*.65));return `<line x1="${x(i)}" x2="${x(i)}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${color}"/><rect x="${x(i)-w/2}" y="${Math.min(y(b.open),y(b.close))}" width="${w}" height="${Math.max(1,Math.abs(y(b.open)-y(b.close)))}" fill="${color}"/>`;}).join('');
  const gates=data.map((b,i)=>`<rect x="${L+i*step}" y="306" width="${step+.2}" height="4" fill="var(--${b.gate?'up':'down'})"/>`).join('');
  const dates=[0,Math.floor(n/2),n-1].map((i,j)=>`<text x="${j===0?L:j===2?W-R:x(i)}" y="${B+20}" text-anchor="${j===0?'start':j===2?'end':'middle'}">${new Date(data[i].time*1000).toISOString().slice(0,10)}</text>`).join('');
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="BTC ${frame==='d'?'daily':'4-hour'} candles, daily SMA200 and iMACD ${length}/13"><g fill="var(--muted)" font-size="10" font-family="monospace">${ticks}${candles}<path d="${path('ma',y)}" fill="none" stroke="var(--amber)" stroke-width="1.5"/>${gates}<text x="${L}" y="332">iMACD ${length} / 13</text><line x1="${L}" x2="${W-R}" y1="420" y2="420" stroke="var(--grid)"/><text x="${W-R+6}" y="424">0</text><path d="${path('md',osc)}" fill="none" stroke="var(--amber)" stroke-width="1.5"/><path d="${path('sb',osc)}" fill="none" stroke="var(--cyan)" stroke-width="1.5"/>${dates}<line id="tfCursor_${frame}" y1="${T}" y2="${B}" stroke="var(--muted)" stroke-dasharray="3 4" visibility="hidden"/><rect id="tfHit_${frame}" x="${L}" y="${T}" width="${width}" height="${B-T}" fill="transparent"/></g></svg>`;
  const inspect=event=>{const r=box.querySelector('svg').getBoundingClientRect(),px=(event.clientX-r.left)/r.width*W,i=Math.max(0,Math.min(n-1,Math.floor((px-L)/step))),b=data[i];
    const line=el('tfCursor_'+frame);line.setAttribute('x1',x(i));line.setAttribute('x2',x(i));line.setAttribute('visibility','visible');
    el('tfRead_'+frame).textContent=`${stamp(b.closeTime)} · close ${usd(b.close)} · daily SMA200 ${Number.isFinite(b.ma)?usd(b.ma):'—'} · impulse ${Number.isFinite(b.md)?b.md.toFixed(1):'—'} · signal ${Number.isFinite(b.sb)?b.sb.toFixed(1):'—'}`;};
  el('tfHit_'+frame).onpointermove=inspect;el('tfHit_'+frame).onclick=inspect;
  el('tfRead_'+frame).textContent=`Closed ${stamp(data.at(-1).closeTime)} · hover or tap to inspect`;
}
for(const frame of ['d','h']){
  el('tfLength_'+frame).onchange=render;el('tfRange_'+frame).onchange=render;
  el('tfRefresh_'+frame).onclick=()=>window.BTC_SIGNALS?.refresh();
  new ResizeObserver(render).observe(el('tfChart_'+frame));
}
window.addEventListener('btc:signals',render);
window.BTC_TIMEFRAMES={onShow(frame){active=frame;render();}};
