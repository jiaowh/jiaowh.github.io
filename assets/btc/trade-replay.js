/* Frozen historical fills, with no assumed intrabar limit executions. */
(()=>{'use strict';
const root=document.getElementById('btcTradeReplay'),D=window.BTC_TRADE_REPLAY;if(!root)return;
if(!D){root.textContent='Historical trade data could not be loaded.';return;}
root.classList.add('btr');
root.innerHTML=`<h2>Every trade on the BTC chart · 2018–2026</h2>
<p class="sub" data-role="rules"></p>
<div class="controls"><label>Year<select data-role="year">${Array.from({length:9},(_,i)=>`<option ${i===7?'selected':''}>${2018+i}</option>`).join('')}</select></label>
<label>Starting account<select data-role="account"><option value="fresh">Fresh 1 BTC each January</option><option value="from2018">Continuous from January 2018</option><option value="from2023">Continuous from January 2023</option></select></label>
<label>Strategy<select data-role="strategy"><option value="overlay">Overlay alone</option><option value="calendar">Overlay + calendar exit</option></select></label>
<label>Rule<select data-role="rule"><option value="current">Original · 1 close / 14 days</option><option value="refined">Refined · 3 closes / 7 days</option></select></label>
<button type="button" data-role="reset">Reset year view</button></div>
<div class="context" data-role="context"></div><div class="summary" data-role="summary" aria-live="polite"></div>
<div class="legend"><span class="sell">▼ Sell</span><span class="buy">▲ Buy</span><span>Shading: cash interval</span><span class="gain">↘ Dashed: BTC gained</span><span class="loss">↗ Dashed: BTC lost</span></div>
<div class="priceplot" data-role="price"></div><div class="detail" data-role="detail" aria-live="polite">Select a numbered trade below or a chart marker to inspect its sale and buyback.</div>
<div class="equityplot" data-role="equity"></div>
<div class="ledgerheading"><h3>Sale / buyback ledger</h3><span class="sub" data-role="count"></span></div>
<div class="tablewrap"><table><thead><tr><th>Trade</th><th>Sell · UTC / price</th><th>Buy · UTC / price</th><th>BTC sold</th><th>BTC bought</th><th>Change</th><th>Buyback reason</th></tr></thead><tbody data-role="ledger"></tbody></table></div>
<p class="sub">Click a trade number to zoom. Prices show daily high/low and close; markers show exact simulated fills at 4-hour opens. The BTC line uses daily and fill-bar closes. Cross-year pairs retain their original sale and buyback dates; open cash is valued after a hypothetical purchase fee, without inventing a trade.</p>
<p class="sub"><a href="research/btc-bull-accumulation-2026/all-year-fills.csv" download>Download every fill</a> · <a href="research/btc-bull-accumulation-2026/trade-overlays-2018-2026.png">All nine yearly charts</a> · <a href="research/btc-bull-accumulation-2026/RECENCY_REPORT.md">Rules and research limitations</a></p>`;
const el=k=>root.querySelector(`[data-role="${k}"]`),yearEl=el('year'),accountEl=el('account'),strategyEl=el('strategy'),ruleEl=el('rule');
const initialRule=new URLSearchParams(window.location.search).get('rule');if(initialRule==='current'||initialRule==='refined')ruleEl.value=initialRule;
const dollar=n=>'$'+n.toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2});
const btc=n=>n.toFixed(6),pct=n=>(n>=0?'+':'')+(n*100).toFixed(2)+'%';
const date=t=>new Date(t*1000).toISOString().slice(0,16).replace('T',' ');
const day=t=>new Date(t*1000).toISOString().slice(0,10);
let selected=null,current=null,visiblePairs=[],lo=0,hi=0;
const colors={grid:'var(--grid)',text:'var(--text)',muted:'var(--muted)',price:'var(--text)',sell:'var(--amber)',buy:'var(--cyan)',gain:'var(--up)',loss:'var(--down)'};
function account(){const key=strategyEl.value+':'+accountEl.value+(accountEl.value==='fresh'?':'+yearEl.value:'');return D.models[ruleEl.value].accounts[key];}
function svgText(x,y,s,anchor='start',fill=colors.muted){return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-size="11">${s}</text>`;}
function pairEnd(p){return p.buy?p.buy.time:Math.min(hi,D.cutoff);}
function showDetail(p){
  if(!p){el('detail').textContent='Select a numbered trade below or a chart marker to inspect its sale and buyback.';return;}
  const s=p.sell,b=p.buy,days=((b?b.time:Math.min(hi,D.cutoff))-s.time)/86400;
  el('detail').innerHTML=`<b>Trade ${p.id}</b> · sell ${btc(s.qty)} BTC at ${dollar(s.price)} on ${date(s.time)} UTC (${s.reason}). `+
    (b?`Buy ${btc(b.qty)} BTC at ${dollar(b.price)} on ${date(b.time)} UTC (${b.reason}). <strong class="${p.gain>=0?'gain':'loss'}">${pct(p.gain)} BTC</strong> after ${days.toFixed(1)} days. Fees: ${dollar(s.fee+b.fee)} total.`:`Cash position remains open at this account’s endpoint; no buyback fill. Sale fee: ${dollar(s.fee)}.`);
}
function focusPair(id){selected=current.pairs.find(p=>p.id===Number(id));if(!selected)return;showDetail(selected);draw();for(const tr of el('ledger').rows)tr.classList.toggle('selected',Number(tr.dataset.id)===selected.id);}
function draw(){
  if(!current)return;
  const w=Math.max(240,Math.round(el('price').getBoundingClientRect().width)),H=350,L=52,R=14,T=30,B=35,pw=w-L-R;
  const lower=selected?selected.sell.time-4*86400:lo;
  const upper=selected?(selected.buy?selected.buy.time:Math.min(hi,D.cutoff))+4*86400:hi;
  const start=Math.max(D.prices[0][0],lower),end=Math.min(D.cutoff,upper),span=Math.max(86400,end-start);
  const pp=D.prices.filter(p=>p[0]<end&&p[0]+86400>start);
  if(!pp.length)return;
  const fs=current.fills.filter(f=>f.time>=start&&f.time<end),ys=pp.flatMap(p=>[p[2],p[3]]).concat(fs.map(f=>f.price));
  let min=Math.min(...ys),max=Math.max(...ys);const pad=(max-min)*.13||100;min-=pad;max+=pad;
  const x=t=>L+(t-start)/span*pw,y=v=>T+(max-v)/(max-min)*(H-T-B);
  let s=`<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="BTC price with exact sell and buy markers">`;
  for(const p of current.pairs){const a=Math.max(start,p.sell.time),b=Math.min(end,p.buy?p.buy.time:D.cutoff);if(b>a)s+=`<rect x="${x(a)}" y="${T}" width="${x(b)-x(a)}" height="${H-T-B}" fill="${colors.sell}" opacity=".07"/>`;}
  for(let j=0;j<5;j++){const v=min+(max-min)*j/4,yy=y(v);s+=`<line x1="${L}" y1="${yy}" x2="${w-R}" y2="${yy}" stroke="${colors.grid}"/>`+svgText(L-5,yy+4,'$'+(v/1000).toFixed(v<10000?1:0)+'k','end');}
  const n=w<500?3:6;for(let j=0;j<=n;j++){const t=start+span*j/n;s+=svgText(x(t),H-10,new Date(t*1000).toLocaleDateString('en-GB',{month:'short',day:'numeric',timeZone:'UTC'}),j===0?'start':j===n?'end':'middle');}
  s+=svgText(L,15,selected?`Trade ${selected.id} · BTC / USD`:`${yearEl.value} · BTC / USD`,'start',colors.text);
  s+=`<g opacity=".2" stroke="${colors.price}">`+pp.map(p=>`<line x1="${x(Math.min(end,Math.max(start,p[0]+43200)))}" x2="${x(Math.min(end,Math.max(start,p[0]+43200)))}" y1="${y(p[2])}" y2="${y(p[3])}"/>`).join('')+'</g>';
  s+=`<path d="${pp.map((p,i)=>(i?'L':'M')+x(Math.min(end,p[0]+86400)).toFixed(2)+','+y(p[4]).toFixed(2)).join(' ')}" fill="none" stroke="${colors.price}" stroke-width="1.4"/>`;
  for(const p of current.pairs){if(p.buy&&p.sell.time>=start&&p.buy.time<=end)s+=`<line x1="${x(p.sell.time)}" y1="${y(p.sell.price)}" x2="${x(p.buy.time)}" y2="${y(p.buy.price)}" stroke="${p.gain>=0?colors.gain:colors.loss}" stroke-width="${selected?.id===p.id?2.5:1.4}" stroke-dasharray="5 4"/>`;}
  const labels=[];
  for(const f of fs){const p=current.pairs.find(p=>p.sell.id===f.id||p.buy?.id===f.id),xx=x(f.time),yy=y(f.price),sell=f.side==='sell',c=sell?colors.sell:colors.buy;
    const points=sell?`${xx-6},${yy-8} ${xx+6},${yy-8} ${xx},${yy+2}`:`${xx-6},${yy+8} ${xx+6},${yy+8} ${xx},${yy-2}`;
    let labelY=yy+(sell?-13:23);if(w>=500){while(labels.some(a=>Math.abs(a[0]-xx)<22&&Math.abs(a[1]-labelY)<14))labelY+=sell?-14:14;labelY=Math.max(25,Math.min(H-B-2,labelY));labels.push([xx,labelY]);}
    s+=`<g class="mark" data-pair="${p.id}" role="button" tabindex="0" aria-label="Trade ${p.id}: ${f.side} at ${dollar(f.price)} on ${date(f.time)}"><title>Trade ${p.id}: ${f.side} ${btc(f.qty)} BTC · ${dollar(f.price)} · ${date(f.time)} UTC</title><circle cx="${xx}" cy="${yy}" r="12" fill="transparent"/><polygon points="${points}" fill="${c}"/>${w>=500||selected?svgText(xx,labelY,p.id,'middle',colors.text):''}</g>`;
  }
  s+='</svg>';el('price').innerHTML=s;
  for(const mark of el('price').querySelectorAll('.mark')){mark.addEventListener('click',()=>focusPair(mark.dataset.pair));mark.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focusPair(mark.dataset.pair);}});}
  const stat=current.years[yearEl.value],samples=current.curve.filter(p=>p[0]>=start&&p[0]<=end);
  if(!samples.length)return;
  let mn=Math.min(stat.startBTC,...samples.map(p=>p[1])),mx=Math.max(stat.startBTC,...samples.map(p=>p[1]));const ep=Math.max(.025,(mx-mn)*.18);mn-=ep;mx+=ep;
  const eh=150,ey=v=>25+(mx-v)/(mx-mn)*90;
  let es=`<svg width="${w}" height="${eh}" role="img" aria-label="BTC-equivalent balance over time">`+svgText(L,15,'BTC equivalent · actual account balance','start',colors.text);
  for(let j=0;j<3;j++){const v=mn+(mx-mn)*j/2;es+=svgText(L-5,ey(v)+4,v.toFixed(2),'end')+`<line x1="${L}" y1="${ey(v)}" x2="${w-R}" y2="${ey(v)}" stroke="${colors.grid}"/>`;}
  es+=`<line x1="${L}" y1="${ey(stat.startBTC)}" x2="${w-R}" y2="${ey(stat.startBTC)}" stroke="${colors.muted}" stroke-dasharray="4 4"/><path d="${samples.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+','+ey(p[1]).toFixed(2)).join(' ')}" fill="none" stroke="${colors.buy}" stroke-width="2"/>`+svgText(L,eh-6,'Dashed line: year-start BTC equivalent')+'</svg>';
  el('equity').innerHTML=es;
}
function render(){
  const yr=Number(yearEl.value);if(accountEl.value==='from2023'&&yr<2023)accountEl.value='from2018';
  current=account();selected=null;lo=Date.UTC(yr,0,1)/1000;hi=Math.min(Date.UTC(yr+1,0,1)/1000,D.cutoff);
  const model=D.models[ruleEl.value];el('rules').textContent=`SMA200 gate · ${model.confirm} closed 4h bar${model.confirm>1?'s':''} below 50% breadth · 10% BTC target or ${model.timeout}-day buyback. Historical simulation, 0.10% each side. 2026 ends October 9 UTC.`;
  const st=current.years[yr],ff=current.fills.filter(f=>f.time>=lo&&f.time<hi);
  visiblePairs=current.pairs.filter(p=>p.sell.time<hi&&(!p.buy||p.buy.time>=lo));
  const bear=yr%4===2,combined=strategyEl.value==='calendar';
  el('context').textContent=(combined?'Calendar combined: cash during 2018, 2022 and 2026; buy back at the first open of 2019 and 2023. ':bear?'Counterfactual bear-year overlay: the combined calendar strategy would be in cash this year. ':'Bull-window overlay. ')+(yr===2026?'Partial year through October 9, 2026 UTC. ':'')+'Fixed parameters selected using later history; this is a historical replay, not a record of real trades.';
  el('summary').innerHTML=`<strong>${btc(st.startBTC)}</strong> → <strong>${btc(st.endBTC)} BTC equivalent</strong> · <span class="${st.endBTC>=st.startBTC?'gain':'loss'}">${pct(st.endBTC/st.startBTC-1)}</span><br><small>End holdings: ${btc(st.endUnits)} BTC + ${dollar(st.endCash)} cash · ${ff.length} executed fills in this year. ${accountEl.value==='fresh'?'Fresh 1 BTC at January open.':`Original account starts with 1 BTC in January ${accountEl.value.slice(4)}; positions carry across years.`}</small>`;
  el('count').textContent=visiblePairs.length?`${visiblePairs.length} cash intervals overlapping this year`:'No sales or buybacks in this year';
  el('ledger').innerHTML=visiblePairs.length?visiblePairs.map(p=>{const s=p.sell,b=p.buy;return `<tr data-id="${p.id}"><td><button type="button" data-trade="${p.id}" aria-label="Inspect trade ${p.id}">${p.id}</button></td><td>${date(s.time)}<span class="sub">${dollar(s.price)}${s.time<lo?' · carried sale':''}</span></td><td>${b?date(b.time):'Still in cash'}<span class="sub">${b?dollar(b.price)+(b.time>=hi?' · next year':''):'No buyback executed'}</span></td><td>${btc(s.qty)}</td><td>${b?btc(b.qty):'—'}</td><td class="${b?(p.gain>=0?'gain':'loss'):''}">${b?pct(p.gain):'Open'}</td><td>${b?b.reason:s.reason}</td></tr>`;}).join(''):'<tr><td colspan="7">No trades. BTC holdings stay unchanged; the dollar price can still fall.</td></tr>';
  for(const button of el('ledger').querySelectorAll('button'))button.onclick=()=>focusPair(button.dataset.trade);
  showDetail(null);draw();
}
for(const control of [yearEl,accountEl,strategyEl,ruleEl])control.addEventListener('change',render);
el('reset').onclick=()=>{selected=null;showDetail(null);for(const tr of el('ledger').rows)tr.classList.remove('selected');draw();};
new ResizeObserver(()=>draw()).observe(el('price'));render();
})();
