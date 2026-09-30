// Fast offline checks on the generated index.html — no browser needed.
//   node build/smoke.js [path/to/explore.html]
// For behaviour (scrolling, routes, favourites …) run build/browser_check.js.
const fs = require('fs');
const path = require('path');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const html = fs.readFileSync(FILE, 'utf8');
let fails = 0;
const ok = (name, cond, detail = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!cond) fails++; };

const m = html.match(/<script id="salon-data" type="application\/json">([\s\S]*?)<\/script>/);
ok('data block present', !!m);
const D = JSON.parse(m[1]);
const {artists: A, works: W, groups: G} = D;
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]);
try { new Function(scripts[scripts.length - 1]); ok('runtime script parses', true); } catch (e) { ok('runtime script parses', false, e.message); }

const seedP = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/seed_painters.json'), 'utf8'));
const seedI = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/seed_illus.json'), 'utf8'));
const study = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/study.json'), 'utf8'));
const names = new Set(A.map(a => a.n));
ok('all seed painters present', seedP.every(a => names.has(a.n)), seedP.length + '');
ok('all seed illustrators present', seedI.every(a => names.has(a.n)), seedI.length + '');
const sn = study.groups.flatMap(g => g.artists.map(a => a.n));
ok('all study entries present with their group', sn.every(n => A.find(a => (a.n === n || (a.aka || []).includes(n)) && a.study)), `${sn.length} in ${study.groups.length} groups`);
ok('study groups kept', G.length === study.groups.length);
ok('japanese names kept', seedP.concat(seedI).filter(a => a.jp).every(a => A.find(x => x.n === a.n).jp === a.jp));

const ids = new Set(A.map(a => a.id));
ok('artist ids unique', ids.size === A.length);
const wids = new Set(W.map(w => w.i));
ok('work ids unique', wids.size === W.length, W.length + ' works');
ok('every work belongs to an artist', W.every(w => A[w.a]));
ok('every image URL is http(s)', W.every(w => /^https?:\/\//.test(w.img) && (!w.th || /^https?:\/\//.test(w.th))));
ok('every work has dimensions', W.every(w => w.w > 0 && w.h > 0), W.filter(w => !(w.w > 0)).length + ' missing');
const per = {};
W.forEach(w => per[w.a] = (per[w.a] || 0) + 1);
const max = Math.max(...Object.values(per));
ok('no eight-work cap', max > 8, 'largest collection ' + max);
for (const t of ['cont', 'illu', 'study']) {
  const n = W.filter(w => A[w.a].tabs.includes(t)).length;
  ok(`tab ${t} has works`, n > 0, n + '');
}
ok('no inline event handlers from data', !/on(error|load|click)\s*=/.test(m[1]));
console.log(`\nartists ${A.length} · with works ${Object.keys(per).length} · works ${W.length} · built ${D.built}`);
process.exit(fails ? 1 : 0);
