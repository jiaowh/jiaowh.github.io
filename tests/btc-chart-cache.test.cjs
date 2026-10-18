const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Jiaow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),old=new Map(),requests=[];let upgraded=false;
for(const f of ['btc.html','assets/btc/signals.js','assets/btc/timeframes.js','assets/btc/signals.css','assets/btc/fast-strategy.mjs','assets/btc/mstr-strategy.mjs'])old.set('/'+f,execFileSync('git',['show','4eefcde:'+f],{cwd:root}));
(async()=>{
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local'),file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  requests.push({upgraded,url:req.url});
  try{res.setHeader('Content-Type',/\.m?js$/.test(file)?'application/javascript':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'application/json');res.setHeader('Cache-Control',file.endsWith('.html')?'no-store':'public, max-age=31536000');res.end(!upgraded&&old.has(url.pathname)?old.get(url.pathname):fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/Jiaow/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>{if(upgraded)errors.push(e.message)});
  // Keep HTTP caching enabled: routing would disable it. Block external data via fetch,
  // and load the pinned chart build from this server in both page generations.
  await context.addInitScript(()=>{const fetchOriginal=window.fetch;window.fetch=(url,opts)=>{const target=new URL(typeof url==='string'?url:url.url,location.href);return target.origin===location.origin?fetchOriginal(url,opts):Promise.reject(Error('Offline fixture'));};
   const append=Element.prototype.appendChild;Element.prototype.appendChild=function(node){if(node.tagName==='SCRIPT'&&node.src.includes('lightweight-charts'))node.src='/assets/btc/vendor/lightweight-charts-4.2.3.js';return append.call(this,node);};});
  const url=`http://127.0.0.1:${server.address().port}/btc.html?tab=d`;
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForSelector('#tfChart_d > svg');
  assert.ok(requests.some(r=>r.url==='/assets/btc/timeframes.js'));
  upgraded=true;
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof VIEWS!=='undefined'&&VIEWS.d?.getCandles()?.length);
  for(const frame of ['d','h']){
   await page.locator(`.tab[data-tab="${frame}"]`).click();await page.waitForFunction(f=>VIEWS[f]?.getCandles()?.length,frame);
   for(const name of ['chart','imacd','rsi'])assert.ok(await page.locator(`#${name}_${frame} canvas`).count());
   assert.equal(await page.locator('#tfChart_'+frame).count(),0);
   assert.notEqual(await page.locator('#thr_'+frame).innerText(),'—');assert.notEqual(await page.locator('#rsiv_'+frame).innerText(),'—');
  }
  for(const file of ['signals.js','timeframes.js','signals.css','fast-strategy.mjs','mstr-strategy.mjs'])assert.ok(requests.some(r=>r.upgraded&&r.url.startsWith('/assets/btc/'+file+'?v=')),file+' was not versioned');
  assert.equal(requests.some(r=>r.upgraded&&r.url==='/assets/btc/timeframes.js'),false);
  assert.deepEqual(errors,[]);console.log('PASS: cached static Daily page upgrades to restored Daily/4h candle, iMACD and RSI panes; all browser module dependencies refreshed; no script errors.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
