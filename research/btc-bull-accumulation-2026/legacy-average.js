// Archived Average model, retired from btc.html on 2026-10-17.
// Research only: never loaded by the page or notification bot.
// Tests supply the shared indicator primitives and DAY constant.

// ---------- Average tab: trend-member ensemble (position sizing, not a trigger) ----------
// 50 long/flat members, all on CLOSED bars built from 4h candles (epoch-aligned, exactly
// as the research harness): 36 iMACD = {impulse > 0, impulse > signal} × TF
// {4,8,12,24,48,72}h × MA length {21,34,55}; on daily bars 5 SMA (close > SMA n),
// 5 momentum (close > close n days ago), 4 Donchian (close > prior n-day high enters,
// close < prior n/2-day low exits). E = share of members long. IN when E > ENS_IN, OUT
// when E < ENS_OUT (hysteresis). While IN the step level is the size of the highest
// ENS_STEPS floors govern reductions; rebuilding needs floor + 3pp (63% / 53%). Spot only, never levered:
// position = level (full size) or level × min(1, target/σ), σ = EW realised vol of 4h returns (half-life 20 d)
// re-read at each UTC daily close. The band applies to the FINAL position (vol resizes, exit steps
// and the funding trim alike): it is traded only when it moves > ENS_BAND from the held size (exits
// always trade), so small steps/trims — ⅔→4/9 while crowded, anything at low vol-target sizes — are
// skipped. Forcing every step/trim/entry through regardless was a wash (r16_review.py, 2026-09-29:
// ΔSharpe +0.00/+0.01 over 8 phases, 2/7 eras, +8 trades/yr), so the lower-turnover rule stays.
// A decision at a bar's close applies from the next bar.
// Research (quant repo): reports/iMACD ensemble.md, reports/Average strategy v2 research.md.
const ENS_TF=[4,8,12,24,48,72],ENS_N=[21,34,55],ENS_MODES=["zero","state"],ENS_BAND=0.25,ENS_IN=0.60,ENS_OUT=0.40;
const ENS_STEPS=[[0.60,1],[0.50,2/3],[0.40,1/3]];     // [E floor, size] while IN, highest first
const ENS_STEP_UP_MARGIN=0.03; // rebuild size only 3 percentage points above the next floor
function ensLevels(E){
  const out=new Array(E.length).fill(NaN);let level=0;
  for(let i=0;i<E.length;i++){
    const e=E[i];if(!Number.isFinite(e))continue;
    if(level===0){if(e>ENS_IN)level=1;}
    else{
      let k=ENS_STEPS.findIndex(q=>q[1]===level);
      // Reductions and exits never wait for the recovery buffer.
      while(k<ENS_STEPS.length&&e<ENS_STEPS[k][0])k++;
      if(k===ENS_STEPS.length)level=0;
      else{
        while(k>0&&e>=ENS_STEPS[k-1][0]+ENS_STEP_UP_MARGIN)k--;
        level=ENS_STEPS[k][1];
      }
    }
    out[i]=level;
  }
  return out;
}
const ENS_STEP_TXT=l=>l===1?"full":l>0.5?"⅔":l>0?"⅓":"out";
// Funding-crowding trim (research round 3): perp funding is the price of leveraged long demand, and
// crowded longs precede liquidation cascades. When the 14-day SUM of BTCUSDT perp funding, annualised,
// is above ENS_FUND_THR, hold ENS_FUND_MULT of the position. Re-read at each 00:00 UTC from the stamps
// published by then (window (T−14d, T]), exactly as research_notes/ensemble_v2/crowd.py in the quant repo.
const ENS_FUND_THR=0.15,ENS_FUND_MULT=2/3,ENS_FUND_DAYS=14;
// funding stamps since fromSec → [[tSec, rate], …] ascending. Binance first, Bybit fallback; throws if both fail.
async function fetchFundingHistory(fromSec){
  const m=new Map();let src="Binance";
  try{let s=fromSec*1000;
    for(let k=0;k<15;k++){const r=await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=${s}&limit=1000`);
      if(!r.ok)throw new Error("binance funding "+r.status);const j=await r.json();
      for(const x of j)m.set(Math.floor(x.fundingTime/1000),+x.fundingRate);
      if(j.length<1000)break;s=j[j.length-1].fundingTime+1;}
    if(!m.size)throw new Error("binance funding empty");
  }catch(e){m.clear();src="Bybit";let end=Date.now();
    for(let k=0;k<40;k++){const r=await fetch(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200&endTime=${end}`);
      if(!r.ok)throw new Error("bybit funding "+r.status);const l=((await r.json()).result||{}).list||[];if(!l.length)break;
      let old=Infinity;for(const x of l){const t=+x.fundingRateTimestamp;m.set(Math.floor(t/1000),+x.fundingRate);old=Math.min(old,t);}
      if(old/1000<=fromSec)break;end=old-1;}
    if(!m.size)throw new Error("funding history unavailable");}
  return {src,stamps:[...m.entries()].sort((a,b)=>a[0]-b[0])};
}
// annualised 14-day funding known at each closed 4h bar: the value as of the latest 00:00 UTC ≤ bar close (NaN if not covered).
// Missing-data policy: a reading is taken only when the feed is FRESH at the read time (a stamp within
// ENS_FUND_STALE before it) and at least half the window's 42 stamps are present; it is then the MEAN of the stamps
// in the window × 3 stamps/day × 365 (= the 14-day sum × 365/14 when complete). Otherwise the last valid reading is
// frozen — during an outage the window must not slide onto only the newest stamps (that can switch the trim off
// without any new evidence). The card flags a stale feed.
const ENS_FUND_STALE=9*3600;   // 8h stamp cadence + 1h slack
function ensFunding14(B,stamps){
  const n=B.length,o=new Array(n).fill(NaN);if(!stamps||!stamps.length)return o;
  const t=stamps.map(s=>s[0]),cs=[0];for(const s of stamps)cs.push(cs[cs.length-1]+s[1]);
  const upTo=x=>{let lo=0,hi=t.length;while(lo<hi){const md=(lo+hi)>>1;if(t[md]<=x)lo=md+1;else hi=md;}return lo;};  // # stamps with t ≤ x
  const W=ENS_FUND_DAYS*DAY,need=ENS_FUND_DAYS*3/2;let last=NaN;
  for(let i=0;i<n;i++){const A=Math.floor((B[i].time+14400)/DAY)*DAY;
    if(t[0]>A-W)continue;const hi=upTo(A),lo=upTo(A-W);
    const fresh=hi>0&&A-t[hi-1]<=ENS_FUND_STALE;
    o[i]=fresh&&hi-lo>=need?(last=(cs[hi]-cs[lo])/(hi-lo)*3*365):last;}
  return o;
}
const ENS_SMA=[20,50,100,150,200],ENS_MOM=[14,28,56,84,168],ENS_DON=[10,20,50,100];
const ENS_FAM={imacd:{label:"iMACD",color:"#ffb000"},sma:{label:"SMA",color:"#38bdf8"},
  mom:{label:"Momentum",color:"#a78bfa"},donch:{label:"Donchian",color:"#f472b6"}};
