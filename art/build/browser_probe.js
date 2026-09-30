// Load every image the page would show inside real Chromium, from a file:// page with
// no referrer — exactly how explore.html embeds them — and record the outcome in
// build/cache/browser.json. Some hosts answer a script's fetch but refuse an embedded
// <img> (bot checks, hotlink rules, ORB). build.py drops works whose image failed here.
//
//   node build/browser_probe.js            # probe URLs not yet probed
//   node build/browser_probe.js --all      # re-probe everything
//
// Reads candidate URLs from build/cache/verify.json (every fetch-verified image).
const path = require('path');
const fs = require('fs');
const PW = process.env.PLAYWRIGHT || path.join(process.env.HOME || '', '.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const { chromium } = require(PW);
const CHROME = process.env.CHROME || (() => {
  const base = path.join(process.env.HOME || '', '.cache/ms-playwright');
  try { const d = fs.readdirSync(base).filter(x => x.startsWith('chromium_headless_shell')).sort().pop(); return path.join(base, d, 'chrome-headless-shell-linux64/chrome-headless-shell'); } catch (e) { return undefined; }
})();
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const CACHE = path.join(__dirname, 'cache', 'browser.json');
const VER = path.join(__dirname, 'cache', 'verify.json');

(async () => {
  const all = process.argv.includes('--all');
  const ver = JSON.parse(fs.readFileSync(VER, 'utf8'));
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
  // only images the gallery actually uses (written by build.py), not every research candidate
  let wanted = null;
  try { wanted = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'wanted.json'), 'utf8'))); } catch (e) {}
  const urls = Object.keys(ver).filter(u => ver[u].ok && (!wanted || wanted.has(u)) && (all || !cache[u] || cache[u].s === 'timeout'));
  console.log('probing', urls.length, 'images in Chromium');
  if (!urls.length) return;
  const b = await chromium.launch({executablePath: CHROME});
  const p = await b.newPage({userAgent: UA});
  await p.goto('file://' + path.join(__dirname, 'template.html'));
  for (let s = 0; s < urls.length; s += 200) {
    const chunk = urls.slice(s, s + 200);
    const res = await p.evaluate(async list => {
      const out = {}; let i = 0;
      const one = u => new Promise(r => {
        const im = new Image(); im.referrerPolicy = 'no-referrer';
        const t = setTimeout(() => { im.src = ''; r('timeout'); }, 60000);
        im.onload = () => { clearTimeout(t); r(im.naturalWidth ? 'ok' : 'zero'); };
        im.onerror = () => { clearTimeout(t); r('error'); };
        im.src = u;
      });
      // at most 3 at a time per host, so slow hosts are not starved by our own requests
      const active = {};
      const worker = async () => {
        while (i < list.length) {
          const u = list[i++]; const h = new URL(u).host;
          while ((active[h] || 0) >= 3) await new Promise(r => setTimeout(r, 200));
          active[h] = (active[h] || 0) + 1;
          try { out[u] = await one(u); } finally { active[h]--; }
        }
      };
      await Promise.all(Array.from({length: 10}, worker));
      return out;
    }, chunk);
    const now = new Date().toISOString();
    Object.entries(res).forEach(([u, s]) => { cache[u] = {s, at: now}; });
    fs.writeFileSync(CACHE + '.tmp', JSON.stringify(cache));
    fs.renameSync(CACHE + '.tmp', CACHE);
    console.log(`  ${Math.min(s + 200, urls.length)}/${urls.length}`);
  }
  await b.close();
  const bad = Object.entries(cache).filter(([u, r]) => r.s !== 'ok');
  const hosts = {};
  bad.forEach(([u]) => { const h = new URL(u).host; hosts[h] = (hosts[h] || 0) + 1; });
  console.log('failing in browser:', bad.length, hosts);
})().catch(e => { console.error(e); process.exit(1); });
