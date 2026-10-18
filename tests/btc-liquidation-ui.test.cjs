const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jiaow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{
    const p=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
    if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{res.setHeader('Content-Type',/\.m?js$/.test(p)?'application/javascript':p.endsWith('.html')?'text/html':'application/json');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/Jiaow/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));let fail=false,requests=0,slow=false;
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();
      if(u.hostname==='fapi.binance.com'&&u.pathname.endsWith('/klines')){
        requests++;if(process.env.LIQ_LIVE==='1')return route.continue();if(fail)return route.fulfill({status:503,body:'offline'});
        const iv=u.searchParams.get('interval'),step={'5m':300,'15m':900,'1h':3600,'4h':14400}[iv];
        const end=Math.floor(+u.searchParams.get('endTime')/(step*1000))*step,n=+u.searchParams.get('limit');
        const rows=Array.from({length:n},(_,i)=>{
          const time=end-(n-1-i)*step,j=time/step,close=80000+700*Math.sin(j/55)+350*Math.sin(j/13),v=1e7*(1.1+.7*Math.sin(j/5));
          return [time*1000,close,close+80,close-80,close,0,0,v,0,0,v*(.5+.15*Math.sin(j/7))];
        });
        if(slow&&iv==='15m')await new Promise(r=>setTimeout(r,180));
        return route.fulfill({json:rows});
      }
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/btc.html`);
    await page.locator('.tab[data-tab="liq"]').click();
    await page.waitForFunction(()=>document.getElementById('liq_src').textContent.includes('Binance perp'));
    assert.equal(requests,3,'Visible range plus 7 days needs pagination');
    assert.match(await page.locator('#liqMag').innerText(),/Strongest above \$/);
    const pixels=()=>page.locator('#liqCanvas').evaluate(c=>c.toDataURL());
    const balanced=await pixels();await page.selectOption('#liqContrast','strong');assert.notEqual(await pixels(),balanced);
    await page.selectOption('#liqContrast','balanced');await page.selectOption('#liqFocus','all');assert.notEqual(await pixels(),balanced);
    await page.selectOption('#liqFocus','near');
    await page.locator('#liqOverlay').hover({position:{x:250,y:160}});assert.match(await page.locator('#liqTip').innerText(),/relative heat/);
    await page.mouse.move(0,0);
    await page.screenshot({path:process.env.TEMP+'/btc-liquidation-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
    await page.screenshot({path:process.env.TEMP+'/btc-liquidation-mobile.png',fullPage:true});
    const overflow=await page.evaluate(()=>({wide:document.documentElement.scrollWidth>innerWidth,items:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().height>0).map(e=>({id:e.id,tag:e.tagName,cls:e.className,w:e.getBoundingClientRect().width})).slice(-15)}));
    assert.equal(overflow.wide,false,JSON.stringify(overflow.items));
    await page.locator('#liqOverlay').hover({position:{x:70,y:160}});
    assert.ok(await page.locator('#liqTip').evaluate(e=>e.getBoundingClientRect().left>=0&&e.getBoundingClientRect().right<=innerWidth));
    await page.mouse.move(0,0);await page.screenshot({path:process.env.TEMP+'/btc-liquidation-mobile.png',fullPage:true});
    if(process.env.LIQ_LIVE==='1'){console.log('PASS: live perpetual feed, desktop/mobile render and controls');return;}
    for(const tier of [10,25,50,100])await page.uncheck('#lv'+tier);
    assert.equal(await page.locator('#liqMag').innerText(),'Select a leverage tier');
    await page.check('#lv50');
    slow=true;await page.selectOption('#liqRange','7d');await page.selectOption('#liqRange','24h');
    await page.waitForFunction(()=>document.getElementById('liq_src').textContent.includes('Binance perp'));
    await page.waitForTimeout(500);assert.equal(await page.locator('#liqRange').inputValue(),'24h');
    fail=true;await page.locator('#refresh').click();
    await page.waitForFunction(()=>document.getElementById('liq_src').textContent.includes('unavailable'));
    assert.match(await page.locator('#liqMag').innerText(),/No verified/);
    assert.equal(await page.locator('#liqCanvas').evaluate(c=>c.getContext('2d').getImageData(0,0,1,1).data[3]),0);
    fail=false;await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('liq_src').textContent.includes('Binance perp'));
    assert.deepEqual(errors,[]);
    console.log('PASS: seeded heatmap, contrast/focus/leverage/range controls, tooltip, desktop/mobile at 2x resolution, feed failure clears chart and Refresh retries.');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
