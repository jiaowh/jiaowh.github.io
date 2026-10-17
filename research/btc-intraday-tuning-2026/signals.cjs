// Use the page's exact iMACD, divergence, threshold and confluence implementation.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const here=__dirname,root=path.resolve(here,'../..');
const src=fs.readFileSync(path.join(root,'btc.html'),'utf8');
const math=src.slice(src.indexOf('function ema('),src.indexOf('// =================================================================',src.indexOf('function scalpTrades(')));
const {scalpFrame,scalpScan}=new Function(math+'\nreturn {scalpFrame,scalpScan};')();
const load=k=>JSON.parse(fs.readFileSync(path.join(here,'cache',k+'.json'))).map(([time,open,high,low,close])=>({time,open,high,low,close}));
const audit={prefixChecks:[],source:'Exact btc.html indicator and confluence functions'};
function validRuns(B,span){let last=-1;return B.map((b,i)=>{if(!i||b.time-B[i-1].time!==span)last=i;return i-last>=1000;});}
function higherIndices(B,H,span,hspan){let j=-1;return B.map(b=>{while(j+1<H.length&&H[j+1].time+hspan<=b.time+span)j++;return j;});}
function lower(a,x,key=v=>v){let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(key(a[m])<x)lo=m+1;else hi=m;}return lo;}
function fastScan(f,h){
  // Indexed equivalent of scalpScan's long side, checked against the original below.
  const divs=[...f.divRsi,...f.divIm].filter(d=>d.type==='bull').sort((a,b)=>a.i-b.i),out=[];
  const good=t=>t&&t.type==='min'&&t.val<-(t.thr??h.thr);
  for(const t of f.turns){
    if(t.type!=='min'||!(t.val<-(t.thr??f.thr)))continue;
    const a=lower(divs,t.i-12,d=>d.i),b=lower(divs,t.i+13,d=>d.i);if(a===b)continue;
    let dv=divs[a];for(let k=a+1;k<b;k++)if(divs[k].confirm<dv.confirm)dv=divs[k];
    const bb=f.bbBelow[lower(f.bbBelow,t.i-12)];if(bb===undefined||bb>t.i+12)continue;
    let i=Math.max(t.confirm,dv.confirm,bb);if(i>=f.n)continue;
    let time=f.closeTime(i),j=lower(h.turns,time+1,t=>h.closeTime(t.confirm))-1;
    if(!good(h.turns[j])){j++;if(!good(h.turns[j]))continue;time=h.closeTime(h.turns[j].confirm);i=f.idxAtOrBefore(time-f.barSecs);}
    if(i>=0&&i-t.i<=24)out.push({confirmI:i,dotI:t.i,confirmTs:time});
  }
  return out.sort((a,b)=>a.confirmTs-b.confirmTs);
}
function candidates(B,H,span,hspan,length,signal){
  const f=scalpFrame(B,span,{length,signal}),h=scalpFrame(H,hspan,{length,signal});
  const v=validRuns(B,span),hv=validRuns(H,hspan),hi=higherIndices(B,H,span,hspan);
  const safe=i=>v[i]&&hi[i]>=0&&hv[hi[i]];
  const stop=(lo,i)=>Math.min(...f.l.slice(lo,i+1))-.3*f.atr[i];
  const pack=(i,lo)=>({i,time:B[i].time+span,stop:stop(lo,i),atr:f.atr[i]});
  const confluence=fastScan(f,h).filter(s=>safe(s.confirmI)).map(s=>pack(s.confirmI,s.dotI));
  const turn=f.turns.filter(t=>t.type==='min'&&t.val<-t.thr&&t.confirm-t.i<=24&&safe(t.confirm)&&h.cl[hi[t.confirm]]>h.sma200[hi[t.confirm]])
    .map(t=>pack(t.confirm,t.i));
  const cross=[];
  for(let i=1;i<B.length;i++)if(safe(i)&&f.md[i]>0&&f.md[i]>f.sb[i]&&f.md[i-1]<=f.sb[i-1]&&h.cl[hi[i]]>h.sma200[hi[i]])cross.push(pack(i,Math.max(0,i-9)));
  return {confluence,turn,cross};
}
for(const [key,hkey,span,hspan] of [['5m','1h',300,3600],['1h','4h',3600,14400]]){
  const B=load(key),H=load(hkey),out={};
  const valid=validRuns(B,span),hv=validRuns(H,hspan),hi=higherIndices(B,H,span,hspan),coverage={};
  for(let i=0;i<B.length;i++){
    const year=new Date(B[i].time*1000).getUTCFullYear();coverage[year]??={bars:0,eligible:0};coverage[year].bars++;
    if(valid[i]&&hi[i]>=0&&hv[hi[i]])coverage[year].eligible++;
  }
  audit[key]={eligibleCoverage:coverage,indexedScanParity:true};
  const sample=B.slice(0,15000),end=sample.at(-1).time+span;
  const sf=scalpFrame(sample,span),sh=scalpFrame(H.filter(b=>b.time+hspan<=end),hspan);
  const signature=s=>[s.confirmI,s.dotI,s.confirmTs];
  assert.equal(JSON.stringify(fastScan(sf,sh).map(signature)),JSON.stringify(scalpScan(sf,sh).filter(s=>s.dir==='long').map(signature)),key+' indexed scan parity');
  for(const length of [14,21,34])for(const signal of [9,13]){
    const id=`${length}-${signal}`,r=candidates(B,H,span,hspan,length,signal);out[id]=r;
    // Prefix checks on each tuning setting, not just the eventual winner.
    for(const cut of [Math.floor(B.length*.58),Math.floor(B.length*.83)]){
      const end=B[cut-1].time+span;
      const p=candidates(B.slice(0,cut),H.filter(b=>b.time+hspan<=end),span,hspan,length,signal);
      for(const kind of Object.keys(r))assert.equal(JSON.stringify(p[kind]),JSON.stringify(r[kind].filter(s=>s.i<cut)),`${key} ${id} ${kind} prefix`);
      audit.prefixChecks.push({frame:key,parameters:id,cut,pass:true});
    }
    console.log(key,id,Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v.length])), 'prefixes OK');
  }
  fs.writeFileSync(path.join(here,'cache',key+'-signals.json'),JSON.stringify(out));
}
fs.writeFileSync(path.join(here,'signal-audit.json'),JSON.stringify(audit,null,2));
