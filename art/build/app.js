'use strict';
/* Salon — runtime. Data comes from the JSON block injected by build/build.py.
   Routes (hash):  #/cont #/illu #/study[/works] #/favs #/artists   (#/all, #/past → #/cont)
                   #/artist/<id>[/w/<workId>]                                     */

/* ============================== data ============================== */
const DATA = (() => {
  try { return JSON.parse(document.getElementById('salon-data').textContent); }
  catch (e) { return {artists: [], works: [], groups: [], built: ''}; }
})();
const A = DATA.artists;              // [{id,n,jp,r,b,why,w,links,tabs,kind,study,...}]
const W = DATA.works;                // [{i,a,t,ten,y,m,img,th,src,w,h,lic}]  a = artist index
const artistById = new Map(A.map((a, i) => [a.id, i]));
const workById = new Map(W.map((w, i) => [w.i, i]));
const worksOf = A.map(() => []);
W.forEach((w, i) => worksOf[w.a].push(i));

const VIEWS = {
  cont:  {label: 'Painters',     test: a => a.tabs.includes('cont')},
  illu:  {label: 'Illustrators', test: a => a.tabs.includes('illu')},
  study: {label: 'Study',        test: a => a.tabs.includes('study')},
};
const TAB_ORDER = ['cont', 'illu', 'study'];
const HOME = 'cont';

/* ============================== helpers ============================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const safeUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : '';
const extLink = (href, label, cls = 'ext') => safeUrl(href)
  ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.1 4c2 0 3.4 1.1 4.9 2.9C13.5 5.1 14.9 4 16.9 4c3.5 0 5.7 3.6 4.4 7.1-1.8 4.8-9.3 9.4-9.3 9.4z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

const store = {
  ok: (() => { try { const k = '__salon'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })(),
  get(key, fallback, check) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return fallback;
      const p = JSON.parse(v);
      return (!check || check(p)) ? p : fallback;
    } catch (e) { return fallback; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } },
};
const sess = {
  get(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch (e) { return null; } },
  set(key, val) { try { sessionStorage.setItem(key, JSON.stringify(val)); } catch (e) {} },
};
const isStrArr = v => Array.isArray(v) && v.every(x => typeof x === 'string');

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (action ? ` <button type="button">${esc(action.label)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { action.run(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2400);
}

/* seeded PRNG so a session's order can be rebuilt exactly after Back */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

/* ============================== saved preferences ============================== */
/* hidden artists: legacy key `salon:hiddenDir` holds names; v2 key holds artist ids.
   We read both, keep ids, and leave the legacy key in place (harmless, and lets the
   old page still work if someone opens a backup). */
const hidden = new Set();
(function loadHidden() {
  const nameToId = new Map();
  A.forEach(a => { nameToId.set(a.n, a.id); (a.aka || []).forEach(x => nameToId.set(x, a.id)); });
  store.get('salon:hidden', [], isStrArr).forEach(id => { if (artistById.has(id)) hidden.add(id); });
  store.get('salon:hiddenDir', [], isStrArr).forEach(n => { const id = nameToId.get(n); if (id) hidden.add(id); });
  store.set('salon:hidden', [...hidden]);
})();
function saveHidden() {
  store.set('salon:hidden', [...hidden]);
  store.set('salon:hiddenDir', [...hidden].map(id => A[artistById.get(id)].n));
}

/* favourites: [[workId, addedAtMs], ...] newest last */
let favs = new Map(store.get('salon:favs', [], v => Array.isArray(v))
  .filter(x => Array.isArray(x) && typeof x[0] === 'string').map(x => [x[0], +x[1] || 0]));
function saveFavs() {
  if (!store.set('salon:favs', [...favs])) toast('Could not save — browser storage is unavailable');
}
function toggleFav(wid) {
  if (favs.has(wid)) favs.delete(wid); else favs.set(wid, Date.now());
  saveFavs();
  document.querySelectorAll(`.fav[data-w="${CSS.escape(wid)}"]`).forEach(b => setFavBtn(b, favs.has(wid)));
  updateTabs();
  return favs.has(wid);
}
function setFavBtn(b, on) {
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.setAttribute('aria-label', on ? 'Remove from favourites' : 'Add to favourites');
  b.title = on ? 'Remove from favourites' : 'Add to favourites';
}

let density = store.get('salon:density', 'comfortable', v => ['compact', 'comfortable', 'large'].includes(v));
document.documentElement.dataset.density = density;

/* works whose image failed to load this session are dropped from every feed */
const failed = new Set(sess.get('salon:failed') || []);
function markFailed(wi) {
  if (failed.has(wi)) return;
  failed.add(wi); sess.set('salon:failed', [...failed]);
}

/* ============================== feed ordering ============================== */
/* Balanced shuffle: every artist's works are shuffled, then work j of an artist with
   k works gets the key (j + u) / k^0.5. Small collections surface early; prolific
   artists spread across the whole pass instead of flooding its start. A second pass
   breaks up runs of one artist when another artist is available nearby. */
function balancedOrder(pool, seed) {
  const r = rng(seed);
  const by = new Map();
  pool.forEach(wi => { const a = W[wi].a; if (!by.has(a)) by.set(a, []); by.get(a).push(wi); });
  const keyed = [];
  by.forEach(list => {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    const k = Math.pow(list.length, 0.5);
    list.forEach((wi, j) => keyed.push([(j + r()) / k, wi]));
  });
  keyed.sort((x, y) => x[0] - y[0]);
  const out = keyed.map(x => x[1]);
  // de-run: avoid the same artist within 3 places when something else is within reach
  for (let i = 1; i < out.length; i++) {
    const recent = new Set([out[i - 1], out[i - 2], out[i - 3]].filter(x => x != null).map(x => W[x].a));
    if (!recent.has(W[out[i]].a)) continue;
    for (let j = i + 1; j < Math.min(out.length, i + 40); j++) {
      if (!recent.has(W[out[j]].a)) { const [x] = out.splice(j, 1); out.splice(i, 0, x); break; }
    }
  }
  return out;
}