// spot only (2026-09-29): every sizing is capped at 1× — no perps, no leverage, no shorts
const ENS_SIZING={
  spot:{label:"Full size · spot",tgt:null,cap:1},
  vt60:{label:"Vol-target 60% · spot ≤1×",tgt:0.6,cap:1},
  vt80:{label:"Vol-target 80% · spot ≤1×",tgt:0.8,cap:1}};
// Buffered-step backtest snapshot, not recomputed live: r18_verify.py, 2026-09-30.
// Binance phase 0, 2019-01-01 through 2026-09-28. Current funding policy; fixed BTC units,
// next-open fills, 10 bp/side reserved from cash, no leverage, idle cash 0.
// Drawdown at 4h closes; Sharpe from daily log returns, rf 0. Other alignments differ.
const ENS_BT_END="2026-09-28";
const ENS_BT=[
  {k:"bh",  label:"Buy & hold",                c19:50,d19:-77,s19:0.65,c23:54,d23:-53},
  {k:"spot",label:"Full size · spot",          c19:64,d19:-29,s19:1.45,c23:47,d23:-21},
  {k:"vt60",label:"Vol-target 60% · spot ≤1×", c19:58,d19:-27,s19:1.46,c23:47,d23:-21},
  {k:"vt80",label:"Vol-target 80% · spot ≤1×", c19:60,d19:-27,s19:1.44,c23:47,d23:-21}];
