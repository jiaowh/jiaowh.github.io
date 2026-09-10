window.RU = window.RU || {};
/* =====================================================================
 * russian/js/save.js  --  RU.save
 * Persistence for Session Zero.  CONTRACT.md section 2 (RU.save) and
 * PLAN_AUDIT.md section 5 ("Persistence is a core requirement, so it gets
 * a real design, not 'autosave on close'").
 *
 * FAILURE MODES THIS MODULE IS DEFENDING AGAINST
 * ---------------------------------------------
 *  1. The tab, the process or the phone dies mid-session.  `beforeunload`
 *     and `unload` are not guaranteed to run (bfcache, task-killer, OOM,
 *     crash, "swipe away the app"), so nothing is ever deferred to close.
 *     Every completed interaction calls write(); the debounce ceiling is
 *     300 ms, so at most one interaction is ever in flight.
 *  2. A write interrupted part-way through, leaving one slot half-written
 *     or byte-truncated.  Two slots are written alternately and each
 *     carries a djb2 checksum, so a torn write can only ever damage the
 *     copy that is NOT currently the good one.
 *  3. localStorage quota exhausted (5-10 MB per origin, shared with every
 *     other thing this origin stores).  Detected by name AND by the legacy
 *     numeric DOMException codes 22 / 1014, then an emergency fold of the
 *     attempt log is tried once before giving up.  Play continues from
 *     memory and the UI is told to offer "download your save now".
 *  4. Private browsing / "block site data" / enterprise policy: reading or
 *     even *touching* window.localStorage can throw SecurityError, and
 *     Safari's private mode historically reported a zero-byte quota.  Every
 *     single access is wrapped; a failure downgrades to memory-only play
 *     and raises a banner, never an exception into the engine.
 *  5. localStorage missing entirely (very old / very locked-down engines).
 *  6. A save file that was hand-edited, truncated by a bad download, or
 *     concatenated with something else -- caught by parse + checksum +
 *     schema validation, in that order.
 *  7. A save written by a NEWER build of the game than the one running.
 *     Refused with a readable reason instead of being silently mangled.
 *  8. Unbounded growth: the attempt log is append-only by design, so it is
 *     capped at the most recent 5000 entries and older entries are folded
 *     into per-item aggregates rather than deleted.  A save that grows
 *     without bound eventually becomes failure mode 3.
 *  9. Content revision changing what a stable ID *means*.  Stable IDs are
 *     necessary but not sufficient (PLAN_AUDIT section 5 / section 10).
 *     Ordered migrations run on load: an alias map for renamed IDs, a hook
 *     that re-flags a changed node as unseen, and archiving -- never
 *     dropping -- the cards of deleted items.  Every migration is logged
 *     into the save itself.
 * 10. Clock skew (NTP jump, DST, a phone whose clock was wrong).  "Newest
 *     slot wins" is only sound if timestamps move forward, so savedAt is
 *     forced to be strictly greater than the newest value this session has
 *     seen or written.
 * 11. A UI error callback that throws.  Each callback is invoked inside its
 *     own try/catch so a broken banner cannot break the save path.
 * 12. Two tabs of the game open at once.  Honest answer: last writer wins.
 *     A `storage` event on our keys sets RU.save.multiTab so the UI can
 *     say so; the dual slots at least keep one older-but-good copy.
 * 13. SAFARI EVICTS ALL SCRIPT-WRITABLE STORAGE (localStorage, IndexedDB,
 *     service-worker caches) FROM A SITE THE USER HAS NOT INTERACTED WITH
 *     FOR 7 DAYS.  Chrome and Edge can also evict under storage pressure,
 *     and any browser's "clear browsing data" wipes us with no warning.
 *     Nothing in this file can prevent that.  THE EXPORTED JSON FILE IS
 *     THE REAL BACKUP -- exportBlob() is not a convenience feature, it is
 *     the durability story, and it is also the PC <-> phone sync path.
 *     The UI is expected to offer it periodically (audit section 5).
 *
 * Style: plain ES2019, no modules, no build step, Chrome/Edge target,
 * graceful degradation elsewhere, no network access of any kind.
 * ===================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
   * Constants
   * ------------------------------------------------------------- */

  var KEY_A = 'ru.save.v1.a';            /* CONTRACT section 2: fixed keys */
  var KEY_B = 'ru.save.v1.b';
  var PROBE_KEY = 'ru.save.v1.probe';

  var SCHEMA = 1;                        /* current save-schema number     */
  var CONTENT_VERSION = 's0.1';          /* current content version        */

  /* Every content version this build can *load*.  A save stamped with
   * anything else is refused by importJson() with a readable reason
   * rather than being loaded and silently misinterpreted. */
  var KNOWN_CONTENT_VERSIONS = ['s0.0', 's0.1'];

  var DEBOUNCE_MS = 300;                 /* audit section 5: ~300 ms       */
  var MAX_ATTEMPTS = 5000;               /* cap on the append-only log     */
  var EMERGENCY_ATTEMPTS = 1000;         /* fold to this on a quota error  */
  var ERROR_THROTTLE_MS = 5000;          /* repeat-suppression per kind    */
  var MAX_VALIDATION_ERRORS = 25;        /* keep validate() output usable  */
  var READBACK_LIMIT = 1024 * 1024;      /* verify writes up to 1 MB       */

  var MIC_CONSENT_VALUES = ['granted', 'declined', 'unset'];

  var SETTINGS_DEFAULTS = {
    translit: true,        /* Arc 0 only (audit section 12.6)              */
    stressMarks: true,
    autoplay: false,
    guided: true,
    slowDefault: false,
    reducedMotion: false   /* an override; the UI also honours the media query */
  };

  /* Top-level keys the schema requires.  Anything else found in a loaded
   * file is preserved untouched (forward compatibility) but never trusted. */
  var REQUIRED_KEYS = ['schema', 'contentVersion', 'savedAt', 'position',
                       'flags', 'memory', 'mastery', 'attempts', 'settings'];

  /* ---------------------------------------------------------------
   * Small type helpers (ES2019, no polyfills, no dependencies)
   * ------------------------------------------------------------- */

  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isObj(v) { return !!v && typeof v === 'object' && !isArr(v); }
  function isStr(v) { return typeof v === 'string'; }
  function isBool(v) { return typeof v === 'boolean'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isInt(v) { return isNum(v) && Math.floor(v) === v; }
  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function keysOf(o) { return isObj(o) ? Object.keys(o) : []; }
  function inList(list, v) {
    for (var i = 0; i < list.length; i++) { if (list[i] === v) return true; }
    return false;
  }

  function nowMs() { return Date.now(); }

  function pad2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }

  /* Human-readable local time for warning messages.  Never throws. */
  function whenText(ms) {
    if (!isNum(ms) || ms <= 0) return 'an unknown time';
    try {
      var d = new Date(ms);
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
             ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    } catch (e) { return String(ms); }
  }

  /* "about 2 minutes 24 seconds" -- used to tell the learner how much play
   * a fallback to the older slot may have cost them. */
  function durationText(ms) {
    if (!isNum(ms) || ms < 1000) return 'less than a second';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' second' + (s === 1 ? '' : 's');
    var m = Math.floor(s / 60), rs = s % 60;
    if (m < 60) return m + ' minute' + (m === 1 ? '' : 's') + (rs ? ' ' + rs + ' second' + (rs === 1 ? '' : 's') : '');
    var h = Math.floor(m / 60), rm = m % 60;
    return h + ' hour' + (h === 1 ? '' : 's') + (rm ? ' ' + rm + ' minute' + (rm === 1 ? '' : 's') : '');
  }

  /* ---------------------------------------------------------------
   * Checksum
   *
   * CONTRACT section 2: "Checksum: djb2 over JSON.stringify of the state
   * without checksum."  Implemented literally.
   *
   * Key-order note (this is the subtle part): JSON.stringify walks own
   * enumerable keys in insertion order, and JSON.parse rebuilds an object
   * whose key order is the order in the text.  So the sequence
   *   write:  stringify(state minus checksum) -> hash -> store full object
   *   load:   parse -> stringify(parsed minus checksum) -> hash
   * feeds byte-identical input to djb2 on both sides.  We therefore do NOT
   * need a canonical/sorted stringify, and deliberately do not use one,
   * because that would no longer be "JSON.stringify of the state".
   * ------------------------------------------------------------- */

  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      /* h * 33 + c, kept inside int32 by the bitwise or */
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16);
  }

  function serialiseForChecksum(state) {
    var copy = {};
    for (var k in state) {
      if (has(state, k) && k !== 'checksum') copy[k] = state[k];
    }
    return JSON.stringify(copy);
  }

  function checksumOf(state) {
    return djb2(serialiseForChecksum(state));
  }

  /* ---------------------------------------------------------------
   * Error plumbing
   *
   * CONTRACT: RU.save.onError(cb) with cb({kind, message}),
   * kind in "quota" | "security" | "corrupt".  Silent failure is
   * forbidden, so:
   *   - errors raised before any callback exists are QUEUED and delivered
   *     to the first subscriber (load() can fail before ui.js is wired);
   *   - the most recent error is always readable at RU.save.lastError;
   *   - a callback that throws cannot break the save path;
   *   - identical (kind + message) pairs are rate-limited to one every
   *     5 s so a failing write in a 300 ms loop cannot flood the UI, but
   *     the FIRST occurrence of anything always gets through.
   * ------------------------------------------------------------- */

  var errorCallbacks = [];
  var queuedErrors = [];
  var lastEmitted = {};      /* "kind|message" -> ms of last emission */

  function emitError(kind, message, detail) {
    var err = { kind: kind, message: message, detail: detail || null, at: nowMs() };
    api.lastError = err;

    var sig = kind + '|' + message;
    var t = nowMs();
    if (lastEmitted[sig] && (t - lastEmitted[sig]) < ERROR_THROTTLE_MS) return err;
    lastEmitted[sig] = t;

    if (errorCallbacks.length === 0) {
      /* Nobody is listening yet.  Keep it, do not drop it. */
      if (queuedErrors.length < 10) queuedErrors.push(err);
      logWarn(kind + ': ' + message);
      return err;
    }
    deliver(err);
    return err;
  }

  function deliver(err) {
    for (var i = 0; i < errorCallbacks.length; i++) {
      try {
        errorCallbacks[i](err);
      } catch (e) {
        /* A broken banner must never take persistence down with it. */
        logWarn('an onError callback threw: ' + (e && e.message));
      }
    }
  }

  function onError(cb) {
    if (typeof cb !== 'function') return function () {};
    errorCallbacks.push(cb);
    /* Flush anything that happened before the UI existed. */
    if (queuedErrors.length) {
      var backlog = queuedErrors.slice(0);
      queuedErrors.length = 0;
      for (var i = 0; i < backlog.length; i++) {
        try { cb(backlog[i]); } catch (e) { logWarn('an onError callback threw: ' + (e && e.message)); }
      }
    }
    return function off() {
      for (var j = errorCallbacks.length - 1; j >= 0; j--) {
        if (errorCallbacks[j] === cb) errorCallbacks.splice(j, 1);
      }
    };
  }

  function logWarn(msg) {
    try { if (window.console && console.warn) console.warn('[RU.save] ' + msg); } catch (e) {}
  }

  /* ---------------------------------------------------------------
   * Storage access layer -- every single touch is wrapped
   * ------------------------------------------------------------- */

  /* Quota detection.  The modern name is QuotaExceededError, but old and
   * odd engines only set the legacy numeric DOMException code, and Firefox
   * uses its own name and code.  Safari in private browsing used to report
   * a zero quota and throw here on every write. */
  function isQuotaError(e) {
    if (!e) return false;
    var name = e.name || '';
    if (name === 'QuotaExceededError') return true;
    if (name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;   /* Firefox        */
    if (e.code === 22) return true;                           /* legacy QUOTA_EXCEEDED_ERR */
    if (e.code === 1014) return true;                         /* legacy Firefox */
    if (e.number === -2147024882) return true;                /* old IE "out of memory" */
    return false;
  }

  /* Private mode with site data blocked, third-party-context iframes, and
   * enterprise policies all surface as SecurityError -- sometimes on the
   * property access itself, before any method is called. */
  function isSecurityError(e) {
    if (!e) return false;
    var name = e.name || '';
    if (name === 'SecurityError') return true;
    if (e.code === 18) return true;                           /* legacy SECURITY_ERR */
    /* Chrome throws a plain Error with this wording when site data is blocked. */
    if (/access is denied|denied/i.test(String(e.message || '')) &&
        /storage/i.test(String(e.message || ''))) return true;
    return false;
  }

  function classifyStorageError(e, what) {
    if (isQuotaError(e)) {
      return {
        kind: 'quota',
        message: 'The browser refused to store your progress: this site is out of storage space' +
                 (what ? ' (' + what + ')' : '') + '. Your progress is still here in memory, ' +
                 'but it will be lost if you close the tab. Export your save now.'
      };
    }
    if (isSecurityError(e)) {
      return {
        kind: 'security',
        message: 'This browser will not let the game store your progress' +
                 (what ? ' (' + what + ')' : '') + '. That usually means private browsing, ' +
                 'or site data is blocked for this site. You can keep playing, but nothing ' +
                 'will be saved unless you export it to a file.'
      };
    }
    return {
      kind: 'corrupt',
      message: 'Unexpected storage error' + (what ? ' (' + what + ')' : '') + ': ' +
               ((e && e.message) || String(e)) + '. Your progress is still here in memory. ' +
               'Export your save to be safe.'
    };
  }

  function reportStorageError(e, what) {
    var c = classifyStorageError(e, what);
    api.storageOk = false;
    return emitError(c.kind, c.message, { name: String((e && e.name) || ''), where: what });
  }

  /* Even reading the property can throw, so this is a function, not a
   * cached reference taken at load time. */
  function store() {
    try {
      var s = window.localStorage;
      if (!s) return null;
      return s;
    } catch (e) {
      reportStorageError(e, 'opening localStorage');
      return null;
    }
  }

  function rawGet(key) {
    var s = store();
    if (!s) return null;
    try {
      return s.getItem(key);
    } catch (e) {
      reportStorageError(e, 'reading ' + key);
      return null;
    }
  }

  /* Returns {ok:true} or {ok:false, error} -- never throws. */
  function rawSet(key, value) {
    var s = store();
    if (!s) {
      /* No storage object at all: same practical consequence as a blocked
       * one, so it is reported as a security failure rather than as an
       * unexplained 'corrupt', which would be a worse message. */
      var gone = new Error('localStorage is not available in this browser');
      gone.name = 'SecurityError';
      return { ok: false, error: gone };
    }
    try {
      s.setItem(key, value);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  function rawRemove(key) {
    var s = store();
    if (!s) return false;
    try { s.removeItem(key); return true; } catch (e) { return false; }
  }

  /* One-shot probe so the UI can tell the learner up front that this
   * browser will not persist anything.  Cached; never throws. */
  var storageProbe = null;
  function storageWritable() {
    if (storageProbe !== null) return storageProbe;
    var r = rawSet(PROBE_KEY, '1');
    if (r.ok) {
      rawRemove(PROBE_KEY);
      storageProbe = true;
      api.storageOk = true;
    } else {
      storageProbe = false;
      reportStorageError(r.error, 'testing whether saving works at all');
    }
    return storageProbe;
  }

  /* Cheap savedAt extraction from a slot we could not parse, so the
   * "which one was newer" message can still name a time. */
  function peekSavedAt(raw) {
    if (!isStr(raw)) return null;
    var m = /"savedAt"\s*:\s*(\d+)/.exec(raw);
    return m ? parseInt(m[1], 10) : null;
  }

  /* ---------------------------------------------------------------
   * fresh() -- a new empty state
   *
   * savedAt is 0 on purpose: a fresh state must never win a
   * newest-slot-wins comparison against anything real, and write() will
   * stamp it the first time it is persisted.
   *
   * The nine REQUIRED_KEYS are exactly CONTRACT section 1.5.  The five
   * fields after them (seen, masteryAggregates, archive, attemptsFolded,
   * migrations) are additive bookkeeping this module needs and section 1.5
   * does not list; they are optional everywhere, so a save without them
   * still validates and simply gains them on load.  See the note in
   * ensureShape() and the contract-defect list at the bottom of the file.
   * ------------------------------------------------------------- */

  function fresh() {
    return {
      schema: SCHEMA,
      contentVersion: CONTENT_VERSION,
      savedAt: 0,
      checksum: null,
      position: { nodeId: null, variantPicks: {} },
      flags: { name: null, micConsent: 'unset' },
      memory: {},
      mastery: {},
      attempts: [],
      settings: {
        translit: SETTINGS_DEFAULTS.translit,
        stressMarks: SETTINGS_DEFAULTS.stressMarks,
        autoplay: SETTINGS_DEFAULTS.autoplay,
        guided: SETTINGS_DEFAULTS.guided,
        slowDefault: SETTINGS_DEFAULTS.slowDefault,
        reducedMotion: SETTINGS_DEFAULTS.reducedMotion
      },

      /* --- additive, optional --- */
      seen: {},                 /* nodeId -> ms of first view; the migration
                                 * hook that re-flags a changed node as
                                 * unseen deletes from here.               */
      masteryAggregates: {},    /* itemId -> folded attempt statistics      */
      archive: {                /* deleted-content cards, never dropped     */
        mastery: {},
        masteryAggregates: {}
      },
      attemptsFolded: 0,        /* how many attempts have been folded away  */
      migrations: []            /* audit trail written by migrate()         */
    };
  }

  /* Fill in the additive containers and any settings key an older save did
   * not have.  Two rules make this safe:
   *
   *   a) Nothing here ever copies a value out of another state object, so
   *      this is not the partial merge the plan forbids.
   *   b) A field that is PRESENT is never overwritten, and a missing
   *      REQUIRED field is never invented.  Repairing either would hide
   *      corruption from validate(), and hiding it would defeat the whole
   *      point of the dual slots: a slot whose "mastery" has been replaced
   *      by a string must be rejected so load() can fall back to the other
   *      copy, not quietly loaded with an empty mastery map.
   *
   * The five additive fields (seen, masteryAggregates, archive,
   * attemptsFolded, migrations) are the exception: save.js is their only
   * writer, so a wrong type there is this module's bug, not learner data,
   * and is simply reset. */
  function ensureShape(state) {
    if (!isObj(state)) return state;
    var i;

    /* Sub-fields of required containers, only when the container itself is
     * intact and the sub-field is absent. */
    if (isObj(state.position)) {
      if (!has(state.position, 'nodeId')) state.position.nodeId = null;
      if (!has(state.position, 'variantPicks')) state.position.variantPicks = {};
    }
    if (isObj(state.flags)) {
      if (!has(state.flags, 'name')) state.flags.name = null;
      if (!has(state.flags, 'micConsent')) state.flags.micConsent = 'unset';
    }
    if (isObj(state.settings)) {
      var sk = Object.keys(SETTINGS_DEFAULTS);
      for (i = 0; i < sk.length; i++) {
        if (!has(state.settings, sk[i])) state.settings[sk[i]] = SETTINGS_DEFAULTS[sk[i]];
      }
    }

    /* Additive bookkeeping owned entirely by save.js. */
    if (!isObj(state.seen)) state.seen = {};
    if (!isObj(state.masteryAggregates)) state.masteryAggregates = {};
    if (!isObj(state.archive)) state.archive = {};
    if (!isObj(state.archive.mastery)) state.archive.mastery = {};
    if (!isObj(state.archive.masteryAggregates)) state.archive.masteryAggregates = {};
    if (!isNum(state.attemptsFolded) || state.attemptsFolded < 0) state.attemptsFolded = 0;
    if (!isArr(state.migrations)) state.migrations = [];

    return state;
  }

  /* ---------------------------------------------------------------
   * validate(state) -> {ok, errors:[]}
   *
   * Used by both load() and importJson() (CONTRACT section 2).  It runs
   * AFTER migrate(), so it demands the current schema and content version:
   * a state that could not be migrated forward fails here with a message
   * that names both versions.
   *
   * Card contents are checked loosely on purpose.  srs.js owns the card
   * shape; save.js only insists that a card is an object with a "due" and
   * that any numeric field that is present really is a number.  Anything
   * stricter would make this file break every time the scheduler changes.
   * ------------------------------------------------------------- */

  function validate(state) {
    var errors = [];

    function bad(msg) {
      if (errors.length < MAX_VALIDATION_ERRORS) errors.push(msg);
      else if (errors.length === MAX_VALIDATION_ERRORS) errors.push('(further problems not listed)');
    }

    if (!isObj(state)) {
      return { ok: false, errors: [isArr(state) ? 'the save is a JSON array, not a save object'
                                                : 'the save is not a JSON object'] };
    }

    var i, k, keys;

    /* --- required top-level keys --- */
    for (i = 0; i < REQUIRED_KEYS.length; i++) {
      if (!has(state, REQUIRED_KEYS[i])) bad('missing required field "' + REQUIRED_KEYS[i] + '"');
    }
    if (errors.length) return { ok: false, errors: errors };

    /* --- schema --- */
    if (!isInt(state.schema) || state.schema < 1) {
      bad('"schema" is not a positive whole number (found ' + JSON.stringify(state.schema) + ')');
    } else if (state.schema > SCHEMA) {
      bad('this save uses schema ' + state.schema + ', but this build of the game only knows schema ' +
          SCHEMA + ' -- it was made by a newer version of the game');
    } else if (state.schema < SCHEMA) {
      bad('this save is still at schema ' + state.schema + ' after migration; there is no upgrade path to schema ' + SCHEMA);
    }

    /* --- contentVersion --- */
    if (!isStr(state.contentVersion) || state.contentVersion === '') {
      bad('"contentVersion" is missing or not a string');
    } else if (state.contentVersion !== CONTENT_VERSION) {
      if (!inList(KNOWN_CONTENT_VERSIONS, state.contentVersion)) {
        bad('this save was made with content version "' + state.contentVersion +
            '", which this build does not know (it knows: ' + KNOWN_CONTENT_VERSIONS.join(', ') + ')');
      } else {
        bad('this save is still at content version "' + state.contentVersion +
            '" after migration; there is no upgrade path to "' + CONTENT_VERSION + '"');
      }
    }

    /* --- savedAt --- */
    if (!isNum(state.savedAt) || state.savedAt < 0) bad('"savedAt" is not a timestamp');

    /* --- position --- */
    if (!isObj(state.position)) {
      bad('"position" is not an object');
    } else {
      if (state.position.nodeId !== null && !isStr(state.position.nodeId)) {
        bad('"position.nodeId" must be a node id string or null');
      }
      if (!isObj(state.position.variantPicks)) {
        bad('"position.variantPicks" is not an object');
      } else {
        keys = keysOf(state.position.variantPicks);
        for (i = 0; i < keys.length; i++) {
          if (!isStr(state.position.variantPicks[keys[i]])) {
            bad('"position.variantPicks.' + keys[i] + '" is not a variant id string');
          }
        }
      }
    }

    /* --- flags --- */
    if (!isObj(state.flags)) {
      bad('"flags" is not an object');
    } else {
      if (state.flags.name !== null && !isStr(state.flags.name)) bad('"flags.name" must be a string or null');
      if (!inList(MIC_CONSENT_VALUES, state.flags.micConsent)) {
        bad('"flags.micConsent" must be one of ' + MIC_CONSENT_VALUES.join(' / ') +
            ' (found ' + JSON.stringify(state.flags.micConsent) + ')');
      }
    }

    /* --- memory --- */
    if (!isObj(state.memory)) bad('"memory" is not an object');

    /* --- mastery: itemId -> dimension -> card --- */
    if (!isObj(state.mastery)) {
      bad('"mastery" is not an object');
    } else {
      keys = keysOf(state.mastery);
      for (i = 0; i < keys.length; i++) {
        var itemId = keys[i];
        var byDim = state.mastery[itemId];
        if (!isObj(byDim)) { bad('mastery["' + itemId + '"] is not an object of cards'); continue; }
        var dims = keysOf(byDim);
        for (var d = 0; d < dims.length; d++) {
          validateCard(byDim[dims[d]], 'mastery["' + itemId + '"].' + dims[d], bad);
        }
      }
    }

    /* --- attempts --- */
    if (!isArr(state.attempts)) {
      bad('"attempts" is not an array');
    } else {
      if (state.attempts.length > MAX_ATTEMPTS) {
        bad('"attempts" holds ' + state.attempts.length + ' entries, above the cap of ' + MAX_ATTEMPTS);
      }
      var badAttempts = 0;
      for (i = 0; i < state.attempts.length; i++) {
        var problem = attemptProblem(state.attempts[i]);
        if (problem) {
          badAttempts++;
          if (badAttempts <= 5) bad('attempts[' + i + ']: ' + problem);
        }
      }
      if (badAttempts > 5) bad('and ' + (badAttempts - 5) + ' further malformed attempt entries');
    }

    /* --- settings --- */
    if (!isObj(state.settings)) {
      bad('"settings" is not an object');
    } else {
      var sk = Object.keys(SETTINGS_DEFAULTS);
      for (i = 0; i < sk.length; i++) {
        if (has(state.settings, sk[i]) && !isBool(state.settings[sk[i]])) {
          bad('"settings.' + sk[i] + '" is not true or false');
        }
      }
    }

    /* --- optional additive fields: validated only when present --- */
    if (has(state, 'seen') && !isObj(state.seen)) bad('"seen" is not an object');
    if (has(state, 'masteryAggregates') && !isObj(state.masteryAggregates)) bad('"masteryAggregates" is not an object');
    if (has(state, 'attemptsFolded') && (!isNum(state.attemptsFolded) || state.attemptsFolded < 0)) {
      bad('"attemptsFolded" is not a count');
    }
    if (has(state, 'migrations') && !isArr(state.migrations)) bad('"migrations" is not an array');
    if (has(state, 'archive')) {
      if (!isObj(state.archive)) bad('"archive" is not an object');
      else {
        if (has(state.archive, 'mastery') && !isObj(state.archive.mastery)) bad('"archive.mastery" is not an object');
        if (has(state.archive, 'masteryAggregates') && !isObj(state.archive.masteryAggregates)) {
          bad('"archive.masteryAggregates" is not an object');
        }
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function validateCard(card, label, bad) {
    if (!isObj(card)) { bad(label + ' is not a card object'); return; }
    if (!has(card, 'due')) bad(label + ' has no "due" field');
    var numeric = ['stability', 'difficulty', 'reps', 'lapses', 'interval'];
    for (var i = 0; i < numeric.length; i++) {
      if (has(card, numeric[i]) && !isNum(card[numeric[i]])) {
        bad(label + '.' + numeric[i] + ' is not a number');
      }
    }
  }

  /* Returns a human-readable problem string, or null when the entry is
   * acceptable.  The attempt log is the immutable evidence trail
   * (audit section 2), so a malformed entry is a real error, not a shrug. */
  function attemptProblem(a) {
    if (!isObj(a)) return 'not an object';
    if (!isNum(a.at)) return 'has no usable "at" timestamp';
    /* `correct` is TRI-state, not boolean.  null means "not measured": an
     * ungraded exercise (kind:"open", or graded:false -- CONTRACT 1.3 and
     * PLAN_AUDIT 6.4 both require those to feed no mastery card), and a
     * grader failure.  engine.js writes exactly that, and rejecting it here
     * made the whole slot unreadable on the next load the moment the learner
     * touched s0.ex1 -- the first exercise in the session.  Only a value that
     * is neither a boolean nor null is malformed. */
    if (has(a, 'correct') && a.correct !== null && !isBool(a.correct)) {
      return '"correct" is not true, false or null';
    }
    if (has(a, 'assisted') && !isBool(a.assisted)) return '"assisted" is not true or false';
    if (has(a, 'latencyMs') && a.latencyMs !== null && !isNum(a.latencyMs)) return '"latencyMs" is not a number or null';
    var strOrNull = ['id', 'nodeId', 'itemId', 'dimension', 'modality'];
    for (var i = 0; i < strOrNull.length; i++) {
      var k = strOrNull[i];
      if (has(a, k) && a[k] !== null && !isStr(a[k]) && !isNum(a[k])) {
        return '"' + k + '" is not a string';
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------
   * Migrations
   *
   * PLAN_AUDIT section 5: "Stable IDs are necessary but not sufficient.
   * Every content release carries a contentVersion and an ordered list of
   * migrations: renamed IDs get an alias map; a scene that changed meaning
   * is re-flagged as unseen; a deleted item's cards are archived, not
   * dropped.  Migrations run on load, are logged into the save."
   *
   * Two ordered lists, run in this order:
   *   1. SCHEMA_MIGRATIONS  -- structural changes to the save format.
   *   2. CONTENT_MIGRATIONS -- meaning changes in the authored content.
   * Then STANDING_ALIASES is applied unconditionally (see below).
   *
   * To ship a content revision: append one entry to CONTENT_MIGRATIONS,
   * bump CONTENT_VERSION, add the old version to KNOWN_CONTENT_VERSIONS,
   * and add any renames to STANDING_ALIASES as well.  Nothing else.
   * ------------------------------------------------------------- */

  /* Renames that must keep working forever, regardless of which version a
   * save is coming from.  A save that skipped three releases never runs the
   * intermediate content migrations' alias maps in the right order, so the
   * union of every rename ever made is also applied on every load.
   * Applying an alias twice is a no-op, which is what makes this safe. */
  var STANDING_ALIASES = {
    /* 'lex:old-id': 'lex:new-id',
       's0.oldNode': 's0.newNode'  */
  };

  var SCHEMA_MIGRATIONS = [
    {
      from: 0,
      to: 1,
      id: 'schema.0-1',
      describe: 'v0 -> v1 identity migration: pre-release saves used the same field ' +
                'layout as v1, so only the version stamp and the additive bookkeeping ' +
                'containers change.',
      run: function (state, ctx) {
        /* Genuinely nothing to reshape.  ensureShape() (run by migrate for
         * every state) adds seen/masteryAggregates/archive/attemptsFolded,
         * which is the only difference a v0 save can have. */
        ctx.note('identity migration; no learner data was changed');
      }
    }
  ];

  var CONTENT_MIGRATIONS = [
    {
      from: 's0.0',
      to: 's0.1',
      id: 'content.s0.0-s0.1',
      describe: 'Session Zero pre-release (s0.0) to first playable (s0.1).',
      /* The three declarative hooks every content migration can use.  They
       * are applied by runContentMigration() before the optional run(). */
      aliases: {},          /* oldId -> newId, for lexemes and node ids     */
      changedNodes: [],     /* nodes whose meaning changed -> re-flag unseen */
      removedItems: [],     /* items deleted from the content -> archive     */
      run: null             /* optional custom step, function (state, ctx)   */
    }
  ];

  /* migrate(state) -> state.  Mutates and returns the object it is given
   * (load() owns a freshly parsed object, so this is safe and avoids
   * cloning a multi-megabyte save on every start-up). */
  function migrate(state) {
    if (!isObj(state)) return state;

    var log = [];
    var startedSchema = state.schema;
    var startedContent = state.contentVersion;

    ensureShape(state);

    function makeCtx(stepId) {
      var notes = [];
      return {
        notes: notes,
        note: function (msg) { notes.push(String(msg)); },
        /* The three hooks the audit names, exposed to custom run() steps. */
        aliasIds: function (map) { return applyAliases(state, map, this); },
        reflagUnseen: function (nodeIds) { return reflagUnseen(state, nodeIds, this); },
        archiveItems: function (itemIds, reason) { return archiveItems(state, itemIds, reason, this); },
        stepId: stepId
      };
    }

    /* --- 1. schema migrations, in order --- */
    var guard = 0;
    while (isInt(state.schema) && state.schema < SCHEMA && guard++ < 50) {
      var step = findMigration(SCHEMA_MIGRATIONS, state.schema);
      if (!step) break;                     /* validate() will report the gap */
      var ctx = makeCtx(step.id);
      try {
        if (typeof step.run === 'function') step.run(state, ctx);
        state.schema = step.to;
        log.push({ at: nowMs(), kind: 'schema', id: step.id, from: step.from, to: step.to, notes: ctx.notes });
      } catch (e) {
        log.push({ at: nowMs(), kind: 'schema', id: step.id, from: step.from, to: step.to,
                   failed: true, error: String(e && e.message) });
        emitError('corrupt', 'Could not upgrade your save from schema ' + step.from + ' to ' + step.to +
                             ': ' + (e && e.message) + '. Your old save has not been changed on disk.',
                  { step: step.id });
        break;
      }
    }

    /* --- 2. content migrations, in order --- */
    guard = 0;
    while (isStr(state.contentVersion) && state.contentVersion !== CONTENT_VERSION && guard++ < 50) {
      var cstep = findMigration(CONTENT_MIGRATIONS, state.contentVersion);
      if (!cstep) break;                    /* validate() will report the gap */
      var cctx = makeCtx(cstep.id);
      try {
        runContentMigration(state, cstep, cctx);
        state.contentVersion = cstep.to;
        log.push({ at: nowMs(), kind: 'content', id: cstep.id, from: cstep.from, to: cstep.to, notes: cctx.notes });
      } catch (e2) {
        log.push({ at: nowMs(), kind: 'content', id: cstep.id, from: cstep.from, to: cstep.to,
                   failed: true, error: String(e2 && e2.message) });
        emitError('corrupt', 'Could not upgrade your save from content version ' + cstep.from + ' to ' +
                             cstep.to + ': ' + (e2 && e2.message) + '. Your old save has not been changed on disk.',
                  { step: cstep.id });
        break;
      }
    }

    /* --- 3. standing aliases, always, whatever version we came from --- */
    var aliasCtx = makeCtx('aliases.standing');
    var renamed = applyAliases(state, STANDING_ALIASES, aliasCtx);
    if (renamed > 0) {
      log.push({ at: nowMs(), kind: 'aliases', id: 'aliases.standing', renamed: renamed, notes: aliasCtx.notes });
    }

    /* --- 4. keep the log bounded and record it in the save --- */
    if (log.length) {
      state.migrations = state.migrations.concat(log);
      if (state.migrations.length > 100) {
        state.migrations = state.migrations.slice(state.migrations.length - 100);
      }
      logWarn('migrated save: schema ' + startedSchema + ' -> ' + state.schema +
              ', content ' + startedContent + ' -> ' + state.contentVersion +
              ' (' + log.length + ' step' + (log.length === 1 ? '' : 's') + ')');
    }

    return state;
  }

  function findMigration(list, from) {
    for (var i = 0; i < list.length; i++) { if (list[i].from === from) return list[i]; }
    return null;
  }

  function runContentMigration(state, step, ctx) {
    if (isObj(step.aliases) && keysOf(step.aliases).length) applyAliases(state, step.aliases, ctx);
    if (isArr(step.changedNodes) && step.changedNodes.length) reflagUnseen(state, step.changedNodes, ctx);
    if (isArr(step.removedItems) && step.removedItems.length) {
      archiveItems(state, step.removedItems, 'removed in ' + step.to, ctx);
    }
    if (typeof step.run === 'function') step.run(state, ctx);
  }

  /* --- migration hook 1: renamed ids -------------------------------
   * Rewrites item ids and node ids everywhere they can appear.  On a
   * collision (both the old and the new id carry cards) the NEW id's data
   * wins and the old id's cards are archived rather than discarded --
   * losing a scheduled card silently is exactly the failure this whole
   * mechanism exists to prevent. */
  function applyAliases(state, map, ctx) {
    if (!isObj(state) || !isObj(map)) return 0;
    ensureShape(state);   /* the hooks are also callable from a custom run() */
    var ids = keysOf(map);
    if (!ids.length) return 0;
    var changed = 0, i, oldId, newId;

    /* ensureShape() deliberately does not invent missing required
     * containers (a damaged slot must stay visibly damaged), so every one
     * of them is treated as optional here. */
    var picks = (isObj(state.position) && isObj(state.position.variantPicks)) ? state.position.variantPicks : null;
    var attempts = isArr(state.attempts) ? state.attempts : [];

    for (i = 0; i < ids.length; i++) {
      oldId = ids[i];
      newId = map[oldId];
      if (!isStr(newId) || newId === oldId) continue;

      changed += renameKey(state.mastery, oldId, newId, state.archive.mastery, ctx, 'mastery');
      changed += renameKey(state.masteryAggregates, oldId, newId, state.archive.masteryAggregates, ctx, 'masteryAggregates');
      changed += renameKey(state.seen, oldId, newId, null, ctx, 'seen');
      changed += renameKey(picks, oldId, newId, null, ctx, 'variantPicks');

      /* variantPicks values are variant ids, which can also be renamed */
      var vk = keysOf(picks);
      for (var v = 0; v < vk.length; v++) {
        if (picks[vk[v]] === oldId) { picks[vk[v]] = newId; changed++; }
      }

      if (isObj(state.position) && state.position.nodeId === oldId) { state.position.nodeId = newId; changed++; }

      for (var a = 0; a < attempts.length; a++) {
        var at = attempts[a];
        if (!isObj(at)) continue;
        if (at.itemId === oldId) { at.itemId = newId; changed++; }
        if (at.nodeId === oldId) { at.nodeId = newId; changed++; }
      }
    }

    if (changed && ctx) ctx.note('applied ' + ids.length + ' id alias(es), ' + changed + ' reference(s) rewritten');
    return changed;
  }

  function renameKey(container, oldId, newId, archiveInto, ctx, label) {
    if (!isObj(container) || !has(container, oldId)) return 0;
    if (has(container, newId)) {
      /* Collision: keep the new id, archive the old payload. */
      if (isObj(archiveInto)) {
        archiveInto[oldId] = { data: container[oldId], archivedAt: nowMs(),
                               reason: 'renamed to ' + newId + ', which already had data' };
      }
      delete container[oldId];
      if (ctx) ctx.note(label + ': "' + oldId + '" collided with existing "' + newId + '"; the old copy was archived');
      return 1;
    }
    container[newId] = container[oldId];
    delete container[oldId];
    return 1;
  }

  /* --- migration hook 2: a node whose meaning changed --------------
   * Re-flag it as unseen so the learner meets the new version, and drop any
   * remembered variant pick for it so the variant selector chooses again
   * against the revised content (CONTRACT: variantPicks are reused on
   * reload, which is exactly what must NOT happen after a rewrite). */
  function reflagUnseen(state, nodeIds, ctx) {
    if (!isObj(state) || !isArr(nodeIds)) return 0;
    ensureShape(state);
    var n = 0;
    var picks = (isObj(state.position) && isObj(state.position.variantPicks)) ? state.position.variantPicks : null;
    for (var i = 0; i < nodeIds.length; i++) {
      var id = nodeIds[i];
      if (has(state.seen, id)) { delete state.seen[id]; n++; }
      if (picks && has(picks, id)) { delete picks[id]; n++; }
    }
    if (n && ctx) ctx.note('re-flagged ' + nodeIds.length + ' changed node(s) as unseen');
    return n;
  }

  /* --- migration hook 3: deleted content ---------------------------
   * Archive, never drop.  An item that comes back in a later release gets
   * its scheduling history back; an item that never returns still leaves
   * its evidence in the save for the ability report and for debugging. */
  function archiveItems(state, itemIds, reason, ctx) {
    if (!isObj(state) || !isArr(itemIds)) return 0;
    ensureShape(state);
    var n = 0, at = nowMs();
    if (!isObj(state.mastery)) return 0;
    for (var i = 0; i < itemIds.length; i++) {
      var id = itemIds[i];
      if (has(state.mastery, id)) {
        state.archive.mastery[id] = { data: state.mastery[id], archivedAt: at, reason: reason || 'removed from content' };
        delete state.mastery[id];
        n++;
      }
      if (has(state.masteryAggregates, id)) {
        state.archive.masteryAggregates[id] = { data: state.masteryAggregates[id], archivedAt: at,
                                                reason: reason || 'removed from content' };
        delete state.masteryAggregates[id];
        n++;
      }
    }
    if (n && ctx) ctx.note('archived ' + n + ' record(s) for ' + itemIds.length + ' removed item(s)');
    return n;
  }

  /* ---------------------------------------------------------------
   * Attempt-log cap and folding
   *
   * PLAN_AUDIT section 5: "The append-only log is capped (most recent
   * ~5,000 attempts) with older entries folded into per-item aggregates,
   * so the save cannot grow unbounded."
   *
   * Folding keeps the counts that the ability report needs (totals,
   * correct, assisted, mean latency, per dimension and per modality) and
   * discards only the per-attempt detail -- in particular `raw`, the
   * learner's literal typed text, which is the bulk of the bytes.
   *
   * The log is assumed to be in append order, which the engine guarantees.
   * Entries with no itemId are folded under "__unattributed" rather than
   * being thrown away.
   * ------------------------------------------------------------- */

  function newAggregate() {
    return {
      total: 0, correct: 0, assisted: 0,
      firstAt: null, lastAt: null,
      byDimension: {},   /* dimension -> bucket */
      byModality: {}     /* modality  -> bucket */
    };
  }

  function newBucket() {
    return { total: 0, correct: 0, assisted: 0, latencySumMs: 0, latencyCount: 0 };
  }

  function addToBucket(bucket, a) {
    bucket.total++;
    if (a.correct === true) bucket.correct++;
    if (a.assisted === true) bucket.assisted++;
    /* Latency is only meaningful for unassisted attempts (audit section 6.4:
     * it is a Good/Easy tiebreaker, never a grade), so assisted attempts do
     * not pollute the mean. */
    if (isNum(a.latencyMs) && a.assisted !== true) {
      bucket.latencySumMs += a.latencyMs;
      bucket.latencyCount++;
    }
  }

  function foldAttempt(state, a) {
    if (!isObj(a)) return;
    var itemId = isStr(a.itemId) && a.itemId ? a.itemId : '__unattributed';
    var agg = state.masteryAggregates[itemId];
    if (!isObj(agg)) { agg = newAggregate(); state.masteryAggregates[itemId] = agg; }

    agg.total++;
    if (a.correct === true) agg.correct++;
    if (a.assisted === true) agg.assisted++;
    if (isNum(a.at)) {
      if (agg.firstAt === null || a.at < agg.firstAt) agg.firstAt = a.at;
      if (agg.lastAt === null || a.at > agg.lastAt) agg.lastAt = a.at;
    }

    var dim = isStr(a.dimension) && a.dimension ? a.dimension : 'unknown';
    if (!isObj(agg.byDimension[dim])) agg.byDimension[dim] = newBucket();
    addToBucket(agg.byDimension[dim], a);

    /* Typed and spoken evidence must never be inferred from one another
     * (CONTRACT, engine binding rules), so the modality bucket is kept
     * separate all the way through folding. */
    var mod = isStr(a.modality) && a.modality ? a.modality : 'unknown';
    if (!isObj(agg.byModality[mod])) agg.byModality[mod] = newBucket();
    addToBucket(agg.byModality[mod], a);
  }

  /* Fold everything above `keep` entries.  Returns how many were folded. */
  function foldAttempts(state, keep) {
    if (!isObj(state) || !isArr(state.attempts)) return 0;
    if (!isObj(state.masteryAggregates)) state.masteryAggregates = {};
    var limit = isNum(keep) ? keep : MAX_ATTEMPTS;
    if (state.attempts.length <= limit) return 0;

    var overflow = state.attempts.splice(0, state.attempts.length - limit);
    for (var i = 0; i < overflow.length; i++) foldAttempt(state, overflow[i]);
    state.attemptsFolded = (isNum(state.attemptsFolded) ? state.attemptsFolded : 0) + overflow.length;
    return overflow.length;
  }

  /* ---------------------------------------------------------------
   * The writer
   * ------------------------------------------------------------- */

  var pendingState = null;    /* set by write(), cleared when the timer fires */
  var currentState = null;    /* last state anyone handed us, for flush()     */
  var debounceTimer = null;
  var nextSlot = null;        /* KEY_A or KEY_B; resolved lazily              */
  var lastSlotWritten = null;
  var highWaterSavedAt = 0;   /* newest savedAt seen or written this session  */
  var writeCount = 0;

  /* Which slot should the next write go to?  Always the one that is NOT the
   * current newest good copy, so a torn write can only ever damage the
   * spare.  If load() ran, it set this.  If it did not (a caller that
   * writes before loading), probe both slots cheaply with a regex rather
   * than parsing two potentially large JSON documents. */
  function resolveNextSlot() {
    if (nextSlot) return nextSlot;
    var aAt = peekSavedAt(rawGet(KEY_A));
    var bAt = peekSavedAt(rawGet(KEY_B));
    if (aAt === null && bAt === null) nextSlot = KEY_A;
    else if (aAt === null) nextSlot = KEY_A;
    else if (bAt === null) nextSlot = KEY_B;
    else nextSlot = (aAt >= bAt) ? KEY_B : KEY_A;   /* overwrite the older one */
    if (isNum(aAt) && aAt > highWaterSavedAt) highWaterSavedAt = aAt;
    if (isNum(bAt) && bAt > highWaterSavedAt) highWaterSavedAt = bAt;
    return nextSlot;
  }

  function otherSlot(key) { return key === KEY_A ? KEY_B : KEY_A; }

  /* Synchronous, never throws.  Returns a small result object. */
  function writeNow(state, why) {
    if (!isObj(state)) return { ok: false, reason: 'no state to write' };

    try {
      /* 1. keep the log bounded before it is ever serialised */
      var folded = foldAttempts(state, MAX_ATTEMPTS);
      if (folded) logWarn('folded ' + folded + ' old attempt(s) into aggregates');

      /* 2. stamp version + time.  contentVersion is only FILLED IN when
       *    absent -- never rewritten, because silently restamping a state
       *    that migrate() could not upgrade would destroy the evidence that
       *    it needs upgrading. */
      if (!isInt(state.schema)) state.schema = SCHEMA;
      if (!isStr(state.contentVersion) || state.contentVersion === '') state.contentVersion = CONTENT_VERSION;

      var t = nowMs();
      /* Monotonic: "newest slot wins" is only sound if time moves forward. */
      if (t <= highWaterSavedAt) t = highWaterSavedAt + 1;
      state.savedAt = t;

      /* 3. checksum over everything except the checksum itself */
      state.checksum = null;
      state.checksum = checksumOf(state);

      var payload = JSON.stringify(state);
      var slot = resolveNextSlot();

      /* 4. write, with one emergency-fold retry on a quota failure */
      var r = rawSet(slot, payload);
      if (!r.ok && isQuotaError(r.error)) {
        var reclaimed = foldAttempts(state, EMERGENCY_ATTEMPTS);
        if (reclaimed > 0) {
          state.checksum = null;
          state.checksum = checksumOf(state);
          payload = JSON.stringify(state);
          logWarn('quota hit; emergency-folded ' + reclaimed + ' attempts and retrying');
          r = rawSet(slot, payload);
        }
      }

      if (!r.ok) {
        /* Play continues from memory.  The banner is mandatory. */
        reportStorageError(r.error, 'saving your progress');
        return { ok: false, reason: 'write failed', slot: slot, error: r.error };
      }

      /* 5. cheap integrity check: a silently truncated write would leave a
       *    slot that parses as garbage next time.  Only the length is
       *    compared, and only for payloads small enough that the extra read
       *    is free. */
      if (payload.length <= READBACK_LIMIT) {
        var back = rawGet(slot);
        if (back === null || back.length !== payload.length) {
          emitError('corrupt',
                    'Your progress did not store correctly (the browser read back a different ' +
                    'amount of data than was written). The previous save is still intact. ' +
                    'Export your save to be safe.',
                    { slot: slot, wrote: payload.length, readBack: back === null ? null : back.length });
          return { ok: false, reason: 'readback mismatch', slot: slot };
        }
      }

      api.storageOk = true;
      highWaterSavedAt = t;
      lastSlotWritten = slot;
      nextSlot = otherSlot(slot);
      writeCount++;
      api.lastWrite = { at: t, slot: slot, bytes: payload.length, why: why || 'write', count: writeCount };
      return { ok: true, slot: slot, bytes: payload.length, savedAt: t };

    } catch (e) {
      /* Anything unexpected (a circular reference the engine introduced, a
       * getter that throws during stringify) still must not reach the
       * caller, and still must not be silent. */
      emitError('corrupt',
                'Your progress could not be prepared for saving: ' + ((e && e.message) || String(e)) +
                '. Play continues, but export your save.',
                { where: 'writeNow' });
      return { ok: false, reason: 'exception', error: e };
    }
  }

  /* CONTRACT: write(state) is debounced ~300 ms, coalesced, returns
   * immediately, and never throws.
   *
   * This is a leading-window coalesce, not a trailing-reset debounce: the
   * timer is started by the first dirty write and is NOT restarted by
   * later ones, so the newest state is always on disk within 300 ms of the
   * first change.  A trailing-reset debounce would let continuous
   * interaction starve the save indefinitely, which is the exact failure
   * mode the audit rejected "autosave on close" for. */
  function write(state) {
    try {
      if (!isObj(state)) return;
      pendingState = state;
      currentState = state;
      if (debounceTimer === null) {
        debounceTimer = setTimeout(function () {
          debounceTimer = null;
          var s = pendingState;
          pendingState = null;
          writeNow(s, 'debounced');
        }, DEBOUNCE_MS);
      }
    } catch (e) {
      logWarn('write() failed to schedule: ' + (e && e.message));
    }
  }

  /* CONTRACT: flush() forces a synchronous write now.
   *
   * This is the belt-and-braces path for visibilitychange / pagehide, NOT
   * the primary mechanism -- the primary mechanism is write() after every
   * completed interaction (audit section 5).  It is a no-op when nothing is
   * dirty, so hammering it costs nothing.
   *
   * flush(state) with an explicit state writes that state immediately;
   * this is what the import path uses so a replaced save hits disk before
   * the page reloads. */
  function flushInternal(reason, state) {
    try {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      var s = isObj(state) ? state : pendingState;
      pendingState = null;
      if (!isObj(s)) return { ok: true, skipped: true, reason: 'nothing pending' };
      if (isObj(state)) currentState = state;
      return writeNow(s, reason || 'flush');
    } catch (e) {
      logWarn('flush() failed: ' + (e && e.message));
      return { ok: false, reason: 'exception', error: e };
    }
  }

  function flush(state) { return flushInternal('flush', state); }

  /* ---------------------------------------------------------------
   * load()
   *
   * CONTRACT: read both slots, verify checksums, take the NEWEST slot that
   * parses AND validates.  If the newest is bad but the other is good, use
   * the older one and say exactly what happened.  If both are bad, return a
   * fresh state and a warning.
   *
   * Order matters: parse -> checksum -> migrate -> validate.  The checksum
   * must be verified against the bytes as stored, before migrate() mutates
   * anything; validate() must run after migrate() because an old save is
   * not expected to satisfy the current schema until it has been upgraded.
   * ------------------------------------------------------------- */

  function readSlot(key) {
    var out = { key: key, present: false, ok: false, reason: null, state: null, savedAt: null, bytes: 0 };
    var raw = rawGet(key);
    if (raw === null || raw === '') { out.reason = 'empty'; return out; }

    out.present = true;
    out.bytes = raw.length;
    out.savedAt = peekSavedAt(raw);

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      out.reason = 'it is not valid JSON (the write was probably cut off)';
      return out;
    }
    if (!isObj(parsed)) { out.reason = 'it does not contain a save object'; return out; }

    /* checksum first, against the bytes exactly as stored */
    if (!isStr(parsed.checksum) || parsed.checksum === '') {
      out.reason = 'it carries no checksum';
      return out;
    }
    var expect = checksumOf(parsed);
    if (expect !== parsed.checksum) {
      out.reason = 'its checksum does not match (' + parsed.checksum + ' stored, ' + expect + ' computed) -- ' +
                   'the file was damaged or edited';
      return out;
    }

    if (isNum(parsed.savedAt)) out.savedAt = parsed.savedAt;

    /* then migrate, then validate */
    var migrated;
    try {
      migrated = migrate(parsed);
    } catch (e2) {
      out.reason = 'it could not be upgraded to this version of the game (' + (e2 && e2.message) + ')';
      return out;
    }

    var v = validate(migrated);
    if (!v.ok) {
      out.reason = 'it does not match the expected format: ' + v.errors.slice(0, 3).join('; ');
      return out;
    }

    out.ok = true;
    out.state = migrated;
    return out;
  }

  function load() {
    var warnings = [];
    storageWritable();          /* raises a banner up front in private mode */

    var a = readSlot(KEY_A);
    var b = readSlot(KEY_B);
    var slots = [a, b];

    /* The newest slot by timestamp, good or bad -- needed to explain a
     * fallback honestly.  A slot that would not parse can still expose its
     * savedAt via the regex peek. */
    var newestAny = null;
    for (var i = 0; i < slots.length; i++) {
      if (!slots[i].present) continue;
      if (newestAny === null) { newestAny = slots[i]; continue; }
      var mine = isNum(slots[i].savedAt) ? slots[i].savedAt : -1;
      var theirs = isNum(newestAny.savedAt) ? newestAny.savedAt : -1;
      if (mine > theirs) newestAny = slots[i];
    }

    /* The newest slot that actually loaded. */
    var chosen = null;
    for (var j = 0; j < slots.length; j++) {
      if (!slots[j].ok) continue;
      if (chosen === null) { chosen = slots[j]; continue; }
      var m = isNum(slots[j].savedAt) ? slots[j].savedAt : -1;
      var c = isNum(chosen.savedAt) ? chosen.savedAt : -1;
      if (m > c) chosen = slots[j];
    }

    var state, report;

    if (chosen === null) {
      state = fresh();
      if (!a.present && !b.present) {
        /* First run.  Not a problem, and definitely not a warning. */
        report = { outcome: 'first-run', slots: describeSlots(slots) };
      } else {
        var why = [];
        for (var k = 0; k < slots.length; k++) {
          if (slots[k].present) why.push(slotName(slots[k].key) + ': ' + slots[k].reason);
        }
        var msg = 'Your saved progress could not be read (' + why.join('; ') + '). ' +
                  'Starting a new save. If you have an exported save file, import it now, ' +
                  'before this new save overwrites the damaged one.';
        warnings.push(msg);
        emitError('corrupt', msg, { slots: describeSlots(slots) });
        report = { outcome: 'both-bad', slots: describeSlots(slots) };
      }
      /* Write into the slot that is not the most recently damaged one, so
       * a damaged-but-newer file survives long enough to be rescued by hand. */
      nextSlot = (newestAny && newestAny.key === KEY_A) ? KEY_B : KEY_A;

    } else {
      state = chosen.state;
      report = { outcome: 'loaded', slot: slotName(chosen.key), savedAt: chosen.savedAt, slots: describeSlots(slots) };

      /* Fallback case: something newer existed and did not survive. */
      if (newestAny && newestAny.key !== chosen.key && newestAny.present && !newestAny.ok) {
        var lostMs = (isNum(newestAny.savedAt) && isNum(chosen.savedAt)) ? (newestAny.savedAt - chosen.savedAt) : null;
        var w = 'The most recent save (' + slotName(newestAny.key) + ', ' + whenText(newestAny.savedAt) +
                ') could not be used because ' + newestAny.reason + '. ' +
                'The previous save (' + slotName(chosen.key) + ', ' + whenText(chosen.savedAt) + ') was loaded instead' +
                (lostMs !== null && lostMs > 0 ? ', so up to ' + durationText(lostMs) + ' of play may be missing' : '') +
                '.';
        warnings.push(w);
        emitError('corrupt', w, { used: chosen.key, rejected: newestAny.key, reason: newestAny.reason });
        report.outcome = 'fell-back';
        report.rejected = slotName(newestAny.key);
      }

      /* Report a migration to the learner if one actually changed anything;
       * the audit wants migrations logged, and a silent content upgrade is
       * exactly the kind of thing that later looks like a save bug. */
      if (isArr(state.migrations) && state.migrations.length) {
        var recent = state.migrations[state.migrations.length - 1];
        if (recent && isNum(recent.at) && (nowMs() - recent.at) < 60000) {
          warnings.push('Your save was updated for a newer version of the lesson content ' +
                        '(' + recent.id + '). Nothing was deleted.');
        }
      }

      /* Next write goes to the OTHER slot, preserving the copy we just
       * loaded until the new one has landed intact. */
      nextSlot = otherSlot(chosen.key);
      if (isNum(chosen.savedAt) && chosen.savedAt > highWaterSavedAt) highWaterSavedAt = chosen.savedAt;
    }

    if (newestAny && isNum(newestAny.savedAt) && newestAny.savedAt > highWaterSavedAt) {
      highWaterSavedAt = newestAny.savedAt;
    }

    currentState = state;
    api.lastLoadReport = report;
    return { state: state, warnings: warnings };
  }

  function slotName(key) { return key === KEY_A ? 'slot A' : 'slot B'; }

  function describeSlots(slots) {
    var out = [];
    for (var i = 0; i < slots.length; i++) {
      out.push({
        slot: slotName(slots[i].key),
        key: slots[i].key,
        present: slots[i].present,
        ok: slots[i].ok,
        savedAt: slots[i].savedAt,
        bytes: slots[i].bytes,
        reason: slots[i].reason
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------
   * exportBlob(state) -> {filename, json, ...}
   *
   * This is the real backup (see failure mode 13 at the top of the file)
   * and the PC <-> phone sync path.  The filename carries the savedAt
   * timestamp so a folder full of exports sorts and reads sensibly, and the
   * JSON is pretty-printed so it can be inspected and, if it comes to it,
   * repaired by hand.
   * ------------------------------------------------------------- */

  function stampForFilename(ms) {
    var d = new Date(isNum(ms) && ms > 0 ? ms : nowMs());
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) +
           '_' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
  }

  function exportBlob(state) {
    var src = isObj(state) ? state : (currentState || fresh());
    var out;

    try {
      /* Detach: an export must never be able to mutate live state, and the
       * round-trip also drops undefined values and functions. */
      out = JSON.parse(JSON.stringify(src));
    } catch (e) {
      out = fresh();
      emitError('corrupt', 'Your progress could not be packaged for export: ' + ((e && e.message) || String(e)) +
                           '. An empty save was produced instead.', { where: 'exportBlob' });
    }

    if (!isObj(out)) out = fresh();
    ensureShape(out);
    if (!isNum(out.savedAt) || out.savedAt <= 0) out.savedAt = nowMs();
    if (!isInt(out.schema)) out.schema = SCHEMA;
    if (!isStr(out.contentVersion) || out.contentVersion === '') out.contentVersion = CONTENT_VERSION;

    out.exportedAt = nowMs();
    out.checksum = null;
    out.checksum = checksumOf(out);

    var json = JSON.stringify(out, null, 2);
    var filename = 'ru-save-v1-' + stampForFilename(out.savedAt) + '.json';

    var result = {
      filename: filename,
      json: json,
      mime: 'application/json',
      bytes: json.length,
      savedAt: out.savedAt,
      blob: null
    };

    /* A ready-made Blob is a convenience for the download link; its absence
     * (very old engines) must not break the export. */
    try {
      if (typeof Blob === 'function') result.blob = new Blob([json], { type: 'application/json' });
    } catch (e2) { result.blob = null; }

    return result;
  }

  /* ---------------------------------------------------------------
   * importJson(text) -> {ok, state, error}
   *
   * PLAN_AUDIT section 5: "An imported file is parsed, schema-validated,
   * and checked for a content version the build knows. Reject with a
   * readable reason. Never merge a partially-valid save over a good one."
   *
   * NOTHING here touches localStorage.  A rejected import cannot disturb
   * the existing save because this function does not write at all -- it
   * returns a complete replacement state and the caller (ui.js, via the
   * "this will replace your progress, current save downloaded first" flow)
   * decides to write it.  That is also why there is no merge path: the
   * return value is always a whole state or an error, never a patch.
   * ------------------------------------------------------------- */

  function fail(reason) { return { ok: false, state: null, error: reason, warnings: [] }; }

  function importJson(text) {
    if (!isStr(text) || text.replace(/^\s+|\s+$/g, '') === '') {
      return fail('That file is empty. Choose an exported save file (a .json file whose name starts with "ru-save-").');
    }
    if (text.length > 64 * 1024 * 1024) {
      return fail('That file is far too large to be a save file (' + Math.round(text.length / 1048576) + ' MB).');
    }

    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return fail('That file is not valid JSON, so it is not a save file (' + ((e && e.message) || 'parse error') + ').');
    }

    if (isArr(parsed)) return fail('That file contains a JSON list, not a save file.');
    if (!isObj(parsed)) return fail('That file does not contain a save object.');

    var warnings = [];

    /* --- refuse fragments before anything else -----------------------
     * A file missing whole sections of the schema is a fragment, and the
     * only safe thing to do with a fragment is refuse it: filling the gaps
     * from the current save would be exactly the partial merge the plan
     * forbids. */
    var missing = [];
    for (var i = 0; i < REQUIRED_KEYS.length; i++) {
      if (!has(parsed, REQUIRED_KEYS[i])) missing.push(REQUIRED_KEYS[i]);
    }
    if (missing.length) {
      return fail('That file is missing part of a save (' + missing.join(', ') + '). ' +
                  'It looks like a fragment or a different kind of file. Partial saves are never merged ' +
                  'into your progress, so nothing has been changed.');
    }

    /* --- version gates, before migration ----------------------------- */
    /* Schema 0 is a real, migratable version (SCHEMA_MIGRATIONS starts
     * there), so the floor is 0, not 1. */
    if (!isInt(parsed.schema) || parsed.schema < 0) {
      return fail('That file does not say which save format it uses, so it cannot be trusted.');
    }
    if (parsed.schema > SCHEMA) {
      return fail('That save was made by a newer version of the game (save format ' + parsed.schema +
                  '; this build understands up to ' + SCHEMA + '). Update the game, then import it again. ' +
                  'Your current progress has not been changed.');
    }
    if (!isStr(parsed.contentVersion) || parsed.contentVersion === '') {
      return fail('That file does not say which lesson content it belongs to, so it cannot be trusted.');
    }
    if (!inList(KNOWN_CONTENT_VERSIONS, parsed.contentVersion)) {
      return fail('That save belongs to lesson content "' + parsed.contentVersion +
                  '", which this build does not know (it knows: ' + KNOWN_CONTENT_VERSIONS.join(', ') + '). ' +
                  'Your current progress has not been changed.');
    }

    /* --- checksum ----------------------------------------------------
     * A mismatch on a file that parses and validates almost always means a
     * deliberate hand edit rather than corruption (corruption normally
     * breaks the parse first), so this is a warning the UI must show, not a
     * refusal.  Truncation and byte damage are still caught, by the parse
     * and by validate() below. */
    if (isStr(parsed.checksum) && parsed.checksum !== '') {
      var expect = checksumOf(parsed);
      if (expect !== parsed.checksum) {
        warnings.push('The checksum in this file does not match its contents, which usually means it was ' +
                      'edited by hand after it was exported. It passed every other check, so it can be ' +
                      'imported, but check that your progress looks right afterwards.');
      }
    } else {
      warnings.push('This file has no checksum, so its contents could not be verified. It passed every ' +
                    'other check.');
    }

    /* --- migrate, then validate -------------------------------------- */
    var state;
    try {
      state = migrate(parsed);
    } catch (e2) {
      return fail('That save could not be updated to this version of the game (' +
                  ((e2 && e2.message) || String(e2)) + '). Your current progress has not been changed.');
    }

    var v = validate(state);
    if (!v.ok) {
      return fail('That save does not match the expected format, so it was not imported: ' +
                  v.errors.slice(0, 5).join('; ') + '. Your current progress has not been changed.');
    }

    /* Bring the imported log under the cap immediately, so importing a huge
     * save cannot be the thing that pushes the next write over quota. */
    var folded = foldAttempts(state, MAX_ATTEMPTS);
    if (folded) {
      warnings.push('The history in this save was longer than the ' + MAX_ATTEMPTS + '-attempt limit; the ' +
                    'oldest ' + folded + ' attempts were folded into per-item totals. Nothing was lost from ' +
                    'your progress or your scheduling.');
    }

    /* savedAt is preserved from the file (it is what the learner sees in
     * the confirm dialog), but it must not be allowed to sit above "now"
     * far enough to poison the monotonic write clock forever. */
    if (isNum(state.savedAt) && state.savedAt > nowMs() + 86400000) {
      warnings.push('This save is timestamped in the future (' + whenText(state.savedAt) + '); the clock on ' +
                    'the device that made it was probably wrong.');
    }

    return {
      ok: true,
      state: state,
      error: null,
      warnings: warnings,
      summary: {
        savedAt: state.savedAt,
        savedAtText: whenText(state.savedAt),
        contentVersion: state.contentVersion,
        schema: state.schema,
        nodeId: state.position.nodeId,
        items: keysOf(state.mastery).length,
        archivedItems: keysOf(state.archive.mastery).length,
        attempts: state.attempts.length,
        attemptsFolded: state.attemptsFolded,
        name: state.flags.name
      }
    };
  }

  /* ---------------------------------------------------------------
   * Belt-and-braces unload hooks
   *
   * These are the EXTRA, not the mechanism.  write() has already put every
   * completed interaction on disk within 300 ms; these only catch the
   * 0-300 ms window.  visibilitychange:hidden is the reliable one on
   * mobile; pagehide covers desktop navigation and bfcache entry.
   * beforeunload is deliberately not used -- it is unreliable, and on some
   * browsers registering it disables bfcache.
   * ------------------------------------------------------------- */

  function installUnloadHooks() {
    try {
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') flushInternal('visibilitychange', null);
        }, false);
      }
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('pagehide', function () { flushInternal('pagehide', null); }, false);

        /* Another tab of the game writing our keys.  Last writer wins; the
         * least we can do is know, and let the UI say so. */
        window.addEventListener('storage', function (ev) {
          if (!ev || (ev.key !== KEY_A && ev.key !== KEY_B)) return;
          api.multiTab = true;
          var at = peekSavedAt(ev.newValue);
          if (isNum(at) && at > highWaterSavedAt) highWaterSavedAt = at;
          logWarn('another tab wrote ' + ev.key + '; this tab will overwrite it on its next save');
        }, false);
      }
    } catch (e) {
      logWarn('could not install unload hooks: ' + (e && e.message));
    }
  }

  /* ---------------------------------------------------------------
   * Public surface (CONTRACT section 2, plus read-only diagnostics)
   * ------------------------------------------------------------- */

  var api = {
    /* --- contract --- */
    load: load,
    write: write,
    flush: flush,
    exportBlob: exportBlob,
    importJson: importJson,
    fresh: fresh,
    onError: onError,
    migrate: migrate,
    validate: validate,

    /* --- constants, read-only by convention --- */
    KEY_A: KEY_A,
    KEY_B: KEY_B,
    SCHEMA: SCHEMA,
    CONTENT_VERSION: CONTENT_VERSION,
    KNOWN_CONTENT_VERSIONS: KNOWN_CONTENT_VERSIONS.slice(0),
    MAX_ATTEMPTS: MAX_ATTEMPTS,
    DEBOUNCE_MS: DEBOUNCE_MS,

    /* --- diagnostics the UI may read --- */
    storageOk: true,        /* false once any storage access has failed    */
    multiTab: false,        /* another tab has written our keys            */
    lastError: null,        /* the most recent {kind, message, detail, at} */
    lastWrite: null,        /* {at, slot, bytes, why, count}               */
    lastLoadReport: null,   /* structured detail behind load()'s warnings  */

    /* --- test seam: used by the fixture test the audit asks for
     * (section 5: "covered by a fixture test with an old save file").
     * Not part of the frozen contract; do not call from game code. --- */
    _internal: {
      djb2: djb2,
      checksumOf: checksumOf,
      serialiseForChecksum: serialiseForChecksum,
      foldAttempts: foldAttempts,
      ensureShape: ensureShape,
      applyAliases: applyAliases,
      reflagUnseen: reflagUnseen,
      archiveItems: archiveItems,
      readSlot: readSlot,
      writeNow: writeNow,
      isQuotaError: isQuotaError,
      isSecurityError: isSecurityError,
      SCHEMA_MIGRATIONS: SCHEMA_MIGRATIONS,
      CONTENT_MIGRATIONS: CONTENT_MIGRATIONS,
      STANDING_ALIASES: STANDING_ALIASES,
      resetForTest: function () {
        pendingState = null; currentState = null; nextSlot = null;
        lastSlotWritten = null; highWaterSavedAt = 0; writeCount = 0;
        storageProbe = null; lastEmitted = {}; queuedErrors.length = 0;
        if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null; }
      }
    }
  };

  RU.save = api;
  installUnloadHooks();

  /* ---------------------------------------------------------------
   * NOTES ON THE CONTRACT, recorded here rather than in a side document
   * ---------------------------------------------------------------
   * 1. CONTRACT section 1.5 lists nine top-level save fields.  The
   *    migration machinery section 5 demands cannot be built from those
   *    nine alone: "a scene that changed meaning is re-flagged as unseen"
   *    needs a record of what has been seen, and "a deleted item's cards
   *    are archived, not dropped" needs somewhere to archive them.  This
   *    module therefore adds five optional fields -- seen,
   *    masteryAggregates, archive, attemptsFolded, migrations -- all of
   *    which are created on demand, none of which any other module is
   *    required to touch.  `seen` is written by the engine if it wants the
   *    unseen-reflagging hook to do anything; everything else is owned
   *    entirely by save.js.
   * 2. CONTRACT section 2 does not say what `warnings` contains.  It holds
   *    plain human-readable strings, ready to render; the structured
   *    version is on RU.save.lastLoadReport.
   * 3. `masteryAggregates` was specified for this module but is not in
   *    section 1.5's schema either; engine.report() should read it
   *    alongside state.attempts so that evidence counts do not silently
   *    drop when the log is folded.
   * ------------------------------------------------------------- */

}());