function poolFor(view) {
  const out = [];
  if (view === 'favs') {
    [...favs.entries()].sort((x, y) => y[1] - x[1]).forEach(([id]) => { if (workById.has(id)) out.push(workById.get(id)); });
    return out;
  }
  const t = VIEWS[view].test;
  W.forEach((w, i) => { if (t(A[w.a])) out.push(i); });
  return out;
}

/* ============================== feed state ============================== */
/* One state per view, kept in memory and mirrored to sessionStorage so Back from an
   external site (a real page reload of the back/forward kind) restores it. A fresh
   open or a manual reload starts over with new seeds. */
const BATCH = 36;
const navType = (() => { try { return performance.getEntriesByType('navigation')[0].type; } catch (e) { return 'navigate'; } })();
const saved = navType === 'back_forward' ? (sess.get('salon:feeds') || {}) : {};
const feeds = {};
function feedState(view) {
  if (feeds[view]) return feeds[view];
  const s = saved[view];
  const st = {view, seeds: [], q: '', shown: 0, scroll: 0};
  if (s && Array.isArray(s.seeds) && s.seeds.length) Object.assign(st, {seeds: s.seeds, q: s.q || '', shown: s.shown | 0, scroll: s.scroll | 0});
  else st.seeds = [newSeed()];
  buildSeq(st);
  return (feeds[view] = st);
}
function persistFeeds() {
  const o = {};
  Object.values(feeds).forEach(s => { o[s.view] = {seeds: s.seeds, q: s.q, shown: s.shown, scroll: s.scroll}; });
  sess.set('salon:feeds', o);
}

function matches(wi, q) {
  if (!q) return true;
  const w = W[wi], a = A[w.a];
  return (a._hay || (a._hay = norm([a.n, a.jp, ...(a.aka || []), a.r].join(' ')))).includes(q) ||
    norm([w.t, w.ten, w.y, w.m].join(' ')).includes(q);
}
function visible(wi, q) { return !hidden.has(A[W[wi].a].id) && !failed.has(wi) && matches(wi, q); }

/* seq = concatenation of passes; each pass is a filtered balanced order.
   A pass boundary is marked with {div:n}. */
function buildSeq(st) {
  const pool = poolFor(st.view);
  const q = norm(st.q.trim());
  st.pool = pool;
  st.seq = [];
  st.passLen = [];
  st.seeds.forEach((seed, p) => {
    let ord = st.view === 'favs' ? pool.slice() : balancedOrder(pool, seed);
    ord = ord.filter(wi => visible(wi, q));
    if (p > 0) {
      // no immediate repeats across the boundary: push the last few of the previous
      // pass away from the start of this one
      const prev = st.seq.filter(x => typeof x === 'number');
      const tail = new Set(prev.slice(-Math.min(12, Math.floor(ord.length / 2))));
      const head = ord.filter(x => !tail.has(x)), back = ord.filter(x => tail.has(x));
      ord = head.length ? [...head.slice(0, 12), ...back, ...head.slice(12)] : ord;
      // tiny pools: at least never show the same work twice in a row, and prefer
      // a different artist at the seam
      const last = prev[prev.length - 1];
      if (ord.length > 1 && ord[0] === last) [ord[0], ord[1]] = [ord[1], ord[0]];
      const j = ord.findIndex((x, k) => k < 8 && W[x].a !== W[last]?.a);
      if (last != null && j > 0 && W[ord[0]].a === W[last].a) { const [x] = ord.splice(j, 1); ord.unshift(x); }
      st.seq.push({div: p + 1, n: ord.length});
    }
    st.passLen.push(ord.length);
    st.seq.push(...ord);
  });
}
function reshuffle(st) {
  st.seeds = [newSeed()]; st.shown = 0; st.scroll = 0;
  buildSeq(st);
}

/* ============================== masonry ============================== */
/* Items stay in DOM (reading/tab) order; each is absolutely placed in the currently
   shortest column. Heights come from recorded image dimensions, so space is reserved
   before any image arrives. */
class Masonry {
  constructor(el) { this.el = el; this.items = []; this.cols = []; this.colW = 0; this.n = 0; }
  metrics() {
    const cs = getComputedStyle(document.documentElement);
    const target = parseFloat(cs.getPropertyValue('--col')) || 250;
    const gap = parseFloat(cs.getPropertyValue('--gap')) || 14;
    const cap = parseFloat(cs.getPropertyValue('--cap')) || 40;
    const width = this.el.clientWidth || this.el.getBoundingClientRect().width || 1000;
    const n = Math.max(1, Math.round((width + gap) / (target + gap)));
    return {gap, cap, width, n, colW: (width - gap * (n - 1)) / n};
  }
  reset() { this.items = []; this.el.innerHTML = ''; this.el.style.height = '0px'; this.cols = []; }
  place(node, ratio, full) {
    // ratio = h/w of image; full = full-width divider
    const m = this.m || (this.m = this.metrics());
    if (this.cols.length !== m.n) this.cols = new Array(m.n).fill(0);
    let x, y, h;
    if (full) {
      y = Math.max(0, ...this.cols); x = 0;
      node.style.width = m.width + 'px';
      node.style.transform = `translate(0px,${y}px)`;
      h = node.offsetHeight || 120;
      this.cols.fill(y + h + m.gap);
    } else {
      let c = 0;
      for (let i = 1; i < m.n; i++) if (this.cols[i] < this.cols[c] - 1) c = i;
      x = c * (m.colW + m.gap); y = this.cols[c];
      const ih = Math.round(m.colW * ratio);
      h = ih + m.cap;
      node.style.width = m.colW + 'px';
      node.querySelector('.frame').style.height = ih + 'px';
      node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      this.cols[c] = y + h + m.gap;
    }
    this.el.style.height = Math.max(0, ...this.cols) + 'px';
  }
  add(node, ratio, full) {
    this.el.appendChild(node);
    this.items.push([node, ratio, full]);
    this.place(node, ratio, full);
  }
  relayout() {
    this.m = this.metrics(); this.cols = [];
    this.items = this.items.filter(([n]) => n.isConnected);
    this.items.forEach(([n, r, f]) => this.place(n, r, f));
    if (!this.items.length) this.el.style.height = '0px';
  }
}

