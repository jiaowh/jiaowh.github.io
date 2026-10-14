// Browser checks require Playwright and Chromium; env vars can override local paths.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jiaow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',(p.endsWith('.js')||p.endsWith('.mjs'))?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.png')?'image/png':'application/json');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/Jiaow/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
try{
const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
const base='http://127.0.0.1:'+server.address().port;
await page.goto(base+'/btc-trades.html');
const q=k=>page.locator(`[data-role="${k}"]`);
assert.match(await q('summary').innerText(),/0.973899 BTC equivalent/);
assert.equal(await q('price').locator('.mark').count(),16);assert.equal(await q('ledger').locator('tr').count(),8);
await q('ledger').locator('button').first().click();
assert.match(await q('detail').innerText(),/-8.52% BTC/);assert.equal(await q('price').locator('.mark').count(),2);
await q('reset').click();assert.equal(await q('price').locator('.mark').count(),16);
await q('account').selectOption('from2023');
assert.match(await q('summary').innerText(),/1.622386 BTC equivalent/);assert.match(await q('ledger').innerText(),/2024-12-28/);
await q('ledger').locator('button').first().click();assert.match(await q('detail').innerText(),/2025-01-11/);
await q('reset').click();
await q('account').selectOption('fresh');await q('year').selectOption('2020');assert.match(await q('summary').innerText(),/0.881808 BTC equivalent/);
let combinations=0;
for(const model of ['current','refined'])for(const strategy of ['overlay','calendar'])for(const account of ['fresh','from2018','from2023'])for(let y=account==='from2023'?2023:2018;y<=2026;y++){
  await q('rule').selectOption(model);
  await q('year').selectOption(String(y));await q('account').selectOption(account);await q('strategy').selectOption(strategy);
  assert.doesNotMatch(await q('summary').innerText(),/NaN|undefined/);assert.ok(await q('price').locator('svg').count());
  const expected=await page.evaluate(({model,strategy,account,y})=>window.BTC_TRADE_REPLAY.models[model].accounts[strategy+':'+account+(account==='fresh'?':'+y:'')].fills.filter(f=>new Date(f.time*1000).getUTCFullYear()===y).length,{model,strategy,account,y});
  assert.equal(await q('price').locator('.mark').count(),expected);combinations++;
}
await q('year').selectOption('2025');await q('account').selectOption('fresh');await q('strategy').selectOption('overlay');await q('rule').selectOption('refined');
assert.match(await q('summary').innerText(),/1.150565 BTC equivalent/);assert.match(await q('rules').innerText(),/3 closed 4h bars/);assert.match(await q('ledger').innerText(),/7-day timeout/);
await q('rule').selectOption('current');
await q('year').selectOption('2026');await q('account').selectOption('fresh');await q('strategy').selectOption('calendar');
assert.match(await q('summary').innerText(),/End holdings: 0.000000 BTC/);assert.match(await q('ledger').innerText(),/Still in cash/);
await q('strategy').selectOption('overlay');assert.equal(await q('price').locator('.mark').count(),0);assert.match(await q('ledger').innerText(),/No trades/);
await q('year').selectOption('2025');await page.screenshot({path:process.env.TEMP+'/btc-trades-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>Number(document.querySelector('[data-role="price"] svg').getAttribute('width'))<400);
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)){console.log(await page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>!e.closest('.tablewrap')&&e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,cls:e.getAttribute('class'),right:e.getBoundingClientRect().right,text:e.textContent.slice(0,60)})).slice(0,20)));await page.screenshot({path:process.env.TEMP+'/btc-trades-overflow.png',fullPage:true});}
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await q('ledger').locator('button').first().click();assert.match(await q('detail').innerText(),/-8.52% BTC/);
await q('reset').click();await page.screenshot({path:process.env.TEMP+'/btc-trades-mobile.png',fullPage:true});
await page.goto(base+'/btc.html');await page.locator('#signalResults summary').click();assert.equal(await page.locator('#signalResults a[href="btc-trades.html?rule=refined"]').count(),1);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
await page.goto(base+'/btc-trades.html?rule=refined');assert.match(await q('summary').innerText(),/1.150565 BTC equivalent/);
await page.setViewportSize({width:1280,height:1000});await page.waitForFunction(()=>Number(document.querySelector('[data-role="price"] svg').getAttribute('width'))>1000);
await page.screenshot({path:process.env.TEMP+'/btc-trades-refined.png',fullPage:true});
console.log(`PASS: ${combinations} year/account/strategy views, exact marker counts, year-crossing trades, zoom/reset, cash exits, no-trade years, mobile layout, compact results link and no JS errors.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
