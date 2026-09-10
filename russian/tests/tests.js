/* russian/tests/tests.js — Session Zero test suite.
 *
 * Dependency-free. Loaded LAST by tests/test.html, after the real modules in
 * the contract's load order. Runs entirely synchronously so that a headless
 * `msedge --headless --disable-gpu --dump-dom` capture always sees the final
 * result in the DOM, and prints one machine-readable line to the console:
 *
 *     TESTS: <passed>/<total> PASSED     (or ... FAILED)
 *
 * The same string is written to document.title and to #tests-summary.
 *
 * Nothing here touches the network, real localStorage, or real audio: the page
 * installs a fake Storage before the modules load (see test.html), and this
 * file swaps RU.speech for a stub before the engine suite runs.
 */
window.RU = window.RU || {};
window.RUTEST = window.RUTEST || {};

(function () {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  function has(o, k) { return o !== null && o !== undefined && hasOwn.call(o, k); }

  /* ==========================================================================
     1. Tiny assertion harness (describe / it / expect)
     ========================================================================== */

  var suites = [];
  var cur = null;
  var passed = 0;
  var failed = 0;

  function msgOf(e) {
    if (!e) return String(e);
    if (e.message) return String(e.message);
    return String(e);
  }

  function describe(name, fn) {
    cur = { name: name, tests: [] };
    suites.push(cur);
    try {
      fn();
    } catch (e) {
      cur.tests.push({ name: '(suite body threw before finishing)', ok: false, err: msgOf(e) });
      failed++;
      if (window.console && console.error) console.error('FAIL: ' + name + ' > (suite body threw) :: ' + msgOf(e));
    }
    cur = null;
  }

  function it(name, fn) {
    if (!cur) { cur = { name: '(ungrouped)', tests: [] }; suites.push(cur); }
    var suite = cur;
    var rec = { name: name, ok: true, err: '' };
    try { fn(); } catch (e) { rec.ok = false; rec.err = msgOf(e); }
    suite.tests.push(rec);
    if (rec.ok) { passed++; }
    else {
      failed++;
      if (window.console && console.error) console.error('FAIL: ' + suite.name + ' > ' + name + ' :: ' + rec.err);
    }
  }

  function show(v) {
    if (typeof v === 'string') return '"' + v + '"';
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return 'function ' + (v.name || '(anonymous)');
    try {
      var s = JSON.stringify(v);
      if (s === undefined) return String(v);
      return s.length > 400 ? s.slice(0, 400) + '…' : s;
    } catch (e) { return String(v); }
  }

  function deepEq(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number' && a !== a && b !== b) return true; // NaN
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b), i;
    if (ka.length !== kb.length) return false;
    for (i = 0; i < ka.length; i++) {
      if (kb.indexOf(ka[i]) < 0) return false;
      if (!deepEq(a[ka[i]], b[ka[i]])) return false;
    }
    return true;
  }

  function expect(actual) {
    return {
      toBe: function (x) {
        if (actual !== x && !(actual !== actual && x !== x)) throw new Error('expected ' + show(x) + ', got ' + show(actual));
      },
      toEqual: function (x) {
        if (!deepEq(actual, x)) throw new Error('expected deep-equal ' + show(x) + ', got ' + show(actual));
      },
      toThrow: function (re) {
        var threw = false, err = null;
        try { actual(); } catch (e) { threw = true; err = e; }
        if (!threw) throw new Error('expected the call to throw, it returned normally');
        if (re && !re.test(String(msgOf(err)))) throw new Error('threw ' + show(msgOf(err)) + ' which does not match ' + re);
      },
      toBeCloseTo: function (x, digits) {
        var d = (digits === undefined) ? 2 : digits;
        var tol = Math.pow(10, -d) / 2;
        if (!(Math.abs(actual - x) < tol)) throw new Error('expected ' + show(actual) + ' within ' + tol + ' of ' + show(x));
      },
      toBeTruthy: function () { if (!actual) throw new Error('expected a truthy value, got ' + show(actual)); },
      toBeFalsy: function () { if (actual) throw new Error('expected a falsy value, got ' + show(actual)); },
      toContain: function (x) {
        var ok = (typeof actual === 'string') ? actual.indexOf(x) >= 0 : (actual && actual.indexOf && actual.indexOf(x) >= 0);
        if (!ok) throw new Error('expected ' + show(actual) + ' to contain ' + show(x));
      },
      toMatch: function (re) { if (!re.test(String(actual))) throw new Error('expected ' + show(String(actual)) + ' to match ' + re); },
      toBeGreaterThan: function (x) { if (!(actual > x)) throw new Error('expected ' + show(actual) + ' > ' + show(x)); },
      toBeAtLeast: function (x) { if (!(actual >= x)) throw new Error('expected ' + show(actual) + ' >= ' + show(x)); },
      toBeLessThan: function (x) { if (!(actual < x)) throw new Error('expected ' + show(actual) + ' < ' + show(x)); }
    };
  }

  function fail(message) { throw new Error(message); }

  /* ==========================================================================
     2. Shared helpers and fixtures
     ========================================================================== */

  var NOW = Date.now();
  var DAY = 86400000;
  var FAST = 600;      // comfortably under any sane "effortless" latency threshold
  var SLOW = 20000;    // comfortably over it
  var ACUTE = '\u0301'; // U+0301 COMBINING ACUTE ACCENT — the stress mark

  var KEY_A = 'ru.save.v1.a';
  var KEY_B = 'ru.save.v1.b';

  function clone(o) {
    if (o === null || typeof o !== 'object') return o;
    if (o instanceof Date) return new Date(o.getTime());
    if (Array.isArray(o)) { var a = [], i; for (i = 0; i < o.length; i++) a[i] = clone(o[i]); return a; }
    var r = {}, k;
    for (k in o) if (has(o, k)) r[k] = clone(o[k]);
    return r;
  }

  function spin(ms) { // synchronous wait, so two saves get distinct savedAt stamps
    var t = Date.now();
    while (Date.now() - t < ms) { /* deliberate busy wait: the suite must stay synchronous */ }
  }

  function keys(o) { return o ? Object.keys(o) : []; }

  // Flatten any object into [{path, value}] leaves — used to inspect report()
  // and save states whose exact field names the contract leaves open.
  function leaves(obj, path, out, depth) {
    out = out || []; path = path || ''; depth = depth || 0;
    if (depth > 8) { out.push({ path: path, value: '(depth cut)' }); return out; }
    if (obj === null || typeof obj !== 'object') { out.push({ path: path, value: obj }); return out; }
    if (obj instanceof Date) { out.push({ path: path, value: obj.getTime() }); return out; }
    if (Array.isArray(obj)) {
      if (!obj.length) out.push({ path: path, value: '[]' });
      for (var i = 0; i < obj.length; i++) leaves(obj[i], path + '[' + i + ']', out, depth + 1);
      return out;
    }
    var any = false, k;
    for (k in obj) if (has(obj, k)) { any = true; leaves(obj[k], path ? path + '.' + k : k, out, depth + 1); }
    if (!any) out.push({ path: path, value: '{}' });
    return out;
  }

  function leavesUnder(obj, re) {
    var all = leaves(obj), out = [], i;
    for (i = 0; i < all.length; i++) if (re.test(all[i].path)) out.push(all[i]);
    return out;
  }

  function stringify(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }

  // Storage plumbing -------------------------------------------------------

  function fakeStore() { return window.RUTEST.fakeStorage; }

  function resetStorage() {
    var fs = fakeStore();
    if (fs && fs.__reset) fs.__reset();
    else { try { window.localStorage.clear(); } catch (e) { /* nothing we can do */ } }
  }

  function setThrowMode(mode) {
    var fs = fakeStore();
    if (fs) fs.throwMode = mode;
  }

  function rawSlot(key) {
    var fs = fakeStore();
    if (fs) return has(fs._data, key) ? fs._data[key] : null;
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function writeRawSlot(key, value) {
    var fs = fakeStore();
    if (fs) { if (value === null) delete fs._data[key]; else fs._data[key] = String(value); return; }
    try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, String(value)); }
    catch (e) { /* ignore */ }
  }

  function parseSlot(key) {
    var raw = rawSlot(key);
    if (raw === null || raw === undefined) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function slotKeysInUse() {
    var out = [];
    if (rawSlot(KEY_A) !== null) out.push(KEY_A);
    if (rawSlot(KEY_B) !== null) out.push(KEY_B);
    return out;
  }

  function saveAndFlush(state) {
    RU.save.write(state);
    if (typeof RU.save.flush === 'function') RU.save.flush();
  }

  // Lexicon fixture used by the grading suite. Deliberately local so the
  // grading tests do not depend on whatever the content author put in
  // data/lexicon.js. кот is animate masculine, so acc_sg === gen_sg === "кота",
  // which is exactly the trap the contract's beat 4 wants diagnosed.
  var TESTLEX = {
    'lex:кот': {
      id: 'lex:кот', lemma: 'кот', stressed: 'ко' + ACUTE + 'т', pos: 'noun', gender: 'm', gloss: 'cat',
      forms: {
        nom_sg: 'кот', gen_sg: 'кота', dat_sg: 'коту',
        acc_sg: 'кота', ins_sg: 'котом', pre_sg: 'коте', nom_pl: 'коты'
      },
      letters: ['К', 'О', 'Т'], tags: ['s0']
    },
    'lex:нос': {
      id: 'lex:нос', lemma: 'нос', stressed: 'но' + ACUTE + 'с', pos: 'noun', gender: 'm', gloss: 'nose',
      forms: {
        nom_sg: 'нос', gen_sg: 'носа', dat_sg: 'носу',
        acc_sg: 'нос', ins_sg: 'носом', pre_sg: 'носе', nom_pl: 'носы'
      },
      letters: ['Н', 'О', 'С'], tags: ['s0']
    }
  };

  function catExercise(over) {
    var ex = {
      type: 'exercise', id: 's0.test.ex', kind: 'constrained', graded: true, modality: 'typed',
      prompt: { ru: 'Что это?', stressed: 'Что э' + ACUTE + 'то?', en: 'What is this?', audio: null },
      image: null,
      accept: ['кот', 'это кот', 'это кот.'],
      checks: [{ type: 'formOf', lex: 'lex:кот', require: 'nom_sg' }],
      hint: 'Она показывает на кота.',
      reviews: ['lex:кот'],
      dimension: 'controlled'
    };
    if (over) { var k; for (k in over) if (has(over, k)) ex[k] = over[k]; }
    return ex;
  }

  /* ==========================================================================
     3. Module presence
     ========================================================================== */

  var REQUIRED = [
    ['srs', ['newCard', 'rate', 'due', 'deriveRating']],
    ['save', ['load', 'write', 'flush', 'exportBlob', 'importJson', 'fresh', 'onError', 'migrate']],
    ['grade', ['normalise', 'check']],
    ['speech', ['load', 'play', 'replayWord', 'available', 'consentState', 'setConsent', 'listen']],
    ['engine', ['start']]
  ];

  describe('0. modules load', function () {
    it('the page installed a fake localStorage before the modules ran', function () {
      expect(!!fakeStore()).toBe(true);
      if (window.RUTEST.storageInstallError) fail('could not shadow window.localStorage: ' + window.RUTEST.storageInstallError);
      expect(window.localStorage === fakeStore()).toBe(true);
    });

    it('every module script loaded', function () {
      var missing = window.RUTEST.loadFailures || [];
      if (missing.length) fail(missing.length + ' script(s) failed to load: ' + missing.join(', '));
    });

    it('no module threw while loading', function () {
      var errs = window.RUTEST.loadErrors || [];
      if (errs.length) fail(errs.length + ' script error(s) during load: ' + errs.join(' | '));
    });

    for (var i = 0; i < REQUIRED.length; i++) {
      (function (name, members) {
        it('RU.' + name + ' exists with its contract API', function () {
          var mod = RU[name];
          if (!mod) fail('RU.' + name + ' is undefined — js/' + name + '.js is missing or failed to parse');
          var missing = [], j;
          for (j = 0; j < members.length; j++) if (typeof mod[members[j]] !== 'function') missing.push(members[j]);
          if (missing.length) fail('RU.' + name + ' is missing function(s): ' + missing.join(', '));
        });
      }(REQUIRED[i][0], REQUIRED[i][1]));
    }

    it('RU.LEXICON is a non-empty object of lexemes', function () {
      if (!RU.LEXICON) fail('RU.LEXICON is undefined — data/lexicon.js is missing or failed to parse');
      expect(keys(RU.LEXICON).length).toBeGreaterThan(0);
    });

    it('RU.SESSION0 exists and exposes an ordered node list', function () {
      if (!RU.SESSION0) fail('RU.SESSION0 is undefined — data/session0.js is missing or failed to parse');
      var nodes = sessionNodes();
      if (!nodes) fail('could not find the ordered node array on RU.SESSION0 (looked for .nodes/.session/.script/.beats, or SESSION0 itself as an array); keys are: ' + keys(RU.SESSION0).join(', '));
      expect(nodes.length).toBeGreaterThan(0);
    });
  });

  /* ==========================================================================
     4. RU.srs.deriveRating — the binding rules table (CONTRACT §2, audit §6.4)
     ========================================================================== */

  // The contract's deriveRating signature does not carry the card's current
  // interval, yet the "easy" rule depends on it ("card interval already >= 21
  // days"). We therefore supply the interval under every plausible name so a
  // conforming implementation can find it however it chose to read it.
  function dr(over) {
    var input = {
      correct: true, assisted: false, selfCorrected: false, confusablePairSlip: false,
      latencyMs: 3000, modality: 'typed', interfered: false
    };
    var k;
    if (over) for (k in over) if (has(over, k)) input[k] = over[k];
    if (has(input, 'interval')) {
      input.cardInterval = input.interval;
      input.card = { interval: input.interval, stability: input.interval, difficulty: 5, reps: 6, lapses: 0, state: 'review', due: NOW + input.interval * DAY, lastReview: NOW - DAY };
    }
    return RU.srs.deriveRating(input);
  }

  describe('1. RU.srs.deriveRating binding rules', function () {
    if (!RU.srs || typeof RU.srs.deriveRating !== 'function') {
      it('RU.srs.deriveRating is available', function () { fail('RU.srs.deriveRating is not a function'); });
      return;
    }

    it('assisted:true returns null even when the answer was correct and fast', function () {
      // The single most important rule: a hinted answer is recorded, never rated.
      expect(dr({ assisted: true, correct: true, latencyMs: FAST, interval: 60 })).toBe(null);
    });

    it('assisted:true returns null even when the answer was wrong', function () {
      expect(dr({ assisted: true, correct: false })).toBe(null);
    });

    it('assisted:true beats a self-corrected answer too (assisted always wins)', function () {
      expect(dr({ assisted: true, correct: true, selfCorrected: true })).toBe(null);
    });

    it('a wrong answer is "again"', function () {
      expect(dr({ correct: false })).toBe('again');
    });

    it('a wrong answer is "again" regardless of latency or modality', function () {
      expect(dr({ correct: false, latencyMs: FAST, modality: 'spoken' })).toBe('again');
      expect(dr({ correct: false, latencyMs: SLOW, modality: 'typed' })).toBe('again');
    });

    it('correct but self-corrected is "hard"', function () {
      expect(dr({ correct: true, selfCorrected: true })).toBe('hard');
    });

    it('correct after a confusable-pair slip in the same session is "hard"', function () {
      expect(dr({ correct: true, confusablePairSlip: true })).toBe('hard');
    });

    it('a plain correct first-try unaided answer is "good", not "easy"', function () {
      // Revision 1 of the plan omitted "good"; it is the default outcome.
      expect(dr({ correct: true })).toBe('good');
    });

    it('a fast correct answer on a short-interval card is still only "good"', function () {
      expect(dr({ correct: true, latencyMs: FAST, interval: 3 })).toBe('good');
    });

    it('"easy" is granted for a fast unaided typed answer on a card at >= 21 days', function () {
      // If this fails while the three refusal tests below pass, "easy" is dead
      // code and latency/interval are not being read at all.
      expect(dr({ correct: true, latencyMs: FAST, interval: 40, modality: 'typed', interfered: false })).toBe('easy');
    });

    it('"easy" is refused when the modality is "spoken" (recogniser lag is not mastery)', function () {
      expect(dr({ correct: true, latencyMs: FAST, interval: 40, modality: 'spoken' })).toBe('good');
    });

    it('"easy" is refused when interfered is true (replay, scroll, tab blur)', function () {
      expect(dr({ correct: true, latencyMs: FAST, interval: 40, interfered: true })).toBe('good');
    });

    it('"easy" is refused when the card interval is under 21 days', function () {
      expect(dr({ correct: true, latencyMs: FAST, interval: 20, modality: 'typed' })).toBe('good');
      expect(dr({ correct: true, latencyMs: FAST, interval: 0, modality: 'typed' })).toBe('good');
    });

    it('"easy" is refused when the answer was slow', function () {
      expect(dr({ correct: true, latencyMs: SLOW, interval: 40 })).toBe('good');
    });

    it('every returned value is one of the four ratings or null', function () {
      var cases = [
        { correct: false }, { correct: true }, { assisted: true }, { correct: true, selfCorrected: true },
        { correct: true, confusablePairSlip: true }, { correct: true, latencyMs: FAST, interval: 40 },
        { correct: true, modality: 'spoken' }, { correct: false, assisted: true }
      ];
      var allowed = ['again', 'hard', 'good', 'easy'], i, r;
      for (i = 0; i < cases.length; i++) {
        r = dr(cases[i]);
        if (r !== null && allowed.indexOf(r) < 0) fail('case ' + show(cases[i]) + ' returned ' + show(r));
      }
    });
  });

  /* ==========================================================================
     5. RU.srs.rate / newCard / due
     ========================================================================== */

  function intervalOf(card) {
    if (!card) return NaN;
    if (typeof card.interval === 'number') return card.interval;
    // Fall back to the gap between lastReview and due, expressed in days.
    var due = card.due instanceof Date ? card.due.getTime() : card.due;
    var last = card.lastReview instanceof Date ? card.lastReview.getTime() : card.lastReview;
    if (typeof due === 'number' && typeof last === 'number') return (due - last) / DAY;
    return NaN;
  }

  function expectRatingRejected(rating, label) {
    var card = RU.srs.newCard();
    var before = clone(card);
    var threw = false, result;
    try { result = RU.srs.rate(card, rating, NOW); } catch (e) { threw = true; }
    if (threw) return;                                   // throwing is a valid rejection
    if (result === null || result === undefined) return;  // returning nothing is a valid rejection
    var repsBefore = before.reps, repsAfter = result.reps;
    var dueBefore = String(before.due instanceof Date ? before.due.getTime() : before.due);
    var dueAfter = String(result.due instanceof Date ? result.due.getTime() : result.due);
    if (repsBefore === repsAfter && dueBefore === dueAfter) return; // unchanged card is a valid rejection
    fail(label + ': rate() accepted the rating and rescheduled the card (reps ' + repsBefore + '→' + repsAfter + ', due ' + dueBefore + '→' + dueAfter + ')');
  }

  describe('2. RU.srs.rate / newCard / due', function () {
    if (!RU.srs || typeof RU.srs.rate !== 'function') {
      it('RU.srs.rate is available', function () { fail('RU.srs.rate is not a function'); });
      return;
    }

    it('newCard() returns the contract card shape', function () {
      var c = RU.srs.newCard();
      var need = ['due', 'stability', 'difficulty', 'reps', 'lapses', 'lastReview', 'interval', 'state'];
      var missing = [], i;
      for (i = 0; i < need.length; i++) if (!has(c, need[i])) missing.push(need[i]);
      if (missing.length) fail('newCard() is missing field(s): ' + missing.join(', ') + ' — got ' + show(c));
      expect(c.reps).toBe(0);
      expect(c.lapses).toBe(0);
    });

    it('a new card is due immediately', function () {
      expect(RU.srs.due(RU.srs.newCard(), NOW)).toBe(true);
    });

    it('rate() does not mutate the card it was given', function () {
      var c = RU.srs.newCard();
      var snapshot = stringify(c);
      RU.srs.rate(c, 'good', NOW);
      expect(stringify(c)).toBe(snapshot);
    });

    it('a rated card is not due at the moment it was rated, and is due later', function () {
      var c = RU.srs.rate(RU.srs.newCard(), 'good', NOW);
      expect(RU.srs.due(c, NOW)).toBe(false);
      var due = c.due instanceof Date ? c.due.getTime() : c.due;
      expect(RU.srs.due(c, due + 1000)).toBe(true);
    });

    it('intervals grow across a ladder of "good" ratings', function () {
      var c = RU.srs.newCard();
      var t = NOW;
      var seen = [];
      for (var i = 0; i < 4; i++) {
        c = RU.srs.rate(c, 'good', t);
        seen.push(intervalOf(c));
        t = (c.due instanceof Date ? c.due.getTime() : c.due) + 1000;
      }
      for (var j = 1; j < seen.length; j++) {
        if (!(seen[j] >= seen[j - 1])) fail('interval went backwards on "good": ' + seen.join(' → '));
      }
      if (!(seen[seen.length - 1] > seen[0])) fail('four "good" ratings did not grow the interval: ' + seen.join(' → '));
      expect(c.reps).toBeGreaterThan(0);
    });

    it('"again" collapses the interval and counts a lapse', function () {
      var c = RU.srs.newCard(), t = NOW, i;
      for (i = 0; i < 4; i++) { c = RU.srs.rate(c, 'good', t); t = (c.due instanceof Date ? c.due.getTime() : c.due) + 1000; }
      var before = c;
      var after = RU.srs.rate(before, 'again', t);
      if (!(intervalOf(after) < intervalOf(before))) {
        fail('"again" did not collapse the interval: ' + intervalOf(before) + ' → ' + intervalOf(after));
      }
      if (!(after.lapses > before.lapses)) fail('"again" did not count a lapse: ' + before.lapses + ' → ' + after.lapses);
    });

    it('"hard" schedules sooner than "good" from the same card', function () {
      var c = RU.srs.newCard(), t = NOW, i;
      for (i = 0; i < 3; i++) { c = RU.srs.rate(c, 'good', t); t = (c.due instanceof Date ? c.due.getTime() : c.due) + 1000; }
      var hard = RU.srs.rate(c, 'hard', t);
      var good = RU.srs.rate(c, 'good', t);
      if (!(intervalOf(hard) <= intervalOf(good))) fail('"hard" scheduled later than "good": ' + intervalOf(hard) + ' vs ' + intervalOf(good));
    });

    it('a null rating is rejected — it must never schedule the card', function () {
      // deriveRating returns null for assisted attempts and the card must stay
      // due, so rate() must refuse null rather than quietly treating it as good.
      expectRatingRejected(null, 'null rating');
    });

    it('undefined and unknown ratings are rejected too', function () {
      expectRatingRejected(undefined, 'undefined rating');
      expectRatingRejected('sometimes', 'unknown rating string');
    });
  });

  /* ==========================================================================
     6. RU.save
     ========================================================================== */

  var saveErrors = [];
  try {
    if (RU.save && typeof RU.save.onError === 'function') {
      RU.save.onError(function (e) { saveErrors.push(e || {}); });
    }
  } catch (e) { /* reported by the module-presence suite */ }

  function findAggregates(state) {
    var out = [], k, m, entry, kk;
    for (k in state) {
      if (!has(state, k)) continue;
      if (/aggregat|folded|rollup|archive|summar/i.test(k) && state[k] && typeof state[k] === 'object') out.push({ path: k, value: state[k] });
    }
    if (state && state.mastery) {
      for (m in state.mastery) {
        if (!has(state.mastery, m)) continue;
        entry = state.mastery[m];
        if (!entry || typeof entry !== 'object') continue;
        for (kk in entry) {
          if (!has(entry, kk)) continue;
          if (/aggregat|folded|counts|totals|history/i.test(kk)) out.push({ path: 'mastery.' + m + '.' + kk, value: entry[kk] });
        }
      }
    }
    return out;
  }

  describe('3. RU.save round-trip, corruption and import', function () {
    if (!RU.save || typeof RU.save.fresh !== 'function') {
      it('RU.save is available', function () { fail('RU.save is not usable'); });
      return;
    }

    it('fresh() returns an empty, well-formed state', function () {
      var s = RU.save.fresh();
      expect(s.schema).toBe(1);
      expect(typeof s.contentVersion).toBe('string');
      expect(!!s.position).toBe(true);
      expect(!!s.flags).toBe(true);
      expect(!!s.memory).toBe(true);
      expect(!!s.mastery).toBe(true);
      expect(Array.isArray(s.attempts)).toBe(true);
      expect(s.attempts.length).toBe(0);
      expect(!!s.settings).toBe(true);
      expect(!!s.position.variantPicks).toBe(true);
    });

    it('load() on empty storage returns a fresh state with no warnings', function () {
      resetStorage();
      var r = RU.save.load();
      expect(!!r).toBe(true);
      expect(!!r.state).toBe(true);
      expect(Array.isArray(r.warnings)).toBe(true);
      expect(r.state.attempts.length).toBe(0);
      expect(r.warnings.length).toBe(0); // a first run is not a corruption warning
    });

    it('write() then load() round-trips the state', function () {
      resetStorage();
      var s = RU.save.fresh();
      s.position.nodeId = 's0.l7';
      s.flags.name = 'Wenhan';
      s.settings.translit = false;
      s.memory.city = 'Petersburg';
      saveAndFlush(s);
      var r = RU.save.load();
      expect(r.state.position.nodeId).toBe('s0.l7');
      expect(r.state.flags.name).toBe('Wenhan');
      expect(r.state.settings.translit).toBe(false);
      expect(r.state.memory.city).toBe('Petersburg');
      expect(r.warnings.length).toBe(0);
    });

    it('a written slot carries schema, contentVersion, savedAt and a checksum', function () {
      resetStorage();
      var s = RU.save.fresh();
      s.position.nodeId = 's0.l1';
      saveAndFlush(s);
      var used = slotKeysInUse();
      if (!used.length) fail('neither ' + KEY_A + ' nor ' + KEY_B + ' was written');
      var slot = parseSlot(used[0]);
      if (!slot) fail(used[0] + ' does not contain parseable JSON');
      expect(slot.schema).toBe(1);
      expect(typeof slot.contentVersion).toBe('string');
      expect(typeof slot.savedAt).toBe('number');
      expect(typeof slot.checksum).toBe('string');
      expect(slot.checksum.length).toBeGreaterThan(0);
    });

    it('consecutive writes alternate between the two slots', function () {
      resetStorage();
      var s = RU.save.fresh();
      s.position.nodeId = 's0.first';
      saveAndFlush(s);
      spin(3);
      s.position.nodeId = 's0.second';
      saveAndFlush(s);
      var used = slotKeysInUse();
      if (used.length !== 2) fail('expected both ' + KEY_A + ' and ' + KEY_B + ' after two writes, in use: ' + (used.join(', ') || '(none)'));
      var a = parseSlot(KEY_A), b = parseSlot(KEY_B);
      var ids = [a && a.position && a.position.nodeId, b && b.position && b.position.nodeId];
      if (ids.indexOf('s0.first') < 0 || ids.indexOf('s0.second') < 0) {
        fail('the two slots do not hold the two distinct writes: ' + show(ids));
      }
    });

    it('checksum tampering on the newest slot falls back to the older slot and warns', function () {
      resetStorage();
      var s = RU.save.fresh();
      s.position.nodeId = 's0.older';
      saveAndFlush(s);
      spin(4); // distinct savedAt stamps, so "newest" is unambiguous
      s = RU.save.fresh();
      s.position.nodeId = 's0.newer';
      saveAndFlush(s);

      // Find the slot holding the newer write and corrupt only its checksum.
      var target = null, k, slot;
      var candidates = [KEY_A, KEY_B];
      for (k = 0; k < candidates.length; k++) {
        slot = parseSlot(candidates[k]);
        if (slot && slot.position && slot.position.nodeId === 's0.newer') target = candidates[k];
      }
      if (!target) fail('could not find the slot holding the newer write');
      var tampered = parseSlot(target);
      tampered.checksum = 'deadbeef';
      writeRawSlot(target, JSON.stringify(tampered));

      var r = RU.save.load();
      expect(r.state.position.nodeId).toBe('s0.older');
      if (!r.warnings.length) fail('falling back to the older slot must report a warning; warnings was empty');
    });

    it('a slot whose payload was edited without fixing the checksum is rejected', function () {
      resetStorage();
      var s = RU.save.fresh();
      s.position.nodeId = 's0.older';
      saveAndFlush(s);
      spin(4);
      s = RU.save.fresh();
      s.position.nodeId = 's0.newer';
      saveAndFlush(s);

      var target = null, k, slot;
      var candidates = [KEY_A, KEY_B];
      for (k = 0; k < candidates.length; k++) {
        slot = parseSlot(candidates[k]);
        if (slot && slot.position && slot.position.nodeId === 's0.newer') target = candidates[k];
      }
      if (!target) fail('could not find the slot holding the newer write');
      var edited = parseSlot(target);
      edited.flags.name = 'Injected';         // payload changed, checksum left alone
      writeRawSlot(target, JSON.stringify(edited));

      var r = RU.save.load();
      expect(r.state.position.nodeId).toBe('s0.older');
      expect(r.state.flags.name === 'Injected').toBe(false);
      expect(r.warnings.length).toBeGreaterThan(0);
    });

    it('both slots corrupt returns a fresh state and a warning', function () {
      resetStorage();
      writeRawSlot(KEY_A, '{not json at all');
      writeRawSlot(KEY_B, 'garbage-not-json');
      var r = RU.save.load();
      expect(!!r.state).toBe(true);
      expect(r.state.schema).toBe(1);
      expect(r.state.attempts.length).toBe(0);
      expect(keys(r.state.mastery).length).toBe(0);
      if (!r.warnings.length) fail('losing both slots must report a warning; warnings was empty');
    });

    it('both slots present but checksum-invalid returns a fresh state and a warning', function () {
      resetStorage();
      var s = RU.save.fresh();
      s.position.nodeId = 's0.gone';
      saveAndFlush(s);
      spin(3);
      s.position.nodeId = 's0.gone2';
      saveAndFlush(s);
      var k, slot;
      var candidates = [KEY_A, KEY_B];
      for (k = 0; k < candidates.length; k++) {
        slot = parseSlot(candidates[k]);
        if (slot) { slot.checksum = 'not-the-checksum'; writeRawSlot(candidates[k], JSON.stringify(slot)); }
      }
      var r = RU.save.load();
      expect(r.state.attempts.length).toBe(0);
      expect(r.state.position.nodeId === 's0.gone' || r.state.position.nodeId === 's0.gone2').toBe(false);
      expect(r.warnings.length).toBeGreaterThan(0);
    });

    it('a storage security exception on load yields a usable state instead of throwing', function () {
      resetStorage();
      setThrowMode('security');
      var r = null, threw = false;
      try { r = RU.save.load(); } catch (e) { threw = true; }
      setThrowMode(null);
      expect(threw).toBe(false);
      expect(!!(r && r.state)).toBe(true);
      expect(Array.isArray(r.warnings)).toBe(true);
    });

    it('a QuotaExceededError on write reports through onError and keeps playing', function () {
      resetStorage();
      var before = saveErrors.length;
      setThrowMode('quota');
      var s = RU.save.fresh();
      s.position.nodeId = 's0.quota';
      var threw = false;
      try { saveAndFlush(s); } catch (e) { threw = true; }
      setThrowMode(null);
      expect(threw).toBe(false); // the game must keep playing from memory
      var fired = saveErrors.slice(before);
      if (!fired.length) fail('a failed write did not call any onError callback');
      var kinds = [], i;
      for (i = 0; i < fired.length; i++) kinds.push(String(fired[i].kind) + ':' + String(fired[i].message));
      if (!/quota/i.test(kinds.join(' | '))) fail('onError did not report kind "quota"; got ' + kinds.join(' | '));
    });

    it('exportBlob() produces a filename and JSON that imports back', function () {
      var s = RU.save.fresh();
      s.position.nodeId = 's0.exported';
      var blob = RU.save.exportBlob(s);
      expect(typeof blob.filename).toBe('string');
      expect(blob.filename.length).toBeGreaterThan(0);
      expect(/\.json$/i.test(blob.filename)).toBe(true);
      var back = RU.save.importJson(blob.json);
      expect(back.ok).toBe(true);
      expect(back.state.position.nodeId).toBe('s0.exported');
    });

    it('importJson rejects malformed JSON and leaves the existing save untouched', function () {
      resetStorage();
      var s = RU.save.fresh();
      s.position.nodeId = 's0.keepme';
      saveAndFlush(s);
      var snapshot = JSON.stringify([rawSlot(KEY_A), rawSlot(KEY_B)]);

      var r = RU.save.importJson('{ this is not json ');
      expect(r.ok).toBe(false);
      expect(typeof r.error).toBe('string');
      expect(r.error.length).toBeGreaterThan(0);
      expect(JSON.stringify([rawSlot(KEY_A), rawSlot(KEY_B)])).toBe(snapshot);
      expect(RU.save.load().state.position.nodeId).toBe('s0.keepme');
    });

    it('importJson rejects a bad schema and leaves the existing save untouched', function () {
      resetStorage();
      var s = RU.save.fresh();
      s.position.nodeId = 's0.keepme';
      saveAndFlush(s);
      var snapshot = JSON.stringify([rawSlot(KEY_A), rawSlot(KEY_B)]);

      var bad = RU.save.fresh();
      bad.schema = 99;
      var r = RU.save.importJson(JSON.stringify(bad));
      expect(r.ok).toBe(false);
      expect(typeof r.error).toBe('string');
      expect(JSON.stringify([rawSlot(KEY_A), rawSlot(KEY_B)])).toBe(snapshot);

      // A structurally wrong object must be rejected too, never partial-merged.
      var r2 = RU.save.importJson(JSON.stringify({ hello: 'world' }));
      expect(r2.ok).toBe(false);
      expect(JSON.stringify([rawSlot(KEY_A), rawSlot(KEY_B)])).toBe(snapshot);
      expect(RU.save.load().state.position.nodeId).toBe('s0.keepme');
    });

    it('importJson rejects an unknown contentVersion and leaves the existing save untouched', function () {
      resetStorage();
      var s = RU.save.fresh();
      s.position.nodeId = 's0.keepme';
      saveAndFlush(s);
      var snapshot = JSON.stringify([rawSlot(KEY_A), rawSlot(KEY_B)]);

      var bad = RU.save.fresh();
      bad.contentVersion = 's99.999-from-the-future';
      var r = RU.save.importJson(JSON.stringify(bad));
      expect(r.ok).toBe(false);
      expect(typeof r.error).toBe('string');
      expect(r.error.length).toBeGreaterThan(0);
      expect(JSON.stringify([rawSlot(KEY_A), rawSlot(KEY_B)])).toBe(snapshot);
      expect(RU.save.load().state.position.nodeId).toBe('s0.keepme');
    });

    it('importJson accepts a valid save of the current content version', function () {
      var good = RU.save.fresh();
      good.position.nodeId = 's0.imported';
      good.flags.name = 'Аня';
      var r = RU.save.importJson(JSON.stringify(good));
      expect(r.ok).toBe(true);
      expect(!!r.state).toBe(true);
      expect(r.state.position.nodeId).toBe('s0.imported');
    });

    it('migrate() passes a current-version state through unharmed', function () {
      var s = RU.save.fresh();
      s.position.nodeId = 's0.l4';
      var out = RU.save.migrate(s);
      expect(!!out).toBe(true);
      expect(out.schema).toBe(1);
      expect(out.position.nodeId).toBe('s0.l4');
    });

    it('the attempt log is capped — old entries are dropped, the newest survive', function () {
      resetStorage();
      var CAP = (RU.save.ATTEMPT_CAP || RU.save.MAX_ATTEMPTS || RU.save.ATTEMPTS_CAP || 5000);
      var n = CAP + 200;
      var s = RU.save.fresh();
      var i;
      for (i = 0; i < n; i++) {
        s.attempts.push({
          id: 'att' + i, nodeId: 's0.test.ex', itemId: 'lex:кот', dimension: 'controlled',
          modality: 'typed', correct: (i % 3 !== 0), assisted: false, latencyMs: 1200 + i,
          raw: 'кот', at: NOW - (n - i) * 1000
        });
      }
      saveAndFlush(s);
      var after = RU.save.load().state.attempts;
      var inPlace = s.attempts;
      var capped = (after.length < n) ? after : ((inPlace.length < n) ? inPlace : null);
      if (!capped) fail('wrote ' + n + ' attempts and got ' + after.length + ' back — the log is not capped');
      expect(capped.length).toBeLessThan(n);
      var ids = {}, j;
      for (j = 0; j < capped.length; j++) ids[capped[j].id] = true;
      if (!ids['att' + (n - 1)]) fail('the newest attempt was dropped by the cap');
      if (ids['att0']) fail('the oldest attempt survived a cap that dropped ' + (n - capped.length) + ' entries');
    });

    it('capped attempts are folded into aggregates, not simply thrown away', function () {
      resetStorage();
      var CAP = (RU.save.ATTEMPT_CAP || RU.save.MAX_ATTEMPTS || RU.save.ATTEMPTS_CAP || 5000);
      var n = CAP + 200;
      var s = RU.save.fresh();
      var i;
      for (i = 0; i < n; i++) {
        s.attempts.push({
          id: 'att' + i, nodeId: 's0.test.ex', itemId: 'lex:кот', dimension: 'controlled',
          modality: 'typed', correct: (i % 3 !== 0), assisted: false, latencyMs: 1200 + i,
          raw: 'кот', at: NOW - (n - i) * 1000
        });
      }
      saveAndFlush(s);
      var loaded = RU.save.load().state;
      var found = findAggregates(loaded).concat(findAggregates(s));
      if (!found.length) {
        fail('no aggregate structure found after folding ~' + (n - CAP) + ' attempts; searched top-level keys matching /aggregat|folded|rollup|archive|summar/ and mastery.*.{aggregate,folded,counts,totals,history}. State keys: ' + keys(loaded).join(', '));
      }
      // At least one aggregate must actually carry a positive count.
      var numbers = [], k, l;
      for (k = 0; k < found.length; k++) {
        l = leaves(found[k].value);
        for (i = 0; i < l.length; i++) if (typeof l[i].value === 'number' && l[i].value > 0) numbers.push(l[i].path + '=' + l[i].value);
      }
      if (!numbers.length) fail('an aggregate structure exists but holds no positive counts: ' + show(found[0]));
    });
  });

  /* ==========================================================================
     7. RU.grade.normalise
     ========================================================================== */

  describe('4. RU.grade.normalise', function () {
    if (!RU.grade || typeof RU.grade.normalise !== 'function') {
      it('RU.grade.normalise is available', function () { fail('RU.grade.normalise is not a function'); });
      return;
    }
    var n = function (s) { return RU.grade.normalise(s); };

    it('lowercases', function () {
      expect(n('КОТ')).toBe('кот');
      expect(n('Это Кот')).toBe('это кот');
    });

    it('trims and collapses internal whitespace', function () {
      expect(n('   это    кот   ')).toBe('это кот');
      expect(n('это\tкот')).toBe('это кот');
      expect(n('это\n кот')).toBe('это кот');
    });

    it('folds ё to е in both cases', function () {
      expect(n('ёж')).toBe('еж');
      expect(n('Ёлка')).toBe('елка');
      expect(n('всё')).toBe('все');
    });

    it('strips the U+0301 stress mark', function () {
      expect(n('ко' + ACUTE + 'т')).toBe('кот');
      expect(n('Э' + ACUTE + 'то ко' + ACUTE + 'т')).toBe('это кот');
      expect(n('метро' + ACUTE)).toBe('метро');
    });

    it('strips punctuation', function () {
      expect(n('Это кот.')).toBe('это кот');
      expect(n('Кот!')).toBe('кот');
      expect(n('Что это?')).toBe('что это');
      expect(n('это, кот')).toBe('это кот');
      expect(n('«кот»')).toBe('кот');
    });

    it('strips a dash used as a copula and still collapses the gap', function () {
      expect(n('Это — кот.')).toBe('это кот');
    });

    it('leaves Latin text intact apart from case, so latin-script can be detected', function () {
      expect(n('Kot')).toBe('kot');
      expect(n('  Eto  KOT! ')).toBe('eto kot');
    });

    it('is idempotent', function () {
      var samples = ['Это — ко' + ACUTE + 'т.', '  ЁЖ  ', 'Что э' + ACUTE + 'то?', 'kot'];
      for (var i = 0; i < samples.length; i++) {
        var once = n(samples[i]);
        expect(n(once)).toBe(once);
      }
    });

    it('handles empty and non-string input without throwing', function () {
      expect(n('')).toBe('');
      expect(n('    ')).toBe('');
      var out;
      out = n(null); expect(typeof out).toBe('string');
      out = n(undefined); expect(typeof out).toBe('string');
    });
  });

  /* ==========================================================================
     8. RU.grade.check
     ========================================================================== */

  describe('5. RU.grade.check', function () {
    if (!RU.grade || typeof RU.grade.check !== 'function') {
      it('RU.grade.check is available', function () { fail('RU.grade.check is not a function'); });
      return;
    }

    it('throws when called on an open, ungraded exercise', function () {
      // The plan's central assessment rule: nothing open may leak into mastery.
      var open = {
        type: 'exercise', id: 's0.test.open', kind: 'open', graded: false, modality: 'typed',
        prompt: { ru: 'Что ты делал в воскресенье?', stressed: 'Что ты де' + ACUTE + 'лал в воскресе' + ACUTE + 'нье?', en: 'What did you do on Sunday?', audio: null },
        reviews: [], dimension: 'spontaneous'
      };
      expect(function () { RU.grade.check('я гулял', open, TESTLEX); }).toThrow();
    });

    it('throws on any exercise with graded:false, not only kind:"open"', function () {
      var ungraded = catExercise({ id: 's0.test.ungraded', graded: false });
      expect(function () { RU.grade.check('кот', ungraded, TESTLEX); }).toThrow();
    });

    it('accepts an exact authored answer', function () {
      var r = RU.grade.check('кот', catExercise(), TESTLEX);
      expect(r.ok).toBe(true);
      expect(r.diagnosis).toBe(null);
      expect(typeof r.matched).toBe('string');
    });

    it('accepts an authored answer through normalisation (case, spaces, punctuation, stress)', function () {
      var cases = ['  ЭТО   КОТ!  ', 'Это кот.', 'это ко' + ACUTE + 'т', 'Это — кот'];
      for (var i = 0; i < cases.length; i++) {
        var r = RU.grade.check(cases[i], catExercise(), TESTLEX);
        if (!r.ok) fail(show(cases[i]) + ' should have been accepted; got ' + show(r));
      }
    });

    it('"кота" for "кот" is diagnosed wrong-form, naming the genitive/accusative and the wanted form', function () {
      // Note that "кота" is edit distance 1 from "кот": the paradigm check must
      // run BEFORE near-miss detection, or this returns the wrong diagnosis.
      var r = RU.grade.check('кота', catExercise(), TESTLEX);
      expect(r.ok).toBe(false);
      if (!r.diagnosis) fail('expected a diagnosis, got ' + show(r));
      expect(r.diagnosis.code).toBe('wrong-form');
      expect(r.diagnosis.lex === 'lex:кот' || r.diagnosis.lex === 'кот').toBe(true);
      var got = String(r.diagnosis.gotForm) + ' ' + String(r.diagnosis.message);
      if (!/gen|acc|род|вин/i.test(got)) {
        fail('the diagnosis must name the genitive/accusative; gotForm=' + show(r.diagnosis.gotForm) + ' message=' + show(r.diagnosis.message));
      }
      if (!/nom|именит/i.test(String(r.diagnosis.wantForm))) {
        fail('the diagnosis must name the wanted form (nom_sg); wantForm=' + show(r.diagnosis.wantForm));
      }
      expect(typeof r.diagnosis.message).toBe('string');
      expect(r.diagnosis.message.length).toBeGreaterThan(0);
    });

    it('another wrong slot of the same paradigm is also wrong-form', function () {
      var r = RU.grade.check('коте', catExercise(), TESTLEX);
      expect(r.ok).toBe(false);
      expect(r.diagnosis && r.diagnosis.code).toBe('wrong-form');
    });

    it('a Latin-script answer is diagnosed latin-script', function () {
      var r = RU.grade.check('kot', catExercise(), TESTLEX);
      expect(r.ok).toBe(false);
      expect(r.diagnosis && r.diagnosis.code).toBe('latin-script');
      var r2 = RU.grade.check('Eto kot', catExercise(), TESTLEX);
      expect(r2.ok).toBe(false);
      expect(r2.diagnosis && r2.diagnosis.code).toBe('latin-script');
    });

    it('a single-character typo is diagnosed near-miss', function () {
      var r = RU.grade.check('коот', catExercise(), TESTLEX); // one insertion from "кот"
      expect(r.ok).toBe(false);
      expect(r.diagnosis && r.diagnosis.code).toBe('near-miss');
    });

    it('a valid-but-different word is diagnosed wrong-word', function () {
      var r = RU.grade.check('нос', catExercise(), TESTLEX);
      expect(r.ok).toBe(false);
      expect(r.diagnosis && r.diagnosis.code).toBe('wrong-word');
    });

    it('an empty answer is diagnosed empty', function () {
      var r = RU.grade.check('', catExercise(), TESTLEX);
      expect(r.ok).toBe(false);
      expect(r.diagnosis && r.diagnosis.code).toBe('empty');
      var r2 = RU.grade.check('   ', catExercise(), TESTLEX);
      expect(r2.ok).toBe(false);
      expect(r2.diagnosis && r2.diagnosis.code).toBe('empty');
    });

    it('a failed check reports matched:null and every diagnosis code is a known one', function () {
      var codes = ['wrong-form', 'wrong-word', 'empty', 'latin-script', 'near-miss', 'unrecognised'];
      var answers = ['кота', 'нос', '', 'kot', 'коот', 'абракадабра'];
      for (var i = 0; i < answers.length; i++) {
        var r = RU.grade.check(answers[i], catExercise(), TESTLEX);
        if (r.ok) continue;
        expect(r.matched).toBe(null);
        if (!r.diagnosis) fail('answer ' + show(answers[i]) + ' failed with no diagnosis');
        if (codes.indexOf(r.diagnosis.code) < 0) fail('unknown diagnosis code ' + show(r.diagnosis.code) + ' for ' + show(answers[i]));
      }
    });

    it('grades a closed exercise against its authored key', function () {
      var closed = {
        type: 'exercise', id: 's0.test.closed', kind: 'closed', graded: true, modality: 'choice',
        prompt: { ru: 'Что это?', stressed: 'Что э' + ACUTE + 'то?', en: 'What is this?', audio: null },
        choices: [
          { id: 'a', ru: 'кот', en: 'cat', correct: true },
          { id: 'b', ru: 'нос', en: 'nose', correct: false }
        ],
        reviews: ['lex:кот'], dimension: 'recognition'
      };
      var good = RU.grade.check('a', closed, TESTLEX);
      expect(good.ok).toBe(true);
      var bad = RU.grade.check('b', closed, TESTLEX);
      expect(bad.ok).toBe(false);
    });
  });

  /* ==========================================================================
     9. RU.speech consent gate (real module, before it is stubbed out)
     ========================================================================== */

  describe('6. RU.speech consent gate', function () {
    if (!RU.speech || typeof RU.speech.available !== 'function') {
      it('RU.speech is available', function () { fail('RU.speech is not usable'); });
      return;
    }

    it('available() reports tts, asr and asrReason by feature detection', function () {
      var a = RU.speech.available();
      expect(typeof a).toBe('object');
      expect(typeof a.tts).toBe('boolean');
      expect(typeof a.asr).toBe('boolean');
      expect(typeof a.asrReason).toBe('string');
      // Feature detection, never user-agent sniffing.
      var detected = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      expect(a.asr).toBe(detected);
    });

    it('listen() throws unless consent is granted', function () {
      var before = RU.speech.consentState();
      RU.speech.setConsent('unset');
      expect(RU.speech.consentState()).toBe('unset');
      expect(function () { RU.speech.listen({ lang: 'ru-RU' }); }).toThrow();
      RU.speech.setConsent('declined');
      expect(function () { RU.speech.listen({ lang: 'ru-RU' }); }).toThrow();
      try { RU.speech.setConsent(before); } catch (e) { /* restore best-effort */ }
    });
  });

  /* ==========================================================================
     10. Speech stub — installed for the engine suite so no audio is needed
     ========================================================================== */

  var STUB_HANDLE = { stop: function () { }, pause: function () { } };
  function installSpeechStub() {
    window.RUTEST.realSpeech = RU.speech;
    RU.speech = {
      __stub: true,
      load: function () {
        var manifest = { version: 1, voice: 'ru-RU-SvetlanaNeural', clips: {} };
        if (typeof Promise === 'function') return Promise.resolve(manifest);
        return { then: function (f) { try { f(manifest); } catch (e) { } return this; }, 'catch': function () { return this; } };
      },
      // onEnd is deferred to a timer that cannot fire inside this synchronous
      // suite, so a listening engine never auto-advances mid-test.
      play: function (clipKey, opts) {
        if (opts && typeof opts.onEnd === 'function') {
          setTimeout(function () { try { opts.onEnd({ fallback: true, clipKey: clipKey }); } catch (e) { } }, 0);
        }
        return STUB_HANDLE;
      },
      replayWord: function () { return STUB_HANDLE; },
      available: function () { return { tts: false, asr: false, asrReason: 'test stub: no speech in the harness' }; },
      consentState: function () { return 'unset'; },
      setConsent: function () { },
      listen: function () { throw new Error('test stub: listen() requires granted consent'); }
    };
  }
  function restoreSpeech() {
    if (window.RUTEST.realSpeech) RU.speech = window.RUTEST.realSpeech;
  }
  installSpeechStub();

  /* ==========================================================================
     11. RU.engine
     ========================================================================== */

  // RU.SESSION0 is specified as holding `letters`, and separately "a session is
  // an ordered array of nodes" — the contract never says which property carries
  // that array, so we probe the plausible names.
  function sessionNodes() {
    var S = RU.SESSION0;
    if (!S) return null;
    if (Array.isArray(S)) return S;
    var names = ['nodes', 'session', 'script', 'beats', 'content', 'arc'], i, k;
    for (i = 0; i < names.length; i++) if (Array.isArray(S[names[i]])) return S[names[i]];
    for (k in S) {
      if (!has(S, k)) continue;
      if (Array.isArray(S[k]) && S[k].length && S[k][0] && S[k][0].type) return S[k];
    }
    return null;
  }

  // engine.start(session, state) — likewise the contract does not say whether
  // `session` is RU.SESSION0 itself or the bare node array. Probe once, cache.
  var ENGINE_SHAPE = null;
  function sessionWrap(nodes, shape) {
    switch (shape) {
      case 0: return { id: 's0.test', contentVersion: (RU.save && RU.save.fresh ? RU.save.fresh().contentVersion : 's0.1'), letters: [], nodes: nodes };
      case 1: return nodes;
      case 2: return { nodes: nodes };
      case 3: return { session: nodes };
      default: return { id: 's0.test', letters: [], script: nodes };
    }
  }
  // The probe always runs against a FRESH state, because a resumed state
  // legitimately puts the engine somewhere other than the first node.
  function probeSessionShape(nodes) {
    if (ENGINE_SHAPE !== null) return;
    if (!RU.engine || typeof RU.engine.start !== 'function') fail('RU.engine.start is not a function');
    var lastErr = null, i, eng, node;
    for (i = 0; i <= 4; i++) {
      try {
        eng = RU.engine.start(sessionWrap(nodes, i), RU.save.fresh());
        if (eng && typeof eng.current === 'function') {
          node = eng.current();
          if (node && node.id === nodes[0].id) { ENGINE_SHAPE = i; return; }
          lastErr = new Error('start() (session shape ' + i + ') returned current()=' + show(node && node.id) + ', expected ' + show(nodes[0].id));
        } else {
          lastErr = new Error('start() (session shape ' + i + ') did not return an object with current()');
        }
      } catch (e) { lastErr = e; }
    }
    fail('RU.engine.start did not accept any known session shape. Last error: ' + msgOf(lastErr));
  }

  function startEngine(nodes, state) {
    probeSessionShape(nodes);
    return RU.engine.start(sessionWrap(nodes, ENGINE_SHAPE), state);
  }

  // Guarantee a lexeme with a nom_sg form that really exists in RU.LEXICON, so
  // engine-side form checks resolve regardless of what the content author wrote.
  function ensureLexeme() {
    RU.LEXICON = RU.LEXICON || {};
    if (RU.LEXICON['lex:кот'] && RU.LEXICON['lex:кот'].forms && RU.LEXICON['lex:кот'].forms.nom_sg) return RU.LEXICON['lex:кот'];
    var k;
    for (k in RU.LEXICON) {
      if (!has(RU.LEXICON, k)) continue;
      var l = RU.LEXICON[k];
      if (l && l.forms && typeof l.forms.nom_sg === 'string' && l.forms.nom_sg.length) return l;
    }
    RU.LEXICON['lex:кот'] = clone(TESTLEX['lex:кот']);
    return RU.LEXICON['lex:кот'];
  }

  function buildSession(lex) {
    var nom = lex.forms.nom_sg;
    return [
      {
        type: 'line', id: 's0.t1', who: 'anya', ru: 'Это ' + nom + '.', stressed: 'Э' + ACUTE + 'то ' + nom + '.',
        en: 'This is a ' + (lex.gloss || 'thing') + '.', translit: 'Eto ...', audio: null,
        sprite: 'neutral', bg: 'flat', teaches: [lex.id], stop: false
      },
      {
        type: 'exercise', id: 's0.t2', kind: 'constrained', graded: true, modality: 'typed',
        prompt: { ru: 'Что это?', stressed: 'Что э' + ACUTE + 'то?', en: 'What is this?', audio: null },
        image: null,
        accept: [nom, 'это ' + nom],
        checks: [{ type: 'formOf', lex: lex.id, require: 'nom_sg' }],
        hint: 'Она показывает.', reviews: [lex.id], dimension: 'controlled'
      },
      {
        type: 'line', id: 's0.t3', who: 'anya', ru: 'Да.', stressed: 'Да.', en: 'Yes.', translit: 'Da.',
        audio: null, sprite: 'neutral', bg: 'flat', teaches: [], stop: true
      },
      { type: 'checkpoint', id: 's0.t4' }
    ];
  }

  var DIMENSIONS = ['recognition', 'meaning', 'controlled', 'spontaneous'];

  function masteryOf(state, lexId) {
    return (state && state.mastery && state.mastery[lexId]) ? state.mastery[lexId] : null;
  }

  function cardDimensions(entry) {
    var out = [], k;
    if (!entry) return out;
    for (k in entry) {
      if (!has(entry, k)) continue;
      if (DIMENSIONS.indexOf(k) >= 0 && entry[k] && typeof entry[k] === 'object') out.push(k);
    }
    return out;
  }

  function assertLadder(state, lexId) {
    var entry = masteryOf(state, lexId);
    if (!entry) return;
    var present = cardDimensions(entry), i;
    for (i = 1; i < DIMENSIONS.length; i++) {
      if (present.indexOf(DIMENSIONS[i]) >= 0 && present.indexOf(DIMENSIONS[i - 1]) < 0) {
        fail('mastery["' + lexId + '"] has a "' + DIMENSIONS[i] + '" card with no "' + DIMENSIONS[i - 1] + '" card below it: ' + present.join(', '));
      }
    }
  }

  describe('7. RU.engine', function () {
    if (!RU.engine || typeof RU.engine.start !== 'function') {
      it('RU.engine.start is available', function () { fail('RU.engine.start is not a function'); });
      return;
    }
    if (!RU.save || typeof RU.save.fresh !== 'function') {
      it('RU.save.fresh is available for engine tests', function () { fail('RU.save.fresh is not a function'); });
      return;
    }

    var LEX = ensureLexeme();
    var NOM = LEX.forms.nom_sg;

    it('start() places the engine on the first node', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      expect(eng.current().id).toBe('s0.t1');
    });

    it('advance() walks the node list in order', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      expect(eng.current().id).toBe('s0.t1');
      var next = eng.advance();
      var id = (next && next.id) || eng.current().id;
      expect(id).toBe('s0.t2');
    });

    it('a first exposure creates exactly ONE card, and it is the recognition card', function () {
      // audit §6.2: "One at introduction (recognition)... An item that is only
      // ever recognised carries one card, not four."
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      eng.advance(); // leave the teaching line
      var entry = masteryOf(state, LEX.id);
      if (!entry) fail('advancing past a line with teaches:["' + LEX.id + '"] created no mastery entry at all; mastery keys: ' + keys(state.mastery).join(', '));
      var present = cardDimensions(entry);
      if (present.length !== 1) fail('first exposure created ' + present.length + ' card(s) (' + present.join(', ') + '), expected exactly 1');
      expect(present[0]).toBe('recognition');
    });

    it('no higher-dimension card exists before a "good" at the level below', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      eng.advance();
      var entry = masteryOf(state, LEX.id) || {};
      expect(!!entry.meaning).toBe(false);
      expect(!!entry.controlled).toBe(false);
      expect(!!entry.spontaneous).toBe(false);
      assertLadder(state, LEX.id);
    });

    it('answering a controlled exercise never skips the ladder up to four cards', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      eng.advance();
      eng.answer(NOM, { assisted: false, latencyMs: 1500, interfered: false });
      assertLadder(state, LEX.id);
      var present = cardDimensions(masteryOf(state, LEX.id));
      if (present.length > 2) fail('one graded answer created ' + present.length + ' cards (' + present.join(', ') + '); cards are created one at a time');
    });

    it('answer() records an attempt with the exercise modality and grades it', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      var gradedEvents = [];
      if (typeof eng.on === 'function') eng.on('graded', function (e) { gradedEvents.push(e); });
      eng.advance();
      eng.answer(NOM, { assisted: false, latencyMs: 1500, interfered: false });
      expect(state.attempts.length).toBeGreaterThan(0);
      var a = state.attempts[state.attempts.length - 1];
      expect(a.modality).toBe('typed');
      expect(a.correct).toBe(true);
      expect(a.assisted).toBe(false);
      expect(a.nodeId).toBe('s0.t2');
      expect(typeof a.at).toBe('number');
      if (typeof eng.on === 'function' && !gradedEvents.length) fail('no "graded" event was emitted');
    });

    it('an assisted answer is recorded but leaves the card due (no rating)', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      eng.advance();
      eng.answer(NOM, { assisted: true, latencyMs: 900, interfered: false });
      var a = state.attempts[state.attempts.length - 1];
      expect(a.assisted).toBe(true);
      var entry = masteryOf(state, LEX.id);
      var dims = cardDimensions(entry), i, card;
      for (i = 0; i < dims.length; i++) {
        card = entry[dims[i]];
        if (!RU.srs.due(card, Date.now())) fail('the "' + dims[i] + '" card was scheduled forward by an assisted attempt');
      }
    });

    it('typed evidence never populates the spoken bucket', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      eng.advance();
      eng.answer(NOM, { assisted: false, latencyMs: 1500, interfered: false });
      var i;
      for (i = 0; i < state.attempts.length; i++) {
        if (state.attempts[i].modality === 'spoken') fail('a typed answer produced an attempt tagged modality:"spoken"');
      }
      var rep = eng.report();
      var spoken = leavesUnder(rep, /spoken|speak|speech|oral/i), j;
      for (j = 0; j < spoken.length; j++) {
        if (typeof spoken[j].value === 'number' && spoken[j].value > 0) {
          fail('report() shows a non-zero speaking figure (' + spoken[j].path + '=' + spoken[j].value + ') after typed-only evidence');
        }
      }
    });

    it('report() says "not enough evidence" below 3 attempts', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      eng.advance();
      eng.answer(NOM, { assisted: false, latencyMs: 1500, interfered: false });
      var rep = eng.report();
      expect(!!rep).toBe(true);
      expect(typeof rep).toBe('object');
      if (!/not enough evidence/i.test(stringify(rep))) {
        fail('report() after 1 attempt must say "not enough evidence" somewhere; got ' + show(rep));
      }
    });

    it('report() reports nothing about speaking when there are zero spoken attempts', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      eng.advance();
      eng.answer(NOM, { assisted: false, latencyMs: 1500, interfered: false });
      var rep = eng.report();
      var spoken = leavesUnder(rep, /spoken|speak|speech|oral/i);
      if (!spoken.length) fail('report() must address speaking explicitly (no key matching /spoken|speak|speech|oral/ found in ' + show(rep) + ')');
      var flagged = false, i, v, p;
      for (i = 0; i < spoken.length; i++) {
        v = spoken[i].value; p = spoken[i].path;
        if (typeof v === 'string' && /not enough evidence/i.test(v)) flagged = true;
        if (/enough/i.test(p) && v === false) flagged = true;
        if (/notenough|insufficient|unknown|untested/i.test(p) && v === true) flagged = true;
        if (typeof v === 'number' && v !== 0) fail('speaking figure ' + p + '=' + v + ' with zero spoken attempts');
      }
      if (!flagged) fail('the speaking section is not flagged as lacking evidence: ' + show(spoken));
    });

    it('report() does not claim evidence it does not have (counts match the attempt log)', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      eng.advance();
      eng.answer(NOM, { assisted: false, latencyMs: 1500, interfered: false });
      var rep = eng.report();
      var all = leaves(rep), i, path;
      for (i = 0; i < all.length; i++) {
        path = all[i].path;
        if (typeof all[i].value !== 'number') continue;
        if (!/attempt|count|evidence|n$/i.test(path)) continue;
        // min/max/threshold fields are policy constants, not claims of evidence.
        if (/min|max|threshold|required|needed|limit|cap|target|floor/i.test(path)) continue;
        if (all[i].value > state.attempts.length) {
          fail('report() claims ' + path + '=' + all[i].value + ' but only ' + state.attempts.length + ' attempts exist');
        }
      }
    });

    it('answer() writes the save', function () {
      resetStorage();
      var realWrite = RU.save.write;
      var calls = 0;
      RU.save.write = function (s) { calls++; return realWrite.call(RU.save, s); };
      try {
        var state = RU.save.fresh();
        var eng = startEngine(buildSession(LEX), state); // spy installed before start(), in case the engine captured the fn
        eng.advance();
        var before = calls;
        eng.answer(NOM, { assisted: false, latencyMs: 1500, interfered: false });
        if (calls <= before) fail('engine.answer() did not call RU.save.write()');
      } finally {
        RU.save.write = realWrite;
      }
    });

    it('advance() writes the save too (never deferred to unload)', function () {
      resetStorage();
      var realWrite = RU.save.write;
      var calls = 0;
      RU.save.write = function (s) { calls++; return realWrite.call(RU.save, s); };
      try {
        var state = RU.save.fresh();
        var eng = startEngine(buildSession(LEX), state);
        var before = calls;
        eng.advance();
        if (calls <= before) fail('engine.advance() did not call RU.save.write()');
      } finally {
        RU.save.write = realWrite;
      }
    });

    it('the position written by the engine resumes in place', function () {
      resetStorage();
      var state = RU.save.fresh();
      var eng = startEngine(buildSession(LEX), state);
      eng.advance();
      expect(state.position.nodeId).toBe('s0.t2');
      if (typeof RU.save.flush === 'function') RU.save.flush();
      var reloaded = RU.save.load().state;
      expect(reloaded.position.nodeId).toBe('s0.t2');
      var eng2 = startEngine(buildSession(LEX), reloaded);
      expect(eng2.current().id).toBe('s0.t2');
    });

    // ---- pickVariant -----------------------------------------------------

    function retrievalNode() {
      return {
        type: 'retrieval', id: 's0.rv', reviews: ['lex:due', 'lex:notdue'],
        variants: [
          { id: 's0.rv.v1', covers: ['lex:notdue'], nodes: [{ type: 'line', id: 's0.rv.v1.l1', who: 'anya', ru: 'А это?', stressed: 'А э' + ACUTE + 'то?', en: 'And this?', translit: 'A eto?', audio: 's0.rv.v1.l1', sprite: 'neutral', bg: 'flat', teaches: [], stop: false }] },
          { id: 's0.rv.v2', covers: ['lex:due'], nodes: [{ type: 'line', id: 's0.rv.v2.l1', who: 'anya', ru: 'А это?', stressed: 'А э' + ACUTE + 'то?', en: 'And this?', translit: 'A eto?', audio: 's0.rv.v2.l1', sprite: 'neutral', bg: 'flat', teaches: [], stop: false }] },
          { id: 's0.rv.v3', covers: ['lex:notdue'], nodes: [{ type: 'line', id: 's0.rv.v3.l1', who: 'anya', ru: 'А это?', stressed: 'А э' + ACUTE + 'то?', en: 'And this?', translit: 'A eto?', audio: 's0.rv.v3.l1', sprite: 'neutral', bg: 'flat', teaches: [], stop: false }] }
        ]
      };
    }

    function stateWithDueItem() {
      var state = RU.save.fresh();
      var dueCard = RU.srs.newCard();                              // due right now
      var notDue = RU.srs.rate(RU.srs.newCard(), 'good', Date.now()); // scheduled forward
      state.mastery['lex:due'] = { recognition: dueCard };
      state.mastery['lex:notdue'] = { recognition: notDue };
      return state;
    }

    function variantId(v) { return (v && typeof v === 'object') ? v.id : v; }

    it('pickVariant prefers the variant covering the due item', function () {
      resetStorage();
      var state = stateWithDueItem();
      // Precondition: the fixture really does have one due and one not-due card.
      expect(RU.srs.due(state.mastery['lex:due'].recognition, Date.now())).toBe(true);
      expect(RU.srs.due(state.mastery['lex:notdue'].recognition, Date.now())).toBe(false);

      var node = retrievalNode();
      var eng = startEngine(buildSession(LEX).concat([node]), state);
      if (typeof eng.pickVariant !== 'function') fail('engine.pickVariant is not a function');
      var picked = variantId(eng.pickVariant(node));
      expect(picked).toBe('s0.rv.v2'); // not the first variant in the array
    });

    it('pickVariant is deterministic and records its choice in position.variantPicks', function () {
      resetStorage();
      var state = stateWithDueItem();
      var node = retrievalNode();
      var eng = startEngine(buildSession(LEX).concat([node]), state);
      var first = variantId(eng.pickVariant(node));
      var second = variantId(eng.pickVariant(node));
      expect(second).toBe(first);
      expect(state.position.variantPicks[node.id]).toBe(first);
    });

    it('a tie between variants is broken deterministically across independent engines', function () {
      resetStorage();
      var node = retrievalNode();
      // Nothing due at all: every variant covers zero due items.
      var s1 = RU.save.fresh();
      var e1 = startEngine(buildSession(LEX).concat([node]), s1);
      var p1 = variantId(e1.pickVariant(node));
      resetStorage();
      var s2 = RU.save.fresh();
      var e2 = startEngine(buildSession(LEX).concat([node]), s2);
      var p2 = variantId(e2.pickVariant(node));
      expect(p1).toBe(p2);
      var ids = ['s0.rv.v1', 's0.rv.v2', 's0.rv.v3'];
      if (ids.indexOf(p1) < 0) fail('pickVariant returned an unknown variant: ' + show(p1));
    });

    it('a variant already chosen in position.variantPicks is reused on reload', function () {
      resetStorage();
      var node = retrievalNode();
      var state = stateWithDueItem();           // v2 would win on coverage
      state.position.variantPicks[node.id] = 's0.rv.v3';  // but the save says v3
      var eng = startEngine(buildSession(LEX).concat([node]), state);
      var picked = variantId(eng.pickVariant(node));
      expect(picked).toBe('s0.rv.v3');
      expect(state.position.variantPicks[node.id]).toBe('s0.rv.v3');
    });

    it('the real Session Zero starts and reaches its first node', function () {
      resetStorage();
      var nodes = sessionNodes();
      if (!nodes) fail('RU.SESSION0 has no usable node array');
      var state = RU.save.fresh();
      var eng = RU.engine.start(ENGINE_SHAPE === 1 ? nodes : RU.SESSION0, state);
      expect(!!eng).toBe(true);
      expect(typeof eng.current).toBe('function');
      var n = eng.current();
      expect(!!n).toBe(true);
      expect(n.id).toBe(nodes[0].id);
    });
  });

  /* ==========================================================================
     12. Content integrity (CONTRACT §3 beats, §4 lint rules)
     ========================================================================== */

  function collectNodes(nodes, out) {
    out = out || [];
    if (!nodes) return out;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n || typeof n !== 'object') continue;
      out.push(n);
      if (n.type === 'retrieval' && Array.isArray(n.variants)) {
        for (var j = 0; j < n.variants.length; j++) {
          var v = n.variants[j];
          if (!v) continue;
          out.push({ id: v.id, type: 'variant', __variant: true, covers: v.covers });
          if (Array.isArray(v.nodes)) collectNodes(v.nodes, out);
        }
      }
    }
    return out;
  }

  function collectExercises(all) {
    var out = [], i, n;
    for (i = 0; i < all.length; i++) {
      n = all[i];
      if (n && n.type === 'exercise') out.push(n);
      // A weblab node carries an exercise-shaped question that must obey the
      // same rules even though it is not itself a node in the list.
      if (n && n.type === 'weblab' && n.task && n.task.question) out.push(n.task.question);
    }
    return out;
  }

  function collectAudioKeys(all) {
    var out = [], i, n;
    for (i = 0; i < all.length; i++) {
      n = all[i];
      if (!n) continue;
      if (typeof n.audio === 'string' && n.audio.length) out.push({ key: n.audio, where: (n.id || '(no id)') + '.audio' });
      if (n.prompt && typeof n.prompt.audio === 'string' && n.prompt.audio.length) out.push({ key: n.prompt.audio, where: (n.id || '(no id)') + '.prompt.audio' });
      if (Array.isArray(n.choices)) {
        for (var j = 0; j < n.choices.length; j++) {
          var c = n.choices[j];
          if (c && typeof c.audio === 'string' && c.audio.length) out.push({ key: c.audio, where: (n.id || '(no id)') + '.choices[' + j + '].audio' });
        }
      }
    }
    return out;
  }

  describe('8. Session Zero content integrity', function () {
    var nodes = sessionNodes();
    if (!nodes) {
      it('RU.SESSION0 exposes an ordered node array', function () { fail('no node array found on RU.SESSION0'); });
      return;
    }
    var all = collectNodes(nodes);
    var exercises = collectExercises(all);

    it('every node has a type and an id', function () {
      var bad = [], i;
      for (i = 0; i < all.length; i++) {
        if (!all[i].id || typeof all[i].id !== 'string') bad.push('#' + i + ' ' + show(all[i].type) + ' has no id');
        else if (!all[i].__variant && !all[i].type) bad.push(all[i].id + ' has no type');
      }
      if (bad.length) fail(bad.join('; '));
    });

    it('every node id is unique', function () {
      var seen = {}, dupes = [], i, id;
      for (i = 0; i < all.length; i++) {
        id = all[i].id;
        if (!id) continue;
        if (seen[id]) dupes.push(id);
        seen[id] = true;
      }
      if (dupes.length) fail('duplicate node id(s): ' + dupes.join(', '));
    });

    it('every node id is s0-prefixed', function () {
      var bad = [], i;
      for (i = 0; i < all.length; i++) {
        if (all[i].id && !/^s0\./.test(all[i].id)) bad.push(all[i].id);
      }
      if (bad.length) fail('node id(s) not matching /^s0\\./: ' + bad.join(', '));
    });

    it('every audio key referenced in session0 is unique', function () {
      var refs = collectAudioKeys(all);
      var seen = {}, dupes = [], i;
      for (i = 0; i < refs.length; i++) {
        if (seen[refs[i].key]) dupes.push(refs[i].key + ' (' + seen[refs[i].key] + ' and ' + refs[i].where + ')');
        seen[refs[i].key] = refs[i].where;
      }
      if (dupes.length) fail('audio key(s) referenced more than once: ' + dupes.join('; '));
      expect(refs.length).toBeGreaterThan(0);
    });

    it('every checks[].lex exists in RU.LEXICON with the required form present', function () {
      var problems = [], i, j, ex, chk, lex, want, form;
      for (i = 0; i < exercises.length; i++) {
        ex = exercises[i];
        if (!Array.isArray(ex.checks)) continue;
        for (j = 0; j < ex.checks.length; j++) {
          chk = ex.checks[j];
          if (!chk || !chk.lex) { problems.push((ex.id || '?') + ': checks[' + j + '] has no lex'); continue; }
          lex = RU.LEXICON ? RU.LEXICON[chk.lex] : null;
          if (!lex) { problems.push((ex.id || '?') + ': ' + chk.lex + ' is not in RU.LEXICON'); continue; }
          /* A `notLex` check names the confusable the answer must NOT be
             (CONTRACT 3 beat 4). It has no paradigm slot to resolve — the
             whole point is that any form of that lexeme is the wrong animal —
             so it is done once the lexeme itself has been found. */
          if (chk.type === 'notLex') continue;
          want = chk.require || chk.requires || chk.form;
          if (!want) { problems.push((ex.id || '?') + ': checks[' + j + '] declares no required form'); continue; }
          form = lex.forms ? lex.forms[want] : null;
          if (typeof form !== 'string' || !form.length) problems.push((ex.id || '?') + ': ' + chk.lex + '.forms.' + want + ' is missing');
        }
      }
      if (problems.length) fail(problems.join('; '));
    });

    it('every constrained exercise has accept.length >= 2', function () {
      var problems = [], i, ex;
      for (i = 0; i < exercises.length; i++) {
        ex = exercises[i];
        if (ex.kind !== 'constrained') continue;
        if (!Array.isArray(ex.accept)) { problems.push((ex.id || '?') + ' has no accept array'); continue; }
        if (ex.accept.length < 2) problems.push((ex.id || '?') + ' has accept.length=' + ex.accept.length);
      }
      if (problems.length) fail(problems.join('; '));
    });

    it('every accept member normalises to something distinct', function () {
      if (!RU.grade || typeof RU.grade.normalise !== 'function') fail('RU.grade.normalise is unavailable');
      var problems = [], i, j, ex, seen, norm;
      for (i = 0; i < exercises.length; i++) {
        ex = exercises[i];
        if (!Array.isArray(ex.accept)) continue;
        seen = {};
        for (j = 0; j < ex.accept.length; j++) {
          norm = RU.grade.normalise(ex.accept[j]);
          if (!norm.length) { problems.push((ex.id || '?') + ': accept[' + j + '] normalises to nothing'); continue; }
          if (seen[norm]) problems.push((ex.id || '?') + ': accept[' + j + '] duplicates ' + show(norm));
          seen[norm] = true;
        }
      }
      if (problems.length) fail(problems.join('; '));
    });

    it('every open exercise has graded:false', function () {
      var problems = [], i, ex;
      for (i = 0; i < exercises.length; i++) {
        ex = exercises[i];
        if (ex.kind === 'open' && ex.graded !== false) problems.push((ex.id || '?') + ' is kind:"open" with graded=' + show(ex.graded));
      }
      if (problems.length) fail(problems.join('; '));
    });

    it('every graded exercise declares modality, dimension and reviews', function () {
      var problems = [], i, ex;
      for (i = 0; i < exercises.length; i++) {
        ex = exercises[i];
        if (ex.graded !== true) continue;
        if (!ex.modality) problems.push((ex.id || '?') + ' has no modality');
        if (!ex.dimension) problems.push((ex.id || '?') + ' has no dimension');
        if (!Array.isArray(ex.reviews) || !ex.reviews.length) problems.push((ex.id || '?') + ' has no reviews');
      }
      if (problems.length) fail(problems.join('; '));
    });

    it('there is a retrieval node and it has at least 3 variants', function () {
      var retrievals = [], i;
      for (i = 0; i < nodes.length; i++) if (nodes[i] && nodes[i].type === 'retrieval') retrievals.push(nodes[i]);
      if (!retrievals.length) fail('Session Zero has no node of type "retrieval" (CONTRACT §3 beat 7)');
      var thin = [], fat = 0;
      for (i = 0; i < retrievals.length; i++) {
        var count = Array.isArray(retrievals[i].variants) ? retrievals[i].variants.length : 0;
        if (count < 2) thin.push(retrievals[i].id + ' has ' + count + ' variant(s)');
        if (count >= 3) fat++;
      }
      if (thin.length) fail('lint rule 8 (>= 2 variants): ' + thin.join('; '));
      if (!fat) fail('CONTRACT §3 beat 7 requires a retrieval node with >= 3 variants; the largest has ' + (Array.isArray(retrievals[0].variants) ? retrievals[0].variants.length : 0));
    });

    it('every retrieval variant has an id, at least one covers entry and its own nodes', function () {
      var problems = [], i, j, node, v;
      for (i = 0; i < nodes.length; i++) {
        node = nodes[i];
        if (!node || node.type !== 'retrieval' || !Array.isArray(node.variants)) continue;
        for (j = 0; j < node.variants.length; j++) {
          v = node.variants[j];
          if (!v) { problems.push(node.id + '.variants[' + j + '] is empty'); continue; }
          if (!v.id) problems.push(node.id + '.variants[' + j + '] has no id');
          if (!Array.isArray(v.covers) || !v.covers.length) problems.push((v.id || node.id + '[' + j + ']') + ' has no covers entries');
          if (!Array.isArray(v.nodes) || !v.nodes.length) problems.push((v.id || node.id + '[' + j + ']') + ' has no nodes');
        }
      }
      if (problems.length) fail(problems.join('; '));
    });

    it('every reviews/teaches/covers item id exists in RU.LEXICON', function () {
      var problems = [], i, j, n, lists = ['reviews', 'teaches', 'covers'], k, list, id;
      for (i = 0; i < all.length; i++) {
        n = all[i];
        for (k = 0; k < lists.length; k++) {
          list = n[lists[k]];
          if (!Array.isArray(list)) continue;
          for (j = 0; j < list.length; j++) {
            id = list[j];
            if (typeof id !== 'string') { problems.push((n.id || '?') + '.' + lists[k] + '[' + j + '] is not a string'); continue; }
            // Only lex: ids are lexicon lookups; ltr:/gram:/chunk: ids live elsewhere.
            if (!/^lex:/.test(id)) continue;
            if (!RU.LEXICON || !RU.LEXICON[id]) problems.push((n.id || '?') + '.' + lists[k] + ': ' + id + ' is not in RU.LEXICON');
          }
        }
      }
      if (problems.length) fail(problems.join('; '));
    });

    it('the three taught letters Р, С and Н are present in SESSION0.letters', function () {
      var letters = RU.SESSION0 && RU.SESSION0.letters;
      if (!Array.isArray(letters)) fail('RU.SESSION0.letters is not an array');
      var uppers = {}, i;
      for (i = 0; i < letters.length; i++) if (letters[i]) uppers[letters[i].upper] = true;
      var need = ['Р', 'С', 'Н'], missing = [];
      for (i = 0; i < need.length; i++) if (!uppers[need[i]]) missing.push(need[i]);
      if (missing.length) fail('SESSION0.letters is missing the taught contrast letter(s): ' + missing.join(', '));
    });

    it('the required beats are all present', function () {
      var types = {}, i;
      for (i = 0; i < all.length; i++) if (all[i] && all[i].type) types[all[i].type] = (types[all[i].type] || 0) + 1;
      var need = ['line', 'letters', 'exercise', 'retrieval', 'weblab', 'consent', 'checkpoint'], missing = [];
      for (i = 0; i < need.length; i++) if (!types[need[i]]) missing.push(need[i]);
      if (missing.length) fail('Session Zero is missing node type(s): ' + missing.join(', ') + ' — present: ' + stringify(types));
    });

    it('no learner-facing English string is empty', function () {
      var problems = [], i, n, j;
      for (i = 0; i < all.length; i++) {
        n = all[i];
        if (!n) continue;
        if (has(n, 'en') && (typeof n.en !== 'string' || !n.en.trim().length)) problems.push((n.id || '?') + '.en is empty');
        if (n.prompt && has(n.prompt, 'en') && (typeof n.prompt.en !== 'string' || !n.prompt.en.trim().length)) problems.push((n.id || '?') + '.prompt.en is empty');
        if (Array.isArray(n.choices)) {
          for (j = 0; j < n.choices.length; j++) {
            if (n.choices[j] && has(n.choices[j], 'en') && !String(n.choices[j].en).trim().length) problems.push((n.id || '?') + '.choices[' + j + '].en is empty');
          }
        }
      }
      if (problems.length) fail(problems.join('; '));
    });

    it('every polysyllabic stressed string carries exactly one U+0301', function () {
      var problems = [], i, n;
      var VOWELS = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';
      function vowelCount(s) {
        var c = 0, j;
        for (j = 0; j < s.length; j++) if (VOWELS.indexOf(s.charAt(j)) >= 0) c++;
        return c;
      }
      function checkStressed(id, s) {
        if (typeof s !== 'string' || !s.length) return;
        // Check word by word: a sentence has one mark per polysyllabic word.
        var words = s.split(/\s+/), w, k, marks;
        for (k = 0; k < words.length; k++) {
          w = words[k];
          if (!/[\u0400-\u04FF]/.test(w)) continue;
          marks = (w.match(/\u0301/g) || []).length;
          if (vowelCount(w) > 1 && marks !== 1) problems.push(id + ': ' + show(w) + ' has ' + marks + ' stress mark(s), expected 1');
          if (vowelCount(w) <= 1 && marks > 1) problems.push(id + ': ' + show(w) + ' has ' + marks + ' stress marks on one syllable');
        }
      }
      for (i = 0; i < all.length; i++) {
        n = all[i];
        if (!n) continue;
        checkStressed((n.id || '?'), n.stressed);
        if (n.prompt) checkStressed((n.id || '?') + '.prompt', n.prompt.stressed);
      }
      if (problems.length) fail(problems.join('; '));
    });

    it('every lexeme in RU.LEXICON has the fields grade.js relies on', function () {
      var problems = [], k, l;
      for (k in RU.LEXICON) {
        if (!has(RU.LEXICON, k)) continue;
        l = RU.LEXICON[k];
        if (!l) { problems.push(k + ' is empty'); continue; }
        if (l.id !== k) problems.push(k + ': id is ' + show(l.id));
        if (typeof l.lemma !== 'string' || !l.lemma.length) problems.push(k + ': no lemma');
        if (typeof l.gloss !== 'string' || !l.gloss.length) problems.push(k + ': no gloss');
        // forms may be partial (CONTRACT 1.1) and a particle may have none at
        // all, but when a lexeme has one it must be a usable table, and a noun
        // without a nominative singular cannot be checked by grade.js.
        if (has(l, 'forms') && (!l.forms || typeof l.forms !== 'object')) problems.push(k + ': forms is not a table');
        if (l.pos === 'noun' && !(l.forms && typeof l.forms.nom_sg === 'string' && l.forms.nom_sg.length)) problems.push(k + ': noun with no forms.nom_sg');
        if (l.lemma && /\u0301/.test(l.lemma)) problems.push(k + ': lemma carries a stress mark');
      }
      if (problems.length) fail(problems.join('; '));
    });
  });

  describe('Beginner progression', function () {
    it('opens with English and waits for the learner to request audio', function () {
      var first = RU.SESSION0.nodes[0], settings = RU.save.fresh().settings;
      if (!first.en || first.ru || first.audio) fail('Opening requires Russian before context');
      if (settings.autoplay !== false || settings.guided !== true) fail('Fresh settings must support a quiet English-first start');
    });
    it('teaches every required contrast letter before a reading choice', function () {
      var known = 'АКМОТЕ', nodes = RU.SESSION0.nodes;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.type === 'letters') { known += n.letters.map(function (id) { return id.slice(4); }).join(''); }
        if (n.type === 'exercise' && n.choices) {
          n.choices.forEach(function (c) {
            var letters = (c.ru || '').toUpperCase().match(/[А-ЯЁ]/g) || [];
            letters.forEach(function (letter) { if (known.indexOf(letter) < 0) fail(n.id + ' uses untaught ' + letter); });
          });
        }
      }
    });
    it('introduces each first reading target before asking for its meaning', function () {
      var taught = {}, targets = { 's0.ex2':'lex:ракета', 's0.ex3':'lex:нос', 's0.ex4':'lex:мост', 's0.ex5':'lex:метро', 's0.ex6':'lex:кот' };
      RU.SESSION0.nodes.forEach(function (n) {
        if (targets[n.id] && !taught[targets[n.id]]) fail(n.id + ' tests a word before teaching it');
        (n.teaches || []).forEach(function (id) { taught[id] = true; });
      });
    });
  });

  restoreSpeech();

  /* ==========================================================================
     13. Report — DOM + console + document.title
     ========================================================================== */

  var total = passed + failed;
  var SUMMARY = 'TESTS: ' + passed + '/' + total + ' ' + (failed === 0 ? 'PASSED' : 'FAILED');

  window.RUTEST.results = { passed: passed, failed: failed, total: total, summary: SUMMARY, suites: suites };

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }

  function render() {
    var root = document.getElementById('tests-root');
    if (!root) { root = el('div'); root.id = 'tests-root'; document.body.appendChild(root); }
    root.textContent = '';

    var head = el('h1', failed === 0 ? 'ok' : 'bad', SUMMARY);
    head.id = 'tests-summary';
    root.appendChild(head);

    var meta = el('p', 'meta', suites.length + ' suites · ' + total + ' assertions run · ' + failed + ' failing');
    root.appendChild(meta);

    if (failed) {
      var fh = el('h2', 'bad', 'Failures');
      root.appendChild(fh);
      var fl = el('ul', 'failures');
      for (var s = 0; s < suites.length; s++) {
        for (var t = 0; t < suites[s].tests.length; t++) {
          var rec = suites[s].tests[t];
          if (rec.ok) continue;
          var li = el('li');
          li.appendChild(el('span', 'suite', suites[s].name + ' › '));
          li.appendChild(el('span', 'name', rec.name));
          li.appendChild(el('div', 'err', rec.err));
          fl.appendChild(li);
        }
      }
      root.appendChild(fl);
    }

    for (var i = 0; i < suites.length; i++) {
      var suite = suites[i];
      var nFail = 0, j;
      for (j = 0; j < suite.tests.length; j++) if (!suite.tests[j].ok) nFail++;
      var sec = el('section', nFail ? 'suite-bad' : 'suite-ok');
      sec.appendChild(el('h3', null, suite.name + '  (' + (suite.tests.length - nFail) + '/' + suite.tests.length + ')'));
      var ul = el('ul');
      for (j = 0; j < suite.tests.length; j++) {
        var r = suite.tests[j];
        var item = el('li', r.ok ? 'ok' : 'bad', (r.ok ? '✓ ' : '✗ ') + r.name);
        if (!r.ok) item.appendChild(el('div', 'err', r.err));
        ul.appendChild(item);
      }
      sec.appendChild(ul);
      root.appendChild(sec);
    }

    // Plain-text mirror, so --dump-dom output is readable without CSS.
    var pre = el('pre', 'plain');
    pre.id = 'tests-plain';
    var lines = [SUMMARY, ''];
    for (i = 0; i < suites.length; i++) {
      lines.push('## ' + suites[i].name);
      for (j = 0; j < suites[i].tests.length; j++) {
        var rr = suites[i].tests[j];
        lines.push((rr.ok ? '  PASS ' : '  FAIL ') + rr.name + (rr.ok ? '' : '\n       ' + rr.err));
      }
    }
    pre.textContent = lines.join('\n');
    root.appendChild(pre);
  }

  try { render(); } catch (e) {
    if (window.console) console.error('test reporter failed: ' + msgOf(e));
  }

  document.title = SUMMARY;
  if (window.console && console.log) console.log(SUMMARY);
}());
