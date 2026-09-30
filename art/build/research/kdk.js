// Render KADOKAWA product search for an illustrator and list books whose card credits them as イラスト.
const { chromium } = require(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('fs');
const [,, name, out] = process.argv;
(async () => {
  const b = await chromium.launch({executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell'});
  const p = await b.newPage({userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'});
  const res = [];
  for (let page = 1; page <= 3; page++) {
    await p.goto('https://www.kadokawa.co.jp/product/search/?auth=' + encodeURIComponent(name) + '&page=' + page, {waitUntil: 'domcontentloaded'});
    await p.waitForTimeout(3500);
    const items = await p.evaluate(() => [...document.querySelectorAll('a[href*="/product/"]')].map(a => {
      const card = a.closest('li, article, div') || a;
      const img = card.querySelector('img');
      return {href: a.href, text: card.innerText.replace(/\s+/g, ' ').slice(0, 300), img: img ? (img.currentSrc || img.src) : ''};
    }));
    const n0 = res.length;
    for (const it of items) if (/\/product\/\d{12}\/?$/.test(it.href) && !res.find(r => r.href === it.href)) res.push(it);
    if (res.length === n0) break;
  }
  fs.writeFileSync(out, JSON.stringify(res, null, 0));
  console.log(name, res.length);
  await b.close();
})();