function ratioOf(w) { return (w.w && w.h) ? Math.min(3, Math.max(0.3, w.h / w.w)) : 1.25; }
function titleOf(w) { return w.t || w.ten || ''; }
function altOf(w) {
  const a = A[w.a];
  return (titleOf(w) ? titleOf(w) + (w.ten && w.t && w.ten !== w.t ? ' (' + w.ten + ')' : '') : 'Work') + ' by ' + a.n + (w.y ? ', ' + w.y : '');
}

/* Everything the source states about a work. Keys (from build.py):
   t/ten title, y year, m medium, sz size, ty kind of work, mo subject, pub book,
   coll collection, po date posted/released, tg tags, no note, nl note label, cr credit */
function detailsHTML(w, withArtist) {
  const a = A[w.a];
  const rows = [];
  const add = (k, v, cls) => { if (v) rows.push(`<dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd>`); };
  if (withArtist) add('Artist', `<a href="#/artist/${esc(a.id)}">${esc(a.n)}</a>${a.jp && a.jp !== a.n ? ' · ' + esc(a.jp) : ''}`);
  add('Year', esc(w.y));
  add('Medium', esc(w.m));
  add('Size', esc(w.sz));
  add('Subject', esc(w.mo));
  add('Type', esc(w.ty));
  add('Book', esc(w.pub));
  add('Collection', esc(w.coll));
  add(w.ty && /cover/i.test(w.ty) ? 'Released' : 'Posted', esc(w.po));
  if (w.tg && w.tg.length) add('Tags', `<span class="tags">${w.tg.map(t => `<span>${esc(t)}</span>`).join('')}</span>`);
  add(esc(w.nl || 'Note'), esc(w.no), 'note');
  add('Credit', esc(w.cr));
  add('Rights', esc(w.lic));
  const host = (() => { try { return new URL(w.src).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })();
  return `<div class="wd">
    <div class="wt">${esc(titleOf(w)) || '<span style="color:var(--muted)">Untitled / title not recorded</span>'}${w.ten && w.t && w.ten !== w.t ? `<small>${esc(w.ten)}</small>` : ''}</div>
    ${rows.length ? `<dl>${rows.join('')}</dl>` : `<p class="none">The source gives no further details for this work.</p>`}
    ${safeUrl(w.src) ? `<p class="srcl">Source: <a href="${esc(w.src)}" target="_blank" rel="noopener noreferrer">${esc(host)} ↗</a></p>` : ''}
  </div>`;
}

function cardNode(wi, href) {
  const w = W[wi], a = A[w.a];
  // the link and the favourite button are siblings (a button inside a link is invalid)
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.wi = wi;
  const fav = favs.has(w.i);
  el.innerHTML = `<a class="cl" href="${href}"><span class="frame"><img alt="${esc(altOf(w))}" loading="lazy" decoding="async"
      ${w.w ? `width="${w.w}" height="${w.h}"` : ''} src="${esc(safeUrl(w.th || w.img))}"></span>
    <span class="cap"><span class="an">${esc(a.n)}${a.jp ? ' · ' + esc(a.jp) : ''}</span><span class="ti">${esc(titleOf(w)) || '&nbsp;'}${w.y ? ' · ' + esc(w.y) : ''}</span></span></a>
    <button type="button" class="fav" data-w="${esc(w.i)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favourites' : 'Add to favourites'}" title="${fav ? 'Remove from favourites' : 'Add to favourites'}">${HEART}</button>`;
  const img = el.querySelector('img');
  img.addEventListener('load', () => img.classList.add('in'), {once: true});
  if (img.complete && img.naturalWidth) img.classList.add('in');
  return el;
}

/* ============================== feed view ============================== */
let current = null;           // current route object
let feedMason = null, feedObserver = null, feedView = null;

function renderFeed(view, opts = {}) {
  const st = feedState(view);
  const body = $('#feedBody');
  feedView = view;
  if (!feedMason) { body.innerHTML = '<div class="mason" id="feedMason"></div><div class="more" id="feedMore"></div><div class="sentinel" id="feedSentinel"></div>'; feedMason = new Masonry($('#feedMason')); }
  $('#q').value = st.q;
  $('#qClear').hidden = !st.q;
  renderFeedHead(st);
  feedMason.reset();
  feedMason.m = null;
  const target = Math.max(BATCH, st.shown);
  st.shown = 0;
  appendBatch(st, target);
  if (!opts.keepScroll) st.scroll = 0;
  requestAnimationFrame(() => window.scrollTo(0, opts.keepScroll ? st.scroll : 0));
  ensureObserver();
}

function renderFeedHead(st) {
  const h = $('#feedHead');
  const q = norm(st.q.trim());
  const total = st.passLen[0] || 0;
  const artistsIn = new Set(st.seq.filter(x => typeof x === 'number').map(x => W[x].a)).size;
  let chips = '';
  if (q) {
    const hits = A.map((a, i) => i).filter(i => VIEWS[st.view] ? VIEWS[st.view].test(A[i]) : true)
      .filter(i => (A[i]._hay || (A[i]._hay = norm([A[i].n, A[i].jp, ...(A[i].aka || []), A[i].r].join(' ')))).includes(q)).slice(0, 12);
    if (hits.length) chips = `<div class="chips" aria-label="Matching artists">${hits.map(i => `<a class="chip" href="#/artist/${esc(A[i].id)}">${esc(A[i].n)}${A[i].jp ? `<span class="jp">${esc(A[i].jp)}</span>` : ''}</a>`).join('')}</div>`;
  }
  let lede;
  if (st.view === 'favs') lede = total ? `<b>${total}</b> favourite${total > 1 ? 's' : ''}, newest first` : '';
  else lede = `<b>${total.toLocaleString()}</b> works · ${artistsIn} artists${q ? ` matching “${esc(st.q.trim())}”` : ''}${hidden.size ? ` · ${hidden.size} hidden` : ''}`;
  const studySeg = st.view === 'study' ? `<span class="seg" role="group" aria-label="Study view"><a href="#/study" aria-current="false">Where to study</a><a href="#/study/works" aria-current="true">Teachers’ work</a></span>` : '';
  h.innerHTML = `${studySeg}<span class="lede">${lede}</span>${chips}`;
}

function appendBatch(st, count = BATCH) {
  const href = wi => `#/artist/${encodeURIComponent(A[W[wi].a].id)}/w/${encodeURIComponent(W[wi].i)}`;
  const end = Math.min(st.seq.length, st.shown + count);
  for (let k = st.shown; k < end; k++) {
    const x = st.seq[k];
    if (typeof x === 'number') feedMason.add(cardNode(x, href(x)), ratioOf(W[x]));
    else {
      const d = document.createElement('div');
      d.className = 'divider';
      d.innerHTML = `<b>Another pass</b>The same ${x.n} works, reshuffled — you have seen everything in this view once.`;
      d.setAttribute('role', 'separator');
      feedMason.add(d, 0, true);
    }
  }
  st.shown = end;
  updateMore(st);
}

function updateMore(st) {
  const more = $('#feedMore');
  const remaining = st.seq.length - st.shown;
  const works = st.passLen.reduce((s, n) => s + n, 0);
  if (!works) {
    more.innerHTML = emptyMessage(st);
  } else if (remaining > 0) {
    if (!$('#loadMore', more)) more.innerHTML = `<button class="btn" type="button" id="loadMore">Load more</button>`;
  } else if (st.view === 'favs') {
    more.innerHTML = '';
  } else {
    const n = st.passLen[st.passLen.length - 1];
    more.innerHTML = `<p>That is everything in this view${st.seeds.length > 1 ? ' again' : ''} — ${n} work${n === 1 ? '' : 's'}.</p>
      <button class="btn" type="button" id="nextPass" style="margin-top:10px">${n <= 1 ? 'Show it again' : 'Keep going: another shuffled pass'}</button>`;
  }
  persistFeeds();
}

function emptyMessage(st) {
  if (st.view === 'favs') return `<div class="empty">No favourites yet. Tap the heart on any picture to keep it here.</div>`;
  if (st.q.trim()) return `<div class="empty">Nothing here matches “${esc(st.q.trim())}”.<br><button class="btn" type="button" data-act="clearq">Clear search</button></div>`;
  if (st.pool.length && hidden.size) return `<div class="empty">Every artist in this view is hidden.<br><button class="btn" type="button" data-act="restoreAll">Restore hidden artists</button></div>`;
  if (st.pool.length) return `<div class="empty">None of these images could be loaded right now.</div>`;
  return `<div class="empty">No works with verified images in this view yet.</div>`;
}

function ensureObserver() {
  if (feedObserver || !('IntersectionObserver' in window)) return;
  feedObserver = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return;
    if (!current || current.kind !== 'feed') return;
    const st = feeds[feedView];
    if (st && st.shown < st.seq.length) appendBatch(st);
  }, {rootMargin: '1400px 0px'});
  feedObserver.observe($('#feedSentinel'));
}