// MSTR follows the buffered BTC target at the 16:00 UTC read. No updated MSTR backtest yet.
const MSTR_HOUR=16;
async function fetchMSTR(fromSec){
  const f=s=>new Date(s*1000).toISOString().slice(0,10).replace(/-/g,"")+"000000";
  const r=await fetch(`https://ts-api.cnbc.com/harmony/app/bars/MSTR/1D/${f(fromSec)}/${f(Date.now()/1000+DAY)}/adjusted/EST5EDT.json`);
  if(!r.ok)throw new Error("CNBC "+r.status);
  const b=(await r.json()).barData.priceBars;
  if(!b||!b.length)throw new Error("CNBC empty");
  // one bar per US trading date, stamped 00:00 UTC of that date
  return b.map(x=>{const t=x.tradeTime;return {time:Date.UTC(+t.slice(0,4),+t.slice(4,6)-1,+t.slice(6,8))/1000,
    open:+x.open,high:+x.high,low:+x.low,close:+x.close};}).filter(c=>c.close>0);
}
let ENS_MODE="vt60";
try{const m=localStorage.getItem("btc_ens_mode");if(m&&ENS_SIZING[m])ENS_MODE=m;}catch(e){}
// group closed 4h bars into epoch-aligned `span`-second bars; ends[k] = 4h index that closes bar k
function ensGroup(B,span){
  const n=B.length,bars=[],ends=[];let g=null,cur=null;
  for(let i=0;i<n;i++){const k=Math.floor(B[i].time/span);
    if(k!==g){if(cur){bars.push(cur);ends.push(i-1);}g=k;cur={high:B[i].high,low:B[i].low,close:B[i].close};}
    else{cur.high=Math.max(cur.high,B[i].high);cur.low=Math.min(cur.low,B[i].low);cur.close=B[i].close;}}
  if(cur&&(B[n-1].time+14400)%span===0){bars.push(cur);ends.push(n-1);}   // last group only if complete
  return {bars,ends};
}
// state of the latest CLOSED coarse bar, laid out on the 4h grid (NaN while warming up)
function ensSpread(v,ends,n){
  const st=new Array(n).fill(NaN);let j=-1;
  for(let i=0;i<n;i++){while(j+1<ends.length&&ends[j+1]<=i)j++;if(j>=0)st[i]=v[j];}
  return st;
}
// Display-only confirmation. Incomplete days/gaps cannot count toward either daily close.
// Nothing here feeds votes, levels, sizing, or the trading band.
function ensRiskContext(B,D,ends){
  const ma=smaN(D.map(b=>b.close),50),values=[],counts=[],times=[];
  let complete=0,below=0;
  for(let j=0;j<D.length;j++){
    const start=j?ends[j-1]+1:0,end=ends[j];
    const ok=end-start===5&&B[start].time%DAY===0&&
      B.slice(start,end+1).every((b,k)=>b.time===B[start].time+k*14400);
    const consecutive=j>0&&B[end].time-B[ends[j-1]].time===DAY;
    complete=ok?(consecutive?complete+1:1):0;
    const ready=complete>=50&&Number.isFinite(ma[j]);
    below=ready&&D[j].close<ma[j]?Math.min(2,below+1):0;
    values.push(ready?ma[j]:NaN);counts.push(ready?below:NaN);times.push(B[end].time+14400);
  }
  return {sma50:ensSpread(values,ends,B.length),below50:ensSpread(counts,ends,B.length),
    dailyTime:ensSpread(times,ends,B.length)};
}
function ensRiskCard(R,mode){
  const i=R.t.length-1,e=R.E[i],p=R.banded[mode][i],want=R.pos[mode][i];
  if(![e,p,want].every(Number.isFinite))return '';
  const pct=x=>(100*x).toFixed(1)+'%',time=t=>new Date(t*1000).toISOString().slice(0,16).replace('T',' ');
  const f=R.f14[i],fresh=Number.isFinite(R.fundLast)&&Date.now()/1000-R.fundLast<=ENS_FUND_STALE;
  const crowded=Number.isFinite(f)&&f>ENS_FUND_THR;
  const risk=R.risk,below=risk?risk.below50[i]:NaN,confirmed=below>=2&&e<ENS_IN;
  const item=(label,state,detail,tone='')=>`<div class="avg-risk-item"><div class="avg-risk-label">${label}</div><strong class="avg-risk-state ${tone}">${state}</strong><div class="avg-risk-detail">${detail}</div></div>`;
  const trend=e<ENS_OUT?'Exit regime':e<.50?'Broad trend weakness':e<ENS_IN?'Trend weakening':'No vote warning';
  const trendDetail=`${Math.round(e*R.members.length)}/${R.members.length} members long (${Math.round(e*100)}%). `+
    (R.inn[i]===0?'OUT; entry still requires more than 60%.':'Reductions below 60% / 50%; exit below 40%.');
  const crowdState=!Number.isFinite(f)?'Funding unavailable':!fresh?'Stale funding reading':crowded?'Elevated crowding':'Below crowding threshold';
  const crowdDetail=Number.isFinite(f)?`${pct(f)}/yr over 14 days${!fresh?' (last valid reading)':''}. `+
    (crowded?'Desired size is multiplied by ⅔; the trading band can skip the trim.':'The crowding threshold is 15%/yr.'):
    'No usable 14-day reading; the displayed target has no funding trim.';
  const confirmation=!Number.isFinite(below)?'History unavailable':confirmed?'Confirmed trend damage':below>=2?'Price weakness only':below===1?'One daily close below SMA50':'Not confirmed';
  const confirmDetail=Number.isFinite(below)?`${below>=2?'Two':below===1?'One':'No'} consecutive daily close${below===1?'':'s'} below SMA50`+
    ` ($${risk.sma50[i].toLocaleString('en-US',{maximumFractionDigits:0})}), as of ${time(risk.dailyTime[i])} UTC. `+
    (confirmed?'Votes are also below 60%.':'Confirmation also requires votes below 60%.'):
    'Needs 50 complete, consecutive UTC days. Forming candles do not count.';
  const gap=want-p,skipped=Math.abs(gap)>1e-9;
  let change=i;while(change>0&&R.banded[mode][change-1]===p)change--;
  const prior=i>0?R.banded[mode][i-1]:NaN;
  const tradeState=skipped?(gap<0?'Reduction skipped by band':'Increase skipped by band'):
    p===0?'Flat target':Number.isFinite(prior)&&p<prior?'Target reduced':Number.isFinite(prior)&&p>prior?'Target increased':'Target unchanged';
  const tradeDetail=`Desired ${pct(want)}; last rebalance target ${pct(p)}. `+
    (skipped?`The ${Math.abs(gap*100).toFixed(1)}pp gap does not exceed the 25pp band. `:'')+
    `Target set at ${time(R.t[change]+14400)} UTC; applies from the next bar open.`;
  return `<section class="avg-risk" aria-label="Risk context"><h3>Risk context</h3>
    <div class="sig-sub">As of ${time(R.t[i]+14400)} UTC · closed bars · conditions, not a crash forecast</div>
    <div class="avg-risk-grid">${item('Trend participation',trend,trendDetail,e<ENS_OUT?'risk':e<ENS_IN?'warn':'')}
    ${item('Funding crowding',crowdState,crowdDetail,!fresh||crowded?'warn':'')}
    ${item('Daily confirmation',confirmation,confirmDetail,confirmed?'risk':below>0?'warn':'')}
    ${item('Rebalance status',tradeState,tradeDetail,skipped?'warn':'')}</div>
    <div class="sig-sub">Confirmation is context only; it does not delay exits or change targets. Targets assume next-open fills; this page cannot verify your trades. Actual allocation can drift between rebalances.</div></section>`;
}
function computeEnsemble(c4,funding){
  const now=Date.now()/1000;
  const B=c4.filter(c=>c.time+14400<=now);          // closed 4h bars only (a prefix of c4)
  const n=B.length;if(n<50)return null;
  const members=[];
  for(const tf of ENS_TF){
    const {bars,ends}=ensGroup(B,tf*3600);
    for(const len of ENS_N){
      const {md,sb}=impulseMACD(bars,len,9);
      for(const mode of ENS_MODES){
        const v=md.map((x,j)=>isNaN(sb[j])?NaN:(mode==="zero"?(x>0?1:0):(x>sb[j]?1:0)));
        members.push({fam:"imacd",tf,len,mode,label:`iMACD ${tf}h ${len} ${mode==="zero"?"> 0":"> signal"}`,st:ensSpread(v,ends,n)});}}}
  const {bars:D,ends:De}=ensGroup(B,DAY),m=D.length,cd=D.map(b=>b.close);
  for(const d of ENS_SMA){const s=smaN(cd,d);
    members.push({fam:"sma",len:d,label:`SMA ${d}d`,st:ensSpread(cd.map((c,j)=>isNaN(s[j])?NaN:(c>s[j]?1:0)),De,n)});}
  for(const d of ENS_MOM)
    members.push({fam:"mom",len:d,label:`Momentum ${d}d`,st:ensSpread(cd.map((c,j)=>j<d?NaN:(c>cd[j-d]?1:0)),De,n)});
  for(const d of ENS_DON){const k=Math.max(2,Math.floor(d/2)),v=new Array(m).fill(NaN);let x=0;
    for(let j=d;j<m;j++){let hi=-Infinity,lo=Infinity;
      for(let q=j-d;q<j;q++)if(D[q].high>hi)hi=D[q].high;
      for(let q=j-k;q<j;q++)if(D[q].low<lo)lo=D[q].low;
      if(cd[j]>hi)x=1;else if(cd[j]<lo)x=0;v[j]=x;}
    members.push({fam:"donch",len:d,label:`Donchian ${d}/${k}d`,st:ensSpread(v,De,n)});}
  const avgOf=list=>{const o=new Array(n).fill(NaN);
    for(let i=0;i<n;i++){let s=0,ok=true;for(const q of list){if(isNaN(q.st[i])){ok=false;break;}s+=q.st[i];}
      if(ok)o[i]=s/list.length;}return o;};
  const E=avgOf(members),fam={};
  for(const f in ENS_FAM)fam[f]=avgOf(members.filter(q=>q.fam===f));
  // EW variance of 4h returns; the vol used for sizing is re-read at each daily close
  const lam=Math.pow(0.5,1/(20*6)),vol=new Array(n);let v=0.36/2190,held=0.6;
  for(let i=0;i<n;i++){
    if(i>0){const r=B[i].close/B[i-1].close-1;v=lam*v+(1-lam)*r*r;}
    if((B[i].time+14400)%DAY===0)held=Math.sqrt(v*2190);
    vol[i]=held;}
  // Stateful steps: immediate reductions, buffered recovery. Entry/exit thresholds unchanged.
  const lvl=ensLevels(E),inn=lvl.map(s=>isNaN(s)?NaN:s>0?1:0);
  // funding-crowding trim (1 when funding is unavailable or not yet covered)
  const f14=ensFunding14(B,funding&&funding.stamps),trim=f14.map(f=>f>ENS_FUND_THR?ENS_FUND_MULT:1);
  const pos={},banded={};
  for(const k in ENS_SIZING){const z=ENS_SIZING[k];
    pos[k]=lvl.map((s,i)=>isNaN(s)?NaN:s*trim[i]*(z.tgt?Math.min(z.cap,z.tgt/vol[i]):1));
    let c=NaN;banded[k]=pos[k].map(p=>{if(isNaN(p))return NaN;
      if(isNaN(c)||Math.abs(p-c)>ENS_BAND||(p===0&&c!==0))c=p;return c;});}
  for(const q of members){q.now=q.st[n-1];q.since=-1;       // last flip = bar whose close changed it
    for(let i=n-1;i>0;i--)if(!isNaN(q.st[i-1])&&q.st[i]!==q.st[i-1]){q.since=i;break;}}
  const fundLast=funding&&funding.stamps.length?funding.stamps[funding.stamps.length-1][0]:NaN;
  return {t:B.map(b=>b.time),E,inn,lvl,f14,trim,fundSrc:funding?funding.src:null,fundLast,fam,vol,pos,banded,members,
    risk:ensRiskContext(B,D,De)};
}

