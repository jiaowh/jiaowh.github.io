/* =============================================================================
 * russian/js/speech.js  ->  window.RU.speech
 * Session Zero: audio playback, baked word highlighting, and the speech-input
 * wrapper with its consent gate.
 *
 * READ THIS BEFORE CHANGING THE MICROPHONE CODE
 * ---------------------------------------------
 * The Web Speech API has two halves and they are not alike.
 *
 *   speechSynthesis (playback)  runs on the device. Fine, boring, always on.
 *   SpeechRecognition (input)   DOES NOT run on the device. The browser records
 *                               your microphone and ships the audio to its
 *                               vendor's speech service - Google's for Chrome,
 *                               Microsoft's for Edge, Apple's for Safari - and
 *                               gets text back.
 *
 * So: audio leaves the machine when the microphone is on. This page has no
 * backend of its own and nothing reaches the author, but "nothing leaves the
 * browser" would be a lie and this module must never imply it. (PLAN_AUDIT
 * section 7 and section 14 defect #3: revision 1 claimed exactly that and it
 * was factually wrong.)
 *
 * Consequences, all enforced below rather than merely documented:
 *   - Recognition is OFF by default. consentState() starts at "unset".
 *   - listen() THROWS unless consentState() === "granted". It is a gate, not a
 *     nicety, and the thrown message says so.
 *   - Revoking consent while the microphone is live aborts it on the spot.
 *   - This module stores NO audio. Ever. Only the returned transcript string is
 *     handed to the caller; nothing else is retained here.
 *   - Support is decided by feature detection of the constructor, NEVER by
 *     reading navigator.userAgent.
 *
 * The typed path is a first-class equal, not a fallback for the unlucky. A
 * typed answer always advances the story and always scores the typed-production
 * card; the microphone only ever adds automated checking of spoken answers on a
 * small set of authored targets. A learner who never enables it completes the
 * whole course. The disclosure wording in RU.speech.DISCLOSURE presents both
 * choices as equals and is the single canonical copy of that wording.
 *
 * WORD HIGHLIGHTING IS BAKED, AND THAT IS A DESIGN WIN
 * ----------------------------------------------------
 * Word timings come from the build-time manifest (tools/gen_audio.py takes them
 * from edge-tts word-boundary metadata). We never ask the browser to tell us
 * where a word starts. That means karaoke highlighting and click-a-word replay
 * work identically in every browser, including ones with no speech support at
 * all, and they keep working offline. The runtime job is only to read
 * audio.currentTime against a table we already have.
 *
 * ES2019, no modules, no build step, no network calls beyond fetching our own
 * static manifest and mp3 files. Target Chrome/Edge; degrade elsewhere, never
 * hard-fail.
 * ============================================================================= */

window.RU = window.RU || {};

