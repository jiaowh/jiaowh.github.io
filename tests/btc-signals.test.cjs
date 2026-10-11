// Compare every historical signal with the independent Python research arrays,
// then exercise the tab with failed and successful public-feed responses.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jiaow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{
    const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html; charset=utf-8':'application/json');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/Jiaow/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1050}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    let online=false;
    await page.route('**/*',r=>{
      const u=r.request().url();
      if(u.startsWith('http://127.0.0.1:'))return r.continue();
      if(online&&u.startsWith('https://data-api.binance.vision/'))return r.fulfill({json:[]});
      return r.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/btc.html?tab=signals`);
    await page.waitForFunction(()=>document.getElementById('signalSource').textContent.includes('Refresh unavailable'));
    const result=await page.evaluate(async()=>{
      const [seed,expected]=await Promise.all(['assets/btc/signal-snapshot.json','research/btc-bull-accumulation-2026/signal-parity.json'].map(p=>fetch(p).then(r=>r.json())));
      const bars=seed.bars.map(([time,open,high,low,close])=>({time,open,high,low,close}));
      const rows=BTC_SIGNALS.calculate(bars),byTime=new Map(rows.map(r=>[r.time,r]));
      let checked=0;
      for(const [time,E,ma,gate,signal] of expected){
        const r=byTime.get(time);
        if(!r||Math.abs(r.breadth-E)>1e-10||Math.abs(r.ma-ma)>.000001||r.gate!==gate||r.eligible!==signal)throw new Error('Parity mismatch '+JSON.stringify({time,expected:[E,ma,gate,signal],got:r}));
        checked++;
      }
      // Future candles must never affect a closed-bar reading.
      const future={...bars.at(-1),time:Math.ceil(Date.now()/14400000)*14400,close:1};
      const futureRows=BTC_SIGNALS.calculate([...bars,future]);
      if(JSON.stringify(rows.at(-1))!==JSON.stringify(futureRows.at(-1)))throw new Error('Forming candle changed signal');
      return {checked,last:rows.at(-1)};
    });
    assert.ok(result.checked>19000);
    assert.equal(await page.locator('#panel_signals').isVisible(),true);
    assert.equal(await page.locator('#panel_accum').isVisible(),false);
    assert.match(await page.locator('#signalCards').innerText(),/56%/);
    await page.selectOption('#signalRange','2026');
    assert.match(await page.locator('#signalCounts').innerText(),/302 bullish-filter bars · 0 also below 50%/);
    await page.selectOption('#signalRange','2022');
    assert.match(await page.locator('#signalCounts').innerText(),/23 bullish-filter bars · 23 also below 50% · 23 also in confirmed weakness · 0 new eligible/);
    await page.selectOption('#signalRange','2025');
    assert.ok(await page.locator('.signal-marker').count()>0);
    await page.locator('#signalHit').click({position:{x:200,y:100}});
    assert.match(await page.locator('#signalRead').innerText(),/UTC · BTC .*SMA200 .*breadth/);
    await page.selectOption('#signalRange','90');
    await page.screenshot({path:process.env.TEMP+'/btc-signals-desktop.png',fullPage:true});
    online=true;await page.locator('#signalRefresh').click();
    await page.waitForFunction(()=>/Binance checked|Feed is behind/.test(document.getElementById('signalSource').textContent));
    await page.locator('[data-tab="accum"]').click();assert.equal(await page.locator('#panel_signals').isVisible(),false);
    await page.locator('[data-tab="signals"]').click();
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.querySelector('#signalChart svg').viewBox.baseVal.width<400);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:process.env.TEMP+'/btc-signals-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${result.checked} independent breadth/SMA/gate/signal comparisons, forming-bar exclusion, 2022/2026 counts, refresh fallback, chart inspection, tab switching and mobile layout.`);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