function nextPass(st) {
  st.seeds.push(newSeed());
  const prevLen = st.seq.length;
  buildSeq(st);
  st.shown = Math.min(st.shown, prevLen);
  appendBatch(st);
}

/* ============================== artist page ============================== */
let artistMason = null, artistState = null;
const ARTIST_BATCH = 30;

function renderArtist(ai, wid) {
  const a = A[ai];
  const view = $('#artistView');
  const list = worksOf[ai].filter(wi => !failed.has(wi));
  let fi = wid && workById.has(wid) ? workById.get(wid) : null;
  if (fi != null && W[fi].a !== ai) fi = null;
  if (fi == null && list.length) fi = list[0];
  const sel = Math.max(0, list.indexOf(fi));
  const from = current && current.from;
  const backHref = from ? '' : '#/' + (VIEWS[a.tabs[0]] ? a.tabs[0] : HOME);
  const tabsTxt = a.tabs.map(t => VIEWS[t] ? VIEWS[t].label : t).join(' · ');
  const links = (a.links || []).map(([l, u]) => extLink(u, l)).join('');
  const srcDomains = [...new Set(list.map(wi => { try { return new URL(W[wi].src).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }).filter(Boolean))];
  const search = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent((a.jp || a.n) + ' ' + (a.kind === 'illustrator' ? 'イラスト' : 'painting'))}`;
  const st = a.study;
  view.innerHTML = `
    <div class="artistTop">
      ${list.length ? `<div id="featureBox"></div>` : `<div class="noimg">No verified images for this artist yet — the links on the right lead to their work.</div>`}
      <div class="aInfo">
        ${from ? `<button class="btn ghost back" type="button" data-act="back">← Back</button>` : `<a class="btn ghost back" href="${backHref}">← ${esc(VIEWS[a.tabs[0]] ? VIEWS[a.tabs[0]].label : VIEWS[HOME].label)}</a>`}
        <h1 tabindex="-1" id="artistName">${esc(a.n)}</h1>
        ${a.jp ? `<div class="jp" lang="ja">${esc(a.jp)}</div>` : ''}
        ${a.r ? `<div class="rg">${esc(a.r)}</div>` : ''}
        ${a.b ? `<p>${esc(a.b)}</p>` : ''}
        ${a.why ? `<p class="note">${esc(a.why)}</p>` : ''}
        ${st && (st.b || st.why) && st.b !== a.b ? `<p class="kw"><span>Study:</span> ${esc(st.g)}${st.b ? ' — ' + esc(st.b) : ''}</p>` : ''}
        ${a.w && a.w.length ? `<p class="kw">Notable: <span>${a.w.map(t => '「' + esc(t) + '」').join(' ')}</span></p>` : ''}
        <div class="links">${links}${st && st.site ? extLink(st.site, st.siteLabel || 'school') : ''}${extLink(search, 'image search')}</div>
        ${srcDomains.length ? `<p class="kw" style="margin-top:12px">Images from: ${srcDomains.map(esc).join(', ')}</p>` : ''}
        <div class="aActs">
          <button class="btn" type="button" data-act="hide">Hide this artist</button>
          <span class="kw" style="align-self:center">${list.length} work${list.length === 1 ? '' : 's'} · ${esc(tabsTxt)}</span>
        </div>
      </div>
    </div>
    ${list.length > 1 ? `<h2 class="sec">Works by ${esc(a.n)} <small>${list.length} · click one to see its details</small></h2><div class="mason" id="artistMason"></div><div class="more" id="artistMore"></div><div class="sentinel" id="artistSentinel"></div>` : ''}`;
  artistState = {ai, list, shown: 0, sel};
  artistMason = list.length > 1 ? new Masonry($('#artistMason')) : null;
  if (list.length) renderFeature();
  if (artistMason) appendArtist(Math.min(list.length, Math.max(ARTIST_BATCH, sel + 1)));
  if (hidden.has(a.id)) $('[data-act="hide"]', view).textContent = 'Unhide this artist';
  if (artistMason && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting) && artistState && artistState.shown < artistState.list.length) appendArtist(ARTIST_BATCH);
    }, {rootMargin: '1200px 0px'});
    io.observe($('#artistSentinel'));
    artistState.io = io;
  }
}
function renderFeature() {
  const s = artistState, box = $('#featureBox');
  if (!s || !box) return;
  const f = W[s.list[s.sel]];
  box.innerHTML = `<figure class="feature" data-w="${esc(f.i)}">
      <button type="button" data-view="${s.sel}" aria-label="Open ${esc(altOf(f))} full size"><img src="${esc(safeUrl(f.th || f.img))}" alt="${esc(altOf(f))}" ${f.w ? `width="${f.w}" height="${f.h}"` : ''}></button>
      <figcaption>${detailsHTML(f)}
      ${s.list.length > 1 ? `<div class="wd-nav"><button class="btn" type="button" data-act="selPrev">‹ Previous</button><button class="btn" type="button" data-act="selNext">Next ›</button><span style="align-self:center;color:var(--faint);font-size:12.5px">${s.sel + 1} / ${s.list.length}</span></div>` : ''}
      </figcaption></figure>`;
  const img = $('img', box);
  img.addEventListener('error', () => { const b = $('.feature > button', box); if (b) b.outerHTML = '<div class="noimg">This image could not be loaded from its host right now.</div>'; });
  document.querySelectorAll('#artistMason .card').forEach(c => c.classList.toggle('sel', +c.dataset.k === s.sel));
}
function selectWork(k, scroll) {
  const s = artistState;
  if (!s || k < 0 || k >= s.list.length) return;
  s.sel = k;
  const w = W[s.list[k]];
  try { history.replaceState(history.state, '', '#/artist/' + encodeURIComponent(A[s.ai].id) + '/w/' + encodeURIComponent(w.i)); } catch (e) {}
  if (current && current.kind === 'artist') current.wid = w.i;
  renderFeature();
  if (scroll) $('#featureBox').scrollIntoView({behavior: 'smooth', block: 'start'});
}
function appendArtist(n) {
  const s = artistState;
  const end = Math.min(s.list.length, s.shown + n);
  for (let k = s.shown; k < end; k++) {
    const node = cardNode(s.list[k], '#');
    node.dataset.k = k;
    if (k === s.sel) node.classList.add('sel');
    const link = node.querySelector('.cl');
    link.dataset.pick = k;
    link.setAttribute('role', 'button');
    link.removeAttribute('href');
    link.tabIndex = 0;
    link.setAttribute('aria-label', 'Show details of ' + altOf(W[s.list[k]]));
    artistMason.add(node, ratioOf(W[s.list[k]]));
  }
  s.shown = end;
  const more = $('#artistMore');
  if (more) more.innerHTML = end < s.list.length ? `<button class="btn" type="button" data-act="artistMore">Show more (${s.list.length - end} left)</button>` : '';
}

/* ============================== viewer ============================== */
let vwr = null;
function openViewer(list, idx, opener) {
  closeViewer(true);
  vwr = {list, idx, opener: opener || document.activeElement};
  const el = document.createElement('div');
  el.className = 'vwr';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Image viewer');
  el.innerHTML = `<div class="stage"><img alt=""></div>
    <div class="vcap" aria-live="polite"></div>
    <span class="ct"></span>
    <button type="button" class="fav" data-w="">${HEART}</button>
    <button type="button" class="vbtn x" aria-label="Close viewer (Escape)">✕</button>
    <button type="button" class="vbtn pv" aria-label="Previous work (Left arrow)">‹</button>
    <button type="button" class="vbtn nx" aria-label="Next work (Right arrow)">›</button>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  vwr.el = el;
  el.addEventListener('click', e => {
    if (e.target.closest('.x') || e.target.classList.contains('stage')) return closeViewer();
    if (e.target.closest('.pv')) return stepViewer(-1);
    if (e.target.closest('.nx')) return stepViewer(1);
    const fb = e.target.closest('.fav');
    if (fb) { toggleFav(fb.dataset.w); }
  });
  showViewer();
  $('.x', el).focus();
}
function showViewer() {
  const {list, idx, el} = vwr;
  const w = W[list[idx]];
  const img = $('img', el);
  img.src = safeUrl(w.img);
  img.alt = altOf(w);
  img.onerror = () => { $('.vcap', el).insertAdjacentHTML('afterbegin', '<p class="m">This image could not be loaded from its host.</p>'); };
  const fb = $('.fav', el); fb.dataset.w = w.i; setFavBtn(fb, favs.has(w.i));
  $('.ct', el).textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : '';
  $('.pv', el).hidden = $('.nx', el).hidden = list.length < 2;
  $('.vcap', el).innerHTML = detailsHTML(w, true);
  // warm the neighbours
  [1, -1].forEach(d => { const n = list[(idx + d + list.length) % list.length]; if (n != null) { const i = new Image(); i.src = safeUrl(W[n].img); } });
}
function stepViewer(d) {
  if (!vwr) return;
  vwr.idx = (vwr.idx + d + vwr.list.length) % vwr.list.length;
  showViewer();
  if (artistState && vwr.list === artistState.list) selectWork(vwr.idx);   // keep the page in step
}
function closeViewer(silent) {
  if (!vwr) return;
  const op = vwr.opener;
  vwr.el.remove(); vwr = null;
  document.body.style.overflow = '';
  if (!silent && op && op.isConnected) op.focus();
}