(function () {
  'use strict';

  /* ---------------------------------------------------------------------------
   * Small shims and helpers
   * ------------------------------------------------------------------------- */

  var raf = (window.requestAnimationFrame || function (fn) {
    // Degradation path only: a 40ms interval is worse than rAF but still not a
    // drifting setTimeout chain, because every tick re-reads audio.currentTime.
    return window.setTimeout(function () { fn(now()); }, 40);
  }).bind(window);

  var caf = (window.cancelAnimationFrame || window.clearTimeout).bind(window);

  function now() {
    return (window.performance && window.performance.now)
      ? window.performance.now()
      : Date.now();
  }

  function noop() {}

  // Callbacks come from UI code. A throw inside one must never kill the audio
  // loop or leave the recogniser running, so every call site is wrapped.
  function safe(fn) {
    return function () {
      if (typeof fn !== 'function') return;
      try {
        fn.apply(null, arguments);
      } catch (e) {
        if (window.console && console.error) console.error('[RU.speech] callback threw:', e);
      }
    };
  }

  // U+0301 COMBINING ACUTE ACCENT marks stress in our authored text. Baked mp3
  // playback does not care, but speechSynthesis engines mispronounce or spell
  // out combining marks, so the fallback path strips them.
  var COMBINING_ACUTE = new RegExp('\u0301', 'g');

  function stripStress(s) {
    return String(s == null ? '' : s).replace(COMBINING_ACUTE, '');
  }

  function isArray(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
  }

  // Resolve "s0.l3.mp3" against the directory of "audio/s0/manifest.json".
  // Kept as plain string work so it behaves the same on http(s):// and file://,
  // where the URL constructor with a relative base is unreliable.
  function joinPath(baseDir, file) {
    if (!file) return null;
    if (/^([a-z]+:)?\/\//i.test(file) || file.charAt(0) === '/') return file;
    if (!baseDir) return file;
    return baseDir.replace(/\/+$/, '') + '/' + file.replace(/^\/+/, '');
  }

  function dirOf(url) {
    var s = String(url || '');
    var q = s.indexOf('?');
    if (q >= 0) s = s.slice(0, q);
    var h = s.indexOf('#');
    if (h >= 0) s = s.slice(0, h);
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(0, i) : '';
  }

  /* ---------------------------------------------------------------------------
   * Manifest state (CONTRACT 1.4)
   *
   *   { version, voice, clips: { "<key>": {
   *       file, slow, text, dur, words:[{t,d,w}, ...] } } }
   * ------------------------------------------------------------------------- */

  var manifest = null;        // parsed manifest object, or null
  var manifestBase = '';      // directory the clip filenames resolve against
  var manifestUrlLoaded = null;
  var manifestPromise = null; // cached, so load() is idempotent per URL
  var manifestWarnings = [];

  // Fetch JSON without hard-failing. XHR fallback exists because a `fetch` of a
  // file:// URL is rejected outright by Chrome while XHR sometimes still works
  // when the page was opened with --allow-file-access-from-files.
  function fetchJson(url) {
    return new Promise(function (resolve, reject) {
      if (typeof window.fetch === 'function') {
        window.fetch(url, { credentials: 'same-origin' }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        }).then(resolve, function (err) {
          xhrJson(url, resolve, reject, err);
        });
        return;
      }
      xhrJson(url, resolve, reject, null);
    });
  }

  function xhrJson(url, resolve, reject, priorErr) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onload = function () {
        // status 0 is what a successful file:// XHR reports.
        if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error('HTTP ' + xhr.status));
        }
      };
      xhr.onerror = function () {
        reject(priorErr || new Error('network error'));
      };
      xhr.send(null);
    } catch (e) {
      reject(priorErr || e);
    }
  }

  /**
   * RU.speech.load(manifestUrl) -> Promise
   *
   * Resolves with { ok, clips, warnings } and NEVER rejects. A missing manifest
   * is a degraded mode (every clip falls through to speechSynthesis), not a
   * reason to stop the session, so callers can write
   *   RU.speech.load(url).then(startSession)
   * without a rejection path.
   *
   * INTERPRETATION: the contract only says "-> Promise". Resolving with a
   * result object rather than rejecting is the graceful-degradation reading.
   *
   * Also accepts an already-parsed manifest object, for the case where the
   * manifest is inlined into a data/*.js file to sidestep file:// fetch rules:
   *   RU.speech.load({ manifest: <obj>, base: "audio/s0" })
   */
  function load(manifestUrl) {
    if (manifestUrl && typeof manifestUrl === 'object') {
      var obj = manifestUrl.manifest || manifestUrl.clips ? (manifestUrl.manifest || manifestUrl) : null;
      manifest = obj;
      manifestBase = manifestUrl.base || 'audio/s0';
      manifestUrlLoaded = '(inline)';
      manifestWarnings = [];
      manifestPromise = Promise.resolve(result(true, null));
      return manifestPromise;
    }

    var url = String(manifestUrl || '');
    if (manifestPromise && manifestUrlLoaded === url) return manifestPromise;

    manifestUrlLoaded = url;
    manifestWarnings = [];

    manifestPromise = fetchJson(url).then(function (json) {
      if (!json || typeof json !== 'object' || !json.clips) {
        manifest = null;
        manifestWarnings.push('Manifest at ' + url + ' has no "clips" object.');
        return result(false, 'malformed-manifest');
      }
      manifest = json;
      manifestBase = dirOf(url);
      return result(true, null);
    }, function (err) {
      manifest = null;
      manifestBase = dirOf(url);
      manifestWarnings.push('Could not load the audio manifest (' + (err && err.message ? err.message : err) +
        '). Every line will use the browser voice instead.');
      if (window.console && console.warn) console.warn('[RU.speech] ' + manifestWarnings[0]);
      return result(false, 'manifest-unavailable');
    });

    return manifestPromise;

    function result(ok, reason) {
      return {
        ok: ok,
        reason: reason,
        clips: manifest && manifest.clips ? manifest.clips : {},
        voice: manifest ? manifest.voice : null,
        warnings: manifestWarnings.slice()
      };
    }
  }

  function ready() {
    return !!(manifest && manifest.clips);
  }

  function clipEntry(clipKey) {
    if (!manifest || !manifest.clips) return null;
    var c = manifest.clips[clipKey];
    return c || null;
  }

  /**
   * RU.speech.clip(clipKey) -> a shallow copy of the manifest entry, or null.
   *
   * ADDITION (not in the frozen list): the UI needs the words array up front to
   * render one clickable span per word before playback starts, otherwise
   * replayWord() has nothing to hang off. Returning a copy keeps the manifest
   * itself immutable from the UI's point of view.
   */
  function clip(clipKey) {
    var c = clipEntry(clipKey);
    if (!c) return null;
    return {
      key: clipKey,
      file: c.file || null,
      slow: c.slow || null,
      text: c.text || '',
      dur: typeof c.dur === 'number' ? c.dur : null,
      words: isArray(c.words) ? c.words.slice() : []
    };
  }

  /* ---------------------------------------------------------------------------
   * Prefetch
   * ------------------------------------------------------------------------- */

  var PREFETCH_MAX = 10;
  var prefetched = [];   // [{url, el}] - kept referenced so the load completes

  /**
   * RU.speech.prefetch(clipKeys, opts)
   *
   * Warms the HTTP cache for clips the engine expects to need next. We keep the
   * Audio elements alive only so the browser does not cancel the in-flight
   * request; play() always builds a fresh element and relies on the HTTP cache,
   * which avoids every bug that comes from re-using a half-torn-down element.
   */
  function prefetch(clipKeys, opts) {
    opts = opts || {};
    var keys = isArray(clipKeys) ? clipKeys : (clipKeys ? [clipKeys] : []);
    for (var i = 0; i < keys.length; i++) {
      var c = clipEntry(keys[i]);
      if (!c) continue;
      warm(joinPath(manifestBase, c.file));
      if (opts.slow && c.slow) warm(joinPath(manifestBase, c.slow));
    }
  }

  function warm(url) {
    if (!url) return;
    for (var i = 0; i < prefetched.length; i++) {
      if (prefetched[i].url === url) return;
    }
    try {
      var el = new Audio();
      el.preload = 'auto';
      el.src = url;
      // No play() call: this is a cache warm, never a sound.
      el.load();
      prefetched.push({ url: url, el: el });
      while (prefetched.length > PREFETCH_MAX) {
        var dead = prefetched.shift();
        try { dead.el.src = ''; } catch (e) { /* ignore */ }
      }
    } catch (e) { /* prefetch is best-effort by definition */ }
  }

  /* ---------------------------------------------------------------------------
   * Playback
   *
   * onEnd receives one object, always:
   *   { ok, fallback, spoke, stopped, reason, clipKey, slow }
   *     ok       playback ran to completion (or to the end of a word range)
   *     fallback true when speechSynthesis stood in for a missing/broken clip
   *     spoke    false when even the fallback had nothing to say
   *     stopped  true when handle.stop() cut it short
   *     reason   null, or one of: "missing-clip" | "no-file" | "load-error" |
   *              "stalled" | "blocked" | "no-text" | "no-tts" | "stopped" |
   *              "manifest-unavailable"
   * ------------------------------------------------------------------------- */

  var current = null;   // the one active playback handle; VN semantics are strictly one at a time
  var lastUtterance = null; // Chrome garbage-collects live utterances; holding a ref avoids it

  var LOAD_WATCHDOG_MS = 8000;

  function finishHandle(h, info) {
    if (h._done) return;
    h._done = true;
    if (h._raf != null) { caf(h._raf); h._raf = null; }
    if (h._watchdog != null) { clearTimeout(h._watchdog); h._watchdog = null; }
    if (h._audio) {
      try {
        h._audio.pause();
        h._audio.onerror = h._audio.onended = h._audio.onplaying = h._audio.onloadedmetadata = null;
      } catch (e) { /* ignore */ }
    }
    if (current === h) current = null;
    h.info = info;
    safe(h._onEnd)(info);
  }

  function stopAll() {
    if (current) {
      var h = current;
      // Mark stopped before tearing down so the end handlers do not double-report.
      h._stopped = true;
      if (h._utterance && window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      }
      finishHandle(h, endInfo(h, { ok: false, stopped: true, reason: 'stopped' }));
    }
  }

  function endInfo(h, over) {
    var base = {
      ok: false,
      fallback: !!h._fallback,
      spoke: h._spoke !== false,
      stopped: false,
      reason: null,
      clipKey: h.clipKey,
      slow: !!h.slow
    };
    for (var k in over) {
      if (Object.prototype.hasOwnProperty.call(over, k)) base[k] = over[k];
    }
    return base;
  }

  function newHandle(clipKey, opts) {
    var h = {
      clipKey: clipKey,
      slow: !!opts.slow,
      info: null,
      _done: false,
      _stopped: false,
      _fallback: false,
      _spoke: true,
      _audio: null,
      _utterance: null,
      _raf: null,
      _watchdog: null,
      _onEnd: opts.onEnd,
      _onWord: opts.onWord,
      stop: function () {
        if (h._done) return;
        h._stopped = true;
        if (h._utterance && window.speechSynthesis) {
          try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
        }
        finishHandle(h, endInfo(h, { ok: false, stopped: true, reason: 'stopped' }));
      },
      isPlaying: function () { return !h._done; }
    };
    return h;
  }

  /**
   * Find the word active at time t, given the previous index as a hint.
   *
   * Linear from the hint, so it is O(1) per frame in the normal forward case
   * and still correct after a seek (replayWord) or after the tab was hidden and
   * rAF stopped firing for several seconds. The gap between two words counts as
   * still belonging to the earlier word, which is what karaoke highlighting
   * should do: the highlight stays put through the pause rather than flickering.
   */
  function wordIndexAt(words, t, hint) {
    if (!words || !words.length) return -1;
    var i = (hint >= 0 && hint < words.length) ? hint : 0;
    while (i > 0 && t < words[i].t) i--;
    while (i + 1 < words.length && t >= words[i + 1].t) i++;
    if (t < words[i].t) return -1;   // before the first word starts
    return i;
  }

  /**
   * The rAF ticker. Deliberately NOT a setTimeout chain: a chain accumulates
   * scheduling error, keeps firing while the tab is hidden (where audio may be
   * throttled or paused), and desynchronises from the real playhead within a
   * couple of seconds. Every tick here re-reads audio.currentTime, so the
   * highlight is derived from the playhead rather than from elapsed wall time
   * and it self-corrects after any stall, seek or throttle.
   */
  function startTicker(h, state) {
    function tick() {
      if (h._done) return;
      var a = h._audio;
      if (!a) return;
      var t = a.currentTime;

      if (state.endAt != null && t >= state.endAt) {
        // Word-range playback (replayWord): stop exactly at the word boundary.
        try { a.pause(); } catch (e) { /* ignore */ }
        finishHandle(h, endInfo(h, { ok: true, reason: null }));
        return;
      }

      if (state.words && state.words.length && h._onWord) {
        var idx = wordIndexAt(state.words, t, state.lastIndex);
        if (idx >= 0 && idx !== state.lastIndex) {
          state.lastIndex = idx;
          safe(h._onWord)(idx + state.indexOffset, state.words[idx]);
        }
      }

      h._raf = raf(tick);
    }
    h._raf = raf(tick);
  }

  /**
   * RU.speech.play(clipKey, {slow, onWord, onEnd, text, from, to})
   *   -> handle with .stop()
   *
   * onWord(index, wordObj) is driven by the baked manifest timings.
   * `text` is optional and only used if we have to fall back (it lets the
   * caller hand us the node's `stressed` string when the clip is not in the
   * manifest at all). `from`/`to` are internal, used by replayWord.
   */
  function play(clipKey, opts) {
    opts = opts || {};
    stopAll();   // one clip at a time; a new line always cuts the previous one

    var h = newHandle(clipKey, opts);
    current = h;

    var c = clipEntry(clipKey);

    if (!c) {
      // Not in the manifest (or no manifest at all). Speak it rather than
      // leaving the learner in silence.
      var reason = manifest ? 'missing-clip' : 'manifest-unavailable';
      speakFallback(h, opts.text || '', reason, null);
      return h;
    }

    var wantSlow = !!opts.slow && !!c.slow;
    var file = wantSlow ? c.slow : c.file;
    if (!file) {
      speakFallback(h, c.text || opts.text || '', 'no-file', c);
      return h;
    }

    var url = joinPath(manifestBase, file);
    var words = isArray(c.words) ? c.words : [];

    var state = {
      words: words,
      lastIndex: -1,
      indexOffset: 0,
      endAt: (typeof opts.to === 'number') ? opts.to : null
    };

    var a;
    try {
      a = new Audio();
    } catch (e) {
      speakFallback(h, c.text || opts.text || '', 'load-error', c);
      return h;
    }
    h._audio = a;
    a.preload = 'auto';

    // If the file 404s, is the wrong codec, or the element errors for any other
    // reason, we do not stop the session: we speak the line instead.
    a.onerror = function () {
      if (h._done) return;
      h._audio = null;
      try { a.onerror = a.onended = a.onplaying = a.onloadedmetadata = null; } catch (e2) { /* ignore */ }
      if (h._raf != null) { caf(h._raf); h._raf = null; }
      speakFallback(h, c.text || opts.text || '', 'load-error', c);
    };

    a.onended = function () {
      if (h._done) return;
      finishHandle(h, endInfo(h, { ok: true, reason: null }));
    };

    a.onloadedmetadata = function () {
      if (h._done) return;
      if (typeof opts.from === 'number') {
        try { a.currentTime = opts.from; } catch (e2) { /* ignore */ }
      }
      // The manifest bakes ONE words array, timed against the normal take, but
      // the slow take is a separate render with a different duration. Rather
      // than drop highlighting for slow playback we rescale the timings by the
      // duration ratio. edge-tts --rate=-30% is close to a uniform stretch, so
      // this tracks well enough for highlighting; it is an approximation and is
      // not used for anything that is graded. See the note returned to the
      // orchestrator: the manifest should really bake `slowWords`.
      if (wantSlow && words.length && isFinite(a.duration) && a.duration > 0) {
        var normal = (typeof c.dur === 'number' && c.dur > 0)
          ? c.dur
          : (words[words.length - 1].t + (words[words.length - 1].d || 0));
        if (normal > 0) {
          var scale = a.duration / normal;
          if (scale > 0.5 && scale < 3) {
            var scaled = [];
            for (var i = 0; i < words.length; i++) {
              scaled.push({
                t: words[i].t * scale,
                d: (words[i].d || 0) * scale,
                w: words[i].w,
                approx: true      // timings inferred, not baked
              });
            }
            state.words = scaled;
            if (state.endAt != null) state.endAt = state.endAt * scale;
          }
        }
      }
    };

    a.onplaying = function () {
      if (h._watchdog != null) { clearTimeout(h._watchdog); h._watchdog = null; }
    };

    // Never leave the learner staring at a line that makes no sound because the
    // network stalled halfway through the mp3.
    h._watchdog = setTimeout(function () {
      if (h._done) return;
      if (a.readyState >= 3 && !a.paused) return;   // it is actually going
      try { a.pause(); } catch (e2) { /* ignore */ }
      h._audio = null;
      speakFallback(h, c.text || opts.text || '', 'stalled', c);
    }, LOAD_WATCHDOG_MS);

    a.src = url;
    if (typeof opts.from === 'number' && a.readyState >= 1) {
      try { a.currentTime = opts.from; } catch (e) { /* ignore */ }
    }

    var p;
    try {
      p = a.play();
    } catch (e) {
      p = null;
    }
    if (p && typeof p.then === 'function') {
      p.then(null, function (err) {
        if (h._done) return;
        var name = err && err.name ? err.name : '';
        if (name === 'NotAllowedError') {
          // Autoplay policy: no user gesture yet. speechSynthesis is blocked by
          // the same policy, so falling back would be silence with extra steps.
          // Report it and let the UI show a "tap to play" affordance.
          if (h._watchdog != null) { clearTimeout(h._watchdog); h._watchdog = null; }
          finishHandle(h, endInfo(h, { ok: false, spoke: false, reason: 'blocked' }));
        } else {
          h._audio = null;
          speakFallback(h, c.text || opts.text || '', 'load-error', c);
        }
      });
    }

    if (h._onWord || state.endAt != null) startTicker(h, state);
    return h;
  }

  /**
   * RU.speech.replayWord(clipKey, wordIndex, opts) -> handle with .stop()
   *
   * Plays just that word's baked time range. Always uses the normal take: the
   * manifest's timings belong to it, and a word pulled out of the slow render
   * would need timings we do not have.
   */
  function replayWord(clipKey, wordIndex, opts) {
    opts = opts || {};
    var c = clipEntry(clipKey);
    var w = (c && isArray(c.words)) ? c.words[wordIndex] : null;

    if (!w) {
      // No baked timing for that index: speak the word on its own if we can
      // work out what it was, so a click still does something.
      var h = newHandle(clipKey, opts);
      stopAll();
      current = h;
      speakFallback(h, opts.text || '', 'missing-clip', c);
      return h;
    }

    var pad = 0.04;   // a hair of lead-in, so the onset is not clipped
    var from = Math.max(0, w.t - pad);
    var to = w.t + (w.d || 0.35) + pad;

    return play(clipKey, {
      slow: false,
      from: from,
      to: to,
      text: w.w,
      onEnd: opts.onEnd,
      // Highlight callbacks are pinned to the single word being replayed, so
      // the UI's index bookkeeping still lines up with the full-line rendering.
      onWord: opts.onWord ? function () { safe(opts.onWord)(wordIndex, w); } : null
    });
  }

  /* ---------------------------------------------------------------------------
   * speechSynthesis fallback
   *
   * A stand-in, and the UI is told so (fallback:true) precisely so it can say
   * "browser voice" instead of passing it off as Anya. The point is that a
   * missing or broken clip degrades to a worse voice, never to silence.
   * ------------------------------------------------------------------------- */

  var voicesWarmed = false;

  function warmVoices() {
    if (voicesWarmed) return;
    voicesWarmed = true;
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.getVoices();   // kicks off async population in Chrome
      if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', function () {
          try { window.speechSynthesis.getVoices(); } catch (e) { /* ignore */ }
        });
      }
    } catch (e) { /* ignore */ }
  }

  function pickRussianVoice() {
    if (!window.speechSynthesis || !window.speechSynthesis.getVoices) return null;
    var list;
    try { list = window.speechSynthesis.getVoices() || []; } catch (e) { return null; }
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var lang = String(v.lang || '').toLowerCase().replace('_', '-');
      if (lang === 'ru-ru' || lang.indexOf('ru') === 0) {
        // Prefer a network/natural voice when both exist; Edge exposes the
        // neural ones as remote (localService === false).
        if (!best) best = v;
        else if (best.localService && !v.localService) best = v;
      }
    }
    return best;
  }

  function speakFallback(h, text, reason, c) {
    h._fallback = true;

    var syn = window.speechSynthesis;
    var Utt = window.SpeechSynthesisUtterance;
    var say = stripStress(text || (c && c.text) || '').trim();

    if (!syn || !Utt) {
      h._spoke = false;
      finishHandle(h, endInfo(h, { ok: false, spoke: false, reason: 'no-tts' }));
      return;
    }
    if (!say) {
      // Nothing to speak. Still reported as a fallback so the UI can show the
      // line as text-only rather than pretending audio played.
      h._spoke = false;
      finishHandle(h, endInfo(h, { ok: false, spoke: false, reason: 'no-text' }));
      return;
    }

    warmVoices();

    var u;
    try {
      u = new Utt(say);
    } catch (e) {
      h._spoke = false;
      finishHandle(h, endInfo(h, { ok: false, spoke: false, reason: 'no-tts' }));
      return;
    }

    u.lang = 'ru-RU';
    var v = pickRussianVoice();
    if (v) u.voice = v;
    u.rate = h.slow ? 0.65 : 0.95;
    u.pitch = 1;

    // Word highlighting still works here on browsers that fire `boundary`
    // (Chrome/Edge do). We map the utterance charIndex onto tokens of the same
    // string; where the token count matches the manifest's baked words we hand
    // back the baked word objects so the UI's indices stay consistent.
    var tokens = tokenise(say);
    var bakedWords = (c && isArray(c.words)) ? c.words : null;
    var useBaked = !!(bakedWords && bakedWords.length === tokens.length);

    if (h._onWord && typeof u.addEventListener === 'function') {
      u.addEventListener('boundary', function (ev) {
        if (h._done) return;
        if (ev.name && ev.name !== 'word') return;
        var ci = typeof ev.charIndex === 'number' ? ev.charIndex : -1;
        if (ci < 0) return;
        var idx = tokenIndexAtChar(tokens, ci);
        if (idx < 0) return;
        safe(h._onWord)(idx, useBaked ? bakedWords[idx] : { t: null, d: null, w: tokens[idx].w, approx: true });
      });
    }

    u.onend = function () {
      if (h._done) return;
      finishHandle(h, endInfo(h, { ok: true, reason: reason }));
    };
    u.onerror = function () {
      if (h._done) return;
      h._spoke = false;
      finishHandle(h, endInfo(h, { ok: false, spoke: false, reason: 'no-tts' }));
    };

    h._utterance = u;
    lastUtterance = u;   // see the declaration: keeps Chrome from collecting it mid-speech

    try {
      syn.cancel();      // clear anything queued from a previous line
      syn.speak(u);
    } catch (e) {
      h._spoke = false;
      finishHandle(h, endInfo(h, { ok: false, spoke: false, reason: 'no-tts' }));
    }
  }

  function tokenise(s) {
    var out = [];
    var re = /\S+/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      out.push({ w: m[0], start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function tokenIndexAtChar(tokens, ci) {
    for (var i = 0; i < tokens.length; i++) {
      if (ci < tokens[i].end) return i;
    }
    return tokens.length ? tokens.length - 1 : -1;
  }

  /* ---------------------------------------------------------------------------
   * Capability detection
   * ------------------------------------------------------------------------- */

  function recognitionCtor() {
    // Feature detection of the constructor. This is the ONLY thing that decides
    // available().asr. navigator.userAgent is never read anywhere in this file.
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  /**
   * RU.speech.available() -> { tts, asr, asrReason, asrIsRemote }
   *
   * asrReason is plain English, aimed at the learner, and is only non-empty
   * when asr is false.
   */
  function available() {
    var tts = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
    var SR = recognitionCtor();

    var asr = !!SR;
    var reason = '';

    if (!SR) {
      // Engine hint used ONLY to word the message. It is a Gecko-only DOM
      // property, not a user-agent string, and it never affects the `asr`
      // boolean above - that is decided purely by the constructor check.
      var geckoish = ('mozInnerScreenX' in window);
      reason = geckoish
        ? 'Firefox keeps speech recognition behind a flag (dom.webspeech.recognition.enable) and ships it switched off, so this browser has none available. Typing works exactly as well.'
        : 'This browser has no speech recognition. Chrome and Edge do, and Safari has it from 14.1 on. Typing works exactly as well.';
    } else if (window.isSecureContext === false) {
      // Chrome will not open a microphone on an insecure origin. Better to say
      // so now than to fail later inside listen() with "not-allowed".
      asr = false;
      reason = 'Speech recognition needs a secure page. Open this over https:// (or from localhost) and the microphone option will appear.';
    }

    return {
      tts: tts,
      asr: asr,
      asrReason: reason,
      // Kept on the result object so no caller can render a mic UI without the
      // fact being right there next to the capability flag.
      asrIsRemote: true
    };
  }

  /* ---------------------------------------------------------------------------
   * Consent
   *
   * The truth lives in the save file (state.flags.micConsent, CONTRACT 1.5).
   * This module does not touch localStorage or RU.save directly - the engine
   * injects the accessors so there is exactly one owner of save state.
   * ------------------------------------------------------------------------- */

  var VALID_CONSENT = { unset: 1, granted: 1, declined: 1 };
  var localConsent = 'unset';     // used before the engine binds, and mirrored after
  var consentGet = null;
  var consentSet = null;

  /**
   * RU.speech.bindConsent(getter, setter)  or  bindConsent({get, set})
   *
   * INTERPRETATION: the contract says consentState() reads from save state "via
   * a setter the engine injects" but does not name the injection point. This is
   * that point. Called once by engine.start():
   *
   *   RU.speech.bindConsent(
   *     function () { return state.flags.micConsent; },
   *     function (v) { state.flags.micConsent = v; RU.save.write(state); });
   *
   * Until it is called, consentState() answers "unset" - which is the correct
   * default: no consent means no microphone.
   */
  function bindConsent(getter, setter) {
    if (getter && typeof getter === 'object') {
      setter = getter.set;
      getter = getter.get;
    }
    consentGet = typeof getter === 'function' ? getter : null;
    consentSet = typeof setter === 'function' ? setter : null;
    // Adopt whatever the save already holds, so a reload lands on the stored
    // choice rather than re-asking someone who already answered.
    if (consentGet) {
      var v = normaliseConsent(consentGet());
      localConsent = v;
      if (v !== 'granted') abortListening('consent-not-granted');
    }
    return consentState();
  }

  function normaliseConsent(v) {
    var s = String(v == null ? '' : v);
    return VALID_CONSENT[s] ? s : 'unset';
  }

  function consentState() {
    if (consentGet) {
      try {
        return normaliseConsent(consentGet());
      } catch (e) {
        return localConsent;
      }
    }
    return localConsent;
  }

  /**
   * RU.speech.setConsent("granted" | "declined" | "unset")
   *
   * Throws on anything else: a typo here would silently open or close the
   * microphone gate, which is not something to swallow.
   */
  function setConsent(v) {
    var s = String(v == null ? '' : v);
    if (!VALID_CONSENT[s]) {
      throw new TypeError('RU.speech.setConsent: expected "granted", "declined" or "unset", got ' + JSON.stringify(v));
    }
    localConsent = s;
    if (consentSet) {
      try {
        consentSet(s);
      } catch (e) {
        if (window.console && console.error) console.error('[RU.speech] consent setter threw:', e);
      }
    }
    // Revocation takes effect immediately, mid-sentence if need be. Consent
    // withdrawn is consent withdrawn.
    if (s !== 'granted') abortListening('consent-revoked');
    return s;
  }

  /* ---------------------------------------------------------------------------
   * The disclosure screen's canonical wording
   *
   * One copy, in one place, so it can be reviewed as a whole. Frozen so a UI
   * cannot quietly reword the part about where the audio goes.
   *
   * The two choices are presented as equals on purpose (PLAN_AUDIT sections 7
   * and 12, and CONTRACT section 3 beat 6: "keep it off" is not styled as the
   * lesser choice). Both button labels are positive, both are the same length
   * class, and neither is phrased as declining a gift.
   * ------------------------------------------------------------------------- */

  var DISCLOSURE = {
    version: 1,
    id: 'mic.disclosure.v1',

    title: 'About the microphone',

    body: [
      'Speaking is optional in this course. Every exercise can be answered by typing, and a typed answer always continues the story. Neither way is the real one.',

      'If you switch the microphone on, this page uses the speech recognition built into your browser. That part does not run on your computer: your browser records short clips while you speak and sends them to its vendor - Google for Chrome, Microsoft for Edge, Apple for Safari - which sends text back. This page has no server of its own, and nothing goes to whoever wrote it.',

      'The game keeps no audio. What gets written to your save, here in this browser, is the text the recogniser returned, whether it matched what the exercise expected, and how long you took.',

      'The microphone opens only while a speaking exercise is running, it closes itself when you stop talking, and there is a stop control whenever it is live.',

      'You can change this later in Settings, in either direction. Switching it off takes effect immediately.',

      'Switching it on gets you automatic checking on a small set of expected answers. Keeping it off costs you that and nothing else - you can still listen, repeat, record yourself and compare against Anya. Both buttons below lead all the way through the course.'
    ],

    enableLabel: 'Turn the microphone on',
    declineLabel: 'Keep the microphone off',

    // What Settings shows for each stored state. Same source of truth, same tone.
    status: {
      granted: 'Microphone on. Speaking exercises use the speech recognition built into your browser, which sends the audio to its vendor.',
      declined: 'Microphone off. Speaking exercises are answered by typing, or by recording yourself and comparing.',
      unset: 'Not chosen yet. The microphone stays off until you choose it.'
    }
  };

  if (Object.freeze) {
    Object.freeze(DISCLOSURE.body);
    Object.freeze(DISCLOSURE.status);
    Object.freeze(DISCLOSURE);
  }

  /* ---------------------------------------------------------------------------
   * Speech input
   *
   * NOTHING BUT THE TRANSCRIPT LEAVES THIS SECTION. No audio is captured,
   * copied or retained by this module: the browser owns the microphone stream,
   * we only ever receive result strings from it and pass them to the caller.
   * There is no MediaRecorder here and there must never be one added without
   * revisiting DISCLOSURE above.
   * ------------------------------------------------------------------------- */

  var activeListen = null;
  var LISTEN_GUARD_MS = 20000;   // hard ceiling in case onend never fires

  // Plain-English, non-blaming wording per error code. "The mic did not hear
  // you" is a fact about the microphone; "you were too quiet" is a verdict on
  // the learner, and this course does not do those.
  var ASR_MESSAGES = {
    'no-speech': 'Nothing came through the microphone. Say it again whenever you are ready, or type it instead.',
    'aborted': 'Listening stopped.',
    'audio-capture': 'No microphone was found. Check that one is connected, or type your answer.',
    'not-allowed': 'The browser is not letting this page use the microphone. You can allow it from the padlock in the address bar, or carry on by typing - typing is a complete path.',
    'service-not-allowed': 'The browser blocked its speech service for this page. Typing works and costs you nothing here.',
    'network': 'The browser could not reach its speech service. Recognition needs a connection because it happens on servers owned by the browser vendor, not on this machine. Type it for now.',
    'language-not-supported': 'This browser cannot recognise Russian. Typing works exactly as well.',
    'bad-grammar': 'The recogniser rejected its own settings - that is a bug on our side, not yours. Type the answer and carry on.'
  };

  function asrMessage(code) {
    return ASR_MESSAGES[code] || 'The microphone stopped unexpectedly. Type the answer and carry on.';
  }

  function abortListening(why) {
    if (!activeListen) return;
    var h = activeListen;
    activeListen = null;
    h._silent = (why === 'consent-revoked' || why === 'consent-not-granted');
    try {
      if (h._rec) h._rec.abort();
    } catch (e) { /* ignore */ }
    endListen(h, why || 'aborted');
  }

  function endListen(h, reason) {
    if (h._ended) return;
    h._ended = true;
    if (h._guard != null) { clearTimeout(h._guard); h._guard = null; }
    if (activeListen === h) activeListen = null;
    safe(h._onMicState)(false);
    safe(h._onEnd)({ reason: reason, gotFinal: !!h._gotFinal });
  }

  /**
   * RU.speech.listen({lang, onPartial, onFinal, onError, onStart, onMicState, onEnd})
   *   -> handle with .stop()
   *
   * THROWS if consentState() !== "granted". That is deliberate and load-bearing:
   * opening a microphone sends audio off the machine, so the gate is a hard
   * error rather than a silent no-op that a caller could fail to notice.
   *
   * Callback shapes:
   *   onPartial(text, {isFinal:false})
   *   onFinal(text, {isFinal:true, confidence, alternatives:[string]})
   *   onError({code, message, fatal})
   *   onStart()                 microphone is actually live
   *   onMicState(bool)          same signal, for a persistent indicator
   *   onEnd({reason, gotFinal}) recogniser finished, mic released
   */
  function listen(opts) {
    opts = opts || {};

    var state = consentState();
    if (state !== 'granted') {
      throw new Error(
        'RU.speech.listen() refused: microphone consent is "' + state + '", not "granted". ' +
        'This is a deliberate gate, not a bug. Speech recognition sends your microphone audio ' +
        'to servers owned by the browser vendor, so it stays off until the disclosure screen ' +
        '(RU.speech.DISCLOSURE) has been shown and RU.speech.setConsent("granted") called. ' +
        'The typed path needs no consent and is an equal path through the course.'
      );
    }

    var SR = recognitionCtor();
    if (!SR) {
      // Consent granted on a browser that later turns out to have no recogniser
      // (or an insecure origin). Report it through onError rather than throwing:
      // this one is not the caller's mistake.
      var cap = available();
      safe(opts.onError)({
        code: 'not-supported',
        message: cap.asrReason || 'This browser has no speech recognition. Typing works exactly as well.',
        fatal: true
      });
      return deadHandle();
    }

    if (activeListen) abortListening('superseded');

    var rec;
    try {
      rec = new SR();
    } catch (e) {
      safe(opts.onError)({
        code: 'not-supported',
        message: 'This browser refused to start speech recognition. Type the answer and carry on.',
        fatal: true
      });
      return deadHandle();
    }

    // Contract-mandated settings.
    rec.lang = opts.lang || 'ru-RU';
    rec.interimResults = true;    // the learner sees words appear while speaking
    rec.continuous = false;       // one utterance per exercise, then stop
    try { rec.maxAlternatives = 3; } catch (e) { /* not all builds allow it */ }

    var h = {
      _rec: rec,
      _ended: false,
      _gotFinal: false,
      _stopped: false,
      _silent: false,
      _guard: null,
      _onEnd: opts.onEnd,
      _onMicState: opts.onMicState,
      lang: rec.lang,
      stop: function () {
        // Graceful: lets the recogniser return whatever it has heard so far.
        if (h._ended) return;
        h._stopped = true;
        try { rec.stop(); } catch (e) { /* ignore */ }
      },
      abort: function () {
        // Immediate: drops the utterance and releases the microphone now.
        if (h._ended) return;
        h._stopped = true;
        try { rec.abort(); } catch (e) { /* ignore */ }
        endListen(h, 'aborted');
      },
      isListening: function () { return !h._ended; }
    };

    rec.onaudiostart = function () {
      // The microphone is genuinely open from here until onaudioend. This is
      // the signal the UI must use to show the live-mic indicator.
      safe(opts.onStart)();
      safe(opts.onMicState)(true);
    };

    rec.onaudioend = function () {
      safe(opts.onMicState)(false);
    };

    rec.onresult = function (ev) {
      if (h._ended) return;
      var interim = '';
      var finalText = '';
      var lastFinal = null;
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (!r || !r.length) continue;
        if (r.isFinal) {
          finalText += r[0].transcript;
          lastFinal = r;
        } else {
          interim += r[0].transcript;
        }
      }
      if (interim && opts.onPartial) {
        safe(opts.onPartial)(interim.replace(/\s+/g, ' ').trim(), { isFinal: false });
      }
      if (finalText) {
        h._gotFinal = true;
        var alts = [];
        if (lastFinal) {
          for (var j = 0; j < lastFinal.length && j < 5; j++) {
            var t = lastFinal[j] && lastFinal[j].transcript;
            if (t) alts.push(String(t).replace(/\s+/g, ' ').trim());
          }
        }
        // The transcript is the only thing that exists past this line. No audio
        // is held anywhere in this module.
        safe(opts.onFinal)(finalText.replace(/\s+/g, ' ').trim(), {
          isFinal: true,
          confidence: (lastFinal && lastFinal[0] && typeof lastFinal[0].confidence === 'number')
            ? lastFinal[0].confidence : null,
          alternatives: alts
        });
      }
    };

    rec.onerror = function (ev) {
      if (h._ended) return;
      var code = (ev && ev.error) ? String(ev.error) : 'unknown';
      // A stop() we asked for surfaces as "aborted"; that is not an error the
      // learner should be told about.
      if (code === 'aborted' && (h._stopped || h._silent)) return;
      if (h._silent) return;
      safe(opts.onError)({
        code: code,
        message: asrMessage(code),
        // no-speech and aborted are recoverable: the learner just tries again.
        fatal: (code === 'not-allowed' || code === 'service-not-allowed' ||
                code === 'audio-capture' || code === 'language-not-supported')
      });
    };

    rec.onend = function () {
      endListen(h, h._stopped ? 'stopped' : (h._gotFinal ? 'complete' : 'ended'));
    };

    h._guard = setTimeout(function () {
      // Some builds have hung with the microphone open. A ceiling means the
      // indicator can never be left on with nobody listening for it.
      if (h._ended) return;
      try { rec.abort(); } catch (e) { /* ignore */ }
      endListen(h, 'timeout');
    }, LISTEN_GUARD_MS);

    try {
      rec.start();
    } catch (e) {
      // Chrome throws InvalidStateError if start() is called while a previous
      // session is still winding down.
      if (h._guard != null) { clearTimeout(h._guard); h._guard = null; }
      safe(opts.onError)({
        code: 'start-failed',
        message: 'The microphone did not start. Give it a moment and try again, or type the answer.',
        fatal: false
      });
      endListen(h, 'start-failed');
      return h;
    }

    activeListen = h;
    return h;
  }

  function deadHandle() {
    return {
      stop: noop,
      abort: noop,
      isListening: function () { return false; }
    };
  }

  /* ---------------------------------------------------------------------------
   * Public surface
   * ------------------------------------------------------------------------- */

  RU.speech = {
    // Playback (CONTRACT section 2)
    load: load,
    play: play,
    replayWord: replayWord,

    // Playback extras
    prefetch: prefetch,        // required by the brief: warm the next clips
    stopAll: stopAll,          // ADDITION: engine calls this when a node advances
    clip: clip,                // ADDITION: UI needs the baked words to render them
    ready: ready,

    // Capability and consent (CONTRACT section 2)
    available: available,
    consentState: consentState,
    setConsent: setConsent,
    bindConsent: bindConsent,  // ADDITION: the injection point the contract implies

    // Speech input (CONTRACT section 2)
    listen: listen,

    // The one canonical disclosure wording
    DISCLOSURE: DISCLOSURE
  };

  // Populating the voice list is async in Chrome; asking early means the
  // fallback has a Russian voice ready the first time it is needed.
  warmVoices();

})();
