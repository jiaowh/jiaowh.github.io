const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jiaow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const lib=fs.readFileSync(process.env.BTC_CHART_LIBRARY||path.join(root,'research/btc-intraday-tuning-2026/cache/lightweight-charts.js'));
(async()=>{
  const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{res.setHeader('Content-Type',/\.m?js$/.test(p)?'application/javascript':p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':'application/json');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/Jiaow/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1050}}),errors=[],logs=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')logs.push(m.text());});
    const end=Math.floor(Date.now()/3600000)*3600;
    const mock=span=>Array.from({length:5500},(_,i)=>{const o=80000+1000*Math.sin(i/30)+500*Math.sin(i/7)+i*2,c=o+100*Math.sin(i/3);return [(end-(5500-i)*span)*1000,o,Math.max(o,c)+90,Math.min(o,c)-90,c,10];});
    const frames={'1h':mock(3600),'5m':mock(300)};
    await page.route('**/*',route=>{const u=new URL(route.request().url());
      if(u.hostname==='127.0.0.1')return route.continue();
      if(u.pathname.includes('lightweight-charts'))return route.fulfill({body:lib,contentType:'application/javascript'});
      if(u.hostname==='api.binance.com'&&u.pathname.endsWith('/klines')){const data=frames[u.searchParams.get('interval')];if(data){const before=Number(u.searchParams.get('endTime')||Infinity),n=Number(u.searchParams.get('limit'));return route.fulfill({json:data.filter(r=>r[0]<=before).slice(-n)});}}
      return route.abort();});
    await page.goto(`http://127.0.0.1:${server.address().port}/btc.html?tab=5m`);
    try{await page.waitForFunction(()=>typeof VIEWS!=='undefined'&&VIEWS['5m']?.getScalp());}catch(e){console.log({errors,logs,state:await page.evaluate(()=>({views:Object.keys(VIEWS),one:VIEWS['1h']?.getCandles()?.length,five:VIEWS['5m']?.getCandles()?.length,status:document.getElementById('statusText').textContent}))});throw e;}
    for(const tf of ['1h','5m']){
      await page.locator(`.tab[data-tab="${tf}"]`).click();
      const before=await page.locator('#thr_'+tf).innerText();
      await page.selectOption('#iLength_'+tf,'14');await page.selectOption('#iSignal_'+tf,'13');
      assert.notEqual(await page.locator('#thr_'+tf).innerText(),before);
      assert.ok(await page.locator('#imacd_'+tf+' canvas').count());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(tf==='5m'){
        await page.selectOption('#scalpRR','2');await page.selectOption('#scalpHours','24');
        const state=await page.evaluate(()=>{const s=VIEWS['5m'].getScalp(),b=VIEWS['5m'].getCandles(),expected=impulseMACD(b,14,13);return {md:s.f5.md.at(-1),expected:expected.md.at(-1),turns:s.f5.turns.length,trades:s.trades.map(t=>({entry:t.entry,open:s.f5.o[t.entryI],confirm:t.confirmI,index:t.entryI,hold:t.timeStop,r:(t.tp-t.entry)/t.risk,exit:t.exitI})),last:b.at(-1).time};});
        assert.equal(state.md,state.expected);assert.ok(state.turns>0);assert.ok(state.last+300<=Date.now()/1000);
        for(let i=0;i<state.trades.length;i++){const t=state.trades[i];assert.equal(t.entry,t.open);assert.equal(t.index,t.confirm+1);assert.equal(t.hold,288);assert.ok(Math.abs(t.r-2)<1e-10);if(i)assert.ok(state.trades[i-1].exit<t.index);}
        assert.match(await page.locator('#scalp_5m').innerText(),/Research only/);
      }
      await page.screenshot({path:process.env.TEMP+`/btc-intraday-${tf}-desktop.png`,fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.screenshot({path:process.env.TEMP+`/btc-intraday-${tf}-mobile.png`,fullPage:true});
      const overflow=await page.evaluate(()=>({wide:document.documentElement.scrollWidth>innerWidth,items:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().height>0).slice(-10).map(e=>({tag:e.tagName,id:e.id,cls:e.className,w:e.getBoundingClientRect().width}))}));
      assert.equal(overflow.wide,false,JSON.stringify({items:overflow.items,layout:await page.evaluate(()=>({inner:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,rect:document.body.getBoundingClientRect().width,elements:[...document.querySelectorAll('body *')].filter(e=>e.scrollWidth>e.clientWidth&&e.clientWidth>0).map(e=>({id:e.id,tag:e.tagName,w:e.clientWidth,scroll:e.scrollWidth,overflow:getComputedStyle(e).overflowX})).slice(0,15)}))}));
      await page.setViewportSize({width:1280,height:1050});
    }
    assert.deepEqual(errors,[]);console.log('PASS: 1h/5m parameter controls, rendered charts, confirmed candles, preview settings, next-open fills and desktop/mobile layout.');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
