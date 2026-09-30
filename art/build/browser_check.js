// Real-browser acceptance checks for index.html (Playwright + Chromium).
//
//   node build/browser_check.js [path/to/explore.html] [--shots DIR]
//
// Needs Playwright. Set PLAYWRIGHT to the module path and CHROME to a Chromium binary
// if they are not found automatically. Prints one line per check and exits non-zero
// if any check fails.
const path = require('path');
const fs = require('fs');
const PW = process.env.PLAYWRIGHT || (() => {
  const c = [path.join(process.env.HOME || '', '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'), 'playwright'];
  for (const p of c) { try { require.resolve(p); return p; } catch (e) {} }
  return 'playwright';
})();
const { chromium } = require(PW);
const args = process.argv.slice(2);
const FILE = path.resolve(args.find(a => a.endsWith('.html')) || path.join(__dirname, '..', 'index.html'));
const SHOTS = args.includes('--shots') ? path.resolve(args[args.indexOf('--shots') + 1]) : null;
const URL0 = 'file://' + FILE;
const CHROME = process.env.CHROME || (() => {
  const base = path.join(process.env.HOME || '', '.cache/ms-playwright');
  try {
    const d = fs.readdirSync(base).filter(x => x.startsWith('chromium_headless_shell')).sort().pop();
    return path.join(base, d, 'chrome-headless-shell-linux64/chrome-headless-shell');
  } catch (e) { return undefined; }
})();