/* ============================== study guide ============================== */
function renderStudyGuide() {
  const groups = DATA.groups.map((g, gi) => ({g, list: A.map((a, i) => i).filter(i => A[i].study && A[i].study.gi === gi && !hidden.has(A[i].id))}));
  const html = groups.filter(x => x.list.length).map(({g, list}) => `<section><h3>${esc(g)}</h3>${list.map(i => {
    const a = A[i], s = a.study, ws = worksOf[i].filter(wi => !failed.has(wi));
    return `<div class="ent">
      <div><a class="nm" href="#/artist/${esc(a.id)}">${esc(a.n)}</a>${a.jp ? ` <span lang="ja" style="color:var(--muted)">${esc(a.jp)}</span>` : ''}<span class="rg">${esc(s.r || a.r)}</span></div>
      <p>${esc(s.b || a.b)}</p>
      ${s.why ? `<p class="why">${esc(s.why)}</p>` : ''}
      <div class="acts">${extLink(s.site, s.siteLabel || 'school')}<a class="chip" href="#/artist/${esc(a.id)}">${ws.length ? ws.length + (ws.length === 1 ? ' work' : ' works') : 'artist page'}</a></div>
      ${ws.length ? `<div class="thumbs">${ws.slice(0, 8).map(wi => `<a href="#/artist/${esc(a.id)}/w/${esc(W[wi].i)}"><img loading="lazy" src="${esc(safeUrl(W[wi].th || W[wi].img))}" alt="${esc(altOf(W[wi]))}" ${W[wi].w ? `width="${Math.round(110 * W[wi].w / W[wi].h)}" height="110"` : ''}></a>`).join('')}</div>` : ''}
    </div>`;
  }).join('')}</section>`).join('');
  $('#pageView').innerHTML = `<div class="viewHead"><span class="seg" role="group" aria-label="Study view"><a href="#/study" aria-current="true">Where to study</a><a href="#/study/works" aria-current="false">Teachers’ work</a></span>
    <span class="lede">Teachers, ateliers and academies, grouped by the line of painting they carry.</span></div>
    <div class="guide">${html || '<div class="empty">Every study entry is hidden. <button class="btn" type="button" data-act="restoreAll">Restore hidden artists</button></div>'}</div>`;
}

