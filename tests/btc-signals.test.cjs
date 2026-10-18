// Compare fast-strategy fills and daily regimes with independent Python research,
// then exercise the tab with failed and successful public-feed responses.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jiaow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{
    const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{res.setHeader('Content-Type',(p.endsWith('.js')||p.endsWith('.mjs'))?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html; charset=utf-8':'application/json');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/Jiaow/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1050}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    let online=false;
    await page.route('**/*',r=>{
      const u=r.request().url();
      if(u.includes('lightweight-charts'))return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'assets/btc/vendor/lightweight-charts-4.2.3.js'),'utf8')+`
const originalCreate=LightweightCharts.createChart;window.testCharts={};window.LightweightCharts={...LightweightCharts};LightweightCharts.createChart=(el,opts)=>{const chart=originalCreate(el,opts);testCharts[el.id]=chart;return chart;};`});
      if(u.startsWith('http://127.0.0.1:'))return r.continue();
      if(online&&u.startsWith('https://data-api.binance.vision/'))return r.fulfill({json:[]});
      return r.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/btc.html`);
    await page.waitForFunction(()=>document.getElementById('signalSource').textContent.includes('Refresh unavailable'));
    const result=await page.evaluate(async()=>{
      const [seed,expected,research]=await Promise.all(['assets/btc/signal-snapshot.json','research/btc-bull-accumulation-2026/signal-parity.json','research/btc-timeframe-weights-2026/summary.json'].map(p=>fetch(p).then(r=>r.json())));
      const bars=seed.bars.map(([time,open,high,low,close])=>({time,open,high,low,close}));
      const rows=BTC_SIGNALS.calculate(bars),byTime=new Map(rows.map(r=>[r.time,r]));
      let checked=0;
      for(const [time,E,ma,gate,signal] of expected){
        const r=byTime.get(time);
        if(!r||Math.abs(r.ma-ma)>.000001||r.gate!==gate)throw new Error('Parity mismatch '+JSON.stringify({time,expected:[E,ma,gate,signal],got:r}));
        checked++;
      }
      let fills=0;
      for(let y=2018;y<=2026;y++) {
        const start=Date.UTC(y,0,1)/1000,end=y===2026?Date.UTC(2026,9,10)/1000:Date.UTC(y+1,0,1)/1000;
        const trades=BTC_SIGNALS.replay(bars.filter(b=>b.time<end),rows.filter(r=>r.time<end),start);
        const want=research.details.w_1_1_1_1_1_2[String(y)].ledger;
        if(JSON.stringify(trades.map(t=>[t.side,t.time,t.price]))!==JSON.stringify(want.map(t=>[t.side,t.time,t.price])))throw Error('Fast trade parity '+y);
        fills+=trades.length;
      }
      // Future candles must never affect a closed-bar reading.
      const future={...bars.at(-1),time:Math.ceil(Date.now()/14400000)*14400,close:1};
      const futureRows=BTC_SIGNALS.calculate([...bars,future]);
      if(JSON.stringify(rows.at(-1))!==JSON.stringify(futureRows.at(-1)))throw new Error('Forming candle changed signal');
      const counts=year=>{const v=rows.filter(r=>new Date(r.time*1000).getUTCFullYear()===year&&r.gate);return [v.length,v.filter(r=>r.breadth<.5).length,v.filter(r=>r.confirmed).length,v.filter(r=>r.eligible).length];};
      return {checked,fills,last:rows.at(-1),y2022:counts(2022),y2026:counts(2026)};
    });
    assert.ok(result.checked>19000);
    assert.equal(await page.locator('#panel_signals').isVisible(),true);
    assert.equal(await page.locator('#panel_accum,[data-tab="accum"]').count(),0);
    assert.equal(await page.locator('.tab.active').getAttribute('data-tab'),'signals');
    assert.equal(await page.locator('#signalCards .signal-card').count(),2);
    assert.equal(await page.locator('#signalResults').getAttribute('open'),null);
    await page.locator('#signalResults summary').click();
    assert.match(await page.locator('#signalResults').innerText(),/2.2566/);
    assert.match(await page.locator('#signalResults').innerText(),/1.0000/);
    await page.locator('#signalResults summary').click();
    assert.match(await page.locator('#signalCards').innerText(),/FAST iMACD/);
    assert.ok((await page.locator('#signalCards').innerText()).includes(Math.round(result.last.breadth*100)+'%'));
    assert.equal(result.fills,95);
    await page.selectOption('#signalRange','2026');
    assert.equal(await page.locator('.signal-marker[data-side="sell"]').count(),0);
    assert.equal(await page.locator('.signal-marker[data-side="buy"]').count(),0);
    await page.selectOption('#signalRange','2022');
    assert.equal(await page.locator('.signal-marker').count(),0);
    await page.selectOption('#signalRange','2025');
    assert.ok(await page.locator('.signal-marker').count()>0);
    await page.locator('#signalHit').click({position:{x:200,y:100}});
    assert.match(await page.locator('#signalRead').innerText(),/UTC · BTC .*SMA200 .*breadth/);
    await page.selectOption('#signalRange','90');
    await page.screenshot({path:process.env.TEMP+'/btc-signals-desktop.png',fullPage:true});
    online=true;await page.locator('#signalRefresh').click();
    await page.waitForFunction(()=>/Binance checked|Feed is behind/.test(document.getElementById('signalSource').textContent));
    await page.locator('[data-tab="d"]').click();assert.equal(await page.locator('#panel_signals').isVisible(),false);
    await page.locator('[data-tab="signals"]').click();
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.querySelector('#signalChart svg').viewBox.baseVal.width<400);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:process.env.TEMP+'/btc-signals-mobile.png',fullPage:true});
    await page.locator('#signalResults summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.selectOption('#signalAsset','MSTR');
    assert.match(await page.locator('#signalCards').innerText(),/BTC FAST \+ VORTEX/);
    assert.match(await page.locator('#signalCards').innerText(),/86 bullish vote weights/);
    assert.match(await page.locator('#signalMSTRResults').innerText(),/6.057/);
    await page.selectOption('#signalRange','2025');
    assert.ok(await page.locator('.signal-marker').count()>0);
    assert.match(await page.locator('#signalChart svg').getAttribute('aria-label'),/MSTR/);
    await page.locator('#signalHit').click({position:{x:140,y:100}});
    assert.match(await page.locator('#signalRead').innerText(),/MSTR .*SMA200 .*breadth/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:process.env.TEMP+'/mstr-signals-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:1050});
    await page.waitForFunction(()=>document.querySelector('#signalChart svg').viewBox.baseVal.width>600);
    await page.locator('#signalResults summary').click();
    await page.screenshot({path:process.env.TEMP+'/mstr-signals-desktop.png',fullPage:true});
    await page.locator('[data-tab="indicators"]').click();
    assert.equal(await page.locator('#panel_indicators').isVisible(),true);
    assert.equal(await page.inputValue('#indicatorAsset'),'MSTR');
    async function checkIndicators(count,weight) {
      assert.equal(await page.locator('.indicator-item').count(),count);
      const votes=await page.locator('.indicator-item').evaluateAll(items=>items.map(item=>({
        weight:Number(item.dataset.weight),bullish:item.dataset.bullish,
        dot:item.querySelector('.indicator-dot').className
      })));
      assert.ok(Math.abs(votes.reduce((s,v)=>s+v.weight,0)-weight)<1e-12);
      for(const v of votes)assert.ok(v.dot.includes(v.bullish==='null'?'is-unknown':v.bullish==='true'?'is-up':'is-down'));
      const yes=votes.reduce((s,v)=>s+(v.bullish==='true'?v.weight:0),0);
      if(weight===86)assert.ok((await page.locator('#indicatorSummary').innerText()).includes(`${yes} / ${weight}`));
      else{
        assert.match(await page.locator('#indicatorSummary').innerText(),/72h ×2/);
        assert.equal(await page.locator('.indicator-item[data-group="72h"] small').count(),6);
        assert.ok(Math.abs(votes.filter(v=>Math.abs(v.weight-12/7)<1e-12).length-6)<1e-12);
      }
      assert.ok((await page.locator('#indicatorSummary').innerText()).includes(Math.round(yes/weight*100)+'%'));
      assert.equal(await page.locator('#indicatorSource').innerText(),await page.locator('#signalSource').innerText());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await checkIndicators(68,86);
    assert.equal(await page.locator('.indicator-item[data-weight="2"]').count(),18);
    await page.screenshot({path:process.env.TEMP+'/mstr-indicators-desktop.png',fullPage:true});
    await page.selectOption('#indicatorAsset','BTC');
    assert.equal(await page.inputValue('#signalAsset'),'BTC');
    await checkIndicators(50,50);
    assert.ok((await page.locator('#indicatorSummary').innerText()).includes(Math.round(result.last.breadth*100)+'%'));
    await page.screenshot({path:process.env.TEMP+'/btc-indicators-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await checkIndicators(50,50);
    await page.screenshot({path:process.env.TEMP+'/btc-indicators-mobile.png',fullPage:true});
    await page.selectOption('#indicatorAsset','MSTR');
    await checkIndicators(68,86);
    await page.screenshot({path:process.env.TEMP+'/mstr-indicators-mobile.png',fullPage:true});
    online=false;
    await page.goto(`http://127.0.0.1:${server.address().port}/btc.html?tab=indicators`);
    await page.waitForFunction(()=>document.getElementById('indicatorSource').textContent.includes('Refresh unavailable'));
    assert.equal(await page.locator('#panel_indicators').isVisible(),true);
    await checkIndicators(50,50);
    await page.goto(`http://127.0.0.1:${server.address().port}/btc.html?tab=d`);
    assert.equal(await page.locator('#panel_d').isVisible(),true);
    await page.waitForSelector('#chart_d canvas');
    const aligned=await page.evaluate(async()=>{
      const {timeframeRows}=await import('/assets/btc/timeframes.js?v=20261018-restored-charts');
      const {bars,rows}=BTC_SIGNALS.snapshot(),last=rows.at(-1);
      let comparisons=0;
      for(const [frame,group,span] of [['d','24h',86400],['h','4h',14400]])for(const length of [14,21,34]){
        const view=timeframeRows(bars,rows,frame,length,{impulseMACD}),r=view.at(-1);
        for(const cross of [false,true]){
          const label=`iMACD ${length} ${cross?'above signal':'above zero'}`;
          const member=last.members.find(m=>m.group===group&&m.label===label);
          if(member.bullish!==(r.md>(cross?r.sb:0)))throw Error('Oscillator vote mismatch '+label+frame);
          comparisons++;
        }
        const source=rows.find(v=>v.time===r.closeTime-14400);
        if(r.ma!==source.ma||r.gate!==source.gate)throw Error('Daily regime mismatch');
        if(view.some(v=>v.closeTime>last.closeTime||v.time%span))throw Error('Unclosed or unaligned candle');
        const future={...bars.at(-1),time:last.closeTime,close:1};
        if(JSON.stringify(view)!==JSON.stringify(timeframeRows([...bars,future],rows,frame,length,{impulseMACD})))throw Error('Unconfirmed candle changed detail chart');
      }
      return comparisons;
    });
    assert.equal(aligned,12);
    for(const frame of ['d','h']){
      await page.locator(`.tab[data-tab="${frame}"]`).click();
      await page.selectOption('#tfRange_'+frame,'90');
      await page.selectOption('#iLength_'+frame,'21');
      assert.ok(await page.locator('#imacd_'+frame+' canvas').count());
      assert.ok(await page.locator('#rsi_'+frame+' canvas').count());
      assert.ok(Number.isFinite(Number(await page.locator('#rsiv_'+frame).innerText())));
      await page.locator('#chart_'+frame).click({position:{x:100,y:80}});
      assert.notEqual(await page.locator('#thr_'+frame).innerText(),'—');
      assert.ok(await page.locator('#chart_'+frame+' > svg').count()===0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const ranges=await page.evaluate(frame=>{
        const panes=['chart_','imacd_','rsi_'].map(id=>testCharts[id+frame]);
        const initial=panes[0].timeScale().getVisibleLogicalRange();
        panes[1].timeScale().setVisibleLogicalRange({from:initial.from+10,to:initial.to+10});
        return panes.map(p=>p.timeScale().getVisibleLogicalRange());
      },frame);
      assert.deepEqual(ranges[0],ranges[1]);assert.deepEqual(ranges[1],ranges[2]);
      // Exercise actual price-axis dragging on all three panes.
      await page.setViewportSize({width:1280,height:1050});
      for(const prefix of ['chart_','imacd_','rsi_']){
        const box=page.locator('#'+prefix+frame);await box.scrollIntoViewIfNeeded();
        const rect=await box.boundingBox();
        await page.mouse.move(rect.x+rect.width-30,rect.y+rect.height*.35);
        await page.mouse.down();await page.mouse.move(rect.x+rect.width-30,rect.y+rect.height*.65,{steps:10});await page.mouse.up();
        assert.equal(await page.evaluate(id=>testCharts[id].priceScale('right').options().autoScale,prefix+frame),false);
      }
      await page.locator('#tfReset_'+frame).click();
      assert.equal(await page.evaluate(frame=>['chart_','imacd_','rsi_'].every(id=>testCharts[id+frame].priceScale('right').options().autoScale),frame),true);
      await page.selectOption('#tfRange_'+frame,'365');
      const year=await page.evaluate(frame=>testCharts['chart_'+frame].timeScale().getVisibleLogicalRange(),frame);
      assert.ok(year.to-year.from>ranges[0].to-ranges[0].from);
      await page.selectOption('#tfRange_'+frame,'90');
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:process.env.TEMP+`/btc-aligned-${frame}-mobile.png`,fullPage:true});
      await page.setViewportSize({width:1280,height:1050});
      await page.screenshot({path:process.env.TEMP+`/btc-aligned-${frame}-desktop.png`,fullPage:true});
      await page.setViewportSize({width:390,height:844});
    }
    assert.equal(await page.locator("body").innerText().then(t=>t.includes("108 variants tested")),false);
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${result.checked} independent daily-regime comparisons and ${result.fills} fast-strategy fills, forming-bar exclusion, default signals tab, removed accumulation, collapsed latest results, 2022/2026 counts, refresh fallback, chart inspection, explicit tab links and mobile layout.`);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
