/* =========================================================================
   RU.ui — the visual novel surface for Session Zero.

   Owns NO game state. It subscribes to engine events, calls engine methods,
   and renders. The only things it keeps between frames are view facts the
   contract requires it to supply back to the engine: whether the learner
   asked for a hint (assisted), whether they replayed audio or left the tab
   (interfered), and when the model audio finished (the start of latencyMs,
   per CONTRACT §2 srs / audit §6.4).

   Load order: after engine.js, before main.js.
   ========================================================================= */
window.RU = window.RU || {};

(function () {
  'use strict';

  var ui = {};
  RU.ui = ui;

  /* ------------------------------------------------------------------ *
   * tiny DOM helpers
   * ------------------------------------------------------------------ */
  function byId(id) { return document.getElementById(id); }

  function clear(node) { while (node && node.firstChild) { node.removeChild(node.firstChild); } }

  function h(tag, attrs, kids) {
    var n = document.createElement(tag), k, v, i, list;
    if (attrs) {
      for (k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) { continue; }
        v = attrs[k];
        if (v === null || typeof v === 'undefined') { continue; }
        if (k === 'class') { n.className = v; }
        else if (k === 'text') { n.textContent = v; }          /* never innerHTML: content is data */
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') { n.addEventListener(k.slice(2), v, false); }
        else { n.setAttribute(k, v); }
      }
    }
    if (kids) {
      list = Object.prototype.toString.call(kids) === '[object Array]' ? kids : [kids];
      for (i = 0; i < list.length; i++) {
        if (list[i] === null || typeof list[i] === 'undefined' || list[i] === false) { continue; }
        n.appendChild(typeof list[i] === 'string' ? document.createTextNode(list[i]) : list[i]);
      }
    }
    return n;
  }

  function str(v) { return (typeof v === 'string') ? v : (v === 0 ? '0' : (v ? String(v) : '')); }
  function stripStress(s) { return str(s).replace(/\u0301/g, ''); }
  function isFn(o, name) { return !!(o && typeof o[name] === 'function'); }

  /* ------------------------------------------------------------------ *
   * Fallback transliteration.
   * Authored `translit` always wins; this only fills in where a node did
   * not carry one (the contract puts `translit` on lines but not on
   * exercise prompts, and Session Zero shows translit by default).
   * ------------------------------------------------------------------ */
  var TR_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh',
    'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '’', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  function translitOf(s) {
    var src = stripStress(s), out = '', i, ch, low, mapped;
    for (i = 0; i < src.length; i++) {
      ch = src.charAt(i);
      low = ch.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(TR_MAP, low)) {
        mapped = TR_MAP[low];
        if (ch !== low && mapped) { mapped = mapped.charAt(0).toUpperCase() + mapped.slice(1); }
        out += mapped;
      } else {
        out += ch;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * module context (references, not ownership) and per-node view facts
   * ------------------------------------------------------------------ */
  var E = {};                 /* element cache */
  var ctx = {
    engine: null, state: null, save: null, speech: null,
    session: null, lexicon: {}, letters: {}, ready: null, resumed: null
  };
  var V = {};                 /* per-node view facts, reset on every render */
  var mounted = false;
  var started = false;
  var placeholderSprite = '';
  var seenErrors = {};

  function resetView() {
    V = {
      node: null, ex: null, answerHost: null,
      /* clipText is the Russian this clip says. RU.speech.play() needs it as
         `text` so the speechSynthesis fallback has something to speak when the
         clip — or the whole manifest — is not there yet: without it the
         fallback ends with reason "no-text" and the learner gets silence.
         (CONTRACT §2 speech: "when a clip is missing, play falls back to
         speechSynthesis".) */
      tokens: [], clip: null, clipText: '', handle: null,
      assisted: false, interfered: false, answered: false, revealed: false,
      retries: 0, pendingGrade: false, lastRaw: '',
      shownAt: Date.now(), audioEndedAt: 0,
      autoTimer: null, tapTimer: null, listen: null,
      renderSeq: (V && V.renderSeq) ? V.renderSeq : 0,
      retrievalHops: (V && V.retrievalHops) ? V.retrievalHops : 0,
      lastBg: (V && V.lastBg) ? V.lastBg : 'canal',
      lastSprite: (V && V.lastSprite) ? V.lastSprite : 'neutral'
    };
  }
  resetView();

  /* ------------------------------------------------------------------ *
   * Error banner. Wired to RU.save.onError by main.js. Storage failure has
   * to be visible, so error rows are persistent: no close control. Only
   * soft warnings (slot fallback, migration notes) can be dismissed.
   * Works before mount() — the banner element is in the static markup.
   * ------------------------------------------------------------------ */
  function banner(kind, message, opts) {
    var bar = byId('errbar'), key, row, btns, count, prev;
    if (!bar) { return; }
    opts = opts || {};
    /* One row per KIND for real errors: a browser that refuses storage refuses
       it on every write, and five near-identical banners would bury the game.
       Repeats bump a counter on the row that is already there. Soft warnings
       are deduplicated by their text, because they usually differ. */
    key = opts.soft ? ('w:' + kind + ' ' + message) : ('e:' + kind);
    prev = seenErrors[key];
    if (prev) {
      prev.n++;
      if (prev.count) { prev.count.textContent = '×' + prev.n; prev.count.hidden = false; }
      return;
    }

    count = h('span', { class: 'err-n', hidden: 'hidden', text: '' });
    row = h('div', { class: 'err-row' + (opts.soft ? ' warn' : '') }, [
      h('span', { class: 'err-k', text: str(kind) || 'error' }),
      h('span', { class: 'grow', text: str(message) }),
      count
    ]);
    seenErrors[key] = { row: row, n: 1, count: count };
    btns = [];
    if (!opts.soft) {
      /* audit §5: a failed write must still let the learner take their save away */
      btns.push(h('button', {
        class: 'err-btn', type: 'button', text: 'download my save',
        onclick: function () { exportSave(); }
      }));
    } else {
      btns.push(h('button', {
        class: 'err-btn', type: 'button', text: 'dismiss',
        onclick: function () {
          if (row.parentNode) { row.parentNode.removeChild(row); }
          if (!bar.querySelector('.err-row')) { bar.hidden = true; }
          bar.classList.toggle('warnonly', !bar.querySelector('.err-row:not(.warn)'));
        }
      }));
    }
    for (var i = 0; i < btns.length; i++) { row.appendChild(btns[i]); }
    bar.appendChild(row);
    bar.hidden = false;
    bar.classList.toggle('warnonly', !bar.querySelector('.err-row:not(.warn)'));
  }

  ui.showError = function (e) {
    var kind = (e && e.kind) ? e.kind : 'storage';
    var msg = (e && e.message) ? e.message : str(e);
    if (!msg) { msg = 'Progress could not be written to this browser. Keep playing — but export your save.'; }
    banner(kind, msg, { soft: false });
  };
  ui.warn = function (message) { banner('note', str(message), { soft: true }); };

  function fatalPanel(title, detail) {
    showPanel([
      h('p', { class: 'plabel', text: 'something broke' }),
      h('h2', { class: 'ptitle', text: title }),
      detail ? h('p', { class: 'pbody pdim', text: detail }) : null,
      h('div', { class: 'pbtns' }, [
        h('button', { class: 'pbtn warm', type: 'button', text: 'Download my save', onclick: exportSave }),
        h('button', { class: 'pbtn', type: 'button', text: 'Reload', onclick: function () { location.reload(); } })
      ])
    ]);
    setNext(false, 'Continue');
  }
  ui.fatal = fatalPanel;

  /* ------------------------------------------------------------------ *
   * settings
   *
   * CONTRACT §1.5 defines settings {translit, stressMarks, autoplay,
   * slowDefault, reducedMotion}. Two more are needed by the brief and are
   * written the same way; a save.js that drops unknown keys simply falls
   * back to these defaults, which is harmless.
   *   english     — the English line is independently toggleable
   *   autoAdvance — hands-free play
   * There is no engine API for settings in the contract, so the UI mutates
   * state.settings and asks RU.save to persist it (engine.setSetting is
   * preferred when a build offers one).
   * ------------------------------------------------------------------ */
  var DEFAULTS = {
    translit: true,       /* Arc 0 shows transliteration by default (audit §12.6) */
    stressMarks: true,
    english: true,
    autoplay: false,
    guided: true,
    autoAdvance: false,
    slowDefault: false,
    reducedMotion: false
  };

  function setting(k) {
    var s = ctx.state && ctx.state.settings;
    if (s && typeof s[k] !== 'undefined' && s[k] !== null) { return !!s[k]; }
    return !!DEFAULTS[k];
  }

  function setSetting(k, val) {
    var s;
    if (!ctx.state) { return; }
    if (!ctx.state.settings) { ctx.state.settings = {}; }
    s = ctx.state.settings;
    s[k] = !!val;
    if (isFn(ctx.engine, 'setSetting')) {
      try { ctx.engine.setSetting(k, !!val); } catch (e) { /* fall through to a plain save */ }
    }
    if (isFn(ctx.save, 'write')) {
      try { ctx.save.write(ctx.state); } catch (e2) { /* save.js reports through onError */ }
    }
    applySettings();
  }

  /* The Russian is always on screen: it is the input the game exists to give.
     Only the helpers under it (pronunciation, English) are optional. The
     English stays regardless on non-line nodes, where it is the instruction. */
  function syncLineVisibility() {
    var hasRussian = !!(V.tokens && V.tokens.length);
    if (E.lineRu) { E.lineRu.hidden = !hasRussian; }
    if (E.lineTr) { E.lineTr.hidden = !hasRussian || !setting('translit'); E.lineTr.style.display = ''; }
    if (E.lineEn) { E.lineEn.style.display = (!hasRussian || (V.node && V.node.type !== 'line') || setting('english')) ? '' : 'none'; }
  }

  function applySettings() {
    document.documentElement.classList.toggle('noanim', setting('reducedMotion'));
    press(E.btnTranslit, setting('translit'));
    press(E.btnStress, setting('stressMarks'));
    press(E.btnEn, setting('english'));
    press(E.btnAuto, setting('autoAdvance'));
    syncLineVisibility();
    /* a stress-mark change re-letters the line in place, without re-running
       the reveal animation (which would replay the whole line) */
    if (V.tokens && V.tokens.length && E.lineRu) { renderTokens(E.lineRu, V.tokens, false); }
  }

  function press(btn, on) { if (btn) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); } }

  /* ------------------------------------------------------------------ *
   * mount
   * ------------------------------------------------------------------ */
  ui.mount = function (opts) {
    opts = opts || {};
    ctx.engine = opts.engine || null;
    ctx.state = opts.state || null;
    ctx.save = opts.save || RU.save || null;
    ctx.speech = opts.speech || RU.speech || null;
    ctx.session = opts.session || RU.SESSION0 || null;
    ctx.lexicon = opts.lexicon || RU.LEXICON || {};
    ctx.ready = opts.ready || null;
    /* main.js reads this before engine.start() writes the opening position;
       see wireTitle(). */
    ctx.resumed = (typeof opts.resumed === 'boolean') ? opts.resumed : null;

    cacheEls();
    indexLetters();
    if (E.sprite) { placeholderSprite = E.sprite.getAttribute('src') || ''; }

    wireChrome();
    wireKeyboard();
    wireInterference();
    wireEngine();
    applySettings();

    if (opts.warnings && opts.warnings.length) {
      for (var i = 0; i < opts.warnings.length; i++) {
        banner('save', str(opts.warnings[i]), { soft: true });
      }
    }
    wireTitle();
    mounted = true;
    return ui;
  };

  function cacheEls() {
    E.stage = byId('stage');
    E.bg = byId('bg');
    E.cast = byId('cast');
    E.sprite = byId('sprite');
    E.panel = byId('panel');
    E.tbox = byId('tbox');
    E.name = byId('nameplate');
    E.speaker = byId('speaker');
    E.lineRu = byId('line-ru');
    E.lineTr = byId('line-tr');
    E.lineEn = byId('line-en');
    E.lineNote = byId('line-note');
    E.answer = byId('answer');
    E.btnReplay = byId('btn-replay');
    E.btnSlow = byId('btn-slow');
    E.btnTranslit = byId('btn-translit');
    E.btnStress = byId('btn-stress');
    E.btnEn = byId('btn-en');
    E.btnAuto = byId('btn-auto');
    E.btnNext = byId('btn-next');
    E.modal = byId('modal');
    E.title = byId('titlescreen');
    E.btnStart = byId('btn-start');
    E.btnRestart = byId('btn-restart');
    E.titleStatus = byId('title-status');
    E.btnBack = byId('btn-back');
    E.btnNotebook = byId('btn-notebook');
    E.btnHelp = byId('btn-help');
    E.btnSettings = byId('btn-settings');
    E.savedot = byId('savedot');
    E.micchip = byId('micchip');
    E.micLabel = byId('micchip-label');
    E.btnMicStop = byId('btn-micstop');
  }

  function indexLetters() {
    var arr = ctx.session && ctx.session.letters, i;
    ctx.letters = {};
    if (arr && arr.length) {
      for (i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].id) { ctx.letters[arr[i].id] = arr[i]; }
      }
    }
  }

  function wireChrome() {
    if (E.btnBack) { E.btnBack.addEventListener('click', function () { goBack(); }); }
    if (E.btnNotebook) { E.btnNotebook.addEventListener('click', openNotebook); }
    if (E.btnReplay) { E.btnReplay.addEventListener('click', function () { replay(false); }); }
    if (E.btnSlow) { E.btnSlow.addEventListener('click', function () { replay(true); }); }
    if (E.btnTranslit) { E.btnTranslit.addEventListener('click', function () { setSetting('translit', !setting('translit')); }); }
    if (E.btnStress) { E.btnStress.addEventListener('click', function () { setSetting('stressMarks', !setting('stressMarks')); }); }
    if (E.btnEn) { E.btnEn.addEventListener('click', function () { setSetting('english', !setting('english')); }); }
    if (E.btnAuto) {
      E.btnAuto.addEventListener('click', function () {
        var next = !setting('autoAdvance');
        setSetting('autoAdvance', next);
        if (!next) { cancelAuto(); }
      });
    }
    if (E.btnNext) { E.btnNext.addEventListener('click', function () { advance(); }); }
    if (E.btnHelp) { E.btnHelp.addEventListener('click', openHelp); }
    if (E.btnSettings) { E.btnSettings.addEventListener('click', openSettings); }
    if (E.btnMicStop) { E.btnMicStop.addEventListener('click', function () { stopListening(true); }); }
    if (E.lineRu) { E.lineRu.addEventListener('click', onTokenClick); }
    if (E.sprite) {
      /* a real file can be dropped in later; a missing one falls back silently */
      E.sprite.addEventListener('error', function () {
        if (placeholderSprite && E.sprite.getAttribute('src') !== placeholderSprite) {
          E.sprite.setAttribute('src', placeholderSprite);
        }
      });
    }
  }

  /* interference markers: replaying, leaving the tab or scrolling forbids "easy" */
  function wireInterference() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { markInterfered(); stopAudio(); }
    });
    if (E.tbox) { E.tbox.addEventListener('scroll', markInterfered, { passive: true }); }
    if (E.panel) { E.panel.addEventListener('scroll', markInterfered, { passive: true }); }
  }
  function markInterfered() { V.interfered = true; }

  function wireEngine() {
    if (!isFn(ctx.engine, 'on')) { return; }
    var sub = function (name, fn) { try { ctx.engine.on(name, fn); } catch (e) { /* optional event */ } };
    sub('node', function (payload) {
      /* engine.js emits {node, nodeId, type, report, ...}; a plainer build may
         emit the node itself. Unwrap either shape. */
      lastNodePayload = (payload && typeof payload === 'object' &&
        Object.prototype.hasOwnProperty.call(payload, 'node')) ? payload : null;
      renderNode(lastNodePayload ? lastNodePayload.node : payload);
    });
    sub('graded', function (payload) {
      V.pendingGrade = false;
      applyGrade(normGrade(payload));
    });
    sub('saved', function () { flashSaved(); });
    sub('error', function (err) {
      var msg = (err && err.message) ? err.message : (str(err) || 'The engine reported a problem.');
      /* engine.js tags a content/authoring complaint with severity:"warning"
         and keeps playing ("a ceiling, not a gate" — its own words). A normal
         Session Zero run raises one of these: the new-item ceiling trips at
         the eleventh exposure, around s0.ex5. Painting that in the same
         undismissable red bar as "this browser refused to save your progress"
         was wrong twice over — it buries the real error and it shows the
         learner a note addressed to the author. Warnings go to the console,
         which is where the author is; the banner is kept for failures the
         learner has to act on. */
      if (err && err.severity === 'warning') {
        if (window.console && console.warn) { console.warn('[RU.engine] ' + msg); }
        return;
      }
      banner('engine', msg, { soft: false });
    });
    sub('report', function (rep) { if (V.node && V.node.type === 'checkpoint') { renderReport(rep); } });
  }

  var lastNodePayload = null;

  function flashSaved() {
    if (!E.savedot) { return; }
    E.savedot.classList.add('on');
    window.setTimeout(function () { E.savedot.classList.remove('on'); }, 900);
  }

  /* ------------------------------------------------------------------ *
   * title screen — also the user gesture browsers want before audio
   * ------------------------------------------------------------------ */
  function wireTitle() {
    /* Whether this is a resume is decided by main.js before the engine has a
       chance to write state.position, because engine.start() commits the
       opening node id and saves it. Falling back to the state here would show
       "Continue" / "Start over" to someone who has never played. */
    var resumed = (typeof ctx.resumed === 'boolean')
      ? ctx.resumed
      : !!(ctx.state && ctx.state.position && ctx.state.position.nodeId);
    if (E.btnStart) {
      E.btnStart.textContent = resumed ? 'Continue your evening →' : 'Meet Anya →';
      E.btnStart.addEventListener('click', function () { ui.begin(); });
    }
    if (E.btnRestart) {
      E.btnRestart.hidden = !resumed;
      E.btnRestart.addEventListener('click', function () {
        if (!window.confirm('Start Session Zero again from the beginning? Your current progress is replaced.')) { return; }
        exportSave();
        try {
          if (isFn(ctx.save, 'fresh') && isFn(ctx.save, 'write')) {
            ctx.save.write(ctx.save.fresh());
            if (isFn(ctx.save, 'flush')) { ctx.save.flush(); }
          }
        } catch (e) { banner('storage', 'Could not reset the save: ' + (e.message || e)); return; }
        location.reload();
      });
    }
  }

  ui.setStatus = function (text) {
    if (E.titleStatus) { E.titleStatus.textContent = str(text); }
  };

  ui.begin = function () {
    if (started) { return; }
    started = true;
    if (E.title) { E.title.hidden = true; }
    var go = function () { renderCurrent(); focusStage(); };
    if (ctx.ready && typeof ctx.ready.then === 'function') {
      /* wait briefly for the audio manifest so the first line is voiced */
      var done = false;
      var run = function () { if (!done) { done = true; go(); } };
      ctx.ready.then(run, run);
      window.setTimeout(run, 4000);
    } else {
      go();
    }
  };

  function focusStage() {
    var target = E.panel && !E.panel.hidden ? E.panel : E.btnNext;
    if (target && isFn(target, 'focus')) { try { target.focus(); } catch (e) { /* non-fatal */ } }
  }

  function renderCurrent() {
    var node = null;
    if (!isFn(ctx.engine, 'current')) { fatalPanel('The engine did not start.', 'RU.engine.current is missing.'); return; }
    try { node = ctx.engine.current(); }
    catch (e) { fatalPanel('The engine could not say where we are.', e && e.message ? e.message : str(e)); return; }
    renderNode(node);
  }
  ui.renderCurrent = renderCurrent;

  /* ------------------------------------------------------------------ *
   * the render switch
   * ------------------------------------------------------------------ */
  function renderNode(node) {
    var seq, hops;
    cancelAuto();
    stopAudio();
    stopListening(false);
    seq = (V.renderSeq || 0) + 1;
    hops = V.retrievalHops || 0;
    resetView();
    V.renderSeq = seq;
    V.retrievalHops = (node && node.type === 'retrieval') ? hops : 0;
    V.node = node || null;
    updateJourney(node);
    syncBack();

    clearFeedbackArea();
    if (E.lineNote) { E.lineNote.hidden = true; E.lineNote.textContent = ''; }

    if (!node) {
      /* engine.current() also returns null when a retrieval beat could not be
         opened. That is not the same thing as the session being over. */
      var over = true;
      if (isFn(ctx.engine, 'done')) { try { over = !!ctx.engine.done(); } catch (e) { over = true; } }
      if (over) { renderEnd(); }
      else { fatalPanel('This beat could not open.', 'The engine has no node here and the session is not finished. Your progress is saved.'); }
      return;
    }

    switch (node.type) {
      case 'line': renderLine(node); break;
      case 'letters': renderLetters(node); break;
      case 'exercise': renderExercise(node); break;
      case 'retrieval': resolveRetrieval(node); break;
      case 'weblab': renderWeblab(node); break;
      case 'consent': renderConsent(node); break;
      case 'checkpoint': renderCheckpoint(node); break;
      default: renderUnknown(node); break;
    }
  }

  function clearFeedbackArea() {
    if (E.answer) { clear(E.answer); }
  }

  /* ---------------- scene: background + sprite ---------------- */
  function setScene(node) {
    var bg = node && node.bg ? str(node.bg) : V.lastBg;
    var sp = node && node.sprite ? str(node.sprite) : V.lastSprite;
    var who = node && node.who ? str(node.who) : 'anya';
    if (E.bg && bg) { E.bg.setAttribute('data-bg', bg); }
    V.lastBg = bg || V.lastBg;
    if (E.cast) {
      E.cast.setAttribute('data-expr', sp || 'neutral');
      E.cast.classList.toggle('away', who === 'narrator');
    }
    if (E.sprite && sp && sp !== V.lastSprite) { E.sprite.setAttribute('src', spriteSrc(sp)); }
    V.lastSprite = sp || V.lastSprite;
  }

  /* RU.ART, when a build supplies one, maps expression → file path.
     Without it the inline data-URI silhouette from index.html stands in. */
  function spriteSrc(name) {
    var art = RU.ART && RU.ART.anya;
    if (art && name && art[name]) { return art[name]; }
    return placeholderSprite;
  }

  function setSpeaker(who) {
    var label = '';
    if (who === 'anya' || !who) { label = 'Anya'; }        /* Аня */
    else if (who === 'you') { label = 'You'; }                   /* Ты */
    else if (who === 'narrator') { label = 'Your first evening'; }
    else { label = str(who); }
    if (E.speaker) { E.speaker.textContent = label; }
    if (E.tbox) { E.tbox.classList.toggle('narr', !label); }
  }

  /* ---------------- text lines + word tokens ---------------- */

  /* Tokens are cut from the STRESSED string, because the audio manifest's
     word timings are generated from exactly that text (CONTRACT §1.4).
     Token index N therefore lines up with manifest word N, which is what
     makes onWord highlighting and replayWord(clip, index) correct.
     Punctuation-only pieces get index -1 so they never consume an index. */
  function tokenise(stressed, plain) {
    var src = str(stressed).length ? str(stressed) : str(plain);
    var raw = src.split(/(\s+)/);
    var out = [], wi = 0, i, piece;
    for (i = 0; i < raw.length; i++) {
      piece = raw[i];
      if (!piece) { continue; }
      if (/^\s+$/.test(piece)) { out.push({ ws: true, text: piece }); continue; }
      if (/[A-Za-z\u0400-\u04FF]/.test(piece)) { out.push({ ws: false, text: piece, index: wi++ }); }
      else { out.push({ ws: false, text: piece, index: -1 }); }
    }
    return out;
  }

  /* The manifest's word list is the authority for indices, so align the
     display tokens to it: onWord(index) and replayWord(clip, index) then hit
     the right span even where punctuation splits differently. */
  function normWord(s) {
    return stripStress(str(s)).toLowerCase().replace(/[^0-9a-z\u0400-\u04FF]+/g, '');
  }

  function clipWords(clipKey) {
    var c;
    if (!clipKey || !isFn(ctx.speech, 'clip')) { return null; }
    try { c = ctx.speech.clip(clipKey); } catch (e) { return null; }
    return (c && c.words && c.words.length) ? c.words : null;
  }

  function alignTokens(tokens, words) {
    var ti = 0, wi, i, t, tn, w;
    for (i = 0; i < tokens.length; i++) { if (!tokens[i].ws) { tokens[i].index = -1; } }
    for (wi = 0; wi < words.length; wi++) {
      w = normWord(words[wi] && words[wi].w);
      if (!w) { continue; }
      while (ti < tokens.length) {
        t = tokens[ti];
        ti++;
        if (t.ws) { continue; }
        tn = normWord(t.text);
        if (!tn) { continue; }
        if (tn === w || tn.indexOf(w) === 0 || w.indexOf(tn) === 0) { t.index = wi; break; }
      }
    }
    return tokens;
  }

  var revealTimer = null;

  function renderTokens(host, tokens, animate) {
    var showStress = setting('stressMarks'), i, t, span, n = 0, d, pending = [];
    if (!host) { return; }
    if (revealTimer) { window.clearTimeout(revealTimer); revealTimer = null; }
    clear(host);
    for (i = 0; i < tokens.length; i++) {
      t = tokens[i];
      if (t.ws) { host.appendChild(document.createTextNode(t.text)); continue; }
      span = document.createElement('span');
      span.className = 'tok' + (t.index < 0 ? ' dead' : '');
      span.setAttribute('data-i', String(t.index));
      span.textContent = showStress ? t.text : stripStress(t.text);
      if (animate) {
        d = Math.min(n * 0.024, 0.6);
        span.style.opacity = '0';
        span.style.transform = 'translateY(0.16em)';
        span.style.transition = 'opacity .30s ease ' + d + 's, transform .30s ease ' + d + 's';
        pending.push(span);
      }
      host.appendChild(span);
      n++;
    }
    host.classList.toggle('reveal', !!animate);
    if (pending.length) { revealTokens(pending); }
  }

  /* The reveal is driven from JS and its END state is what JS writes, so a
     line is never left invisible by an animation that did not run (a frozen
     compositor, a paused tab, a screenshotting engine). Worst case the text
     simply appears without the fade. */
  function revealTokens(spans) {
    var done = false;
    var go = function () {
      var i;
      if (done) { return; }
      done = true;
      for (i = 0; i < spans.length; i++) {
        spans[i].style.opacity = '';
        spans[i].style.transform = '';
      }
    };
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { window.requestAnimationFrame(go); });
    }
    revealTimer = window.setTimeout(go, 80);
  }

  function showText(o) {
    var animate = !setting('reducedMotion');
    setSpeaker(o.who);
    V.tokens = tokenise(o.stressed, o.ru);
    var baked = clipWords(V.clip);
    if (baked) { alignTokens(V.tokens, baked); }
    renderTokens(E.lineRu, V.tokens, animate && !!(str(o.stressed) || str(o.ru)));
    if (E.lineTr) {
      var tr = str(o.translit);
      if (!tr && (str(o.stressed) || str(o.ru))) { tr = translitOf(str(o.stressed) || str(o.ru)); }
      E.lineTr.textContent = tr;
    }
    if (E.lineEn) { E.lineEn.textContent = str(o.en); }
    syncLineVisibility();
  }

  function highlight(i) {
    var prev, cur;
    if (!E.lineRu) { return; }
    prev = E.lineRu.querySelector('.tok.on');
    if (prev) { prev.classList.remove('on'); }
    if (typeof i !== 'number' || i < 0) { return; }
    cur = E.lineRu.querySelector('.tok[data-i="' + i + '"]');
    if (cur) { cur.classList.add('on'); }
  }

  function onTokenClick(ev) {
    var t = ev.target, i;
    while (t && t !== E.lineRu && !(t.className && String(t.className).indexOf('tok') >= 0)) { t = t.parentNode; }
    if (!t || t === E.lineRu) { return; }
    i = parseInt(t.getAttribute('data-i'), 10);
    if (isNaN(i) || i < 0) { return; }
    markInterfered();
    /* flash the tapped word even if the clip has no per-word audio */
    t.classList.add('tap');
    if (V.tapTimer) { window.clearTimeout(V.tapTimer); }
    V.tapTimer = window.setTimeout(function () { t.classList.remove('tap'); }, 700);
    if (V.clip && isFn(ctx.speech, 'replayWord')) {
      /* `text` is what speech.js speaks when the clip has no baked timing for
         this index — without it a word tap is silent before gen_audio.py has
         run. Hand it the tapped token itself. */
      try { ctx.speech.replayWord(V.clip, i, { text: str(t.textContent) }); return; }
      catch (e) { /* fall through */ }
    }
    replay(false);
  }

  /* ---------------- audio ---------------- */
  function stopAudio() {
    if (V.handle && isFn(V.handle, 'stop')) { try { V.handle.stop(); } catch (e) { /* already done */ } }
    V.handle = null;
    if (E.cast) { E.cast.classList.remove('speaking'); }
    highlight(-1);
  }

  /* One place that decides both which clip plays and what the fallback
     voice would say if the clip is not on disk. */
  function setClip(key, stressed, ru) {
    V.clip = key || null;
    V.clipText = str(stressed) || stripStress(str(ru));
    if (E.btnReplay) { E.btnReplay.disabled = !V.clip; }
    if (E.btnSlow) { E.btnSlow.disabled = !V.clip; }
  }

  function playClip(clip, slow, text) {
    var seqAtPlay = V.renderSeq;
    if (!clip || !isFn(ctx.speech, 'play')) {
      /* Nothing to play (a narrator line carries audio:null). The latency
         clock still has to start, and auto-advance still has to fire — it
         hangs off onEnd everywhere else, and without this a hands-free run
         stopped dead on the first narrator beat. */
      V.audioEndedAt = Date.now();
      maybeAutoAdvance();
      return;
    }
    stopAudio();
    if (E.cast) { E.cast.classList.add('speaking'); }
    try {
      V.handle = ctx.speech.play(clip, {
        slow: !!slow,
        text: str(text) || V.clipText || '',
        onWord: function (a, b) {
          if (V.renderSeq !== seqAtPlay) { return; }
          var i = wordIndexOf(a);
          if (i < 0 && typeof b === 'number') { i = b; }
          highlight(i);
        },
        onEnd: function (info) {
          if (V.renderSeq !== seqAtPlay) { return; }
          V.handle = null;
          V.audioEndedAt = Date.now();         /* latencyMs is measured from here */
          highlight(-1);
          if (E.cast) { E.cast.classList.remove('speaking'); }
          if (info && info.fallback && E.lineNote) {
            /* speech.js reports spoke:false when even the browser voice was
               not available (no speechSynthesis, or nothing to say). Claiming
               it "read it aloud" in that case is simply untrue. */
            E.lineNote.textContent = (info.spoke === false)
              ? 'Audio is unavailable here. You can still use the written pronunciation guide.'
              : 'Pronunciation from your browser’s Russian voice.';
            E.lineNote.hidden = false;
          }
          maybeAutoAdvance();
        }
      });
    } catch (e) {
      V.audioEndedAt = Date.now();
      if (E.cast) { E.cast.classList.remove('speaking'); }
    }
  }

  function wordIndexOf(w) {
    if (typeof w === 'number') { return w; }
    if (w && typeof w === 'object') {
      if (typeof w.index === 'number') { return w.index; }
      if (typeof w.i === 'number') { return w.i; }
      if (typeof w.wordIndex === 'number') { return w.wordIndex; }
      if (typeof w.n === 'number') { return w.n; }
    }
    return -1;
  }

  function replay(slow) {
    markInterfered();                     /* audit §6.4: a replay forbids "easy" */
    playClip(V.clip, slow || setting('slowDefault'));
  }

  /* ---------------- advance / auto-advance ---------------- */
  function cancelAuto() { if (V.autoTimer) { window.clearTimeout(V.autoTimer); V.autoTimer = null; } }

  function maybeAutoAdvance() {
    if (!setting('autoAdvance')) { return; }
    if (!V.node) { return; }
    if (V.node.type === 'exercise' && !V.answered) { return; }
    /* Without her voice there is no "finished speaking" moment to wait for,
       and a 1.2 s timer on silent text would skip lines before they are read. */
    if (!setting('autoplay')) { return; }
    if (V.node.type === 'consent') { return; }         /* never auto-past a consent choice */
    if (V.node.type === 'checkpoint') { return; }
    if (V.node.lesson) { return; }                     /* a teaching slide is read at the learner's pace */
    var ms = V.node.stop ? 2600 : 1200;
    if (!V.clip) {
      /* a silent narrator line: give roughly a slow reading pace for its English */
      var words = str(V.node.en).split(/\s+/).length;
      ms = Math.max(ms, 2000 + words * 280);
    }
    queueAuto(ms);
  }

  function queueAuto(ms) {
    cancelAuto();
    if (!setting('autoAdvance')) { return; }
    V.autoTimer = window.setTimeout(function () { V.autoTimer = null; advance(); }, ms);
  }

  function advance(payload) {
    var before, next;
    cancelAuto();
    stopAudio();
    if (!isFn(ctx.engine, 'advance')) { fatalPanel('The engine cannot advance.', 'RU.engine.advance is missing.'); return; }
    before = V.renderSeq;
    try { next = ctx.engine.advance(payload); }
    catch (e) {
      banner('engine', 'Could not advance: ' + (e && e.message ? e.message : str(e)));
      return;
    }
    if (V.renderSeq !== before) { return; }            /* the engine emitted "node" already */
    if (next && typeof next.then === 'function') {
      next.then(function (n) { if (V.renderSeq === before) { renderNode(n || null); } }, function () { });
    } else {
      renderNode(next || null);
    }
  }
  ui.advance = advance;

  /* One step back. The engine re-emits "node", which re-renders; nothing the
     learner already answered is undone (see answeredBefore). */
  function goBack() {
    var before;
    if (!isFn(ctx.engine, 'back')) { return; }
    if (isFn(ctx.engine, 'canGoBack') && !ctx.engine.canGoBack()) { return; }
    if (modalOpen) { closeModal(); }
    cancelAuto();
    stopAudio();
    stopListening(false);
    before = V.renderSeq;
    try { ctx.engine.back(); }
    catch (e) {
      banner('engine', 'Could not go back: ' + (e && e.message ? e.message : str(e)));
      return;
    }
    if (V.renderSeq === before) { renderCurrent(); }
  }
  ui.back = goBack;

  function syncBack() {
    var can = false;
    if (!E.btnBack) { return; }
    if (isFn(ctx.engine, 'canGoBack')) { try { can = !!ctx.engine.canGoBack(); } catch (e) { can = false; } }
    E.btnBack.disabled = !can;
  }

  /* An exercise the learner has already answered (they came back to it) is
     replayed as practice: the answer was on screen last time, so a second go
     is not evidence, and marking it assisted keeps it out of the report. */
  function answeredBefore(nodeId) {
    var list = ctx.state && ctx.state.attempts, i;
    if (!nodeId || !list || !list.length) { return false; }
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].nodeId === nodeId) { return true; }
    }
    return false;
  }

  function markRevisit(host) {
    V.assisted = true;
    if (host) {
      host.appendChild(h('p', { class: 'l-note', text: 'You have answered this one already, so this try is practice and is not scored.' }));
    }
  }

  function setNext(enabled, label) {
    if (!E.btnNext) { return; }
    E.btnNext.disabled = !enabled;
    clear(E.btnNext);
    E.btnNext.appendChild(document.createTextNode(label || 'Continue'));
    E.btnNext.appendChild(h('kbd', { text: '␣' }));
  }

  function showPanel(children) {
    if (!E.panel) { return; }
    clear(E.panel);
    E.panel.classList.remove('lesson-panel');          /* renderLesson re-adds it for its own panel */
    E.panel.appendChild(h('div', { class: 'pwrap' }, children));
    E.panel.hidden = false;
    if (E.stage) { E.stage.classList.add('panelled'); }
  }
  function hidePanel() {
    if (!E.panel) { return; }
    E.panel.hidden = true;
    clear(E.panel);
    E.panel.classList.remove('lesson-panel');
    if (E.stage) { E.stage.classList.remove('panelled'); }
  }

  /* ------------------------------------------------------------------ *
   * node type: line
   * ------------------------------------------------------------------ */
  function renderLine(node) {
    hidePanel();
    setScene(node);
    setClip(node.audio, node.stressed, node.ru);
    showText({ who: node.who, stressed: node.stressed, ru: node.ru, translit: node.translit, en: node.en });
    if (node.lesson) { renderLesson(node.lesson); }
    else if (node.teaches && node.teaches.length) { showTeaches(node.teaches); }
    setNext(true, node.stop ? 'Continue' : 'Continue');
    if (node.stop) { markStoppingPoint(); }
    if (setting('autoplay')) { playClip(V.clip, setting('slowDefault')); }
    else { V.audioEndedAt = Date.now(); }
  }

  /* a safe stopping point is offered, never pushed (audit §5) */
  function markStoppingPoint() {
    if (!E.answer) { return; }
    E.answer.appendChild(h('div', { class: 'qtag' }, [
      h('span', { class: 'stopchip', text: 'good place to stop' }),
      h('button', {
        class: 'abtn quiet', type: 'button', text: 'Save and stop',
        onclick: function () { if (isFn(ctx.save, 'flush')) { try { ctx.save.flush(); } catch (e) { } } openSettings(); }
      })
    ]));
  }

  function showTeaches(ids) {
    var chips = [], i, lex;
    for (i = 0; i < ids.length && i < 6; i++) {
      lex = ctx.lexicon && ctx.lexicon[ids[i]];
      if (!lex) { continue; }
      chips.push(h('span', { class: 'stopchip', text: str(lex.lemma) + ' · ' + str(lex.gloss) }));
    }
    if (!chips.length || !E.answer) { return; }
    E.answer.appendChild(h('div', { class: 'qtag' }, [h('span', { text: 'new' })].concat(chips)));
  }

  /* ------------------------------------------------------------------ *
   * node type: letters
   * ------------------------------------------------------------------ */
  function renderLetters(node) {
    var cards = [], ids = node.letters || [], i, L, id;
    setScene(node);
    setClip(node.audio, node.stressed, node.ru);

    for (i = 0; i < ids.length; i++) {
      id = ids[i];
      L = ctx.letters[id];
      cards.push(letterCard(id, L));
    }

    showPanel([
      h('p', { class: 'plabel', text: 'LEARN THE SOUND · ' + str(ids[0] === 'ltr:Р' ? '1 / 3' : (ids[0] === 'ltr:С' ? '2 / 3' : '3 / 3')) }),
      h('h2', { class: 'ptitle', text: node.title ? str(node.title) : 'A familiar shape, a new sound' }),
      h('div', { class: 'lcards' }, cards),
      h('div', { class: 'pbtns' }, [
        h('button', { class: 'pbtn warm', type: 'button', text: 'Ready to try →', onclick: function () { advance(); } })
      ])
    ]);

    showText({
      who: node.who || 'narrator', stressed: node.stressed, ru: node.ru,
      translit: node.translit, en: node.en || node.intro
    });
    setNext(true, 'Continue');
    if (setting('autoplay') && V.clip) { playClip(V.clip, setting('slowDefault')); }
  }

  function letterCard(id, L) {
    var kids, vs, i, other;
    if (!L) {
      return h('div', { class: 'lcard' }, [
        h('div', { class: 'glyph', text: str(id).replace(/^ltr:/, '') }),
        h('p', { class: 'looks', text: 'This letter is not in the session data.' })
      ]);
    }
    kids = [
      h('div', { class: 'glyph' }, [
        document.createTextNode(str(L.upper)),
        h('small', { text: str(L.lower) })
      ]),
      h('div', { class: 'sound', text: L.sound ? '/' + str(L.sound) + '/' : '' })
    ];
    if (L.looksLike || L.trap) {
      kids.push(h('p', { class: 'looks' }, [
        L.looksLike ? h('b', { text: 'looks like ' + str(L.looksLike) }) : null,
        L.trap ? document.createTextNode(' ' + str(L.trap)) : null
      ]));
    }
    if (L.bridge) {
      kids.push(h('p', { class: 'bridge' }, [
        h('em', { text: 'Try the sound' }),
        document.createTextNode(str(L.bridge))
      ]));
    }
    if (L.contrastWith && L.contrastWith.length) {
      vs = [];
      for (i = 0; i < L.contrastWith.length; i++) {
        other = ctx.letters[L.contrastWith[i]];
        vs.push(other ? str(other.upper) + str(other.lower) : str(L.contrastWith[i]).replace(/^ltr:/, ''));
      }
      kids.push(h('p', { class: 'vs', text: 'not: ' + vs.join('  ·  ') }));
    }
    if (L.audio && isFn(ctx.speech, 'play')) {
      kids.push(h('div', { class: 'play' }, [
        h('button', {
          class: 'abtn quiet', type: 'button', text: 'hear it',
          onclick: function () { markInterfered(); playClip(L.audio, false, L.lower || L.upper); }
        })
      ]));
    }
    return h('div', { class: 'lcard' }, kids);
  }

  /* ------------------------------------------------------------------ *
   * node type: exercise
   * ------------------------------------------------------------------ */
  function renderExercise(node) {
    var p = node.prompt || {};
    hidePanel();
    setScene(node);
    V.ex = node;
    V.answerHost = E.answer;
    setClip(p.audio, p.stressed, p.ru);
    showText({ who: node.who || 'anya', stressed: p.stressed, ru: p.ru, translit: p.translit, en: p.en });
    buildAnswer(node, E.answer);
    if (node.graded !== false && answeredBefore(node.id)) { markRevisit(E.answer); }
    setNext(false, 'Answer first');
    if (setting('autoplay')) { playClip(V.clip, setting('slowDefault')); }
    else { V.audioEndedAt = Date.now(); }
  }

  /* Builds the answer controls for anything exercise-shaped: an `exercise`
     node, or the `question` inside a weblab task. */
  function buildAnswer(ex, host) {
    var kind = str(ex.kind) || 'closed';
    var modality = str(ex.modality) || 'typed';
    var tags = [];
    clear(host);
    V.ex = ex;
    V.answerHost = host;

    tags.push(h('span', { text: kind === 'open' ? 'your own words' : (kind === 'closed' ? 'pick one' : 'type it') }));
    if (ex.dimension) { tags.push(h('span', { text: '· ' + str(ex.dimension) })); }
    if (ex.graded === false) { tags.push(h('em', { text: '· practice, not graded' })); }
    host.appendChild(h('div', { class: 'qtag' }, tags));

    if (ex.image) { host.appendChild(referent(ex.image)); }
    if (ex.graded !== false) { host.appendChild(h('button', { class: 'notebook-help abtn quiet', type: 'button', text: 'Help me remember', onclick: openNotebook })); }

    if (kind === 'closed' || modality === 'choice') { buildChoices(ex, host); }
    else if (kind === 'open' || ex.graded === false) { buildOpen(ex, host); }
    else { buildTyped(ex, host, modality); }
  }

  function referent(image) {
    var s = str(image);
    if (/[\/\\]|\.(png|jpe?g|webp|gif|svg)$/i.test(s)) {
      return h('div', { class: 'referent' }, [h('img', { src: s, alt: '' })]);
    }
    return h('div', { class: 'referent', text: s });
  }

  function buildChoices(ex, host) {
    var wrap = h('div', { class: 'choices' }), list = ex.choices || [], i;
    for (i = 0; i < list.length; i++) {
      wrap.appendChild(choiceButton(ex, list[i], i));
    }
    host.appendChild(wrap);
    if (ex.hint) { host.appendChild(hintRow(ex, host)); }
  }

  /* CONTRACT 1.3: a choice's English is either `en` — painted next to the
     Russian — or `enAfter`, which is built now but stays hidden until the
     answer is final. The distinction is load-bearing rather than cosmetic: on
     a reading exercise a gloss shown up front turns "decode РАКЕТА" into
     "match the English", and the checkpoint then reports recognition evidence
     it has not got. Content decides which field it wants; this only obeys. */
  function choiceButton(ex, choice, i) {
    var face = str(choice.stressed || choice.ru);
    var btn = h('button', {
      class: 'choice', type: 'button', 'data-choice': str(choice.id),
      onclick: function () { pickChoice(i); }
    }, [
      h('span', { class: 'num', text: String(i + 1) }),
      h('span', { class: 'ctext' }, [
        h('span', { class: 'cru', lang: 'ru', text: setting('stressMarks') ? face : stripStress(face) }),
        choice.en ? h('span', { class: 'cen', text: str(choice.en) }) : null,
        (setting('english') && choice.enAfter)
          ? h('span', { class: 'cen cafter', hidden: 'hidden', text: str(choice.enAfter) }) : null
      ])
    ]);
    return btn;
  }

  /* Called once the answer can no longer change: a correct answer, a wrong one
     with no retry left, or an explicit reveal. Never after a wrong first
     answer that still has a retry, because that would hand over the target. */
  function revealChoiceGlosses() {
    var host = V.answerHost, spans, i;
    if (!host) { return; }
    spans = host.querySelectorAll('.cafter');
    for (i = 0; i < spans.length; i++) { spans[i].hidden = false; }
  }

  function pickChoice(i) {
    var ex = V.ex, list, choice, btns;
    if (!ex || !ex.choices || V.answered) { return; }
    list = ex.choices;
    if (i < 0 || i >= list.length) { return; }
    choice = list[i];
    btns = V.answerHost ? V.answerHost.querySelectorAll('.choice') : [];
    if (btns[i]) { btns[i].classList.add('picked'); }
    /* CONTRACT §1.3 gives choices a stable `id`; that is what we hand to the
       engine as the raw answer. The choice text goes along as metadata. */
    submit(str(choice.id), { choiceIndex: i, text: str(choice.ru) });
  }

  function buildTyped(ex, host, modality) {
    var input = h('input', {
      class: 'ansin', type: 'text', lang: 'ru', spellcheck: 'false',
      autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
      placeholder: 'type it in Russian',
      'aria-label': 'your answer in Russian'
    });
    var row = h('div', { class: 'inrow' }, [
      input,
      h('button', {
        class: 'abtn', type: 'button', text: 'Answer',
        onclick: function () { submitTyped(input); }
      })
    ]);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitTyped(input); }
    });
    if (modality === 'spoken' || modality === 'either') { row.appendChild(micButton(input)); }
    host.appendChild(row);
    var keys = h('div', { class: 'letter-keyboard', role: 'group', 'aria-label': 'Russian letter keyboard' });
    'АКМОТЕРСН'.split('').forEach(function (letter) {
      keys.appendChild(h('button', { type: 'button', class: 'letter-key', text: letter, 'aria-label': 'Insert ' + letter, onclick: function () {
        if (V.answered) { return; }
        var start = input.selectionStart || 0, end = input.selectionEnd || start;
        input.value = input.value.slice(0, start) + letter.toLowerCase() + input.value.slice(end);
        input.focus(); input.setSelectionRange(start + 1, start + 1);
      } }));
    });
    keys.appendChild(h('button', { type: 'button', class: 'letter-key', text: '⌫', 'aria-label': 'Delete previous letter', onclick: function () {
      if (V.answered) { return; }
      var start = input.selectionStart || 0, end = input.selectionEnd || start, from = start === end ? Math.max(0,start - 1) : start;
      input.value = input.value.slice(0,from) + input.value.slice(end); input.focus(); input.setSelectionRange(from,from);
    } }));
    host.appendChild(keys);
    if (ex.hint) { host.appendChild(hintRow(ex, host)); }
    V.input = input;
    window.setTimeout(function () { try { input.focus(); } catch (e) { } }, 30);
  }

  function submitTyped(input) {
    var raw = input ? input.value : '';
    if (!str(raw).replace(/\s+/g, '')) { input && input.focus(); return; }
    submit(raw, { text: raw });
  }

  function buildOpen(ex, host) {
    var ta = h('textarea', {
      class: 'ansin', lang: 'ru', spellcheck: 'false',
      placeholder: 'answer her in your own words',
      'aria-label': 'your answer'
    });
    var done = h('button', {
      class: 'abtn', type: 'button', text: 'Done',
      onclick: function () { openSelfRate(ex, host, ta.value); }
    });
    host.appendChild(h('div', {}, [ta]));
    host.appendChild(h('div', { class: 'inrow' }, [done]));
    host.appendChild(h('p', { class: 'l-note', text: 'Open answers are practice. They are never scored and never feed a mastery card.' }));
    V.input = ta;
  }

  /* Open exercises are graded:false — RU.grade.check throws on them
     (CONTRACT §2 grade). The UI must never call engine.answer here; the
     self-rating rides along on advance() instead. */
  function openSelfRate(ex, host, raw) {
    var mk = function (label, value) {
      return h('button', {
        class: 'abtn quiet', type: 'button', text: label,
        onclick: function () { V.answered = true; advance({ raw: raw, selfRating: value, assisted: V.assisted }); }
      });
    };
    host.appendChild(h('div', { class: 'fb' }, [
      h('b', { text: 'Did that come out the way you meant?' }),
      h('div', { class: 'selfrate' }, [
        mk('Yes, that is what I meant', 'yes'),
        mk('Roughly', 'partly'),
        mk('Not really', 'no')
      ])
    ]));
    setNext(false, 'Pick one');
  }

  function hintRow(ex, host) {
    var btn = h('button', {
      class: 'abtn quiet', type: 'button', text: 'Hint',
      onclick: function () {
        V.assisted = true;                 /* srs.deriveRating returns null for assisted attempts */
        btn.disabled = true;
        host.appendChild(h('div', { class: 'fb' }, [
          h('b', { text: 'Hint. ' }),
          document.createTextNode(str(ex.hint)),
          h('span', { class: 'heard', text: 'Recorded as assisted, so this attempt is not scored either way.' })
        ]));
      }
    });
    return h('div', { class: 'inrow' }, [btn]);
  }

  /* ---------------- microphone ---------------- */
  function speechAvailable() {
    var a = { tts: false, asr: false, asrReason: 'RU.speech is not loaded.' };
    if (isFn(ctx.speech, 'available')) {
      try { a = ctx.speech.available() || a; } catch (e) { /* keep the default */ }
    }
    return a;
  }
  function consentState() {
    if (isFn(ctx.speech, 'consentState')) {
      try { return str(ctx.speech.consentState()) || 'unset'; } catch (e) { return 'unset'; }
    }
    return 'unset';
  }

  function micButton(input) {
    var btn = h('button', {
      class: 'abtn mic', type: 'button', text: 'Speak',
      onclick: function () {
        if (V.listen) { stopListening(true); return; }
        startListening(input, btn);
      }
    });
    return btn;
  }

  function startListening(input, btn) {
    var av = speechAvailable(), host = V.answerHost;
    if (!av.asr) {
      if (host) { host.appendChild(h('div', { class: 'fb' }, [h('b', { text: 'No speech recognition here. ' }), document.createTextNode(str(av.asrReason) || 'This browser does not offer it.'), h('span', { class: 'heard', text: 'Type the answer instead — it teaches the same material.' })])); }
      return;
    }
    if (consentState() !== 'granted') { openConsentModal(); return; }
    try {
      V.listen = ctx.speech.listen({
        lang: 'ru-RU',
        onPartial: function (t) { if (input) { input.value = str(t); } },
        onFinal: function (t) {
          var heard = str(t);
          if (input) { input.value = heard; }
          stopListening(false);
          if (V.answerHost) {
            V.answerHost.appendChild(h('div', { class: 'fb' }, [h('span', { class: 'heard', text: 'I heard: ' + heard })]));
          }
          submit(heard, { text: heard, modality: 'spoken' });
        },
        onError: function (e) {
          stopListening(false);
          if (V.answerHost) {
            V.answerHost.appendChild(h('div', { class: 'fb bad' }, [
              h('b', { text: 'The microphone stopped. ' }),
              document.createTextNode((e && e.message) ? str(e.message) : 'Try again, or type it.')
            ]));
          }
        }
      });
    } catch (e) {
      /* CONTRACT: listen() throws unless consent === "granted" */
      openConsentModal();
      return;
    }
    if (btn) { btn.classList.add('live'); btn.textContent = 'Stop'; }
    micChip(true);
  }

  function stopListening(userAsked) {
    var btn;
    if (V.listen && isFn(V.listen, 'stop')) { try { V.listen.stop(); } catch (e) { } }
    V.listen = null;
    micChip(false);
    if (V.answerHost) {
      btn = V.answerHost.querySelector('.abtn.mic');
      if (btn) { btn.classList.remove('live'); btn.textContent = 'Speak'; }
    }
    if (userAsked && V.answerHost) {
      V.answerHost.appendChild(h('div', { class: 'fb' }, [h('span', { class: 'heard', text: 'Microphone off.' })]));
    }
  }

  function micChip(on) {
    if (!E.micchip) { return; }
    E.micchip.hidden = !on;
    if (E.micLabel) { E.micLabel.textContent = on ? 'mic live' : 'mic'; }
  }

  /* ---------------- grading ---------------- */
  function latencyNow() {
    var base = V.audioEndedAt || V.shownAt || Date.now();
    return Math.max(0, Date.now() - base);
  }

  function normGrade(g) {
    if (!g) { return null; }
    /* engine.js reports an UNMEASURED attempt as measured:false / correct:null
       — an ungraded exercise (s0.ex1's Latin-P trap, s0.ex8's open repeat) or
       a grader failure. Its `ok` is a flat false, so reading `ok` alone told
       the learner "Not quite" about an item that was never being scored.
       Nothing was measured, so there is no grade to apply. */
    if (g.measured === false || g.correct === null) { return null; }
    if (typeof g.ok === 'boolean') { return g; }
    if (g.result && typeof g.result.ok === 'boolean') { return g.result; }
    if (g.grade && typeof g.grade.ok === 'boolean') { return g.grade; }
    if (g.check && typeof g.check.ok === 'boolean') { return g.check; }
    return null;
  }

  function submit(raw, extra) {
    var ex = V.ex, meta, res = null, before;
    if (!ex || V.answered) { return; }
    if (ex.graded === false && ex.kind === 'closed') {
      V.answered = true;
      disableAnswerControls();
      var chosen = (ex.choices || []).filter(function (c) { return c.id === raw; })[0];
      V.answerHost.appendChild(h('div', { class: 'fb practice-feedback', role: 'status' }, [
        h('strong', { text: chosen && chosen.correct ? 'You read your first word!' : 'Let’s sound it out together.' }),
        h('p', { text: ex.practiceFeedback || 'Take your time. This is practice.' })
      ]));
      setNext(true, 'Continue'); return;
    }
    if (ex.graded === false) {
      /* never grade an open exercise; it is practice (audit §6.4) */
      V.answered = true;
      advance({ raw: raw });
      return;
    }
    if (!isFn(ctx.engine, 'answer')) { banner('engine', 'RU.engine.answer is missing; the answer could not be recorded.'); return; }

    V.lastRaw = str(raw);
    V.pendingGrade = true;
    before = V.renderSeq;
    meta = {
      assisted: !!V.assisted,
      latencyMs: latencyNow(),
      interfered: !!V.interfered
    };
    if (extra) {
      for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { meta[k] = extra[k]; } }
    }
    disableAnswerControls();
    try { res = ctx.engine.answer(raw, meta); }
    catch (e) {
      V.pendingGrade = false;
      banner('engine', 'Grading failed: ' + (e && e.message ? e.message : str(e)));
      setNext(true, 'Continue');
      return;
    }
    if (!V.pendingGrade || V.renderSeq !== before) { return; }   /* the "graded" event got there first */
    if (res && typeof res.then === 'function') {
      res.then(function (r) {
        if (V.pendingGrade && V.renderSeq === before) { V.pendingGrade = false; applyGrade(normGrade(r)); }
      }, function () { V.pendingGrade = false; applyGrade(null); });
      return;
    }
    V.pendingGrade = false;
    applyGrade(normGrade(res));
  }

  function disableAnswerControls() {
    var host = V.answerHost, i, btns;
    if (!host) { return; }
    btns = host.querySelectorAll('.choice');
    for (i = 0; i < btns.length; i++) { btns[i].disabled = true; }
  }

  /* Feedback order is the one the audit fixes (§6.4 / §12):
     say what was received → one issue → replay the model → one retry → move on. */
  function applyGrade(g) {
    var ex = V.ex, host = V.answerHost, fb, msg;
    V.answered = true;
    if (!host) { setNext(true, 'Continue'); return; }

    if (!g) {
      revealChoiceGlosses();
      host.appendChild(h('div', { class: 'fb' }, [h('span', { class: 'heard', text: 'Recorded.' })]));
      setNext(true, 'Continue');
      maybeAutoAdvance();
      return;
    }

    if (g.ok) {
      markChoiceResult(true);
      revealChoiceGlosses();
      /* For a closed exercise the grader's `matched` can be the choice id, which
         means nothing to the learner: echo the choice's own Russian instead. */
      var echo = (V.ex && V.ex.choices) ? chosenChoiceText() : str(g.matched);
      if (!echo) { echo = str(g.matched); }
      fb = h('div', { class: 'fb good' }, [
        h('b', { text: 'Да. ' }),
        document.createTextNode('That is it.'),
        echo ? h('span', { class: 'ru', lang: 'ru', text: '  ' + echo }) : null,
        V.assisted ? h('span', { class: 'heard', text: 'You used the hint, so this one is left due rather than scored.' }) : null
      ]);
      host.appendChild(fb);
      scrollIntoView(fb);
      setNext(true, 'Continue');
      maybeAutoAdvance();
      return;
    }

    markChoiceResult(false);
    msg = diagnosisMessage(g.diagnosis);
    fb = h('div', { class: 'fb bad' }, [
      h('span', { class: 'heard', text: 'You gave: ' + (V.lastRaw ? V.lastRaw : '(nothing)') }),
      h('b', { text: msg.head }),
      document.createTextNode(msg.body)
    ]);
    host.appendChild(fb);
    scrollIntoView(fb);

    var btns = h('div', { class: 'fbtns' }, [
      V.clip ? h('button', { class: 'abtn quiet', type: 'button', text: 'Hear it again', onclick: function () { replay(false); } }) : null
    ]);
    /* The engine tracks attempts on this node and tells us whether the single
       retry (audit §6.4) is still there; fall back to our own count. */
    var canRetry = (typeof g.retryAvailable === 'boolean') ? g.retryAvailable : (V.retries < 1);
    if (canRetry) {
      V.retries++;
      btns.appendChild(h('button', {
        class: 'abtn', type: 'button', text: 'Try once more',
        onclick: function () { retry(); }
      }));
      setNext(true, 'Move on');
    } else {
      revealChoiceGlosses();
      btns.appendChild(h('button', {
        class: 'abtn', type: 'button', text: 'Show me',
        onclick: function () { reveal(); }
      }));
      setNext(true, 'Continue');
    }
    fb.appendChild(btns);
    /* replay the model once, unprompted, if the learner has audio on */
    if (setting('autoplay') && V.clip) { playClip(V.clip, true); }
  }

  function retry() {
    var ex = V.ex, host = V.answerHost;
    if (!ex || !host) { return; }
    V.answered = false;
    V.pendingGrade = false;
    buildAnswer(ex, host);
    setNext(false, 'Answer first');
  }

  function reveal() {
    var ex = V.ex, host = V.answerHost, shown = '', i, list;
    if (!ex || !host) { return; }
    V.revealed = true;
    revealChoiceGlosses();
    if (ex.choices && ex.choices.length) {
      list = host.querySelectorAll('.choice');
      for (i = 0; i < ex.choices.length; i++) {
        if (ex.choices[i] && ex.choices[i].correct) {
          shown = str(ex.choices[i].ru);
          if (list[i]) { list[i].classList.add('right'); }
        }
      }
    } else if (ex.accept && ex.accept.length) {
      shown = str(ex.accept[0]);
    }
    host.appendChild(h('div', { class: 'fb' }, [
      h('b', { text: 'She says it like this: ' }),
      h('span', { class: 'ru', lang: 'ru', text: shown || '—' })
    ]));
    setNext(true, 'Continue');
  }

  /* the Russian of the choice the learner actually pressed */
  function chosenChoiceText() {
    var list = V.ex && V.ex.choices, i;
    if (!list) { return ''; }
    for (i = 0; i < list.length; i++) {
      if (list[i] && str(list[i].id) === V.lastRaw) { return str(list[i].ru); }
    }
    return '';
  }

  /* feedback inside a scrolling panel is useless if it lands below the fold */
  function scrollIntoView(node) {
    if (node && typeof node.scrollIntoView === 'function') {
      try { node.scrollIntoView({ block: 'nearest' }); } catch (e) { /* older engines */ }
    }
  }

  function markChoiceResult(ok) {
    var host = V.answerHost, i, btns;
    if (!host || !V.ex || !V.ex.choices) { return; }
    btns = host.querySelectorAll('.choice');
    for (i = 0; i < btns.length; i++) {
      if (btns[i].classList.contains('picked')) { btns[i].classList.add(ok ? 'right' : 'wrong'); }
    }
  }

  /* English fallbacks for diagnosis codes. The engine's own message always
     wins — these only fill the gap when grade.js returns a bare code. */
  function diagnosisMessage(d) {
    var code = d && d.code ? str(d.code) : '';
    if (d && d.message) { return { head: 'Not quite. ', body: str(d.message) }; }
    switch (code) {
      case 'wrong-form':
        return {
          head: 'Right word, wrong form. ',
          body: (d.gotForm && d.wantForm) ? ('You gave the ' + str(d.gotForm) + '; she wants the ' + str(d.wantForm) + '.') : 'The word is right; the ending is not.'
        };
      case 'wrong-word': return { head: 'Not that word. ', body: 'Listen once more and look at what she is pointing at.' };
      case 'empty': return { head: 'Nothing there yet. ', body: 'Type something, even if it is wrong.' };
      case 'latin-script': return { head: 'Those are Latin letters. ', body: 'Switch the keyboard, or use the letters she just taught you.' };
      case 'near-miss': return { head: 'Almost. ', body: 'One letter is off — look again.' };
      default: return { head: 'Not quite. ', body: 'Have another listen.' };
    }
  }

  /* ------------------------------------------------------------------ *
   * node type: retrieval
   * The engine owns variant selection (CONTRACT §2: pickVariant writes the
   * pick into state.position.variantPicks so a reload replays the same one).
   * If a build hands the raw retrieval node to the UI, we ask the engine to
   * pick and step inside; we never choose a variant ourselves.
   * ------------------------------------------------------------------ */
  function resolveRetrieval(node) {
    V.retrievalHops = (V.retrievalHops || 0) + 1;
    if (V.retrievalHops > 4) {
      fatalPanel('The retrieval beat did not open.', 'engine.advance kept returning the retrieval node ' + str(node.id) + '.');
      return;
    }
    if (isFn(ctx.engine, 'pickVariant')) { try { ctx.engine.pickVariant(node); } catch (e) { /* engine will fall back */ } }
    advance();
  }

  /* ------------------------------------------------------------------ *
   * node type: weblab
   * ------------------------------------------------------------------ */
  function renderWeblab(node) {
    var task = node.task || {}, q = task.question || null, page = str(node.page), qhost;
    setScene(node);
    if (q && q.prompt && q.prompt.audio) { setClip(q.prompt.audio, q.prompt.stressed, q.prompt.ru); }
    else if (q && q.prompt && !node.audio) { setClip(null, q.prompt.stressed, q.prompt.ru); }
    else { setClip(node.audio, node.stressed, node.ru); }

    var frame = h('iframe', {
      src: page,
      title: 'web lab page',
      /* our own static page; scripts stay off so the lab cannot do anything
         but be read (audit §10: "fake Russian pages, static HTML, sanitised") */
      sandbox: 'allow-same-origin',
      loading: 'lazy',
      referrerpolicy: 'no-referrer'
    });
    var lab = h('div', { class: 'lab' }, [
      h('div', { class: 'bar' }, [
        h('span', { class: 'o' }),
        h('span', { class: 'u', text: page })
      ]),
      frame
    ]);
    qhost = h('div', { class: 'labq' });

    showPanel([
      h('p', { class: 'plabel', text: 'web lab' }),
      h('h2', { class: 'ptitle', text: 'Read the real thing' }),
      task.en ? h('p', { class: 'pbody', text: str(task.en) }) : null,
      lab,
      h('p', { class: 'pdim', text: 'If the page does not appear, open it in a new tab: ' + page }),
      qhost
    ]);

    if (q) {
      if (q.prompt) {
        showText({ who: node.who || 'anya', stressed: q.prompt.stressed, ru: q.prompt.ru, translit: q.prompt.translit, en: q.prompt.en });
      } else {
        showText({ who: node.who || 'anya', en: str(task.en) });
      }
      buildAnswer(q, qhost);
      if (q.graded !== false && answeredBefore(node.id)) { markRevisit(qhost); }
      setNext(false, 'Answer first');
      if (setting('autoplay') && V.clip) { playClip(V.clip, setting('slowDefault')); }
    } else {
      showText({ who: node.who || 'narrator', en: str(task.en) });
      setNext(true, 'Continue');
    }
  }

  /* ------------------------------------------------------------------ *
   * node type: consent — the microphone disclosure
   * Both paths get identical visual weight, on purpose (CONTRACT §3.6).
   * ------------------------------------------------------------------ */
  function renderConsent(node) {
    setScene(node);
    setClip(node.audio, node.stressed, node.ru);
    showText({ who: node.who || 'narrator', stressed: node.stressed, ru: node.ru, en: node.en });
    showPanel(consentBody(function (choice) { chooseConsent(choice, true); }));
    setNext(false, 'Choose one');
  }

  function consentBody(onChoice) {
    var d = disclosureParts(), av = speechAvailable(), kids = [], i;
    kids.push(h('p', { class: 'plabel', text: 'before the microphone' }));
    kids.push(h('h2', { class: 'ptitle', text: d.title }));
    for (i = 0; i < d.paras.length; i++) {
      kids.push(h('p', { class: 'pbody', text: d.paras[i] }));
    }
    kids.push(h('div', { class: 'equal' }, [
      h('button', {
        class: 'pick', type: 'button', onclick: function () { onChoice('granted'); }
      }, [
        h('span', { class: 'k', text: 'option one' }),
        h('span', { class: 'h', text: d.enable }),
        h('span', { class: 'd', text: 'Speaking attempts are scored against a short authored answer list, and the transcript is shown to you every time.' }),
        av.asr ? null : h('span', { class: 'd', text: 'Note: this browser does not expose speech recognition (' + (str(av.asrReason) || 'not available') + '). Your choice is remembered for a browser that does.' })
      ]),
      h('button', {
        class: 'pick', type: 'button', onclick: function () { onChoice('declined'); }
      }, [
        h('span', { class: 'k', text: 'option two' }),
        h('span', { class: 'h', text: d.decline }),
        h('span', { class: 'd', text: 'No audio ever leaves this machine. You answer by typing, and you can still record yourself and compare with her, which needs no recogniser.' })
      ])
    ]));
    kids.push(h('p', { class: 'samepath', text: 'The typed path teaches the same material. Nothing in Session Zero, or in any later arc, is locked behind the microphone — speaking is tracked separately in the ability report, and that is the only difference.' }));
    kids.push(h('p', { class: 'pdim', text: 'You can change this at any time in Settings.' }));
    return kids;
  }

  /* RU.speech.DISCLOSURE is what the contract's brief says to render, but the
     §2 speech API does not declare its shape, so accept string | array |
     object and keep an accurate fallback for a build that ships none. */
  function disclosureParts() {
    var d = ctx.speech ? ctx.speech.DISCLOSURE : null;
    var out = {
      title: 'Where your voice goes',
      paras: [],
      enable: 'Turn the microphone on',
      decline: 'Keep it off'
    };
    var body = null;
    if (typeof d === 'string') { out.paras = d.split(/\n{2,}/); }
    else if (d && Object.prototype.toString.call(d) === '[object Array]') { out.paras = d.slice(); }
    else if (d && typeof d === 'object') {
      if (d.title) { out.title = str(d.title); }
      body = d.paragraphs || d.paras || d.body || d.text || d.lines || null;
      if (typeof body === 'string') { out.paras = body.split(/\n{2,}/); }
      else if (body && body.length) { out.paras = [].slice.call(body); }
      if (d.enable || d.enableLabel || d.yes) { out.enable = str(d.enable || d.enableLabel || d.yes); }
      if (d.decline || d.declineLabel || d.no || d.off) { out.decline = str(d.decline || d.declineLabel || d.no || d.off); }
    }
    if (!out.paras.length) {
      out.paras = [
        'Speech recognition in a browser is not local. When the microphone is on, the browser sends your recorded speech to its vendor’s speech service — Google for Chrome, Apple for Safari — and sends back text. That is how it works everywhere, not something this page added.',
        'This game has no server of its own. Nothing is uploaded by us, no account exists, and no audio is stored: only the returned text, whether it matched, and the error tags go into your local save.',
        'The microphone is off until you turn it on, it is used only where the expected answer is short and already written down, and you can turn it off again in Settings whenever you like.'
      ];
    }
    for (var i = 0; i < out.paras.length; i++) { out.paras[i] = str(out.paras[i]); }
    return out;
  }

  function chooseConsent(choice, thenAdvance) {
    if (isFn(ctx.speech, 'setConsent')) {
      try { ctx.speech.setConsent(choice); } catch (e) { banner('speech', 'Could not store the microphone choice: ' + (e.message || e)); }
    }
    /* mirror into the save's flags if the engine did not do it itself */
    window.setTimeout(function () {
      var f = ctx.state && ctx.state.flags;
      if (f && f.micConsent !== choice) {
        f.micConsent = choice;
        if (isFn(ctx.save, 'write')) { try { ctx.save.write(ctx.state); } catch (e) { } }
      }
    }, 0);
    if (thenAdvance) { advance({ consent: choice }); }
    else { closeModal(); refreshSettingsPanel(); }
  }

  function openConsentModal() {
    openModal('The microphone', consentBody(function (choice) { chooseConsent(choice, false); }));
  }

  /* ------------------------------------------------------------------ *
   * node type: checkpoint — the ability report
   * ------------------------------------------------------------------ */
  function renderCheckpoint(node) {
    var rep = null;
    setScene(node);
    setClip(node.audio, node.stressed, node.ru);
    showText({ who: node.who || 'anya', stressed: node.stressed, ru: node.ru, translit: node.translit, en: node.en });
    if (lastNodePayload && lastNodePayload.node === node && lastNodePayload.report) {
      /* engine.js attaches the report to the checkpoint's node event, so the
         UI never has to decide when to ask for it. */
      renderReport(lastNodePayload.report);
      setNext(true, 'Continue');
      if (setting('autoplay') && V.clip) { playClip(V.clip, setting('slowDefault')); }
      return;
    }
    if (!isFn(ctx.engine, 'report')) {
      showPanel([h('p', { class: 'plabel', text: 'ability report' }), h('p', { class: 'pbody', text: 'The engine did not supply a report.' })]);
      setNext(true, 'Continue');
      return;
    }
    try { rep = ctx.engine.report(); }
    catch (e) {
      showPanel([h('p', { class: 'plabel', text: 'ability report' }), h('p', { class: 'pbody', text: 'The report could not be built: ' + (e.message || e) })]);
      setNext(true, 'Continue');
      return;
    }
    renderReport(rep);
    setNext(true, 'Continue');
    if (setting('autoplay') && V.clip) { playClip(V.clip, setting('slowDefault')); }
  }

  /* Rendering rule, binding: print what the engine returned and nothing else.
     No percentages, no totals, no averages — the UI computes no numbers. Where
     the engine says "not enough evidence", those exact words are shown. */
  var NOT_ENOUGH = 'not enough evidence';

  function renderReport(rep) {
    var rows = reportRows(rep), list = h('div', { class: 'rlist' }), i, raw;
    var mrows = modalityRows(rep), mlist = null, speaking = speakingStatement(rep);
    for (i = 0; i < rows.length; i++) { list.appendChild(reportRow(rows[i].key, rows[i].val)); }
    if (!rows.length) {
      list.appendChild(h('div', { class: 'rrow' }, [h('div', { class: 'rname', text: 'No dimensions reported yet.' })]));
    }
    if (mrows.length) {
      mlist = h('div', { class: 'rlist' });
      for (i = 0; i < mrows.length; i++) { mlist.appendChild(reportRow(mrows[i].key, mrows[i].val)); }
    }
    try { raw = JSON.stringify(rep, null, 2); } catch (e) { raw = ''; }

    showPanel([
      h('p', { class: 'plabel', text: 'ability report' }),
      h('h2', { class: 'ptitle', text: 'What tonight actually shows' }),
      h('p', { class: 'pbody pdim', text: 'Typed and spoken production are counted separately and one is never read off the other. Anything with too little behind it is reported as "' + NOT_ENOUGH + '" rather than guessed at.' }),
      h('p', { class: 'rhead', text: 'by dimension' }),
      list,
      mlist ? h('p', { class: 'rhead', text: 'by how you answered' }) : null,
      mlist,
      speaking ? h('p', { class: 'rspeak' + (speaking.toLowerCase().indexOf(NOT_ENOUGH) >= 0 || speaking.toLowerCase().indexOf('no evidence') >= 0 ? ' noev' : ''), text: speaking }) : null,
      topLevelNotes(rep),
      h('p', { class: 'rnote', text: 'Numbers here are attempt counts from this save, not a score.' }),
      raw ? h('details', { class: 'rraw' }, [h('summary', { text: 'the raw report' }), h('pre', { text: raw })]) : null,
      h('div', { class: 'pbtns' }, [
        h('button', { class: 'pbtn warm', type: 'button', text: 'Continue', onclick: function () { advance(); } }),
        h('button', { class: 'pbtn', type: 'button', text: 'Export my save', onclick: exportSave })
      ])
    ]);
  }

  /* CONTRACT 3 beat 8 asks the checkpoint to report typed and spoken
     SEPARATELY and to say "not enough evidence" for speaking when the learner
     typed. engine.report() supplies both — rep.modalities (typed / spoken /
     choice) and a plain-English rep.speaking.statement — but the first build
     of this file painted only rep.dimensions, so the half of the report the
     contract actually names never reached the screen. Printed verbatim, like
     everything else here. */
  function modalityRows(rep) {
    var src = rep && (rep.modalities || rep.byModality || rep.modality), out = [], k;
    if (!src || typeof src !== 'object') { return out; }
    for (k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) { continue; }
      out.push({ key: k, val: src[k] });
    }
    return out;
  }

  function speakingStatement(rep) {
    var sp = rep && rep.speaking;
    if (!sp) { return ''; }
    if (typeof sp === 'string') { return sp; }
    return str(sp.statement || sp.note || sp.summary || sp.verdict);
  }

  function reportRows(rep) {
    var src = null, out = [], i, k;
    if (!rep || typeof rep !== 'object') { return out; }
    src = rep.dimensions || rep.byDimension || rep.dims || rep.abilities || null;
    if (!src) {
      /* the report itself may be keyed by dimension; skip obvious meta fields */
      src = {};
      for (k in rep) {
        if (!Object.prototype.hasOwnProperty.call(rep, k)) { continue; }
        if (k === 'generatedAt' || k === 'at' || k === 'contentVersion' || k === 'schema' || k === 'notes' || k === 'summary' || k === 'flags' ||
            k === 'lines' || k === 'speaking' || k === 'modalities' || k === 'buckets' || k === 'items' || k === 'warnings') { continue; }
        src[k] = rep[k];
      }
    }
    if (Object.prototype.toString.call(src) === '[object Array]') {
      for (i = 0; i < src.length; i++) {
        out.push({ key: str(src[i] && (src[i].dimension || src[i].id || src[i].label || src[i].name)) || ('#' + (i + 1)), val: src[i] });
      }
    } else if (src && typeof src === 'object') {
      for (k in src) {
        if (!Object.prototype.hasOwnProperty.call(src, k)) { continue; }
        out.push({ key: k, val: src[k] });
      }
    }
    return out;
  }

  var DIM_LABELS = {
    recognition: 'Recognition',
    meaning: 'Meaning in context',
    meaningInContext: 'Meaning in context',
    controlled: 'Controlled production',
    spontaneous: 'Spontaneous production',
    typed: 'Typed production',
    spoken: 'Spoken production',
    listening: 'Listening',
    reading: 'Reading'
  };

  function prettyKey(k) {
    if (DIM_LABELS[k]) { return DIM_LABELS[k]; }
    var s = str(k).replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function reportRow(key, val) {
    var name = h('div', { class: 'rname' }, [
      document.createTextNode(prettyKey(key)),
      h('small', { text: str(key) })
    ]);
    return h('div', { class: 'rrow' }, [name, h('div', { class: 'rval' }, reportValue(val))]);
  }

  function reportValue(val) {
    var kids = [], meta = [], k, v, verdict = null;

    if (val === null || typeof val === 'undefined') {
      return [h('div', { class: 'rverdict noev', text: NOT_ENOUGH })];
    }
    if (typeof val === 'string') {
      return [h('div', { class: 'rverdict' + (val.toLowerCase().indexOf(NOT_ENOUGH) >= 0 ? ' noev' : ''), text: val })];
    }
    if (typeof val === 'number' || typeof val === 'boolean') {
      return [h('div', { class: 'rverdict', text: String(val) })];
    }
    if (Object.prototype.toString.call(val) === '[object Array]') {
      return [h('div', { class: 'rmeta', text: val.join(', ') })];
    }

    /* an object: find a verdict string, then list its scalar fields verbatim */
    verdict = val.verdict || val.summary || val.message || val.text || val.note || val.status || null;
    if (!verdict) {
      /* the engine may express it as a flag rather than a phrase */
      if (val.enough === false || val.enoughEvidence === false || val.notEnoughEvidence === true || val.insufficient === true) {
        verdict = NOT_ENOUGH;
      }
    }
    if (verdict) {
      kids.push(h('div', {
        class: 'rverdict' + (str(verdict).toLowerCase().indexOf(NOT_ENOUGH) >= 0 ? ' noev' : ''),
        text: str(verdict)
      }));
    }
    for (k in val) {
      if (!Object.prototype.hasOwnProperty.call(val, k)) { continue; }
      v = val[k];
      if (v === verdict) { continue; }
      if (v === null || typeof v === 'undefined') { continue; }
      if (typeof v === 'object') { continue; }
      if (k === 'enough' || k === 'enoughEvidence' || k === 'insufficient' || k === 'notEnoughEvidence') { continue; }
      meta.push(prettyKey(k).toLowerCase() + ': ' + String(v));
    }
    if (meta.length) { kids.push(h('div', { class: 'rmeta', text: meta.join('  ·  ') })); }
    if (!kids.length) { kids.push(h('div', { class: 'rverdict noev', text: NOT_ENOUGH })); }
    return kids;
  }

  function topLevelNotes(rep) {
    /* engine.report() calls this array `lines` — the ordered English the
       checkpoint is meant to read out, each sentence carrying its own count.
       Looking only for `notes`/`summary` meant it was built and thrown away. */
    var notes = rep && (rep.notes || rep.summary || rep.lines), wrap, i;
    if (!notes) { return null; }
    if (typeof notes === 'string') { return h('p', { class: 'pbody', text: notes }); }
    if (Object.prototype.toString.call(notes) === '[object Array]') {
      wrap = h('div', {});
      for (i = 0; i < notes.length; i++) { wrap.appendChild(h('p', { class: 'pbody', text: str(notes[i]) })); }
      return wrap;
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * unknown node / end of session
   * ------------------------------------------------------------------ */
  function renderUnknown(node) {
    hidePanel();
    setScene(node);
    showText({ who: 'narrator', en: 'This part of the session (' + str(node.type) + ') has no screen yet.' });
    setNext(true, 'Continue');
  }

  function renderEnd() {
    hidePanel();
    if (E.cast) { E.cast.classList.remove('away'); }
    showText({
      who: 'anya',
      stressed: 'Пока́! До за́втра?',
      ru: 'Пока! До завтра?',
      translit: 'Poka! Do zavtra?',
      en: 'Bye! Until tomorrow?'
    });
    setClip(null, null, null);
    showPanel([
      h('p', { class: 'plabel', text: 'end of session zero' }),
      h('h2', { class: 'ptitle', text: 'That is the whole session.' }),
      h('p', { class: 'pbody', text: 'Your position, your answers and her memory of tonight are already written to this browser. Take a copy anyway — a browser can lose site data, and the export file is also how you move progress to your phone.' }),
      h('div', { class: 'pbtns' }, [
        h('button', { class: 'pbtn warm', type: 'button', text: 'Export my save', onclick: exportSave }),
        h('button', { class: 'pbtn', type: 'button', text: 'Settings', onclick: openSettings }),
        h('button', { class: 'pbtn', type: 'button', text: 'Play again', onclick: function () { location.reload(); } })
      ])
    ]);
    setNext(false, 'Finished');
    if (isFn(ctx.save, 'flush')) { try { ctx.save.flush(); } catch (e) { } }
  }

  /* ------------------------------------------------------------------ *
   * modal: settings and keyboard help
   * ------------------------------------------------------------------ */
  var modalOpen = false;

  function openModal(title, children) {
    if (!E.modal) { return; }
    clear(E.modal);
    E.modal.appendChild(h('div', { class: 'mcard' }, [
      h('div', { class: 'mhead' }, [
        h('h2', { id: 'modal-title', text: title }),
        h('button', { class: 'abtn quiet', type: 'button', text: 'Close', onclick: closeModal })
      ])
    ].concat(children)));
    E.modal.hidden = false;
    modalOpen = true;
    try { E.modal.focus(); } catch (e) { }
  }

  function closeModal() {
    if (!E.modal) { return; }
    E.modal.hidden = true;
    clear(E.modal);
    modalOpen = false;
  }

  function toggleRow(label, sub, key) {
    var btn = h('button', {
      class: 'sw', type: 'button', 'aria-pressed': setting(key) ? 'true' : 'false',
      'aria-label': label,
      onclick: function () {
        setSetting(key, !setting(key));
        btn.setAttribute('aria-pressed', setting(key) ? 'true' : 'false');
      }
    });
    return h('div', { class: 'srow' }, [
      h('div', { class: 'lbl' }, [document.createTextNode(label), sub ? h('small', { text: sub }) : null]),
      btn
    ]);
  }

  function openSettings() {
    var cs = consentState(), av = speechAvailable(), fileIn;

    fileIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0];
      if (f) { importSaveFile(f); }
    });

    openModal('Settings', [
      h('div', { class: 'msec' }, [
        h('h3', { text: 'the text box' }),
        toggleRow('Stress marks', 'The acute over the stressed vowel: метро́', 'stressMarks'),
        toggleRow('Transliteration', 'Latin spelling under the Russian. On for Arc 0.', 'translit'),
        toggleRow('English', 'The translation line.', 'english')
      ]),
      h('div', { class: 'msec' }, [
        h('h3', { text: 'pace and sound' }),
        toggleRow('Play her voice automatically', 'Otherwise press Listen (R) on each line.', 'autoplay'),
        toggleRow('Slow take by default', 'The −30% recording, every time.', 'slowDefault'),
        toggleRow('Auto-advance', 'Move on by itself once she has finished speaking. Needs her voice on.', 'autoAdvance'),
        toggleRow('Reduce motion', 'No text reveal, no transitions.', 'reducedMotion')
      ]),
      h('div', { class: 'msec' }, [
        h('h3', { text: 'microphone' }),
        h('div', { class: 'srow' }, [
          h('div', { class: 'lbl' }, [
            document.createTextNode(cs === 'granted' ? 'Speech recognition is on.' : (cs === 'declined' ? 'Speech recognition is off.' : 'Speech recognition has not been decided.')),
            h('small', { text: av.asr ? 'Audio is sent to your browser vendor’s speech service when it is on.' : ('This browser offers no recogniser. ' + (str(av.asrReason) || '')) })
          ]),
          h('button', {
            class: 'abtn quiet', type: 'button',
            text: cs === 'granted' ? 'Turn it off' : 'Turn it on',
            onclick: function () { chooseConsent(cs === 'granted' ? 'declined' : 'granted', false); }
          })
        ]),
        h('div', { class: 'mbtns' }, [
          h('button', { class: 'abtn quiet', type: 'button', text: 'Read the disclosure again', onclick: openConsentModal })
        ])
      ]),
      h('div', { class: 'msec' }, [
        h('h3', { text: 'your save' }),
        h('p', { class: 'mnote', text: 'Progress is written to this browser after every step. Export is the real backup and the way to move between machines. Import replaces what is here — the current save is downloaded first.' }),
        h('div', { class: 'mbtns' }, [
          h('button', { class: 'abtn', type: 'button', text: 'Export', onclick: exportSave }),
          h('button', { class: 'abtn quiet', type: 'button', text: 'Import', onclick: function () { fileIn.click(); } }),
          fileIn
        ]),
        h('p', { class: 'mnote', id: 'import-note' })
      ]),
      h('div', { class: 'msec' }, [
        h('h3', { text: 'keyboard' }),
        keyboardRows()
      ])
    ]);
  }

  function refreshSettingsPanel() { if (modalOpen) { openSettings(); } }

  function keyboardRows() {
    var pairs = [
      ['Space  /  Enter', 'advance, or answer when a box is focused'],
      ['B', 'go back one step'],
      ['1 – 9', 'pick that choice'],
      ['R', 'replay the line'],
      ['S', 'replay it slowly'],
      ['T', 'transliteration on or off'],
      ['Esc', 'close this panel'],
      ['?', 'this list']
    ];
    var wrap = h('div', { class: 'krows' }), i;
    for (i = 0; i < pairs.length; i++) {
      wrap.appendChild(h('kbd', { text: pairs[i][0] }));
      wrap.appendChild(h('span', { text: pairs[i][1] }));
    }
    return wrap;
  }

  function openHelp() {
    openModal('Keys', [
      h('div', { class: 'msec' }, [keyboardRows()]),
      h('div', { class: 'msec' }, [
        h('h3', { text: 'the text box' }),
        h('p', { class: 'mnote', text: 'Click any Russian word to hear just that word. While she speaks, the word being said is lit.' })
      ])
    ]);
  }


  function updateJourney(node) {
    var nodes = ctx.session && ctx.session.nodes || [], index = nodes.indexOf(node);
    if (index < 0 && node && /s0\.r1/.test(node.id)) { index = nodes.findIndex(function (n) { return n.id === 's0.r1'; }); }
    var pct = node ? Math.max(0, Math.round(index / Math.max(1, nodes.length - 1) * 100)) : 100;
    var fill = byId('journey-fill'), label = byId('journey-label');
    if (fill) { fill.style.width = pct + '%'; fill.parentNode.setAttribute('aria-valuenow', String(pct)); }
    var id = node && node.id || '';
    var phase = index < 8 ? 'Meet Anya · start in English' : index < 18 ? 'Discover the sounds' : index < 38 ? 'Build your first words' : index < 44 ? 'Read the café menu' : 'Bring it all together';
    if (label) { label.textContent = phase; }
    if (E.stage) { E.stage.setAttribute('data-node-type', node ? node.type : 'end'); }
  }

  function learningWord(word) {
    return h('div', { class: 'learning-word' }, [
      h('span', { class: 'word-picture', 'aria-hidden': 'true', text: word[3] || '✦' }),
      h('div', { class: 'word-content' }, [h('span', { class: 'word-meaning', text: word[2] }), h('strong', { lang: 'ru', text: word[0] }), h('span', { class: 'word-sound', text: word[1] })]),
      h('button', { type: 'button', class: 'word-listen', text: '♪', 'aria-label': 'Hear ' + word[2], onclick: function () {
        if (V.ex) { V.assisted = true; }
        markInterfered(); playClip('word:' + word[0], false, word[0]);
      } })
    ]);
  }

  function renderLesson(lesson) {
    var body = [h('p', { class: 'plabel', text: 'LEARN FIRST · TAKE YOUR TIME' }), h('h2', { class: 'ptitle', text: lesson.title })];
    if (lesson.kind === 'welcome') {
      body.push(h('div', { class: 'welcome-steps' }, [
        h('div', {}, [h('b', { text: '01' }), h('span', { text: 'Learn one sound' })]),
        h('div', {}, [h('b', { text: '02' }), h('span', { text: 'See it in a word' })]),
        h('div', {}, [h('b', { text: '03' }), h('span', { text: 'Try with a little help' })])
      ]));
    }
    if (lesson.pairs) { body.push(h('div', { class: 'alphabet-pairs' }, lesson.pairs.map(function (p) { return h('div', {}, [h('strong', { lang: 'ru', text: p[0] }), h('span', { text: p[1] })]); }))); }
    if (lesson.words) { body.push(h('div', { class: 'learning-words' }, lesson.words.map(learningWord))); }
    if (lesson.note) { body.push(h('p', { class: 'lesson-note', text: lesson.note })); }
    showPanel(body);
    if (E.panel) { E.panel.classList.add('lesson-panel'); }
  }

  function openNotebook() {
    if (V.ex && !V.answered) { V.assisted = true; }
    var words = [], seen = {}, nodes = ctx.session && ctx.session.nodes || [];
    var at = nodes.indexOf(V.node);
    if (at < 0) { at = nodes.findIndex(function (n) { return n.id === 's0.r1'; }); }
    nodes.slice(0, Math.max(0,at + 1)).forEach(function (node) {
      if (node.lesson && node.lesson.words) { node.lesson.words.forEach(function (word) { if (!seen[word[0]]) { words.push(learningWord(word)); seen[word[0]] = true; } }); }
    });
    openModal('Your pocket notebook', [
      h('p', { class: 'mnote', text: V.ex && !V.answered ? 'Use any reminder you need. This attempt will count as supported practice.' : 'A place for the sounds and words you have met.' }),
      h('div', { class: 'notebook-alphabet', text: 'А ah · К k · М m · О o · Т t · Е ye / e · Р r · С s · Н n' }),
      words.length ? h('div', { class: 'learning-words' }, words) : h('p', { class: 'mnote', text: 'Your first words will appear here as you learn them.' })
    ]);
  }

  /* ------------------------------------------------------------------ *
   * export / import
   * ------------------------------------------------------------------ */
  function exportSave() {
    var blob = null, name = 'session-zero-save.json', text = '';
    try {
      if (isFn(ctx.save, 'exportBlob') && ctx.state) {
        blob = ctx.save.exportBlob(ctx.state);
        if (blob) { name = str(blob.filename) || name; text = str(blob.json); }
      }
      if (!text && ctx.state) { text = JSON.stringify(ctx.state, null, 2); }
    } catch (e) {
      banner('storage', 'Could not build the export file: ' + (e.message || e));
      return;
    }
    if (!text) { banner('storage', 'There is nothing to export yet.'); return; }
    downloadText(name, text);
  }

  function downloadText(name, text) {
    var b, url, a;
    try {
      b = new Blob([text], { type: 'application/json' });
      url = URL.createObjectURL(b);
      a = h('a', { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      window.setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (e) { }
        if (a.parentNode) { a.parentNode.removeChild(a); }
      }, 500);
    } catch (e2) {
      banner('storage', 'This browser refused the download. Copy the save out of localStorage by hand if you need it.');
    }
  }

  function importSaveFile(file) {
    var reader = new FileReader(), note = byId('import-note');
    reader.onload = function () {
      var res;
      if (!isFn(ctx.save, 'importJson')) { if (note) { note.textContent = 'This build cannot import.'; } return; }
      try { res = ctx.save.importJson(String(reader.result)); }
      catch (e) { res = { ok: false, error: e && e.message ? e.message : str(e) }; }
      if (!res || !res.ok) {
        if (note) { note.className = 'mnote bad'; note.textContent = 'Not imported: ' + (res && res.error ? str(res.error) : 'the file did not validate.'); }
        return;
      }
      /* audit §5: never merge; the current save is downloaded first, then replaced */
      exportSave();
      try {
        ctx.save.write(res.state);
        if (isFn(ctx.save, 'flush')) { ctx.save.flush(); }
      } catch (e2) {
        if (note) { note.className = 'mnote bad'; note.textContent = 'The imported save could not be written: ' + (e2.message || e2); }
        return;
      }
      location.reload();
    };
    reader.onerror = function () {
      if (note) { note.className = 'mnote bad'; note.textContent = 'The file could not be read.'; }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * keyboard — full operation without a mouse
   * Physical keys are read from e.code where possible, so R / S / T still
   * work with a Russian keyboard layout active (where they type к / ы / е).
   * ------------------------------------------------------------------ */
  function wireKeyboard() {
    document.addEventListener('keydown', onKey, false);
  }

  function onKey(e) {
    var t = e.target, tag = t && t.tagName ? t.tagName.toUpperCase() : '';
    var typing = (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable));
    var code = e.code || '';
    var k = e.key || '';
    var n;

    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) { return; }

    if (k === 'Escape') {
      if (modalOpen) { e.preventDefault(); closeModal(); }
      return;
    }
    /* while the learner is typing Russian, only Enter is ours */
    if (typing) { return; }

    if (tag === 'BUTTON' && (k === ' ' || k === 'Enter' || code === 'Space' || code === 'Enter')) { return; }

    if (k === '?' ) { e.preventDefault(); openHelp(); return; }

    if (code === 'Space' || k === ' ' || k === 'Spacebar' || code === 'Enter' || k === 'Enter') {
      e.preventDefault();
      primary();
      return;
    }
    if (code === 'KeyR' || k === 'r' || k === 'R') { e.preventDefault(); replay(false); return; }
    if (code === 'KeyS' || k === 's' || k === 'S') { e.preventDefault(); replay(true); return; }
    if (code === 'KeyT' || k === 't' || k === 'T') { e.preventDefault(); setSetting('translit', !setting('translit')); return; }
    if (code === 'KeyB' || k === 'b' || k === 'B') {
      e.preventDefault();
      if (!modalOpen && !(E.title && !E.title.hidden)) { goBack(); }
      return;
    }

    n = -1;
    if (/^Digit[1-9]$/.test(code)) { n = parseInt(code.slice(5), 10); }
    else if (/^Numpad[1-9]$/.test(code)) { n = parseInt(code.slice(6), 10); }
    else if (/^[1-9]$/.test(k)) { n = parseInt(k, 10); }
    if (n > 0) {
      e.preventDefault();
      chooseByNumber(n);
    }
  }

  /* Space / Enter: close a modal, start the game, submit a typed answer,
     otherwise advance — but never skip past an unanswered exercise. */
  function primary() {
    var host = V.answerHost, input;
    if (modalOpen) { closeModal(); return; }
    if (E.title && !E.title.hidden) { ui.begin(); return; }
    if (V.ex && !V.answered) {
      input = host ? host.querySelector('.ansin') : null;
      if (input) {
        if (str(input.value).replace(/\s+/g, '')) { submitTyped(input); }
        else { try { input.focus(); } catch (e) { } }
        return;
      }
      if (host && host.querySelector('.choice')) { return; }   /* a choice must be chosen */
    }
    if (E.btnNext && !E.btnNext.disabled) { advance(); }
  }

  function chooseByNumber(n) {
    var host = V.answerHost, picks;
    if (modalOpen || (E.title && !E.title.hidden)) { return; }
    if (E.panel && !E.panel.hidden) {
      picks = E.panel.querySelectorAll('.equal .pick');
      if (picks.length && n <= picks.length) { picks[n - 1].click(); return; }
    }
    if (!host) { return; }
    picks = host.querySelectorAll('.choice');
    if (picks.length && n <= picks.length && !V.answered) { pickChoice(n - 1); }
  }

}());