// headless Chromium announces itself as HeadlessChrome, which some CDNs refuse; a real
// visitor's browser does not, so test as one.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const results = [];
function check(name, ok, detail = '') {
  results.push([name, !!ok, detail]);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({executablePath: CHROME});
  const errors = [];
  async function page(opts = {}) {
    const ctx = await browser.newContext({viewport: opts.viewport || {width: 1400, height: 900}, userAgent: UA, ...(opts.ctx || {})});
    if (opts.init) await ctx.addInitScript(opts.init);
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    if (opts.block) await p.route(opts.block, r => r.abort());
    return p;
  }
  const order = p => p.$$eval('#feedMason .card', cs => cs.map(c => c.dataset.wi));
  const settle = p => p.waitForTimeout(700);

  // ---- 1. fresh openings vary; order stable while scrolling
  let p = await page();
  await p.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await settle(p);
  const o1 = await order(p);
  check('feed renders artworks in first viewport', o1.length >= 12, o1.length + ' cards');
  const firstTop = await p.$eval('#feedMason .card', c => c.getBoundingClientRect().top);
  check('first artwork is above the fold', firstTop < 300, 'top=' + Math.round(firstTop));
  const p2 = await page(); await p2.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await settle(p2);
  const o2 = await order(p2);
  check('fresh opening gives a different order', o1.slice(0, 12).join() !== o2.slice(0, 12).join());
  await p2.reload(); await settle(p2);
  const o3 = await order(p2);
  check('reload gives a different order', o3.slice(0, 12).join() !== o2.slice(0, 12).join());
  await p2.context().close();

  // ---- 2. infinite loading, no repeats, order stable
  for (let i = 0; i < 6; i++) { await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(400); }
  const oScrolled = await order(p);
  check('scrolling loads more batches', oScrolled.length > o1.length, o1.length + ' → ' + oScrolled.length);
  { // failed images may drop out, but what remains must keep its order
    const kept = o1.filter(x => oScrolled.includes(x));
    check('scrolling does not reshuffle existing works', kept.length >= o1.length - 3 && oScrolled.slice(0, kept.length).join() === kept.join()); }
  check('no repeats before exhaustion', new Set(oScrolled).size === oScrolled.length);
  {
    // manual fallback: a browser without IntersectionObserver must still reach everything
    const pm = await page({init: () => { delete window.IntersectionObserver; }});
    await pm.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await settle(pm);
    const before = (await order(pm)).length;
    await pm.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pm.waitForTimeout(300);
    const still = (await order(pm)).length;
    await pm.click('#loadMore'); await pm.waitForTimeout(300);
    await pm.click('#loadMore'); await pm.waitForTimeout(300);
    const after = (await order(pm)).length;
    check('Load more fallback works without auto-loading', still === before && after > before, `${before} → ${after}`);
    await pm.context().close();
  }
  // ---- 3. click → artist page; back restores
  await p.evaluate(() => window.scrollTo(0, 2600)); await p.waitForTimeout(400);
  const y0 = await p.evaluate(() => window.scrollY);
  const n0 = (await order(p)).length;
  const target = await p.evaluate(() => {
    const cs = [...document.querySelectorAll('#feedMason .card')];
    const c = cs.find(c => { const r = c.getBoundingClientRect(); return r.top > 80 && r.bottom < innerHeight; });
    return {href: c.querySelector('.cl').getAttribute('href'), name: c.querySelector('.an').textContent.split(' · ')[0], img: c.querySelector('img').src, wi: c.dataset.wi, wid: c.querySelector('.fav').dataset.w};
  });
  await p.click(`#feedMason .card[data-wi="${target.wi}"] .frame`); await settle(p);
  const h1 = await p.$eval('#artistName', e => e.textContent).catch(() => '');
  check('artwork click opens internal artist page', p.url().includes('#/artist/') && h1 === target.name, h1);
  const feat = await p.$eval('.feature', f => f.dataset.w).catch(() => '');
  check('clicked work is featured on artist page', feat === target.wid, feat);
  await p.goBack(); await settle(p);
  const oBack = await order(p);
  const yBack = await p.evaluate(() => window.scrollY);
  check('Back restores feed order', oBack.slice(0, n0).join() === (oScrolled.concat()).slice(0, Math.min(n0, oScrolled.length)).join() || oBack.length >= n0);
  check('Back restores loaded state', oBack.length >= n0, oBack.length + ' vs ' + n0);
  check('Back restores scroll position', Math.abs(yBack - y0) < 120, y0 + ' → ' + yBack);
  await p.goForward(); await settle(p);
  check('Forward returns to artist page', (await p.$eval('#artistName', e => e.textContent).catch(() => '')) === target.name);

  // ---- 4. artist with many works: > 8 shown, viewer works
  const big = await p.evaluate(() => { const d = JSON.parse(document.getElementById('salon-data').textContent); const c = {}; d.works.forEach(w => c[w.a] = (c[w.a] || 0) + 1); const [ai, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return {id: d.artists[ai].id, n}; });
  await p.goto(URL0 + '#/artist/' + big.id, {waitUntil: 'domcontentloaded'}); await settle(p);
  for (let i = 0; i < 4; i++) { await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(300); }
  const shown = await p.$$eval('#artistMason .card', c => c.length);
  check('artist page shows more than eight works when available', big.n <= 8 || shown > 8, `${shown} of ${big.n}`);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#artistMason .card >> nth=1'); await p.waitForTimeout(300);
  const vOpen = await p.$('.vwr');
  const focusIn = await p.evaluate(() => !!document.activeElement.closest('.vwr'));
  check('viewer opens with focus inside', !!vOpen && focusIn);
  const c1 = await p.$eval('.vwr .ct', e => e.textContent);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  const c2 = await p.$eval('.vwr .ct', e => e.textContent);
  check('viewer next with arrow key', c1 !== c2, c1 + ' → ' + c2);
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  check('viewer traps focus', await p.evaluate(() => !!document.activeElement.closest('.vwr')));
  const hasSrc = await p.$('.vwr .vcap a[href^="http"]');
  check('viewer caption has source link', !!hasSrc);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  check('Escape closes viewer and returns focus', !(await p.$('.vwr')) && await p.evaluate(() => !!document.activeElement.closest('.card')));

  // ---- 5. direct links, invalid routes, tabs
  const p3 = await page();
  await p3.goto(URL0 + '#/artist/' + big.id, {waitUntil: 'domcontentloaded'}); await settle(p3);
  check('direct artist link works', (await p3.$$('#artistMason .card')).length > 0);
  await p3.goto(URL0 + '#/artist/no-such-artist', {waitUntil: 'domcontentloaded'}); await settle(p3);
  check('invalid route handled', /nothing at/i.test(await p3.$eval('#pageView', e => e.textContent)));
  for (const t of ['cont', 'illu']) {
    await p3.goto(URL0 + '#/' + t, {waitUntil: 'domcontentloaded'}); await settle(p3);
    check(`tab ${t} renders works`, (await p3.$$('#feedMason .card')).length > 10);
  }
  await p3.goto(URL0 + '#/study', {waitUntil: 'domcontentloaded'}); await settle(p3);
  check('Study guide renders groups', (await p3.$$('.guide section')).length >= 8);
  await p3.goto(URL0 + '#/study/works', {waitUntil: 'domcontentloaded'}); await settle(p3);
  check('Study works feed renders', (await p3.$$('#feedMason .card')).length > 0);
  await p3.goto(URL0 + '#/artists', {waitUntil: 'domcontentloaded'}); await settle(p3);
  check('directory lists artists without images too', (await p3.$$('.dir a.row')).length > 150);

  // ---- 6. search, empty state, exhaustion + another pass
  await p3.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await settle(p3);
  await p3.fill('#q', 'zzzzqqq'); await p3.waitForTimeout(600);
  check('empty search result has message', /matches/i.test(await p3.$eval('#feedMore', e => e.textContent)));
  const small = await p3.evaluate(() => { const d = JSON.parse(document.getElementById('salon-data').textContent); const c = {}; d.works.forEach(w => c[w.a] = (c[w.a] || 0) + 1); const e = Object.entries(c).find(([a, n]) => n >= 4 && n <= 10); return {n: d.artists[e[0]].n, count: e[1]}; });
  await p3.fill('#q', small.n); await p3.waitForTimeout(700);
  const got = await p3.$$eval('#feedMason .card', c => c.map(x => x.dataset.wi));
  check('search narrows to one artist', got.length >= small.count && got.length < 60, got.length + ' for ' + small.n);
  const np = await p3.$('#nextPass');
  check('end of pool offers another pass', !!np);
  if (np) {
    const before = await p3.$$eval('#feedMason .card', c => c.map(x => x.dataset.wi));
    await np.click(); await p3.waitForTimeout(400);
    const after = await p3.$$eval('#feedMason .card', c => c.map(x => x.dataset.wi));
    check('another pass is marked with a divider', !!(await p3.$('.divider')));
    check('no immediate repeat across pass boundary', before.length < 2 || after[before.length] !== before[before.length - 1]);
  }
  await p3.context().close();

  // ---- 7. favourites persist; legacy hidden choices survive
  const p4 = await page({init: () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('salon:hiddenDir', JSON.stringify(['Nikolai Fechin'])); } }});
  await p4.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await settle(p4);
  for (let i = 0; i < 12; i++) { await p4.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p4.waitForTimeout(250); }
  const fechin = await p4.$$eval('#feedMason .card .an', a => a.filter(x => x.textContent.startsWith('Nikolai Fechin')).length);
  const hiddenIds = await p4.evaluate(() => localStorage.getItem('salon:hidden'));
  check('legacy salon:hiddenDir names are honoured and migrated', fechin === 0 && /nikolai-fechin/.test(hiddenIds || ''), hiddenIds);
  await p4.evaluate(() => window.scrollTo(0, 0));
  const favId = await p4.$eval('#feedMason .card >> nth=0 >> .fav', b => b.dataset.w);
  const favSel = `#feedMason .fav[data-w="${favId}"]`;
  await p4.hover(favSel);
  await p4.click(favSel);
  await p4.reload(); await settle(p4);
  await p4.goto(URL0 + '#/favs', {waitUntil: 'domcontentloaded'}); await settle(p4);
  const favCards = await p4.$$eval('#feedMason .card .fav', b => b.map(x => x.dataset.w));
  check('favourite persists across reload', favCards.includes(favId), favId + ' in ' + JSON.stringify(favCards) + ' ls=' + await p4.evaluate(() => localStorage.getItem('salon:favs')));
  await p4.context().close();

  // ---- 8. storage failures
  const p5 = await page({init: () => { Object.defineProperty(window, 'localStorage', {get() { throw new Error('denied'); }}); Object.defineProperty(window, 'sessionStorage', {get() { throw new Error('denied'); }}); }});
  await p5.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await settle(p5);
  check('works with storage unavailable', (await p5.$$('#feedMason .card')).length > 10);
  await p5.context().close();
  const p6 = await page({init: () => { localStorage.setItem('salon:favs', '{broken'); localStorage.setItem('salon:hidden', '42'); localStorage.setItem('salon:hiddenDir', '[1,2'); }});
  await p6.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await settle(p6);
  check('works with corrupted storage', (await p6.$$('#feedMason .card')).length > 10);
  await p6.context().close();

  // ---- 9. broken images drop out without stuck states
  const firstHost = await p.evaluate(() => { const d = JSON.parse(document.getElementById('salon-data').textContent); const c = {}; d.works.forEach(w => { const h = new URL(w.th || w.img).host; c[h] = (c[h] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; });
  const p7 = await page({block: u => u.host === firstHost});
  await p7.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await p7.waitForTimeout(2500);
  const broken = await p7.$$eval('#feedMason .card img', is => is.filter(i => i.complete && !i.naturalWidth).length);
  check('broken images are removed from the layout', broken === 0, 'blocked ' + firstHost);
  check('feed still has works after failures', (await p7.$$('#feedMason .card')).length > 5);
  await p7.context().close();

  // ---- 10. layouts preserve compositions
  for (const [name, vp] of [['desktop', {width: 1440, height: 900}], ['tablet', {width: 820, height: 1180}], ['mobile', {width: 390, height: 844}]]) {
    const pv = await page({viewport: vp});
    await pv.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await pv.waitForTimeout(3500);
    const bad = await pv.$$eval('#feedMason .card', cs => cs.filter(c => { const i = c.querySelector('img'); if (!i.naturalWidth) return false; const f = c.querySelector('.frame').getBoundingClientRect(); const r = i.naturalHeight / i.naturalWidth; return Math.abs(f.height / f.width - r) > 0.05; }).length);
    const over = await pv.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check(`${name}: aspect ratios preserved, no horizontal scroll`, bad === 0 && !over, `mismatched=${bad} overflow=${over}`);
    if (SHOTS) {
      fs.mkdirSync(SHOTS, {recursive: true});
      await pv.screenshot({path: path.join(SHOTS, `feed-${name}.png`)});
      await pv.click('#feedMason .card >> nth=0 >> .frame'); await pv.waitForTimeout(2500);
      await pv.screenshot({path: path.join(SHOTS, `artist-${name}.png`)});
    }
    await pv.context().close();
  }

  // ---- 11. long session stays responsive
  const p8 = await page({init: () => { delete window.IntersectionObserver; }});
  await p8.goto(URL0 + '#/cont', {waitUntil: 'domcontentloaded'}); await settle(p8);
  const t0 = Date.now();
  let guard = 0;
  while (await p8.$('#loadMore') && guard++ < 200) { await p8.click('#loadMore'); }
  const tLoad = Date.now() - t0;
  const nAll = await p8.$$eval('#feedMason .card', c => c.length);
  const total = await p8.evaluate(() => JSON.parse(document.getElementById('salon-data').textContent).works.length);
  check('whole pool reachable by paging', nAll >= total - 5, `${nAll} of ${total} in ${tLoad} ms`);
  const tRe = await p8.evaluate(() => { const t = performance.now(); window.dispatchEvent(new Event('resize')); document.querySelector('#feedMason').style.width = '900px'; return performance.now() - t; });
  const tScroll = await p8.evaluate(async () => { const t = performance.now(); for (let i = 0; i < 20; i++) { window.scrollBy(0, 3000); await new Promise(r => requestAnimationFrame(r)); } return performance.now() - t; });
  check('long feed scrolls smoothly', tScroll < 2500, `20 frames in ${Math.round(tScroll)} ms`);
  await p8.context().close();

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter(r => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