// Accumulation accounting is independent of live exchange/chart availability.
// Cash counts only as the BTC it could buy after the conversion fee.
function accumulationBuybackPrice(sale,fee,gain=0){return sale*(1-fee)/((1+fee)*(1+gain));}
// Archived card template
  function card(mode){
    const n=R.t.length-1,e=R.E[n],P=R.banded[mode],p=P[n];
    if(isNaN(e))return '<h2>Average · position</h2><div class="sig-sub">not enough 4h history for every member to warm up (needs ~1,200 bars; the fallback source serves 1,000).</div>';
    const I=R.inn,on=I[n]===1,lv=R.lvl[n],M=R.members.length,nl=Math.round(e*M);
    let j=n;while(j>0&&I[j-1]===I[n])j--;
    const since=j>0?`${on?"IN":"OUT"} since ${tstr(R.t[j]+14400)} UTC`:`${on?"IN":"OUT"} for all loaded history`;
    // members that must flip for the next change: entry needs > ENS_IN·M long; while IN the
    // level steps down below its floor (the last floor is the exit) and back up at the one above
    const cnt=f=>Math.ceil(f*M-1e-9),pct=f=>Math.round(f*100)+"%",pl=k=>`${k} more member${k===1?"":"s"}`;
    let nextTxt;
    if(!on)nextTxt=`enter if ${pl(Math.floor(ENS_IN*M+1e-9)+1-nl)} turn long (above ${pct(ENS_IN)})`;
    else{const s=ENS_STEPS.findIndex(q=>q[1]===lv),f=ENS_STEPS[s][0],dn=nl-cnt(f)+1;
      nextTxt=(s===ENS_STEPS.length-1?`exit if ${pl(dn)} turn flat (below ${pct(ENS_OUT)})`
        :`step down to ${ENS_STEP_TXT(ENS_STEPS[s+1][1])} if ${pl(dn)} turn flat (below ${pct(f)})`)+
        (s>0?` · back to ${ENS_STEP_TXT(ENS_STEPS[s-1][1])} if ${pl(cnt(ENS_STEPS[s-1][0]+ENS_STEP_UP_MARGIN)-nl)} turn long (${pct(ENS_STEPS[s-1][0]+ENS_STEP_UP_MARGIN)}+)`:"");}
    const cls=on?"long":"flat",f=R.f14[n];
    let fs=n;while(fs>0&&R.trim[fs-1]===R.trim[n])fs--;
    const stale=Date.now()/1000-R.fundLast>ENS_FUND_STALE;
    const fundTxt=!R.fundSrc?'<span class="bad">Funding history unavailable — positions shown untrimmed (the backtest rows assume the trim).</span>'
      :isNaN(f)?"Funding 14d: not enough history yet — untrimmed."
      :`Funding 14d (${R.fundSrc} perp, annualised): <b style="color:${f>ENS_FUND_THR?"#d29922":"var(--text)"}">${f>=0?"+":""}${(f*100).toFixed(1)}%/yr</b> · `+
       (f>ENS_FUND_THR?`<b style="color:#d29922">crowded — desired size ×⅔</b> since ${tstr(R.t[fs]+14400)} UTC; lifts when it falls to ${Math.round(ENS_FUND_THR*100)}% or below`
        :`below the ${Math.round(ENS_FUND_THR*100)}% crowding line, no trim`)+" · re-read daily at 00:00 UTC · "+
       (stale?`<span class="bad">last funding stamp ${tstr(R.fundLast)} UTC — feed stale; the last valid reading is frozen until it resumes</span>`
        :`last stamp ${tstr(R.fundLast)} UTC`);
    const famTxt=FAMS.map(f=>{const ms=R.members.filter(q=>q.fam===f);
      return `<span style="color:${ENS_FAM[f].color}">${ENS_FAM[f].label} ${ms.filter(q=>q.now===1).length}/${ms.length}</span>`;}).join(" · ");
    const flip=q=>q.since>0?tstr(R.t[q.since]+14400).slice(0,10):"—";
    const dot=q=>`<td class="${q.now===1?"up":"mid"}" title="${q.label} · last flip ${flip(q)}">${q.now===1?"●":"○"}</td>`;
    const im=(tf,len,md)=>R.members.find(q=>q.fam==="imacd"&&q.tf===tf&&q.len===len&&q.mode===md);
    const grid=ENS_TF.map(tf=>`<tr><td>${tf}h</td>${ENS_N.map(l=>dot(im(tf,l,"zero"))).join("")}${ENS_N.map(l=>dot(im(tf,l,"state"))).join("")}</tr>`).join("");
    const gen=R.members.filter(q=>q.fam!=="imacd").map(q=>`<tr><td style="color:${ENS_FAM[q.fam].color}">${q.label}</td><td class="${q.now===1?"up":"mid"}">${q.now===1?"long":"flat"}</td><td>${flip(q)}</td></tr>`).join("");
    const recent=R.members.filter(q=>q.since>0).sort((a,b)=>b.since-a.since).slice(0,8)
      .map(q=>`<tr><td>${tstr(R.t[q.since]+14400)}</td><td style="color:${ENS_FAM[q.fam].color};text-align:left">${q.label}</td><td class="${q.now===1?"up":"dn"}">${q.now===1?"→ long":"→ flat"}</td></tr>`).join("");
    const bt=ENS_BT.map(r=>`<tr${r.k===mode?' class="open"':""}><td>${r.label}</td><td>${r.c19}%</td><td class="dn">${r.d19}%</td><td>${r.s19.toFixed(2)}</td><td>${r.c23}%</td><td class="dn">${r.d23}%</td></tr>`).join("");
    return `<h2>Average · research target</h2>
      <div class="sig-head"><span class="sig-status ${cls}">${on?"IN · "+ENS_STEP_TXT(lv)+(R.trim[n]<1?" · crowded":"")+" · "+fx(p)+" LONG":"OUT · FLAT"}</span>
        <span class="sig-sub">${since} · ${nl}/${M} members long (${(e*100).toFixed(0)}%) · ${nextTxt}</span></div>
      <div class="sig-sub" style="margin-bottom:4px">${ENS_SIZING[mode].label}${ENS_SIZING[mode].tgt?` · 20d vol ${(R.vol[n]*100).toFixed(0)}%`:""} · desired ${fx(R.pos[mode][n])} · last rebalance target <b>${fx(p)}</b>${Math.abs(R.pos[mode][n]-p)>1e-9?` <span style="color:#d29922">(gap ≤ ${ENS_BAND.toFixed(2)} — not traded until it exceeds the band)</span>`:""}</div>
      <div class="sig-sub" style="margin-bottom:4px">${fundTxt}</div>
      <div class="sig-sub" style="margin-bottom:6px">${famTxt}</div>
      ${ensRiskCard(R,mode)}
      <div class="avg-cols">
        <div><table class="tt ens-grid"><tr><th>iMACD</th>${ENS_N.map(l=>`<th>&gt;0 · ${l}</th>`).join("")}${ENS_N.map(l=>`<th>&gt;sig · ${l}</th>`).join("")}</tr>${grid}</table></div>
        <div><table class="tt"><tr><th>Member</th><th>now</th><th>last flip</th></tr>${gen}</table></div>
      </div>
      <table class="tt"><tr><th>Latest member flips (bar close, UTC)</th><th style="text-align:left">member</th><th></th></tr>${recent}</table>
      <details class="acc-research"><summary>Dollar performance · secondary accounting, not BTC accumulation</summary><div class="acc-note">These older snapshots end in September 2026 and use different windows from the BTC audit. Dollar CAGR and Sharpe do not establish BTC accumulation.</div>
      <div class="acc-scroll"><table class="tt"><tr><th>2019-01 → ${ENS_BT_END}</th><th>USD CAGR</th><th>USD max DD</th><th>USD Sharpe</th><th>2023+ USD CAGR</th><th>2023+ USD DD</th></tr>${bt}</table></div></details>
      <div class="sig-sub">Model rules: full size when more than ${pct(ENS_IN)} of the ${M} members are long; reductions below 60% to ⅔, below 50% to ⅓, and below ${pct(ENS_OUT)} to OUT. After a reduction, the model rebuilds to ⅔ at 53% or higher and to full at 63% or higher. With ${M} members, that requires ${cnt(0.53)}/${M} and ${cnt(0.63)}/${M} long votes (54% and 64% with 50 members). The recovery buffer reduces repeated resizing; it does not establish an accumulation edge. Signals use closed bars and modeled fills occur at the next bar's open.</div>
      <div class="sig-sub">Spot only, at most 1×; the rest stays in cash. Funding above ${Math.round(ENS_FUND_THR*100)}% annualized over 14 days trims desired size to ⅔. Volatility sizing can reduce it further. Changes must exceed the ${ENS_BAND.toFixed(2)} band; complete exits always change the target. Fixed BTC units drift between model rebalances. This model can finish with less BTC than holding.</div>`;
  }
