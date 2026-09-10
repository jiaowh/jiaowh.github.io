/* =========================================================================
   Boot. Loads the save, loads the audio manifest, starts the engine,
   mounts the UI. Nothing else lives here.

   Order matters in two places:
     1. RU.save.onError is registered BEFORE RU.save.load(), so a storage
        failure raised during the load is already visible in the banner.
     2. The audio manifest is fetched in parallel with everything else and
        only awaited by the title screen's Begin button, which is also the
        user gesture browsers require before any audio plays.
   ========================================================================= */
window.RU = window.RU || {};

(function () {
  'use strict';

  var MANIFEST_URL = 'audio/s0/manifest.json';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, false);
    } else {
      fn();
    }
  }

  function isFn(o, name) { return !!(o && typeof o[name] === 'function'); }

  function say(msg) {
    if (RU.ui && isFn(RU.ui, 'setStatus')) { RU.ui.setStatus(msg); }
  }

  function warn(msg) {
    if (RU.ui && isFn(RU.ui, 'warn')) { RU.ui.warn(msg); }
  }

  function hardError(kind, msg) {
    if (RU.ui && isFn(RU.ui, 'showError')) { RU.ui.showError({ kind: kind, message: msg }); }
  }

  /* Which of the contract's globals are actually here? A missing sibling
     module must degrade into a readable screen, never a blank page. */
  function missingModules() {
    var need = [
      ['RU.srs', RU.srs], ['RU.save', RU.save], ['RU.grade', RU.grade],
      ['RU.speech', RU.speech], ['RU.LEXICON', RU.LEXICON], ['RU.SESSION0', RU.SESSION0],
      ['RU.engine', RU.engine], ['RU.ui', RU.ui]
    ];
    var out = [], i;
    for (i = 0; i < need.length; i++) {
      if (!need[i][1]) { out.push(need[i][0]); }
    }
    return out;
  }

  function loadSave() {
    var res = null, state = null, warnings = [];

    if (!isFn(RU.save, 'load')) {
      return { state: null, warnings: ['RU.save.load is missing; nothing can be restored.'] };
    }
    try {
      res = RU.save.load();
    } catch (e) {
      hardError('corrupt', 'The saved game could not be read (' + (e && e.message ? e.message : String(e)) + '). Starting a fresh one.');
      res = null;
    }
    if (res && res.state) {
      state = res.state;
      if (res.warnings && res.warnings.length) { warnings = warnings.concat(res.warnings); }
    }
    if (!state && isFn(RU.save, 'fresh')) {
      try { state = RU.save.fresh(); } catch (e2) {
        hardError('corrupt', 'A new save could not be created: ' + (e2 && e2.message ? e2.message : String(e2)));
      }
    }

    /* Ordered content migrations (CONTRACT §2 save / audit §5). They run on
       load, and a migration failure must not cost the learner their save. */
    if (state && isFn(RU.save, 'migrate')) {
      try {
        var migrated = RU.save.migrate(state);
        if (migrated) { state = migrated; }
      } catch (e3) {
        warnings.push('A save migration did not finish: ' + (e3 && e3.message ? e3.message : String(e3)));
      }
    }

    return { state: state, warnings: warnings };
  }

  function loadManifest() {
    var p;
    if (!isFn(RU.speech, 'load')) {
      return Promise.resolve({ ok: false, reason: 'RU.speech.load is missing' });
    }
    try {
      p = RU.speech.load(MANIFEST_URL);
    } catch (e) {
      return Promise.resolve({ ok: false, reason: e && e.message ? e.message : String(e) });
    }
    if (!p || typeof p.then !== 'function') { return Promise.resolve({ ok: true }); }
    return p.then(
      function () { return { ok: true }; },
      function (err) { return { ok: false, reason: err && err.message ? err.message : String(err) }; }
    );
  }

  function contentVersionCheck(state, session) {
    var want = session && session.contentVersion;
    var have = state && state.contentVersion;
    if (want && have && want !== have) {
      warn('This save was written for content version ' + have + '; the session on disk is ' + want + '. Anything that moved may replay.');
    }
  }

  function boot() {
    var missing = missingModules(), loaded, state, engine, manifestReady, session, resumed;

    /* the banner must be wired before anything touches storage */
    if (RU.save && isFn(RU.save, 'onError')) {
      try {
        RU.save.onError(function (e) {
          if (RU.ui && isFn(RU.ui, 'showError')) { RU.ui.showError(e); }
        });
      } catch (e) { /* a save.js without callbacks still plays from memory */ }
    }

    if (missing.length) {
      hardError('boot', 'These parts of the game did not load: ' + missing.join(', ') + '. Reload, and if it persists the files are missing from the folder.');
      if (RU.ui && isFn(RU.ui, 'mount')) {
        /* mount anyway so the banner, settings and export still work */
        try { RU.ui.mount({ state: null, save: RU.save, speech: RU.speech, session: RU.SESSION0 }); } catch (e2) { }
      }
      say('cannot start');
      var startBtn = document.getElementById('btn-start');
      if (startBtn) { startBtn.disabled = true; }
      return;
    }

    session = RU.SESSION0;
    loaded = loadSave();
    state = loaded.state;
    contentVersionCheck(state, session);

    /* Read BEFORE the engine starts. engine.start() commits the opening node
       to state.position and saves it, so a title screen that asks the state
       afterwards thinks every first-time player is resuming and offers them
       "Continue" and "Start over". */
    resumed = !!(state && state.position && state.position.nodeId);

    manifestReady = loadManifest().then(function (r) {
      if (r && r.ok) { say('voice ready'); }
      else { say('no audio manifest — the browser voice will read her lines'); }
      return r;
    });

    try {
      engine = RU.engine.start(session, state, { newItemCap: 24 });
    } catch (e3) {
      hardError('boot', 'The engine refused to start: ' + (e3 && e3.message ? e3.message : String(e3)));
      engine = null;
    }

    RU.ui.mount({
      engine: engine,
      state: state,
      save: RU.save,
      speech: RU.speech,
      session: session,
      lexicon: RU.LEXICON,
      ready: manifestReady,
      resumed: resumed,
      warnings: loaded.warnings
    });

    if (!engine) {
      RU.ui.fatal('Session Zero could not start.', 'RU.engine.start threw. Your save is untouched — export it before reloading.');
      say('engine failed');
    }

    /* The engine writes after every step (CONTRACT §2), so this is only a
       belt-and-braces flush of a debounced write, never the primary path. */
    window.addEventListener('pagehide', flush, false);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { flush(); } }, false);

    /* a handle for playtesting Session Zero from the console; nothing reads it */
    RU.app = { engine: engine, state: state, session: session };
  }

  function flush() {
    if (isFn(RU.save, 'flush')) { try { RU.save.flush(); } catch (e) { } }
  }

  ready(boot);
}());
