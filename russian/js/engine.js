window.RU = window.RU || {};

/* ============================================================================
 * engine.js  -  RU.engine  -  the session runner.
 *
 * This module owns `state` and is the ONLY module that mutates it. srs.js,
 * grade.js and speech.js are services; ui.js renders and owns nothing. If you
 * find yourself writing `state.something = ...` outside this file, stop.
 *
 * Contract: CONTRACT.md section 2 (RU.engine) and its "Binding rules" block.
 * Rationale: PLAN_AUDIT.md sections 5, 6.2, 6.4, 7, 9, 10, 11.
 *
 * Environment notes:
 *   - Plain ES2019. No modules, no bundler, no npm, no framework.
 *   - This file NEVER touches `document`. It is testable headlessly; a node
 *     runner only has to do `globalThis.window = globalThis` before loading.
 *   - No network calls. No Math.random (pickVariant explains why randomness is
 *     actively harmful here, not merely unavailable).
 *   - Every call into a sibling module is feature-detected and wrapped, so a
 *     missing or broken sibling degrades the session instead of killing it.
 * ========================================================================== */

(function () {
  "use strict";

  var RU = window.RU;

  /* --------------------------------------------------------------------- *
   * Constants
   * --------------------------------------------------------------------- */

  /* The four mastery dimensions, in ladder order (PLAN_AUDIT 6.4). The order
   * is load-bearing: a dimension can only be unlocked by evidence at the one
   * below it. */
  var DIMENSIONS = ["recognition", "meaning", "controlled", "spontaneous"];

  /* Production dimensions are the ones that split by modality. Receptive
   * dimensions do not: hearing a word is hearing a word whether you then tap,
   * type or speak. */
  var PRODUCTION = { controlled: true, spontaneous: true };

  /* A bucket needs this many unaided graded attempts before report() prints a
   * number instead of "not enough evidence" (CONTRACT 2, binding). */
  var MIN_EVIDENCE = 3;

  /* Per-session retrieval cap (PLAN_AUDIT 6.2, "Review load"). */
  var REVIEW_CAP_DEFAULT = 40;

  /* Ceiling on newly introduced items per session (PLAN_AUDIT 6.2). A ceiling
   * and a warning, never a quota and never a hard block: refusing to introduce
   * item 11 mid-scene would strand the learner inside authored content. */
  var NEW_ITEM_CAP_DEFAULT = 10;

  /* Append-only attempt log cap (PLAN_AUDIT 5, "Attempt-log growth"). Older
   * entries are folded into per-item aggregates rather than dropped, so both
   * report() and the lazy-card ladder stay correct after a trim. */
  var ATTEMPT_LOG_CAP = 5000;

  /* How many top-level nodes ahead count as "what the next node needs" when
   * prioritising due items. */
  var LOOKAHEAD = 3;

  var DAY_MS = 86400000;

  var EVENTS = ["node", "graded", "saved", "error", "report", "stoppoint"];

  /* --------------------------------------------------------------------- *
   * Small helpers. No dependencies, no DOM.
   * --------------------------------------------------------------------- */

  function has(o, k) {
    return o !== null && o !== undefined &&
      Object.prototype.hasOwnProperty.call(o, k);
  }

  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }

  function arr(v) { return isArray(v) ? v : []; }

  function isStr(v) { return typeof v === "string" && v.length > 0; }

  function isObj(v) {
    return v !== null && typeof v === "object" && !isArray(v);
  }

  function num(v, fallback) {
    return (typeof v === "number" && isFinite(v)) ? v : fallback;
  }

  function keysSorted(o) {
    var out = [], k;
    if (!isObj(o)) return out;
    for (k in o) { if (has(o, k)) out.push(k); }
    out.sort();
    return out;
  }

  /* Stable ascending sort by a string key. Array.prototype.sort stability is
   * not something we want to lean on when variant choice must be reproducible
   * across reloads, so decorate with the original index. */
  function sortByKeyAscending(list, keyOf) {
    var decorated = [], i;
    for (i = 0; i < list.length; i++) {
      decorated.push({ v: list[i], k: String(keyOf(list[i])), i: i });
    }
    decorated.sort(function (a, b) {
      if (a.k < b.k) return -1;
      if (a.k > b.k) return 1;
      return a.i - b.i;
    });
    var out = [];
    for (i = 0; i < decorated.length; i++) out.push(decorated[i].v);
    return out;
  }

  function pct(n, d) {
    if (!d) return null;
    return Math.round((n / d) * 1000) / 10;
  }

  /* --------------------------------------------------------------------- *
   * Bucket keys: where evidence is filed.
   * --------------------------------------------------------------------- *
   *
   * CONTRACT 1.5 illustrates mastery as
   *     mastery["lex:x"] = { recognition:{card}, controlled:{card} }
   * while CONTRACT 2 binds:
   *     "Typed answers write to the controlled/typed evidence bucket only.
   *      Spoken answers write to the spoken bucket. They are separate cards."
   *
   * A bare dimension key cannot satisfy both, so mastery is keyed by BUCKET:
   *
   *     "recognition"          receptive, modality-free
   *     "meaning"              receptive, modality-free
   *     "controlled:typed"     typed production
   *     "controlled:spoken"    spoken production
   *     "spontaneous:typed"
   *     "spontaneous:spoken"
   *
   * The receptive keys are byte-identical to the contract's example; only the
   * production keys carry the modality suffix the binding rule demands. This
   * is the one place the two statements are reconciled.
   */

  function normaliseDimension(d) {
    for (var i = 0; i < DIMENSIONS.length; i++) {
      if (DIMENSIONS[i] === d) return d;
    }
    return "recognition";
  }

  /* The ONLY function allowed to decide that something is spoken evidence.
   * Anything that is not literally a spoken attempt files as typed. Nothing
   * infers speaking from typing, from a tap, or from modality:"either"
   * (PLAN_AUDIT 6.4, "Typed answers are not evidence of speaking"). */
  function productionModality(modality) {
    return modality === "spoken" ? "spoken" : "typed";
  }

  function bucketKey(dimension, modality) {
    var d = normaliseDimension(dimension);
    if (!PRODUCTION[d]) return d;
    return d + ":" + productionModality(modality);
  }

  function parseBucket(key) {
    var s = String(key || "");
    var at = s.indexOf(":");
    if (at < 0) return { dimension: normaliseDimension(s), modality: null };
    return {
      dimension: normaliseDimension(s.slice(0, at)),
      modality: productionModality(s.slice(at + 1))
    };
  }

  /* The bucket immediately below `key` on the ladder. Lazy card creation
   * (PLAN_AUDIT 6.2 / CONTRACT 2) requires at least one "good" here before
   * `key` may be created at all.
   *
   * Note the lanes: spontaneous:spoken is unlocked by controlled:spoken, NOT
   * by controlled:typed. Typing your way up the ladder must never open a
   * speaking card; that is the same defect as reporting speaking ability for
   * a keyboard-only course. */
  function bucketBelow(key) {
    var p = parseBucket(key);
    if (p.dimension === "recognition") return null;
    if (p.dimension === "meaning") return "recognition";
    if (p.dimension === "controlled") return "meaning";
    return "controlled:" + p.modality;
  }

  /* What the learner actually did, which is not always what the node asked
   * for. meta.modality (supplied by ui.js: "they pressed the mic" vs "they
   * typed") wins over the node's declaration, because modality:"either"
   * declares nothing useful. */
  function effectiveModality(exercise, meta) {
    if (meta && isStr(meta.modality)) return meta.modality;
    var m = exercise && exercise.modality;
    if (m === "spoken" || m === "typed" || m === "choice") return m;
    /* "either" or absent: typing always advances the story (PLAN_AUDIT 7), so
     * an unqualified answer is a typed one. */
    return "typed";
  }

  /* Used only when srs.js is absent (engine-only headless tests). Shape per
   * CONTRACT 2. */
  function fallbackCard(now) {
    return {
      due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0,
      lastReview: null, interval: 0, state: "new"
    };
  }

  /* ===================================================================== *
   * Engine
   * ===================================================================== */

  /**
   * @param {Object|Array} session  RU.SESSION0, or a bare array of nodes.
   * @param {Object} state          the save state (CONTRACT 1.5).
   * @param {Object} [options]      { now:fn, reviewCap:n, newItemCap:n,
   *                                  autosave:bool }
   */
  function Engine(session, state, options) {
    options = isObj(options) ? options : {};

    this.options = options;
    this._nowFn = (typeof options.now === "function") ? options.now : null;
    this.autosave = options.autosave !== false;

    this.session = session;
    this.nodes = Engine._nodeListOf(session);
    this.contentVersion =
      (isObj(session) && isStr(session.contentVersion)) ? session.contentVersion :
      (isObj(session) && isStr(session.version)) ? session.version : null;

    this.state = Engine._ensureState(state, this.contentVersion, this._now());

    /* Validation results. Never thrown: a duplicate id is an authoring bug we
     * report loudly and route around, not a reason to blank the page. */
    this.validation = { ok: true, errors: [], warnings: [] };

    /* nodeId -> { top, variantId|null, sub|null }  (built by _buildIndex) */
    this.index = {};
    /* retrieval node id -> true */
    this.retrievals = {};

    /* Listener registry. "error" listeners are replayed the pending errors
     * that accumulated during start(), because start() necessarily runs
     * before anyone can call on(). */
    this._listeners = {};
    this._pendingErrors = [];

    /* Execution cursor. `top` indexes this.nodes; `frame` is the currently
     * playing retrieval variant, or null. Retrieval nodes are transparent:
     * current() returns their inner nodes, never the retrieval node itself. */
    this.top = 0;
    this.frame = null;

    /* Per-session bookkeeping. A "session" is one Engine run; these do not
     * persist, by design (PLAN_AUDIT 6.4 says "in the same session"). */
    this.reviewCap = num(options.reviewCap, REVIEW_CAP_DEFAULT);
    this.newItemCap = num(options.newItemCap, NEW_ITEM_CAP_DEFAULT);
    this.reviewsUsed = 0;
    this.newItemsThisSession = 0;
    this._sessionWrong = {};   /* "itemId|bucket" -> true  (wrong earlier today) */
    this._sessionSlips = {};   /* itemId -> true           (confusable-pair slip) */
    this._confusable = {};     /* itemId -> { otherId: true } */
    this._attemptsByItem = {}; /* itemId -> [attempt, ...]  (in-memory index) */
    this._attemptSeq = 0;
    this._started = false;
    this._saveHooked = false;
  }

  /* --------------------------------------------------------------------- *
   * Static construction helpers
   * --------------------------------------------------------------------- */

  /* A session is "an ordered array of nodes" (CONTRACT 1.3). RU.SESSION0 also
   * carries `letters`, so it is an object in practice. Accept both, and a
   * couple of plausible property names, rather than hard-failing on shape. */
  Engine._nodeListOf = function (session) {
    if (isArray(session)) return session.slice();
    if (!isObj(session)) return [];
    if (isArray(session.nodes)) return session.nodes.slice();
    if (isArray(session.script)) return session.script.slice();
    if (isArray(session.timeline)) return session.timeline.slice();
    return [];
  };

  /* Fill in any missing top-level containers so the rest of the engine can
   * assume they exist. This never overwrites present data; a save produced by
   * RU.save.fresh() already has all of it. */
  Engine._ensureState = function (state, contentVersion, now) {
    var s = isObj(state) ? state : {};
    if (typeof s.schema !== "number") s.schema = 1;
    if (!isStr(s.contentVersion) && isStr(contentVersion)) {
      s.contentVersion = contentVersion;
    }
    if (!isObj(s.position)) s.position = {};
    if (!has(s.position, "nodeId")) s.position.nodeId = null;
    if (!isObj(s.position.variantPicks)) s.position.variantPicks = {};
    if (!isObj(s.flags)) s.flags = {};
    if (!isObj(s.memory)) s.memory = {};
    if (!isObj(s.mastery)) s.mastery = {};
    if (!isArray(s.attempts)) s.attempts = [];
    if (!isObj(s.settings)) s.settings = {};
    /* Additive: folded aggregates for attempts trimmed out of the log. Keyed
     * itemId -> "dimension|modality" -> counters. Derivable-from-nothing
     * otherwise, so it has to live in the save. */
    if (!isObj(s.aggregates)) s.aggregates = {};
    if (typeof s.savedAt !== "number") s.savedAt = now;
    return s;
  };

  /* --------------------------------------------------------------------- *
   * Time
   * --------------------------------------------------------------------- */

  Engine.prototype._now = function () {
    if (this._nowFn) {
      var t = this._nowFn();
      if (typeof t === "number" && isFinite(t)) return t;
    }
    return Date.now();
  };

  /* --------------------------------------------------------------------- *
   * Events
   * --------------------------------------------------------------------- */

  Engine.prototype.on = function (event, cb) {
    if (!isStr(event) || typeof cb !== "function") return function () {};
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);

    /* Errors raised during start() have nowhere to go, because start() runs
     * before the caller can subscribe. Replay them to a late subscriber. */
    if (event === "error" && this._pendingErrors.length) {
      var pending = this._pendingErrors.slice();
      for (var i = 0; i < pending.length; i++) {
        try { cb(pending[i]); } catch (e) { /* a listener must not break us */ }
      }
    }

    var self = this;
    return function off() { self.off(event, cb); };
  };

  Engine.prototype.off = function (event, cb) {
    var list = this._listeners[event];
    if (!list) return;
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] === cb) list.splice(i, 1);
    }
  };

  /* Normally internal; exposed because ui.js tests and the console find it
   * useful. Listener exceptions are swallowed: a broken renderer must not be
   * able to corrupt the run or lose a save. */
  Engine.prototype.emit = function (event, payload) {
    var list = this._listeners[event];
    if (!list || !list.length) return;
    var copy = list.slice();
    for (var i = 0; i < copy.length; i++) {
      try {
        copy[i](payload, event);
      } catch (e) {
        if (event !== "error") {
          this._error("listener", "a " + event + " listener threw: " +
            (e && e.message ? e.message : String(e)));
        }
      }
    }
  };

  Engine.prototype._error = function (kind, message, extra) {
    var payload = { kind: kind, message: String(message) };
    if (isObj(extra)) {
      for (var k in extra) { if (has(extra, k)) payload[k] = extra[k]; }
    }
    if (!this._listeners.error || !this._listeners.error.length) {
      this._pendingErrors.push(payload);
      if (this._pendingErrors.length > 50) this._pendingErrors.shift();
    }
    this.emit("error", payload);
  };

  Engine.prototype._warn = function (kind, message) {
    this.validation.warnings.push({ kind: kind, message: String(message) });
    this._error(kind, message, { severity: "warning" });
  };

  /* --------------------------------------------------------------------- *
   * start()
   * --------------------------------------------------------------------- */

  Engine.prototype.start = function () {
    if (this._started) return this;
    this._started = true;

    this._buildIndex();
    this._buildConfusableMap();
    this._indexAttempts();
    this._hookSaveErrors();
    this._bindConsent();

    if (isStr(this.contentVersion) && isStr(this.state.contentVersion) &&
        this.state.contentVersion !== this.contentVersion) {
      /* save.js owns migration; we only note the mismatch so it is visible if
       * migrate() did not run or did not cover this jump. */
      this._warn("content-version",
        "save is content " + this.state.contentVersion + ", session is " +
        this.contentVersion);
    }

    this._resume();
    this._settle();

    var node = this.current();
    this._commitPosition(node, "start");
    if (node) this._enterNode(node, true);
    else this.emit("node", { node: null, done: true, index: -1,
                             total: this.nodes.length });
    return this;
  };

  /* Walk the session once and record where every node id lives, including the
   * nodes inside retrieval variants. Duplicate ids are the failure this guards
   * against: resume is by id, so two nodes sharing one id makes "continue
   * where you left off" ambiguous and silently wrong. First occurrence wins;
   * the duplicate is reported. */
  Engine.prototype._buildIndex = function () {
    var i, j, k, node, variants, v, inner;
    var seen = this.index;
    var self = this;

    function claim(id, loc, what) {
      if (!isStr(id)) {
        self.validation.ok = false;
        self.validation.errors.push({
          kind: "missing-id", message: what + " has no id"
        });
        self._error("missing-id", what + " has no id");
        return false;
      }
      if (has(seen, id)) {
        self.validation.ok = false;
        self.validation.errors.push({
          kind: "duplicate-id",
          message: "duplicate node id " + id + " (" + what +
                   "); the first occurrence wins and resume may be wrong"
        });
        self._error("duplicate-id",
          "duplicate node id " + id + " (" + what + ")");
        return false;
      }
      seen[id] = loc;
      return true;
    }

    for (i = 0; i < this.nodes.length; i++) {
      node = this.nodes[i];
      if (!isObj(node)) {
        this._warn("bad-node", "node at index " + i + " is not an object");
        continue;
      }
      claim(node.id, { top: i, variantId: null, sub: null },
        "node #" + i + " (" + (node.type || "?") + ")");

      if (node.type === "retrieval") {
        this.retrievals[node.id] = true;
        variants = arr(node.variants);
        if (variants.length < 2) {
          /* Lint rule 8 wants >= 2. Not fatal at runtime, but say so. */
          this._warn("thin-retrieval",
            node.id + " has " + variants.length + " variant(s); lint wants 2+");
        }
        var variantIds = {};
        for (j = 0; j < variants.length; j++) {
          v = variants[j];
          if (!isObj(v) || !isStr(v.id)) {
            this._warn("bad-variant",
              node.id + " variant #" + j + " has no id");
            continue;
          }
          if (has(variantIds, v.id)) {
            this._warn("duplicate-variant-id",
              node.id + " has two variants called " + v.id);
          }
          variantIds[v.id] = true;
          if (!arr(v.covers).length) {
            this._warn("uncovered-variant",
              v.id + " declares no covers[]; it can never be selected on merit");
          }
          inner = arr(v.nodes);
          for (k = 0; k < inner.length; k++) {
            if (!isObj(inner[k])) continue;
            if (inner[k].type === "retrieval") {
              /* One level of nesting only (CONTRACT 1.3: a variant holds
               * line|exercise nodes). A nested retrieval would need a frame
               * stack and has no authored use; skip it rather than half-run
               * it. */
              this._warn("nested-retrieval",
                v.id + " contains a nested retrieval node; it will be skipped");
            }
            claim(inner[k].id, { top: i, variantId: v.id, sub: k },
              "variant " + v.id + " node #" + k);
          }
        }
      }
    }
  };

  /* Confusable pairs drive the "hard" rating and the review priority order.
   * Sources: the taught-letter list (CONTRACT 1.2 contrastWith) and any
   * lexeme that declares contrastWith / confusableWith. */
  Engine.prototype._buildConfusableMap = function () {
    var self = this;

    function link(a, b) {
      if (!isStr(a) || !isStr(b) || a === b) return;
      if (!self._confusable[a]) self._confusable[a] = {};
      if (!self._confusable[b]) self._confusable[b] = {};
      self._confusable[a][b] = true;
      self._confusable[b][a] = true;
    }

    function absorb(entry) {
      if (!isObj(entry) || !isStr(entry.id)) return;
      var list = arr(entry.contrastWith).concat(arr(entry.confusableWith));
      for (var i = 0; i < list.length; i++) link(entry.id, list[i]);
    }

    var letters = (isObj(this.session) && isArray(this.session.letters))
      ? this.session.letters : [];
    for (var i = 0; i < letters.length; i++) absorb(letters[i]);

    var lex = isObj(RU.LEXICON) ? RU.LEXICON : {};
    for (var id in lex) { if (has(lex, id)) absorb(lex[id]); }
  };

  /* Attempts are scanned per item on every rating decision (ladder unlock) and
   * on every report. Index them once. */
  Engine.prototype._indexAttempts = function () {
    var attempts = arr(this.state.attempts);
    this._attemptsByItem = {};
    for (var i = 0; i < attempts.length; i++) {
      var a = attempts[i];
      if (!isObj(a)) continue;
      var key = isStr(a.itemId) ? a.itemId : "(none)";
      if (!this._attemptsByItem[key]) this._attemptsByItem[key] = [];
      this._attemptsByItem[key].push(a);
    }
    this._attemptSeq = attempts.length;
  };

  /* save.js reports quota / private-mode failures through its own callback
   * registry. Re-emit them as engine "error" events so ui.js only has to
   * subscribe in one place for the persistent banner. */
  Engine.prototype._hookSaveErrors = function () {
    if (this._saveHooked) return;
    if (!RU.save || typeof RU.save.onError !== "function") return;
    var self = this;
    try {
      RU.save.onError(function (err) {
        self._error(
          (isObj(err) && isStr(err.kind)) ? err.kind : "save",
          (isObj(err) && err.message) ? err.message : "save failed",
          { source: "save" });
      });
      this._saveHooked = true;
    } catch (e) {
      /* onError itself misbehaving is not worth taking the session down for */
    }
  };

  /* speech.js keeps no storage of its own: it documents bindConsent() as
   * "called once by engine.start()", and until it IS called consentState()
   * answers "unset" from a module-local variable. Nobody was calling it, so a
   * learner who granted the microphone lost that grant on every reload -
   * state.flags.micConsent said "granted" while RU.speech.listen() still threw.
   * The engine owns the save (CONTRACT 2), so the accessors are injected from
   * here and micConsent has exactly one home. */
  Engine.prototype._bindConsent = function () {
    if (!RU.speech || typeof RU.speech.bindConsent !== "function") return;
    var self = this;
    try {
      RU.speech.bindConsent(
        function () {
          return (isObj(self.state.flags) && isStr(self.state.flags.micConsent))
            ? self.state.flags.micConsent : "unset";
        },
        function (v) {
          if (!isObj(self.state.flags)) self.state.flags = {};
          if (self.state.flags.micConsent === v) return;
          self.state.flags.micConsent = v;
          self._save("consent");
        });
    } catch (e) {
      this._error("speech", "bindConsent threw: " + (e && e.message));
    }
  };

  /* Resume at state.position.nodeId if it still resolves after migration,
   * else start at node 0 (CONTRACT 2 / PLAN_AUDIT 11 "reload mid-scene and
   * resume in place"). */
  Engine.prototype._resume = function () {
    var target = this.state.position ? this.state.position.nodeId : null;
    if (!isStr(target)) { this.top = 0; this.frame = null; return; }

    var loc = has(this.index, target) ? this.index[target] : null;
    if (!loc) {
      /* The id is gone: a scene was renamed, deleted or re-cut by a content
       * migration. Contract says start at node 0 rather than guessing. */
      this.top = 0;
      this.frame = null;
      this._warn("position-reset",
        "saved position " + target + " no longer exists; starting from the top");
      return;
    }

    this.top = loc.top;
    this.frame = null;

    if (loc.variantId !== null && loc.variantId !== undefined) {
      var rnode = this.nodes[loc.top];
      var variants = arr(rnode && rnode.variants);
      var chosen = null;
      for (var i = 0; i < variants.length; i++) {
        if (variants[i] && variants[i].id === loc.variantId) chosen = variants[i];
      }
      if (chosen) {
        /* The learner is demonstrably inside this variant, so it is the truth
         * even if variantPicks disagrees (it can disagree after an import or
         * a partially-applied migration). Repair the pick to match. */
        var picks = this._picks();
        if (picks[rnode.id] !== chosen.id) {
          if (isStr(picks[rnode.id])) {
            this._warn("variant-pick-repaired",
              rnode.id + ": pick was " + picks[rnode.id] + ", resume node is in " +
              chosen.id);
          }
          picks[rnode.id] = chosen.id;
        }
        this.frame = {
          retrievalId: rnode.id,
          variantId: chosen.id,
          nodes: arr(chosen.nodes),
          i: num(loc.sub, 0)
        };
      } else {
        this._warn("variant-lost",
          "variant " + loc.variantId + " vanished; re-entering " + rnode.id);
      }
    }
  };

  /* --------------------------------------------------------------------- *
   * Navigation
   * --------------------------------------------------------------------- */

  Engine.prototype.current = function () {
    if (this.frame && this.frame.i >= 0 && this.frame.i < this.frame.nodes.length) {
      var inner = this.frame.nodes[this.frame.i];
      return isObj(inner) ? inner : null;
    }
    if (this.top >= 0 && this.top < this.nodes.length) {
      var n = this.nodes[this.top];
      if (!isObj(n)) return null;
      /* Retrieval nodes are containers, never rendered themselves. If we are
       * looking at one with no frame, _settle() failed to open it (empty
       * variants); treat it as absent. */
      if (n.type === "retrieval") return null;
      return n;
    }
    return null;
  };

  Engine.prototype.done = function () {
    return !this.frame && this.top >= this.nodes.length;
  };

  /* Position bookkeeping the UI often wants. */
  Engine.prototype.position = function () {
    var node = this.current();
    return {
      nodeId: node ? node.id : null,
      index: this.top,
      total: this.nodes.length,
      inRetrieval: this.frame ? this.frame.retrievalId : null,
      variantId: this.frame ? this.frame.variantId : null,
      variantIndex: this.frame ? this.frame.i : null,
      variantTotal: this.frame ? this.frame.nodes.length : null,
      done: this.done()
    };
  };

  /* Open retrieval containers and skip unusable nodes until `current()` has
   * something real to return, or we fall off the end. */
  Engine.prototype._settle = function () {
    var guard = 0;
    while (this.top < this.nodes.length && guard++ < 10000) {
      if (this.frame) {
        if (this.frame.i < this.frame.nodes.length) return;
        /* variant exhausted */
        this.frame = null;
        this.top++;
        continue;
      }
      var n = this.nodes[this.top];
      if (!isObj(n)) { this.top++; continue; }
      if (n.type !== "retrieval") return;

      var variant = this.pickVariant(n);
      var inner = variant ? arr(variant.nodes) : [];
      /* Drop empty / half-authored variants rather than presenting a blank
       * beat (PLAN_AUDIT 9: "no half-authored variant can be selected"). */
      var usable = [];
      for (var i = 0; i < inner.length; i++) {
        if (isObj(inner[i]) && inner[i].type !== "retrieval") usable.push(inner[i]);
      }
      if (!usable.length) {
        this._warn("empty-variant",
          n.id + ": selected variant has no playable nodes; skipping the beat");
        this.top++;
        continue;
      }
      this.frame = {
        retrievalId: n.id,
        variantId: variant.id,
        nodes: usable,
        i: 0
      };
      return;
    }
  };

  /**
   * advance(payload) -> next node (or null at the end).
   *
   * If the caller hands us an answer for an exercise-shaped node we grade it
   * first, so `advance({answer:"..."})` is a legal one-call path. Calling
   * answer() yourself and then advance() with no payload is equally legal and
   * does not double-grade.
   */
  Engine.prototype.advance = function (payload) {
    payload = isObj(payload) ? payload : {};

    var from = this.current();

    if (from) {
      var exercise = this._exerciseOf(from);
      var carriesAnswer = has(payload, "answer") || has(payload, "raw") ||
        has(payload, "choiceId") || has(payload, "transcript");
      if (exercise && carriesAnswer) {
        var raw = has(payload, "answer") ? payload.answer :
                  has(payload, "raw") ? payload.raw :
                  has(payload, "transcript") ? payload.transcript :
                  payload.choiceId;
        this.answer(raw, payload);
      }
    }

    /* Move the cursor. */
    if (this.frame) {
      this.frame.i++;
      if (this.frame.i >= this.frame.nodes.length) {
        this.frame = null;
        this.top++;
      }
    } else {
      this.top++;
    }
    this._settle();

    var to = this.current();

    /* CONTRACT 2, binding: save after every node advance. Never deferred to
     * unload; beforeunload is not reliable (PLAN_AUDIT 5). */
    this._commitPosition(to, "advance");

    /* A stop:true node is a safe place to put the game down (PLAN_AUDIT 5).
     * The event fires after the position is committed and saved, so if the
     * learner takes the exit the save already points at the right place. The
     * UI is expected to overlay the offer; the engine cannot block. */
    if (from && from.stop === true) {
      this.emit("stoppoint", {
        node: from,
        next: to,
        nodeId: from.id,
        nextId: to ? to.id : null,
        atEnd: !to
      });
    }

    if (to) {
      this._enterNode(to, false);
    } else {
      this.emit("node", {
        node: null, nodeId: null, done: true,
        index: this.top, total: this.nodes.length
      });
    }
    return to;
  };

  /* Jump straight to a node id. Used by ui.js for the backlog / debug jumps
   * and by the "retry this exercise" path. Does not replay side effects of the
   * nodes in between. */
  Engine.prototype.goTo = function (nodeId) {
    if (!isStr(nodeId) || !has(this.index, nodeId)) return null;
    var loc = this.index[nodeId];
    this.top = loc.top;
    this.frame = null;
    if (loc.variantId) {
      var rnode = this.nodes[loc.top];
      var variants = arr(rnode && rnode.variants);
      for (var i = 0; i < variants.length; i++) {
        if (variants[i] && variants[i].id === loc.variantId) {
          this._picks()[rnode.id] = loc.variantId;
          this.frame = {
            retrievalId: rnode.id,
            variantId: loc.variantId,
            nodes: arr(variants[i].nodes),
            i: num(loc.sub, 0)
          };
        }
      }
    }
    this._settle();
    var node = this.current();
    this._commitPosition(node, "goto");
    if (node) this._enterNode(node, false);
    return node;
  };

  Engine.prototype._commitPosition = function (node, reason) {
    if (!isObj(this.state.position)) {
      this.state.position = { nodeId: null, variantPicks: {} };
    }
    this.state.position.nodeId = node ? node.id : null;
    this._save(reason || "position");
  };

  /* Everything that happens because the learner arrived at a node. */
  Engine.prototype._enterNode = function (node, isResume) {
    if (!isObj(node)) return;

    /* Exposure. An item that appears in teaches[] (or in a letters node, or
     * in the reviews[] of something the learner actually reached) gets its
     * recognition card here and only here. */
    var introduced = this._registerExposure(node);

    /* Literal memory declarations on a line ("she now knows you have arrived")
     * apply on entry; placeholder-valued ones wait for an answer. */
    this._applyMemory(node, null);

    /* Per-node attempt bookkeeping for the self-correction rule. */
    this._nodeAttempts = 0;

    var payload = {
      node: node,
      nodeId: node.id,
      type: node.type || null,
      index: this.top,
      total: this.nodes.length,
      inRetrieval: this.frame ? this.frame.retrievalId : null,
      variantId: this.frame ? this.frame.variantId : null,
      resumed: !!isResume,
      introduced: introduced,
      reviewBudget: this.reviewBudget(),
      done: false
    };

    /* A checkpoint node IS the ability report (CONTRACT 1.3, beat 8). Build it
     * here so the UI never has to decide when to ask. */
    if (node.type === "checkpoint") {
      payload.report = this.report();
    }

    this.emit("node", payload);
  };

  /* --------------------------------------------------------------------- *
   * Exposure and lazy card creation  (PLAN_AUDIT 6.2 / CONTRACT 2, binding)
   * --------------------------------------------------------------------- *
   *
   * The rule that matters: an item gets ONE card on first exposure, at the
   * recognition dimension. Higher dimensions are created only when the
   * dimension below has produced at least one "good" rating, and production
   * dimensions are created only in the modality actually used.
   *
   * The defect this replaces: four cards per item at introduction, which for
   * a 3,500-lemma course projected ~14,000 scheduled cards whose steady-state
   * review load alone would swamp a 15-minute session (PLAN_AUDIT 6.2, and
   * defect #4 in the revision-2 changelog). Do not "optimise" this by
   * pre-creating the ladder.
   */

  Engine.prototype._itemsOf = function (node) {
    if (!isObj(node)) return [];
    var out = [], seen = {};
    function push(list) {
      for (var i = 0; i < list.length; i++) {
        var id = list[i];
        if (isStr(id) && !has(seen, id)) { seen[id] = true; out.push(id); }
      }
    }
    push(arr(node.teaches));
    push(arr(node.reviews));
    /* A letters node teaches letter items ("ltr:R"), which are scheduled
     * exactly like lexemes. */
    push(arr(node.letters));
    var exercise = this._exerciseOf(node);
    if (exercise && exercise !== node) {
      push(arr(exercise.reviews));
      push(arr(exercise.teaches));
    }
    return out;
  };

  /* Which of a node's items the node actually TEACHES, as opposed to merely
   * exercises. Both get a card here; only the taught ones count against the
   * introduction ceiling. tools/lint.py --stats draws exactly this line, and
   * calls the other group "reviewed, untaught": data/session0.js deliberately
   * keeps seven cold-read pool words (ракета, нос, сон, мост, морс, крот,
   * карта) out of teaches[] because the learner decodes them rather than being
   * taught them. Counting those as introductions made a normal playthrough
   * trip the ceiling at the eleventh exposure, around s0.ex5, every single
   * time — the engine and the lint disagreeing about what "a new item" means. */
  Engine.prototype._taughtBy = function (node) {
    var out = {}, i;
    var list = arr(node && node.teaches).concat(arr(node && node.letters));
    var exercise = this._exerciseOf(node);
    if (exercise && exercise !== node) list = list.concat(arr(exercise.teaches));
    for (i = 0; i < list.length; i++) {
      if (isStr(list[i])) out[list[i]] = true;
    }
    return out;
  };

  Engine.prototype._registerExposure = function (node) {
    var items = this._itemsOf(node);
    var taught = this._taughtBy(node);
    var introduced = [];
    for (var i = 0; i < items.length; i++) {
      if (this._expose(items[i], taught[items[i]] === true)) introduced.push(items[i]);
    }
    if (introduced.length) this._save("exposure");
    return introduced;
  };

  /* Returns true if this call created the item (first exposure).
   * `counts` says whether this exposure is an INTRODUCTION for the purposes of
   * the PLAN_AUDIT 6.2 ceiling; every first exposure still gets its card. */
  Engine.prototype._expose = function (itemId, counts) {
    if (!isStr(itemId)) return false;
    var mastery = this.state.mastery;
    if (has(mastery, itemId) && isObj(mastery[itemId])) {
      /* Already known. Make sure the recognition card exists anyway: a save
       * hand-edited or migrated from an older shape might be missing it. */
      if (!isObj(mastery[itemId].recognition)) {
        mastery[itemId].recognition = this._newCard();
      }
      return false;
    }
    mastery[itemId] = { recognition: this._newCard() };

    if (counts === true) {
      this.newItemsThisSession++;
      if (this.newItemsThisSession === this.newItemCap + 1) {
        /* Ceiling, not a gate: we complain once and keep playing. */
        this._warn("new-item-cap",
          "this session has now introduced more than " + this.newItemCap +
          " new items (PLAN_AUDIT 6.2 ceiling)");
      }
    }
    return true;
  };

  Engine.prototype._newCard = function () {
    var now = this._now();
    if (RU.srs && typeof RU.srs.newCard === "function") {
      try {
        var c = RU.srs.newCard();
        if (isObj(c)) return c;
      } catch (e) {
        this._error("srs", "newCard threw: " + (e && e.message));
      }
    }
    return fallbackCard(now);
  };

  /**
   * Fetch the card for an item+bucket, creating it if (and only if) the
   * ladder permits. Returns null when creation is blocked, which is a normal
   * outcome, not an error: the attempt is still logged and still shows up in
   * report(); it simply does not schedule a card yet.
   */
  Engine.prototype._cardFor = function (itemId, bucket, create) {
    if (!isStr(itemId) || !isStr(bucket)) return null;
    var mastery = this.state.mastery;
    var entry = has(mastery, itemId) ? mastery[itemId] : null;
    if (!isObj(entry)) {
      if (!create) return null;
      /* Should not normally happen: exposure runs on node entry. An exercise
       * that reviews an item never introduced elsewhere lands here. */
      this._expose(itemId);
      entry = mastery[itemId];
    }
    if (isObj(entry[bucket])) return entry[bucket];
    if (!create) return null;

    var below = bucketBelow(bucket);
    if (below !== null && !this._hasGoodEvidence(itemId, below)) {
      return null; /* ladder-locked; caller records `ladderLocked` */
    }
    entry[bucket] = this._newCard();
    return entry[bucket];
  };

  /**
   * Has this item ever earned a "good" (or better) at this bucket?
   *
   * Source of truth is the immutable attempt log plus the folded aggregates,
   * not the card, because a card's counters cannot distinguish a "good" from
   * an "again" after the fact.
   *
   * The `rating` field on an attempt is an additive extension of CONTRACT 1.5.
   * If a future save.js strips unknown fields, we fall back to
   * `correct && !assisted`, which is the same predicate minus the
   * hard/self-corrected distinction: slightly more permissive, never less.
   */
  Engine.prototype._hasGoodEvidence = function (itemId, bucket) {
    var agg = this._aggregateFor(itemId, bucket, false);
    if (agg && num(agg.good, 0) > 0) return true;

    var list = this._attemptsByItem[itemId];
    if (!list) return false;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!isObj(a)) continue;
      if (this._bucketOfAttempt(a) !== bucket) continue;
      if (a.assisted === true) continue;           /* hints are never evidence */
      if (a.rating === "good" || a.rating === "easy") return true;
      if (a.rating === undefined && a.correct === true) return true;
    }
    return false;
  };

  Engine.prototype._bucketOfAttempt = function (a) {
    if (isStr(a.bucket)) return a.bucket;
    return bucketKey(a.dimension, a.modality);
  };

  /* aggregates[itemId]["dimension|modality"] - dimension+modality rather than
   * bucket, so a folded attempt keeps its "choice" modality for the report. */
  Engine.prototype._aggregateFor = function (itemId, bucket, create) {
    var key = isStr(itemId) ? itemId : "(none)";
    var store = this.state.aggregates;
    var forItem = has(store, key) ? store[key] : null;
    if (!isObj(forItem)) {
      if (!create) return null;
      forItem = store[key] = {};
    }
    /* Match any dimension|modality that maps onto this bucket. */
    var p = parseBucket(bucket);
    var slot = p.dimension + "|" + (p.modality === null ? "-" : p.modality);
    if (!isObj(forItem[slot])) {
      if (!create) {
        /* A receptive bucket may have been folded under any modality. Sum. */
        if (p.modality === null) {
          var merged = null;
          for (var k in forItem) {
            if (!has(forItem, k)) continue;
            if (k.slice(0, p.dimension.length + 1) !== p.dimension + "|") continue;
            var row = forItem[k];
            if (!isObj(row)) continue;
            if (!merged) merged = { attempts: 0, unaided: 0, correct: 0, assisted: 0, good: 0 };
            merged.attempts += num(row.attempts, 0);
            merged.unaided += num(row.unaided, 0);
            merged.correct += num(row.correct, 0);
            merged.assisted += num(row.assisted, 0);
            merged.good += num(row.good, 0);
          }
          return merged;
        }
        return null;
      }
      forItem[slot] = { attempts: 0, unaided: 0, correct: 0, assisted: 0, good: 0 };
    }
    return forItem[slot];
  };

  /* --------------------------------------------------------------------- *
   * Due items, priority order and the review cap
   * --------------------------------------------------------------------- */

  Engine.prototype._isDue = function (card, now) {
    if (!isObj(card)) return false;
    if (RU.srs && typeof RU.srs.due === "function") {
      try { return !!RU.srs.due(card, now); }
      catch (e) { /* fall through to the naive check */ }
    }
    return num(card.due, 0) <= now;
  };

  /* itemId -> { weight, tier, overdueMs, buckets:[...] } for every item with
   * at least one due card. */
  Engine.prototype.dueMap = function (now) {
    now = num(now, this._now());
    var out = {};
    var mastery = this.state.mastery;
    var needs = this._upcomingNeeds();

    var ids = keysSorted(mastery);
    for (var i = 0; i < ids.length; i++) {
      var itemId = ids[i];
      var entry = mastery[itemId];
      if (!isObj(entry)) continue;
      var dueBuckets = [], worstOverdue = -Infinity, anyDue = false;
      var bkeys = keysSorted(entry);
      for (var j = 0; j < bkeys.length; j++) {
        var card = entry[bkeys[j]];
        if (!isObj(card)) continue;
        if (!this._isDue(card, now)) continue;
        anyDue = true;
        dueBuckets.push(bkeys[j]);
        var over = now - num(card.due, now);
        if (over > worstOverdue) worstOverdue = over;
        if (!has(out, itemId)) out[itemId] = { reps: num(card.reps, 0) };
        else out[itemId].reps = Math.max(out[itemId].reps, num(card.reps, 0));
      }
      if (!anyDue) continue;

      /* Priority order (PLAN_AUDIT 6.2, verbatim):
       *   overdue > confusable-pair errors > items the next node needs > rest
       * "overdue" means a card that has actually been reviewed before and is
       * now past its due date; a brand-new card is due but not overdue. */
      var tier = 1;
      if (has(needs, itemId)) tier = 2;
      if (this._sessionSlips[itemId] === true) tier = 3;
      if (out[itemId].reps > 0 && worstOverdue > 0) tier = 4;

      /* Fractional tiebreak so ordering is total and deterministic: more
       * overdue sorts first inside a tier, capped so it can never cross one. */
      var frac = Math.min(Math.max(worstOverdue, 0) / DAY_MS, 30) / 100;
      out[itemId] = {
        weight: tier + frac,
        tier: tier,
        overdueMs: Math.max(worstOverdue, 0),
        reps: out[itemId].reps,
        buckets: dueBuckets
      };
    }
    return out;
  };

  /**
   * dueQueue(limit) -> [{itemId, weight, tier, overdueMs, buckets}]
   * Sorted by priority, truncated to the remaining review budget (or `limit`,
   * whichever is smaller). Overflow is deferred, not dropped: it stays due and
   * surfaces next session (PLAN_AUDIT 6.2).
   */
  Engine.prototype.dueQueue = function (limit) {
    var map = this.dueMap();
    var rows = [];
    var ids = keysSorted(map);
    for (var i = 0; i < ids.length; i++) {
      rows.push({
        itemId: ids[i],
        weight: map[ids[i]].weight,
        tier: map[ids[i]].tier,
        overdueMs: map[ids[i]].overdueMs,
        buckets: map[ids[i]].buckets
      });
    }
    /* Sort by descending weight; ties break by ascending itemId (ids are
     * already sorted, and the sort below is made stable by decoration). */
    rows = sortByKeyAscending(rows, function (r) {
      /* Encode descending weight as an ascending string key so one stable
       * ascending sort does the whole job. */
      var w = Math.max(0, Math.min(9999, Math.round((10 - r.weight) * 1000)));
      var pad = "0000" + w;
      return pad.slice(pad.length - 5) + "|" + r.itemId;
    });

    var cap = this.reviewRemaining();
    var n = num(limit, cap);
    if (n > cap) n = cap;
    if (n < 0) n = 0;
    return rows.slice(0, n);
  };

  Engine.prototype.reviewRemaining = function () {
    var left = this.reviewCap - this.reviewsUsed;
    return left > 0 ? left : 0;
  };

  Engine.prototype.reviewBudget = function () {
    return {
      cap: this.reviewCap,
      used: this.reviewsUsed,
      remaining: this.reviewRemaining(),
      exhausted: this.reviewRemaining() === 0
    };
  };

  Engine.prototype.setReviewCap = function (n) {
    this.reviewCap = num(n, REVIEW_CAP_DEFAULT);
    return this.reviewCap;
  };

  /* Items that the next few top-level nodes will exercise. Feeds priority
   * tier 2 and the variant score. */
  Engine.prototype._upcomingNeeds = function () {
    var out = {};
    var start = this.top;
    for (var i = start; i < this.nodes.length && i < start + LOOKAHEAD + 1; i++) {
      var n = this.nodes[i];
      if (!isObj(n)) continue;
      if (i === start && !this.frame && n.type !== "retrieval") {
        /* The node we are standing on is not "next". */
        continue;
      }
      var items = this._itemsOf(n);
      for (var j = 0; j < items.length; j++) out[items[j]] = true;
      if (n.type === "retrieval") {
        var vs = arr(n.variants);
        for (var k = 0; k < vs.length; k++) {
          var covers = arr(vs[k] && vs[k].covers);
          for (var m = 0; m < covers.length; m++) {
            if (isStr(covers[m])) out[covers[m]] = true;
          }
        }
      }
    }
    return out;
  };

  /* --------------------------------------------------------------------- *
   * pickVariant  (CONTRACT 2, binding)
   * --------------------------------------------------------------------- *
   *
   * Why variants and not word substitution:
   *
   * Revision 1 of the plan had the engine drop due vocabulary into
   * part-of-speech-tagged slots at runtime. That is unsound in Russian.
   * Swapping a noun into a frame changes the adjective agreement, the verb's
   * government, the case ending and frequently the stress, so the sentence
   * stops being correct Russian; and Anya's lines are pre-baked TTS clips that
   * cannot be re-spliced per word, so the substituted sentence would have no
   * matching audio either (PLAN_AUDIT 6.4 "Retrieval variants", changelog
   * defect #2). So a retrieval beat is authored as a set of COMPLETE
   * alternative exchanges, each linted and voiced as a whole, and the only
   * runtime decision is which one to play.
   *
   * Determinism: the choice must be reproducible. Math.random would make a
   * resumed session show a different exchange than the one the learner was
   * halfway through, so the tiebreak is ascending variant id and the winner is
   * written to state.position.variantPicks and reused verbatim on reload.
   */
  Engine.prototype.pickVariant = function (node) {
    if (!isObj(node)) return null;
    var variants = arr(node.variants);
    if (!variants.length) return null;

    var picks = this._picks();
    var i;

    /* 1. Reuse a previous pick, so a reloaded session shows the same variant. */
    var prev = picks[node.id];
    if (isStr(prev)) {
      for (i = 0; i < variants.length; i++) {
        if (isObj(variants[i]) && variants[i].id === prev) return variants[i];
      }
      /* The recorded variant no longer exists (content migration). Drop it and
       * pick again rather than playing nothing. */
      this._warn("variant-pick-stale",
        node.id + ": saved pick " + prev + " no longer exists; re-picking");
      delete picks[node.id];
    }

    /* 2. Score by coverage of the currently-due item set, weighted by the same
     *    priority order the review queue uses. */
    var due = this.dueMap();
    var budget = this.reviewRemaining();
    var ordered = sortByKeyAscending(variants, function (v) {
      return isObj(v) && isStr(v.id) ? v.id : "\uFFFF";
    });

    var best = null, bestScore = -Infinity;
    for (i = 0; i < ordered.length; i++) {
      var v = ordered[i];
      if (!isObj(v) || !isStr(v.id)) continue;
      if (!arr(v.nodes).length) continue;   /* half-authored: not selectable */

      var covers = arr(v.covers);
      var score = 0, hits = 0;
      for (var j = 0; j < covers.length; j++) {
        var itemId = covers[j];
        if (!isStr(itemId)) continue;
        /* Only items the learner has actually met can be "reviewed"
         * (PLAN_AUDIT 6.4: "subject to ... what has been introduced"). */
        if (!has(this.state.mastery, itemId)) continue;
        if (!has(due, itemId)) continue;
        score += due[itemId].weight;
        hits++;
      }

      if (budget <= 0) {
        /* Review cap spent. Overflow is deferred, so prefer the variant that
         * adds the least new retrieval load - the "neutral" one if the author
         * marked one (PLAN_AUDIT 6.4: "If nothing fits, it plays a neutral
         * variant"). */
        score = -score;
        if (v.neutral === true) score += 0.5;
      } else if (v.neutral === true && hits === 0) {
        /* A neutral variant is the sane floor when nothing else covers
         * anything, but must never beat a variant that covers real work. */
        score += 0.01;
      }

      /* Strict `>` over an id-ascending list gives the contract's tiebreak:
       * on equal score the lowest variant id wins. */
      if (score > bestScore) { bestScore = score; best = v; }
    }

    if (!best) {
      for (i = 0; i < ordered.length; i++) {
        if (isObj(ordered[i]) && isStr(ordered[i].id)) { best = ordered[i]; break; }
      }
    }
    if (!best) return null;

    picks[node.id] = best.id;
    this._save("variant");
    return best;
  };

  Engine.prototype._picks = function () {
    if (!isObj(this.state.position)) {
      this.state.position = { nodeId: null, variantPicks: {} };
    }
    if (!isObj(this.state.position.variantPicks)) {
      this.state.position.variantPicks = {};
    }
    return this.state.position.variantPicks;
  };

  /* --------------------------------------------------------------------- *
   * answer()  -  the critical path
   * --------------------------------------------------------------------- *
   *
   * Order is fixed by CONTRACT 2:
   *   1. grade via RU.grade.check
   *   2. derive a rating via RU.srs.deriveRating
   *   3. if the rating is non-null, apply RU.srs.rate to the right card
   *   4. append an immutable attempt record
   *   5. update Anya's memory if the node declares it
   *   6. RU.save.write(state)
   *   7. emit "graded"
   */

  Engine.prototype._exerciseOf = function (node) {
    if (!isObj(node)) return null;
    if (node.type === "exercise") return node;
    /* A weblab node wraps one exercise-shaped question (CONTRACT 1.3). */
    if (node.type === "weblab" && isObj(node.task) && isObj(node.task.question)) {
      return node.task.question;
    }
    if (isObj(node.question)) return node.question;
    return null;
  };

  /* Closed exercises are answered by choice id in the UI but graded as text.
   * Translate here so grade.js only ever sees an answer string, and note the
   * resolved choice for the record. */
  Engine.prototype._resolveChoice = function (exercise, raw) {
    var choices = arr(exercise && exercise.choices);
    if (!choices.length || !isStr(raw)) return null;
    for (var i = 0; i < choices.length; i++) {
      if (isObj(choices[i]) && choices[i].id === raw) return choices[i];
    }
    return null;
  };

  Engine.prototype.answer = function (raw, meta) {
    meta = isObj(meta) ? meta : {};
    var at = this._now();
    var node = this.current();
    if (!node) {
      this._error("no-node", "answer() called with no current node");
      return null;
    }
    var exercise = this._exerciseOf(node);
    if (!exercise) {
      this._error("not-an-exercise",
        "answer() called on node " + node.id + " of type " + node.type);
      return null;
    }

    this._nodeAttempts = num(this._nodeAttempts, 0) + 1;

    var graded = exercise.graded !== false;
    var choice = this._resolveChoice(exercise, raw);
    /* CONTRACT 1.3 makes the choice `id` the raw answer for a closed item, and
       grade.js checkClosed matches on id FIRST, falling back to the visible
       Russian only for callers that did not resolve a choice. Handing it the
       Russian is wrong the moment two choices share a surface form - s0.ex1
       has three choices all reading "РОК" - because the id match then misses
       and the text fallback takes the FIRST match, scoring the wrong button
       while the UI highlights the right one. Anya's memory still wants the
       word the learner saw, so that goes on its own variable. */
    var forGrader = (choice && choice.id !== undefined && choice.id !== null)
      ? String(choice.id) : raw;
    var forMemory = choice && isStr(choice.ru) ? choice.ru : raw;

    /* ---- 1. grade -------------------------------------------------- */
    var result = { ok: false, diagnosis: null, matched: null };
    var gradeFailed = false;

    if (graded) {
      if (RU.grade && typeof RU.grade.check === "function") {
        try {
          var r = RU.grade.check(forGrader, exercise, RU.LEXICON || {});
          if (isObj(r)) {
            result = {
              ok: r.ok === true,
              diagnosis: isObj(r.diagnosis) ? r.diagnosis : null,
              matched: isStr(r.matched) ? r.matched : null
            };
          } else {
            gradeFailed = true;
          }
        } catch (e) {
          gradeFailed = true;
          this._error("grade",
            "grade.check threw on " + node.id + ": " + (e && e.message));
        }
      } else if (choice) {
        /* grade.js absent (engine-only test): a closed exercise can still be
         * resolved from its own key. */
        result.ok = choice.correct === true;
        result.matched = isStr(choice.ru) ? choice.ru : null;
      } else {
        gradeFailed = true;
        this._error("grade", "RU.grade.check is unavailable");
      }
    }

    var measurable = graded && !gradeFailed;
    /* correct === null means "not measured": an open exercise (graded:false,
     * practice only, PLAN_AUDIT 6.4) or a grader failure. It is never counted
     * as either right or wrong. */
    var correct = measurable ? (result.ok === true) : null;
    var assisted = meta.assisted === true;
    var interfered = meta.interfered === true;
    var latencyMs = num(meta.latencyMs, null);

    var modality = effectiveModality(exercise, meta);
    var dimension = normaliseDimension(
      exercise.dimension || node.dimension || "recognition");

    /* Tapping a choice is not production. If an author tags a closed exercise
     * as controlled/spontaneous, file it at "meaning" instead of minting a
     * production card from a multiple-choice tap (PLAN_AUDIT 6.4 table:
     * closed feeds recognition / meaning-in-context). Complain so the content
     * gets fixed. */
    if (modality === "choice" && PRODUCTION[dimension]) {
      this._warn("choice-production",
        node.id + " declares dimension " + dimension +
        " with a choice answer; filing as meaning instead");
      dimension = "meaning";
    }

    var bucket = bucketKey(dimension, modality);

    /* Items this attempt is evidence about. */
    var items = arr(exercise.reviews);
    if (!items.length) items = arr(node.reviews);
    if (!items.length) items = arr(node.teaches);

    /* ---- confusable-pair / self-correction context ------------------ *
     * PLAN_AUDIT 6.4 makes "hard" the rating for a correct answer that came
     * after a wrong-form-then-right-form sequence or a confusable-pair slip
     * IN THE SAME SESSION. The UI cannot know that; the engine can, so it
     * computes both here and hands them to deriveRating. */
    if (measurable && correct === false && result.diagnosis) {
      this._noteSlip(items, result.diagnosis, exercise);
    }

    var records = [];
    var cardsUpdated = [];
    var ladderLocked = [];
    var ratings = {};

    var effectiveItems = items.length ? items : [null];

    for (var i = 0; i < effectiveItems.length; i++) {
      var itemId = isStr(effectiveItems[i]) ? effectiveItems[i] : null;

      var selfCorrected = meta.selfCorrected === true;
      var slip = meta.confusablePairSlip === true;
      if (itemId) {
        /* A previous wrong answer on this item+bucket earlier in the session
         * is exactly the "wrong-form-then-right-form" sequence. */
        if (this._sessionWrong[itemId + "|" + bucket] === true) selfCorrected = true;
        if (this._sessionSlips[itemId] === true) slip = true;
      } else if (this._nodeAttempts > 1) {
        selfCorrected = true;
      }

      /* ---- 2. derive a rating ------------------------------------- */
      var rating = null;
      if (measurable) {
        if (RU.srs && typeof RU.srs.deriveRating === "function") {
          try {
            rating = RU.srs.deriveRating({
              correct: correct,
              assisted: assisted,
              selfCorrected: selfCorrected,
              confusablePairSlip: slip,
              latencyMs: latencyMs,
              modality: modality,
              interfered: interfered
            });
          } catch (e) {
            rating = null;
            this._error("srs", "deriveRating threw: " + (e && e.message));
          }
        }
        if (rating !== "again" && rating !== "hard" &&
            rating !== "good" && rating !== "easy") {
          rating = null;
        }
      }

      /* *********************************************************************
       * THE ASSISTED BRANCH.  READ THIS BEFORE CHANGING ANYTHING BELOW.
       *
       * deriveRating returns null when the attempt must NOT be rated. The
       * only guaranteed case is assisted === true: the learner asked for a
       * hint, saw the answer, or was walked to it.
       *
       * When the rating is null we:
       *     - record the attempt, with assisted:true, in the immutable log
       *     - DO NOT create a card
       *     - DO NOT call RU.srs.rate
       *     - DO NOT touch the existing card in any way
       * so the card stays exactly as due as it was.
       *
       * This is the whole point. Scoring a hinted answer as "hard" - which is
       * what revision 1 of the plan did, and defect #5 in the changelog -
       * pushes the card's interval OUT, so the scheduler starts treating
       * assisted completion as independent retrieval and the item quietly
       * stops coming back. An assisted attempt is a request for more
       * practice, not evidence of memory. It raises the item's priority
       * (via the hint flag in report()) and changes nothing else.
       *
       * Belt and braces: even if a future srs.js forgets its own rule and
       * returns a rating for an assisted attempt, we force it back to null.
       * ******************************************************************* */
      if (assisted) rating = null;

      /* ---- 3. apply the rating to the right card ------------------- */
      var cardBefore = itemId ? this._cardFor(itemId, bucket, false) : null;
      var wasReview = !!cardBefore;
      var cardAfter = null;

      if (rating !== null && itemId) {
        var card = this._cardFor(itemId, bucket, true);
        if (!card) {
          /* Ladder-locked: the dimension below has not produced a "good" yet,
           * so no card is created (PLAN_AUDIT 6.2). The evidence is not lost -
           * it lives in the attempt log and unlocks the bucket the moment the
           * level below earns its "good". */
          ladderLocked.push({ itemId: itemId, bucket: bucket, rating: rating });
        } else if (RU.srs && typeof RU.srs.rate === "function") {
          try {
            var next = RU.srs.rate(card, rating, at);
            if (isObj(next)) {
              this.state.mastery[itemId][bucket] = next;
              cardAfter = next;
              cardsUpdated.push({ itemId: itemId, bucket: bucket, rating: rating,
                                  card: next });
            }
          } catch (e) {
            this._error("srs", "rate threw for " + itemId + ": " + (e && e.message));
          }
        } else {
          this._error("srs", "RU.srs.rate is unavailable; nothing was scheduled");
        }
      }

      if (itemId) ratings[itemId] = rating;

      /* ---- 4. append the immutable attempt record ------------------ */
      var record = this._recordAttempt({
        at: at,
        nodeId: node.id,
        itemId: itemId,
        dimension: dimension,
        modality: modality,
        correct: correct,
        assisted: assisted,
        latencyMs: latencyMs,
        raw: raw,
        /* additive, documented above in _hasGoodEvidence */
        rating: rating,
        bucket: bucket,
        /* ui.js's open-exercise self-assessment ("yes"|"partly"|"no"). It is
         * evidence about the learner's own judgement, never about the memory,
         * so it is stored beside the attempt and feeds no card and no
         * accuracy figure (PLAN_AUDIT 6.4). Before this it was emitted by the
         * UI and read by nobody. */
        selfRating: isStr(meta.selfRating) ? meta.selfRating : null
      });
      records.push(record);

      /* Session bookkeeping AFTER the record, so a wrong answer does not mark
       * itself as its own predecessor. */
      if (itemId && measurable) {
        if (correct === false) this._sessionWrong[itemId + "|" + bucket] = true;
        /* Each graded retrieval on an item that already had a card counts
         * against the per-session review cap (PLAN_AUDIT 6.2). A first
         * exposure is teaching, not review. */
        if (wasReview) this.reviewsUsed++;
      }
    }

    /* ---- 5. Anya's memory ------------------------------------------ */
    var remembered = this._applyMemory(node, {
      raw: raw,
      answer: this._normalise(isStr(forMemory) ? forMemory : raw),
      matched: result.matched,
      choice: choice,
      correct: correct,
      at: at
    });

    /* ---- 6. save --------------------------------------------------- *
     * CONTRACT 2, binding: after every graded answer. save.write is debounced
     * inside save.js and returns immediately; we never defer to unload. */
    this._save("answer");

    /* ---- 7. emit --------------------------------------------------- */
    var payload = {
      node: node,
      nodeId: node.id,
      exercise: exercise,
      raw: raw,
      choice: choice,
      graded: graded,
      measured: measurable,
      ok: correct === true,
      correct: correct,
      assisted: assisted,
      diagnosis: result.diagnosis,
      matched: result.matched,
      dimension: dimension,
      modality: modality,
      bucket: bucket,
      items: items,
      ratings: ratings,
      cardsUpdated: cardsUpdated,
      ladderLocked: ladderLocked,
      attempts: records,
      attemptsOnThisNode: this._nodeAttempts,
      remembered: remembered,
      reviewBudget: this.reviewBudget(),
      /* Feedback order (PLAN_AUDIT 6.4 / Codex, kept): confirm meaning -> one
       * issue -> replay model -> one retry -> move on. The engine tells the UI
       * whether the retry has been spent. */
      retryAvailable: measurable && correct === false &&
                      this._nodeAttempts < 2 && !assisted
    };
    this.emit("graded", payload);
    return payload;
  };

  /* A wrong answer whose diagnosis names a different lexeme is a confusable
   * slip when the two are declared contrasts (letters taught by contrast, or
   * a lexeme's contrastWith/confusableWith). Both members are marked, because
   * the pair is the unit that is confused. */
  Engine.prototype._noteSlip = function (items, diagnosis, exercise) {
    var other = isObj(diagnosis) && isStr(diagnosis.lex) ? diagnosis.lex : null;
    if (!other) return;
    /* An authored `{type:"notLex", lex:"..."}` check IS a declaration that the
     * two are the confusable pair - CONTRACT 3 beat 4 says the notLex
     * diagnosis exists "so the engine can log a confusable-pair slip". The
     * confusable map is built from contrastWith/confusableWith, and
     * data/lexicon.js declares neither on кот/крот, so beat 4's whole point
     * was landing as an ordinary wrong answer. Read the check as well. */
    var declared = this._notLexOf(exercise);
    for (var i = 0; i < items.length; i++) {
      var itemId = items[i];
      if (!isStr(itemId)) continue;
      if (other === itemId) continue;
      var pairs = this._confusable[itemId];
      var linked = !!(pairs && pairs[other] === true) || declared[other] === true;
      if (linked) {
        this._sessionSlips[itemId] = true;
        this._sessionSlips[other] = true;
      }
    }
  };

  /* { lexId: true } for every notLex check the exercise declares. */
  Engine.prototype._notLexOf = function (exercise) {
    var out = {};
    var checks = arr(exercise && exercise.checks);
    for (var i = 0; i < checks.length; i++) {
      if (isObj(checks[i]) && checks[i].type === "notLex" && isStr(checks[i].lex)) {
        out[checks[i].lex] = true;
      }
    }
    return out;
  };

  Engine.prototype._normalise = function (s) {
    if (RU.grade && typeof RU.grade.normalise === "function") {
      try { return RU.grade.normalise(s); }
      catch (e) { /* fall through */ }
    }
    return isStr(s) ? s.replace(/\s+/g, " ").trim().toLowerCase() : "";
  };

  /* --------------------------------------------------------------------- *
   * The attempt log
   * --------------------------------------------------------------------- */

  Engine.prototype._recordAttempt = function (fields) {
    var at = num(fields.at, this._now());
    /* Deterministic id: timestamp plus a monotonic per-save sequence. No
     * Math.random anywhere in this module. */
    var seq = this._attemptSeq++;
    var record = {
      id: "att." + at.toString(36) + "." + seq.toString(36),
      nodeId: fields.nodeId,
      itemId: fields.itemId,
      dimension: fields.dimension,
      modality: fields.modality,
      correct: fields.correct,
      assisted: fields.assisted === true,
      latencyMs: fields.latencyMs,
      raw: isStr(fields.raw) ? fields.raw : (fields.raw === null || fields.raw === undefined ? null : String(fields.raw)),
      at: at,
      /* additive extensions (see _hasGoodEvidence) */
      rating: fields.rating === undefined ? null : fields.rating,
      bucket: fields.bucket,
      selfRating: fields.selfRating === undefined ? null : fields.selfRating
    };

    /* Append-only: nothing in this module ever rewrites an existing record. */
    this.state.attempts.push(record);
    var key = isStr(record.itemId) ? record.itemId : "(none)";
    if (!this._attemptsByItem[key]) this._attemptsByItem[key] = [];
    this._attemptsByItem[key].push(record);

    this._trimAttemptLog();
    return record;
  };

  /* PLAN_AUDIT 5: the log is capped and older entries are FOLDED into
   * aggregates, not discarded, so report() totals and the ladder unlock stay
   * correct for the whole life of the save. */
  Engine.prototype._trimAttemptLog = function () {
    var attempts = this.state.attempts;
    if (attempts.length <= ATTEMPT_LOG_CAP) return;
    var overflow = attempts.length - ATTEMPT_LOG_CAP;
    var folded = attempts.splice(0, overflow);
    for (var i = 0; i < folded.length; i++) {
      var a = folded[i];
      if (!isObj(a)) continue;
      var bucket = this._bucketOfAttempt(a);
      var p = parseBucket(bucket);
      var slot = p.dimension + "|" +
        (isStr(a.modality) ? a.modality : (p.modality === null ? "-" : p.modality));
      var itemKey = isStr(a.itemId) ? a.itemId : "(none)";
      if (!isObj(this.state.aggregates[itemKey])) {
        this.state.aggregates[itemKey] = {};
      }
      var row = this.state.aggregates[itemKey][slot];
      if (!isObj(row)) {
        row = this.state.aggregates[itemKey][slot] =
          { attempts: 0, unaided: 0, correct: 0, assisted: 0, good: 0 };
      }
      row.attempts++;
      if (a.assisted === true) row.assisted++;
      else {
        if (a.correct === true || a.correct === false) row.unaided++;
        if (a.correct === true) row.correct++;
        if (a.rating === "good" || a.rating === "easy") row.good++;
        else if (a.rating === undefined && a.correct === true) row.good++;
      }
    }
    /* Rebuild the per-item index; the folded records are gone from it. */
    this._indexAttempts();
    this._attemptSeq = attempts.length + overflow;
  };

  /* --------------------------------------------------------------------- *
   * Anya's memory  (PLAN_AUDIT 4, "The memory is a real data structure")
   * --------------------------------------------------------------------- *
   *
   * CONTRACT 1.5 defines state.memory but section 1.3 never says how a node
   * declares a write into it, so the engine accepts the plausible shapes and
   * documents them here:
   *
   *   node.remembers = "name"                  -> memory.name = the answer
   *   node.remembers = ["metAnya","arrived"]   -> each key set to true
   *   node.remembers = { key:"name", value:"$answer" }
   *   node.memory    = { name:"$answer", metAnya:true, city:"$raw" }
   *
   * Placeholders, resolved from the answer that was just given:
   *   "$answer"  normalised answer text     "$raw"      exactly what was typed
   *   "$matched" the accepted-answer member "$at"       timestamp
   *   "$choice"  the chosen choice's id
   *
   * A key whose value is a placeholder is skipped when there is no answer in
   * hand (i.e. on plain node entry), so a line node's literal flags apply
   * immediately and an exercise's captured value waits for the answer.
   * Nothing is written for a wrong answer: Anya should not remember your name
   * as the thing you mistyped.
   */
  Engine.prototype._applyMemory = function (node, ctx) {
    if (!isObj(node)) return null;

    var decl = null;
    if (has(node, "remembers")) decl = node.remembers;
    else if (has(node, "memory")) decl = node.memory;
    if (decl === null || decl === undefined) return null;

    var self = this;
    var written = {};
    var wroteSomething = false;

    function placeholder(v) {
      return isStr(v) && v.charAt(0) === "$";
    }

    function resolve(v) {
      if (!placeholder(v)) return v;
      if (!ctx) return undefined;          /* wait for an answer */
      if (v === "$answer") return ctx.answer;
      if (v === "$raw") return ctx.raw;
      if (v === "$matched") return ctx.matched;
      if (v === "$at") return ctx.at;
      if (v === "$choice") return ctx.choice ? ctx.choice.id : null;
      return undefined;
    }

    function put(key, value) {
      if (!isStr(key)) return;
      if (value === undefined) return;
      self.state.memory[key] = value;
      written[key] = value;
      wroteSomething = true;
    }

    /* Only record an answer-derived memory if the answer was right (or the
     * exercise was not graded at all - an open reply is still a real thing she
     * can remember). */
    var answerUsable = !ctx || ctx.correct !== false;

    if (isStr(decl)) {
      if (ctx && answerUsable) put(decl, ctx.answer);
    } else if (isArray(decl)) {
      for (var i = 0; i < decl.length; i++) {
        var d = decl[i];
        if (isStr(d)) put(d, true);
        else if (isObj(d) && isStr(d.key)) {
          if (placeholder(d.value) && !answerUsable) continue;
          put(d.key, resolve(has(d, "value") ? d.value : true));
        }
      }
    } else if (isObj(decl)) {
      if (isStr(decl.key)) {
        if (!(placeholder(decl.value) && !answerUsable)) {
          put(decl.key, resolve(has(decl, "value") ? decl.value : true));
        }
      } else {
        for (var k in decl) {
          if (!has(decl, k)) continue;
          if (placeholder(decl[k]) && !answerUsable) continue;
          put(k, resolve(decl[k]));
        }
      }
    }

    if (wroteSomething) this._save("memory");
    return wroteSomething ? written : null;
  };

  /* --------------------------------------------------------------------- *
   * State mutation entry points for ui.js
   * --------------------------------------------------------------------- *
   * The engine is the only mutator of state (CONTRACT 2). The UI needs to set
   * the learner's name, the mic consent and the display settings, so those go
   * through here rather than through direct assignment.
   */

  Engine.prototype.setFlag = function (key, value) {
    if (!isStr(key)) return null;
    this.state.flags[key] = value;
    /* One-way mirror: keep speech.js's own consent record in step so the two
     * can never disagree about whether the microphone may be opened. */
    if (key === "micConsent" && RU.speech &&
        typeof RU.speech.setConsent === "function") {
      try { RU.speech.setConsent(value); }
      catch (e) { this._error("speech", "setConsent threw: " + (e && e.message)); }
    }
    this._save("flag");
    return value;
  };

  Engine.prototype.remember = function (key, value) {
    if (!isStr(key)) return null;
    this.state.memory[key] = value;
    this._save("memory");
    return value;
  };

  Engine.prototype.setSetting = function (key, value) {
    if (!isStr(key)) return null;
    this.state.settings[key] = value;
    this._save("setting");
    return value;
  };

  Engine.prototype.getState = function () { return this.state; };

  Engine.prototype.flush = function () {
    if (RU.save && typeof RU.save.flush === "function") {
      try { RU.save.flush(); }
      catch (e) { this._error("save", "flush threw: " + (e && e.message)); }
    }
  };

  Engine.prototype._save = function (reason) {
    if (!this.autosave) return;
    if (RU.save && typeof RU.save.write === "function") {
      try {
        RU.save.write(this.state);
        this.emit("saved", { reason: reason, at: this._now(), persisted: true });
        return;
      } catch (e) {
        /* save.js is supposed to swallow quota/security errors itself and use
         * its onError channel, but if one escapes we keep playing from memory
         * exactly as PLAN_AUDIT 5 requires. */
        this._error("save",
          "write threw (" + reason + "): " + (e && e.message ? e.message : e));
        return;
      }
    }
    this.emit("saved", { reason: reason, at: this._now(), persisted: false });
  };

  /* --------------------------------------------------------------------- *
   * report()  -  the ability report
   * --------------------------------------------------------------------- *
   *
   * Rules, all binding (CONTRACT 2, PLAN_AUDIT 6.4):
   *   - per dimension AND per modality
   *   - every figure states the count it rests on
   *   - fewer than 3 unaided attempts in a bucket => "not enough evidence",
   *     never a number
   *   - zero spoken attempts => the report says it can say nothing about
   *     speaking, explicitly. It never infers speaking from typing.
   *   - assisted attempts are counted and shown, but excluded from accuracy,
   *     because including hinted correct answers is exactly score inflation.
   *   - open/practice attempts (correct === null) are shown separately from
   *     graded evidence and contribute to no accuracy figure.
   */

  function blankStat() {
    return {
      attempts: 0,     /* everything, including assisted and practice */
      unaided: 0,      /* graded, unassisted: the evidence base */
      correct: 0,      /* unaided and right */
      assisted: 0,
      practice: 0,     /* ungraded / unmeasured */
      accuracy: null,
      evidence: 0,
      enough: false,
      note: ""
    };
  }

  function finishStat(stat, label) {
    stat.evidence = stat.unaided;
    stat.enough = stat.unaided >= MIN_EVIDENCE;
    if (stat.enough) {
      stat.accuracy = pct(stat.correct, stat.unaided);
      stat.note = label + ": " + stat.correct + " of " + stat.unaided +
        " unaided attempts correct (" + stat.accuracy + "%)" +
        (stat.assisted ? ", plus " + stat.assisted + " with help" : "") + ".";
    } else {
      stat.accuracy = null;
      stat.note = label + ": not enough evidence (" + stat.unaided +
        " unaided attempt" + (stat.unaided === 1 ? "" : "s") + "; " +
        MIN_EVIDENCE + " needed)" +
        (stat.assisted ? ", plus " + stat.assisted + " with help" : "") + ".";
    }
    return stat;
  }

  function bump(stat, a) {
    stat.attempts++;
    if (a.assisted === true) { stat.assisted++; return; }
    if (a.correct === true) { stat.unaided++; stat.correct++; return; }
    if (a.correct === false) { stat.unaided++; return; }
    stat.practice++;
  }

  Engine.prototype.report = function () {
    var now = this._now();
    var i, k;

    var dimensions = {};
    var modalities = {};
    var buckets = {};
    var items = {};
    var overall = blankStat();

    for (i = 0; i < DIMENSIONS.length; i++) dimensions[DIMENSIONS[i]] = blankStat();
    modalities.typed = blankStat();
    modalities.spoken = blankStat();
    modalities.choice = blankStat();

    var self = this;

    function record(a) {
      var bucket = self._bucketOfAttempt(a);
      var p = parseBucket(bucket);
      var dim = p.dimension;
      var mod = isStr(a.modality) ? a.modality : (p.modality || "typed");

      if (!dimensions[dim]) dimensions[dim] = blankStat();
      if (!modalities[mod]) modalities[mod] = blankStat();
      if (!buckets[bucket]) buckets[bucket] = blankStat();

      bump(overall, a);
      bump(dimensions[dim], a);
      bump(modalities[mod], a);
      bump(buckets[bucket], a);

      if (isStr(a.itemId)) {
        if (!items[a.itemId]) {
          items[a.itemId] = { itemId: a.itemId, buckets: {}, total: blankStat() };
        }
        if (!items[a.itemId].buckets[bucket]) {
          items[a.itemId].buckets[bucket] = blankStat();
        }
        bump(items[a.itemId].buckets[bucket], a);
        bump(items[a.itemId].total, a);
      }
    }

    /* Folded aggregates first (older attempts trimmed out of the log), then
     * the live log, so the totals cover the whole history of the save. */
    var aggIds = keysSorted(this.state.aggregates);
    for (i = 0; i < aggIds.length; i++) {
      var forItem = this.state.aggregates[aggIds[i]];
      var slots = keysSorted(forItem);
      for (k = 0; k < slots.length; k++) {
        var row = forItem[slots[k]];
        if (!isObj(row)) continue;
        var split = slots[k].split("|");
        var dimension = normaliseDimension(split[0]);
        var modality = (split[1] && split[1] !== "-") ? split[1] : null;
        var synth = {
          itemId: aggIds[i] === "(none)" ? null : aggIds[i],
          dimension: dimension,
          modality: modality,
          bucket: bucketKey(dimension, modality)
        };
        var attemptsN = num(row.attempts, 0);
        var assistedN = num(row.assisted, 0);
        var unaidedN = num(row.unaided, 0);
        var correctN = num(row.correct, 0);
        var practiceN = Math.max(0, attemptsN - assistedN - unaidedN);
        var n;
        for (n = 0; n < assistedN; n++) {
          record({ itemId: synth.itemId, dimension: dimension, modality: modality,
                   bucket: synth.bucket, assisted: true, correct: null });
        }
        for (n = 0; n < correctN; n++) {
          record({ itemId: synth.itemId, dimension: dimension, modality: modality,
                   bucket: synth.bucket, assisted: false, correct: true });
        }
        for (n = 0; n < unaidedN - correctN; n++) {
          record({ itemId: synth.itemId, dimension: dimension, modality: modality,
                   bucket: synth.bucket, assisted: false, correct: false });
        }
        for (n = 0; n < practiceN; n++) {
          record({ itemId: synth.itemId, dimension: dimension, modality: modality,
                   bucket: synth.bucket, assisted: false, correct: null });
        }
      }
    }

    var attempts = arr(this.state.attempts);
    for (i = 0; i < attempts.length; i++) {
      if (isObj(attempts[i])) record(attempts[i]);
    }

    /* Finish every stat with its evidence gate. */
    finishStat(overall, "Overall");
    var dimKeys = keysSorted(dimensions);
    for (i = 0; i < dimKeys.length; i++) {
      finishStat(dimensions[dimKeys[i]], dimKeys[i]);
    }
    var modKeys = keysSorted(modalities);
    for (i = 0; i < modKeys.length; i++) {
      finishStat(modalities[modKeys[i]], modKeys[i]);
    }
    var bucketKeys = keysSorted(buckets);
    for (i = 0; i < bucketKeys.length; i++) {
      finishStat(buckets[bucketKeys[i]], bucketKeys[i]);
    }

    /* Per-item detail: card state, plus the hint flag PLAN_AUDIT 6.4 asks for
     * ("repeated hint use raises it in the priority queue and flags it"). */
    var itemRows = [];
    var itemIds = keysSorted(items);
    var needsPractice = [];
    for (i = 0; i < itemIds.length; i++) {
      var row = items[itemIds[i]];
      finishStat(row.total, itemIds[i]);
      var bks = keysSorted(row.buckets);
      for (k = 0; k < bks.length; k++) finishStat(row.buckets[bks[k]], bks[k]);
      var mastery = this.state.mastery[itemIds[i]];
      var cards = {};
      if (isObj(mastery)) {
        var mks = keysSorted(mastery);
        for (k = 0; k < mks.length; k++) {
          var c = mastery[mks[k]];
          if (!isObj(c)) continue;
          cards[mks[k]] = {
            due: c.due, interval: c.interval, reps: c.reps,
            lapses: c.lapses, state: c.state,
            isDue: this._isDue(c, now)
          };
        }
      }
      row.cards = cards;
      row.assistedRate = row.total.attempts
        ? pct(row.total.assisted, row.total.attempts) : null;
      row.hintFlagged = row.total.assisted >= 2 ||
        (row.total.attempts >= 3 && row.total.assisted / row.total.attempts >= 0.4);
      if (row.hintFlagged) needsPractice.push(itemIds[i]);
      itemRows.push(row);
    }

    /* Speaking. This block is the reason the report exists in this shape. */
    var spoken = modalities.spoken || blankStat();
    var speaking = {
      attempts: spoken.attempts,
      unaided: spoken.unaided,
      correct: spoken.correct,
      accuracy: spoken.accuracy,
      enough: spoken.enough,
      statement: ""
    };
    if (spoken.attempts === 0) {
      speaking.statement =
        "Speaking: no evidence at all. You have not answered anything out " +
        "loud, so this report can say nothing about your speaking - not that " +
        "it is weak, and not that it is fine. Typing is not evidence of " +
        "speaking, so nothing here has been carried across from your typed " +
        "answers.";
    } else if (!spoken.enough) {
      speaking.statement =
        "Speaking: not enough evidence (" + spoken.unaided +
        " unaided spoken attempt" + (spoken.unaided === 1 ? "" : "s") +
        "; " + MIN_EVIDENCE + " needed before this report will put a number " +
        "on it).";
    } else {
      speaking.statement =
        "Speaking: " + spoken.correct + " of " + spoken.unaided +
        " unaided spoken attempts correct (" + spoken.accuracy + "%).";
    }

    /* Human-readable English lines, in the order the checkpoint should read
     * them out. Every one carries its own count. */
    var lines = [];
    lines.push("This report rests on " + overall.attempts +
      " recorded attempt" + (overall.attempts === 1 ? "" : "s") + ", of which " +
      overall.unaided + " were unaided and graded, " + overall.assisted +
      " used a hint, and " + overall.practice + " were open practice that is " +
      "deliberately not scored.");
    for (i = 0; i < DIMENSIONS.length; i++) {
      var d = dimensions[DIMENSIONS[i]];
      if (d && d.attempts > 0) lines.push(d.note);
    }
    if (modalities.typed && modalities.typed.attempts > 0) {
      lines.push("Typed" + modalities.typed.note.slice(
        modalities.typed.note.indexOf(":")));
    }
    if (modalities.choice && modalities.choice.attempts > 0) {
      lines.push("Multiple choice" + modalities.choice.note.slice(
        modalities.choice.note.indexOf(":")) +
        " Choosing from a list is recognition, not production.");
    }
    lines.push(speaking.statement);
    if (needsPractice.length) {
      lines.push("You leaned on hints for: " + needsPractice.join(", ") +
        ". Those are queued for more practice; hinted answers were not " +
        "scored, so their cards are still due.");
    }

    var report = {
      generatedAt: now,
      contentVersion: this.state.contentVersion || null,
      minEvidence: MIN_EVIDENCE,
      overall: overall,
      dimensions: dimensions,
      modalities: modalities,
      /* dimension x modality, the bucket the evidence actually landed in */
      buckets: buckets,
      speaking: speaking,
      items: itemRows,
      hintFlagged: needsPractice,
      reviewBudget: this.reviewBudget(),
      dueNow: this.dueQueue(this.reviewCap).length,
      newItemsThisSession: this.newItemsThisSession,
      lines: lines,
      warnings: this.validation.warnings.slice()
    };

    this.emit("report", report);
    return report;
  };

  /* ===================================================================== *
   * Public namespace
   * ===================================================================== */

  RU.engine = {
    /* CONTRACT 2: RU.engine.start(session, state) -> engine */
    start: function (session, state, options) {
      var engine = new Engine(session, state, options);
      RU.engine.instance = engine;
      return engine.start();
    },

    /* Constructed but not started; for tests that want to subscribe to the
     * events start() itself fires. */
    create: function (session, state, options) {
      return new Engine(session, state, options);
    },

    Engine: Engine,

    /* Exposed so ui.js and the lint/test harness can talk about buckets
     * without re-deriving the rules. */
    DIMENSIONS: DIMENSIONS,
    MIN_EVIDENCE: MIN_EVIDENCE,
    REVIEW_CAP_DEFAULT: REVIEW_CAP_DEFAULT,
    NEW_ITEM_CAP_DEFAULT: NEW_ITEM_CAP_DEFAULT,
    ATTEMPT_LOG_CAP: ATTEMPT_LOG_CAP,
    EVENTS: EVENTS,
    bucketKey: bucketKey,
    parseBucket: parseBucket,
    bucketBelow: bucketBelow,
    productionModality: productionModality,

    instance: null
  };
})();