/* ============================== directory ============================== */
function renderDirectory() {
  const groups = [['cont', 'Painters'], ['illu', 'Illustrators'], ['study', 'Teachers & schools']];
  const html = groups.map(([t, label]) => {
    const list = A.map((a, i) => i).filter(i => A[i].tabs.includes(t)).sort((x, y) => A[x].n.localeCompare(A[y].n));
    return `<section><h3>${label} <small style="color:var(--faint);font-family:var(--sans);font-size:12px">${list.length}</small></h3>${list.map(i => {
      const a = A[i], n = worksOf[i].length;
      return `<a class="row${hidden.has(a.id) ? ' off' : ''}" href="#/artist/${esc(a.id)}"><span>${esc(a.n)}${a.jp ? `<span class="jp">${esc(a.jp)}</span>` : ''}${hidden.has(a.id) ? ' <span class="c">(hidden)</span>' : ''}</span><span class="c">${n || '—'}</span></a>`;
    }).join('')}</section>`;
  }).join('');
  $('#pageView').innerHTML = `<div class="viewHead"><span class="lede"><b>${A.length}</b> artists · <b>${W.length.toLocaleString()}</b> works. Artists without verified images are listed too — their pages link out to their work.</span></div><div class="dir">${html}</div>`;
}

/* ============================== routing ============================== */
function parseRoute() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const p = h.split('/').filter(Boolean);
  if (!p.length || (p.length === 1 && (p[0] === 'all' || p[0] === 'past'))) return {kind: 'feed', view: HOME};
  if (VIEWS[p[0]] && p[0] !== 'study' && p.length === 1) return {kind: 'feed', view: p[0]};
  if (p[0] === 'study') return p[1] === 'works' ? {kind: 'feed', view: 'study'} : {kind: 'page', page: 'study'};
  if (p[0] === 'favs') return {kind: 'feed', view: 'favs'};
  if (p[0] === 'artists') return {kind: 'page', page: 'dir'};
  if (p[0] === 'artist' && artistById.has(p[1])) return {kind: 'artist', ai: artistById.get(p[1]), wid: p[2] === 'w' ? p[3] : null};
  return {kind: 'missing', raw: h};
}

let lastFeedView = HOME;
function route() {
  const prev = current;
  const r = parseRoute();
  closeViewer(true);
  closePanel(true);
  // leaving a feed: remember where we were
  if (prev && prev.kind === 'feed' && feeds[prev.view]) { feeds[prev.view].scroll = window.scrollY; persistFeeds(); }
  if (prev && prev.kind === 'artist' && artistState && artistState.io) artistState.io.disconnect();
  r.from = prev && (prev.kind === 'feed' || prev.kind === 'page') && r.kind === 'artist' ? prev : (r.kind === 'artist' && prev && prev.kind === 'artist' ? prev.from : null);
  current = r;
  $('#feedView').hidden = r.kind !== 'feed';
  $('#artistView').hidden = r.kind !== 'artist';
  $('#pageView').hidden = r.kind === 'feed' || r.kind === 'artist';
  document.body.dataset.route = r.kind;
  if (r.kind === 'feed') {
    lastFeedView = r.view;
    const st = feeds[r.view];
    if (st && feedView === r.view && feedMason && feedMason.items.length) {
      // same feed still in the DOM: just show it and put the scroll back
      feedMason.relayout();
      requestAnimationFrame(() => window.scrollTo(0, st.scroll));
      $('#q').value = st.q; $('#qClear').hidden = !st.q;
    } else {
      renderFeed(r.view, {keepScroll: !!(feeds[r.view] || saved[r.view])});
    }
    document.title = 'Salon · ' + (r.view === 'favs' ? 'Favourites' : VIEWS[r.view].label);
  } else if (r.kind === 'artist') {
    renderArtist(r.ai, r.wid);
    document.title = A[r.ai].n + ' · Salon';
    window.scrollTo(0, 0);
    const h = $('#artistName'); if (h && prev) h.focus({preventScroll: true});
  } else if (r.kind === 'page') {
    if (r.page === 'study') { renderStudyGuide(); document.title = 'Salon · Study'; }
    else { renderDirectory(); document.title = 'Salon · Artists'; }
    window.scrollTo(0, 0);
  } else {
    $('#pageView').innerHTML = `<div class="empty">There is nothing at “${esc(r.raw)}”.<br><a class="btn" href="#/${HOME}">Go to the gallery</a> <a class="btn" href="#/artists">All artists</a></div>`;
    document.title = 'Salon · not found';
  }
  const searchable = r.kind === 'feed';
  $('#searchForm').hidden = !searchable;
  $('#shuffleBtn').hidden = !(r.kind === 'feed' && r.view !== 'favs');
  updateTabs();
}

