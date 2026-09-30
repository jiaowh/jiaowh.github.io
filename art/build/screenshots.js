// Showcase screenshots of the built page (separate from the acceptance run, with time to load).
//   node build/screenshots.js [outdir]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(process.env.HOME, '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'));
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'screenshots'));
const FILE = 'file://' + path.resolve(__dirname, '..', 'explore.html');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const shots = [
  ['feed-desktop', '#/all', 1440, 900], ['feed-tablet', '#/illu', 820, 1180], ['feed-mobile', '#/cont', 390, 844],
  ['artist-desktop', '#/artist/nick-alm', 1440, 900], ['artist-mobile', '#/artist/mai-yoneyama', 390, 844],
  ['study-desktop', '#/study', 1440, 900], ['earlier-desktop', '#/past', 1440, 900], ['viewer-desktop', '#/artist/alyssa-monks', 1440, 900, 'viewer'],
  ['panel-desktop', '#/all', 1440, 900, 'panel'],
];
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROME || path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell')});
  for (const [name, hash, w, h, act] of shots) {
    const p = await b.newPage({viewport: {width: w, height: h}, userAgent: UA});
    await p.goto(FILE + hash, {waitUntil: 'domcontentloaded'});
    await p.waitForTimeout(7000);
    if (act === 'viewer') { await p.click('.feature button'); await p.waitForTimeout(4000); }
    if (act === 'panel') { await p.click('#menuBtn'); await p.waitForTimeout(500); }
    await p.screenshot({path: path.join(OUT, name + '.png')});
    await p.close();
  }
  await b.close();
  console.log('screenshots in', OUT);
})();