function updateTabs() {
  const r = current || {};
  const cur = r.kind === 'feed' ? r.view : r.kind === 'page' && r.page === 'study' ? 'study' : r.kind === 'page' ? 'dir' : null;
  const n = v => v === 'favs' ? favs.size : '';
  $('#tabs').innerHTML = [...TAB_ORDER, 'favs'].map(v => {
    const label = v === 'favs' ? '♥ Favourites' : VIEWS[v].label;
    const href = v === 'study' ? '#/study' : '#/' + v;
    return `<a href="${href}"${cur === v ? ' aria-current="page"' : ''}>${label}${v === 'favs' && favs.size ? `<span class="n">${n(v)}</span>` : ''}</a>`;
  }).join('');
}

/* ============================== panel ============================== */
let panelOpener = null;
function openPanel() {
  panelOpener = document.activeElement;
  renderPanel();
  $('#panel').hidden = false;
  $('#panelSheet').focus();
}
function closePanel(silent) {
  if ($('#panel').hidden) return;
  $('#panel').hidden = true;
  if (!silent && panelOpener && panelOpener.isConnected) panelOpener.focus();
}
function renderPanel() {
  $('#densityRow').innerHTML = ['compact', 'comfortable', 'large'].map(d =>
    `<button type="button" class="btn" role="radio" aria-checked="${d === density}" aria-pressed="${d === density}" data-density="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('');
  const hid = [...hidden].filter(id => artistById.has(id));
  $('#hiddenList').innerHTML = hid.length
    ? `<ul>${hid.map(id => `<li><a href="#/artist/${esc(id)}">${esc(A[artistById.get(id)].n)}</a><button class="btn" type="button" data-unhide="${esc(id)}">Restore</button></li>`).join('')}</ul>
       <div class="row" style="margin-top:8px"><button class="btn" type="button" data-act="restoreAll">Restore all ${hid.length}</button></div>`
    : `<p>None. “Hide this artist” on an artist page removes them from every feed; they come back here.</p>`;
  $('#buildInfo').textContent = `${A.length} artists · ${W.length.toLocaleString()} verified works · built ${DATA.built || ''}${store.ok ? '' : ' · browser storage unavailable: favourites will not persist'}`;
}

/* ============================== actions ============================== */
function refreshFeedsAfterFilterChange() {
  Object.values(feeds).forEach(st => { const shown = st.shown; buildSeq(st); st.shown = Math.min(shown, st.seq.length); });
}
function restoreAll() {
  hidden.clear(); saveHidden();
  Object.values(feeds).forEach(st => buildSeq(st));
  toast('All hidden artists restored');
  rerenderCurrent();
}
function rerenderCurrent() {
  if (!current) return;
  if (current.kind === 'feed') {
    const st = feeds[current.view];
    if (st) { st.scroll = window.scrollY; const keep = st.shown; buildSeq(st); st.shown = keep; }
    feedView = null; renderFeed(current.view, {keepScroll: true});
  } else if (current.kind === 'page') { route(); }
  else if (current.kind === 'artist') renderArtist(current.ai, current.wid);
  if (!$('#panel').hidden) renderPanel();
}

document.addEventListener('click', e => {
  const fb = e.target.closest('.fav');
  if (fb && !fb.closest('.vwr')) {
    e.preventDefault(); e.stopPropagation();
    const on = toggleFav(fb.dataset.w);
    toast(on ? 'Added to favourites' : 'Removed from favourites');
    if (current && current.kind === 'feed' && current.view === 'favs' && !on) {
      const st = feeds.favs; st.scroll = window.scrollY; buildSeq(st); feedView = null; renderFeed('favs', {keepScroll: true});
    }
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act) {
    const k = act.dataset.act;
    if (k === 'back') { history.back(); return; }
    if (k === 'clearq') { setQuery(''); return; }
    if (k === 'restoreAll') { restoreAll(); return; }
    if (k === 'artistMore') { appendArtist(ARTIST_BATCH); return; }
    if ((k === 'selPrev' || k === 'selNext') && artistState) { const n = artistState.list.length; selectWork((artistState.sel + (k === 'selNext' ? 1 : -1) + n) % n); return; }
    if (k === 'hide' && current && current.kind === 'artist') {
      const a = A[current.ai];
      const on = !hidden.has(a.id);
      hidden[on ? 'add' : 'delete'](a.id); saveHidden();
      Object.values(feeds).forEach(st => { const s = st.shown; buildSeq(st); st.shown = Math.min(s, st.seq.length); });
      if (feedView) feedView = null;   // force the feed to redraw from its (unchanged) order
      act.textContent = on ? 'Unhide this artist' : 'Hide this artist';
      toast(on ? `${a.n} hidden from every feed` : `${a.n} restored`, on ? {label: 'Undo', run: () => { hidden.delete(a.id); saveHidden(); Object.values(feeds).forEach(st => buildSeq(st)); act.textContent = 'Hide this artist'; }} : null);
      return;
    }
  }
  const un = e.target.closest('[data-unhide]');
  if (un) { hidden.delete(un.dataset.unhide); saveHidden(); Object.values(feeds).forEach(st => buildSeq(st)); feedView = null; renderPanel(); toast('Restored'); if (current.kind !== 'feed') rerenderCurrent(); else renderFeed(current.view, {keepScroll: true}); return; }
  const dens = e.target.closest('[data-density]');
  if (dens && dens.tagName === 'BUTTON') {
    density = dens.dataset.density; document.documentElement.dataset.density = density; store.set('salon:density', density);
    renderPanel();
    if (feedMason) feedMason.relayout(); if (artistMason) artistMason.relayout();
    return;
  }
  if (e.target.closest('#loadMore')) { const st = feeds[feedView]; if (st) appendBatch(st); return; }
  if (e.target.closest('#nextPass')) { const st = feeds[feedView]; if (st) nextPass(st); return; }
  const pk = e.target.closest('[data-pick]');
  if (pk && current && current.kind === 'artist' && artistState) { e.preventDefault(); selectWork(+pk.dataset.pick, true); return; }
  const v = e.target.closest('[data-view]');
  if (v && current && current.kind === 'artist' && artistState) {
    e.preventDefault();
    openViewer(artistState.list, +v.dataset.view, v);
  }
});
document.addEventListener('keydown', e => {
  if (vwr) {
    if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepViewer(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepViewer(1); }
    else if (e.key === 'Tab') trapFocus(e, vwr.el);
    return;
  }
  if (!$('#panel').hidden) {
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
    else if (e.key === 'Tab') trapFocus(e, $('#panelSheet'));
    return;
  }
  const card = e.target.closest && e.target.closest('.cl[role="button"]');
  if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); card.click(); }
  if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !$('#searchForm').hidden) { e.preventDefault(); $('#q').focus(); }
});
function trapFocus(e, root) {
  const f = [...root.querySelectorAll('button:not([hidden]), a[href], input, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null || x === document.activeElement);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
}

/* image failures: drop the card, remember the work for this session, re-flow */
let relayoutTimer;
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const card = img.closest('.card');
  if (card) {
    markFailed(+card.dataset.wi);
    card.remove();
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => { if (feedMason) feedMason.relayout(); if (artistMason) artistMason.relayout(); }, 120);
  } else if (img.closest('.thumbs a')) img.closest('.thumbs a').remove();
}, true);

/* search */
let qTimer;
function setQuery(v) {
  $('#q').value = v;
  $('#qClear').hidden = !v;
  if (!current || current.kind !== 'feed') return;
  const st = feedState(current.view);
  if (st.q === v) return;
  st.q = v; st.shown = 0; st.scroll = 0;
  buildSeq(st);
  feedView = null;
  renderFeed(current.view);
}
$('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => setQuery(e.target.value), 220); });
$('#q').addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.value) { e.preventDefault(); setQuery(''); } });
$('#qClear').addEventListener('click', () => { setQuery(''); $('#q').focus(); });

$('#shuffleBtn').addEventListener('click', () => {
  if (!current || current.kind !== 'feed') return;
  const st = feedState(current.view);
  reshuffle(st);
  feedView = null;
  renderFeed(current.view);
  toast('Fresh order');
});
$('#menuBtn').addEventListener('click', openPanel);
$('#panelClose').addEventListener('click', () => closePanel());
$('#panel').addEventListener('click', e => { if (e.target.id === 'panel') closePanel(); });

/* favourites export / import */
$('#favExport').addEventListener('click', () => {
  const rows = [...favs.entries()].map(([id, t]) => {
    const i = workById.get(id); const w = i != null ? W[i] : null;
    return {id, added: new Date(t).toISOString(), artist: w ? A[w.a].n : null, title: w ? titleOf(w) || null : null, image: w ? w.img : null, source: w ? w.src : null};
  });
  const blob = new Blob([JSON.stringify({salon: 'favourites', version: 1, exported: new Date().toISOString(), favourites: rows}, null, 1)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'salon-favourites.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#favImportLbl').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#favImport').click(); } });
$('#favImport').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const rows = Array.isArray(j) ? j : j.favourites;
    let added = 0, unknown = 0;
    (rows || []).forEach(r => {
      const id = typeof r === 'string' ? r : r && r.id;
      if (typeof id !== 'string') return;
      if (!workById.has(id)) unknown++;
      if (!favs.has(id)) { favs.set(id, Date.parse(r.added) || Date.now()); added++; }
    });
    saveFavs(); updateTabs();
    toast(`Imported ${added} favourite${added === 1 ? '' : 's'}${unknown ? ` (${unknown} not in this collection)` : ''}`);
    if (feeds.favs) buildSeq(feeds.favs);
  } catch (err) { toast('That file could not be read as Salon favourites'); }
  e.target.value = '';
});

/* keep layouts right when the window changes size */
let rsTimer, lastW = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastW) return;
  lastW = window.innerWidth;
  clearTimeout(rsTimer);
  rsTimer = setTimeout(() => { if (feedMason && !$('#feedView').hidden) feedMason.relayout(); if (artistMason && !$('#artistView').hidden) artistMason.relayout(); }, 120);
});
/* remember scroll position continuously (cheap) so a reload-from-history can restore */
let scTimer;
window.addEventListener('scroll', () => {
  clearTimeout(scTimer);
  scTimer = setTimeout(() => { if (current && current.kind === 'feed' && feeds[current.view]) { feeds[current.view].scroll = window.scrollY; persistFeeds(); } }, 250);
}, {passive: true});
/* storage changed in another tab: pick up favourites */
window.addEventListener('storage', e => {
  if (e.key === 'salon:favs') { favs = new Map(store.get('salon:favs', [], v => Array.isArray(v)).filter(x => Array.isArray(x)).map(x => [x[0], +x[1] || 0])); updateTabs(); }
});

try { history.scrollRestoration = 'manual'; } catch (e) {}
window.addEventListener('hashchange', route);
route();
