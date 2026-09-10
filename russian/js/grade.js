/* russian/js/grade.js — RU.grade
 *
 * Answer checking for Session Zero. CONTRACT.md §2 "RU.grade", PLAN_AUDIT.md §6.4.
 *
 * Why this module exists, in one paragraph, because it is the whole design:
 * revision 1 of the plan proposed grading open answers by edit distance against a
 * single target string. That fails in both directions — "Я не хочу, спасибо" is a
 * correct answer that scores far from "Нет, спасибо", while "Я хочу чай" and
 * "Я хочу чая" differ by one character and by a real grammatical fact. So grading
 * here is split three ways:
 *
 *   closed       exact match against the authored choice id
 *   constrained  match against the authored accepted-answer set, and when that
 *                fails, a rule-based diagnostic ladder whose most valuable rung is
 *                a paradigm lookup ("right lemma, wrong case"), not a string metric
 *   open         NOT GRADED. check() throws. Open replies are practice with
 *                self-assessment and must never reach a grader (PLAN_AUDIT §6.4)
 *
 * Edit distance survives in exactly two places, both narrow and both commented at
 * their definition: single-character typo detection on constrained answers, and
 * fuzzy matching of an ASR transcript against a constrained target set. It is never
 * run on free text.
 *
 * Plain ES2019. No modules, no build step, no network. Chrome/Edge target; the one
 * piece of newer syntax used here is built through new RegExp inside a try/catch so
 * an older engine degrades instead of failing to parse the file.
 */

window.RU = window.RU || {};

(function (RU) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Character classes and lookup tables
   * ------------------------------------------------------------------ */

  var COMBINING_ACUTE = /\u0301/g;          // U+0301, the stress mark. Display only.
  var YO = /\u0451/g;                       // yo (already lower-cased by the time we hit it)
  var YO_DECOMPOSED = /\u0435\u0308/g;      // e + combining diaeresis, if NFC was unavailable
  var INVISIBLES = /[\u00AD\u200B-\u200F\u2028\u2029\uFEFF]/g;

  /* Every dash-like character becomes a space rather than being deleted.
   * Two reasons. Аня's copula dash ("Это — кот") must not glue words together, and
   * treating a hyphen as a space makes "по-русски" and "по русски" normalise alike.
   * The third variant, "порусски", is then one edit away and is caught as a
   * near-miss instead of as a hard failure. */
  var DASHES = /[\u002D\u058A\u05BE\u1400\u1806\u2010-\u2015\u2212\u2E17\u2E1A\u2E3A\u2E3B\u301C\u3030\u30A0\uFE31\uFE32\uFE58\uFE63\uFF0D]/g;

  var CYRILLIC_RE = /[\u0400-\u04FF\u0500-\u052F]/;
  var LATIN_RE = /[a-z]/;                   // applied after lower-casing
  var RU_VOWELS = /[аеёиоуыэюя]/g;

  /* Punctuation strip. Unicode property escapes are ES2018 and fine in Chrome/Edge,
   * but a bare /\p{L}/u literal is a *parse* error on an engine that lacks them,
   * which would kill this whole file. Built through new RegExp so the failure is a
   * caught exception and the fallback class takes over. Never a hard failure. */
  var PUNCT_RE = (function () {
    try {
      // keep letters, numbers and combining marks; drop everything else that is not whitespace
      return new RegExp('[^\\p{L}\\p{N}\\p{M}\\s]', 'gu');
    } catch (e) {
      // Whitelist fallback: Latin, digits, Cyrillic (incl. supplement), combining marks.
      return /[^0-9A-Za-z\u0300-\u036F\u0400-\u04FF\u0500-\u052F\s]/g;
    }
  })();

  /* Latin → Cyrillic *shape* look-alikes, for the "latin-script" diagnosis.
   * This is a map of what the letters LOOK like, never of what they sound like —
   * which is exactly the Session Zero trap (Р is not P, С is not C, Н is not H). */
  var LATIN_LOOKALIKE = {
    a: 'а', o: 'о', e: 'е', k: 'к', m: 'м', t: 'т',
    p: 'р', c: 'с', h: 'н', y: 'у', x: 'х', b: 'в'
  };

  /* The look-alikes whose shape lies about their sound. Named in the message so the
   * learner gets the contrast rather than a silent substitution. */
  var DECEPTIVE_SOUND = { 'р': 'r', 'с': 's', 'н': 'n', 'в': 'v', 'у': 'oo', 'х': 'kh' };

  var CASE_NAMES = {
    nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative',
    ins: 'instrumental', inst: 'instrumental', instr: 'instrumental',
    pre: 'prepositional', prep: 'prepositional',
    loc: 'locative', voc: 'vocative', par: 'partitive'
  };
  var NUMBER_NAMES = { sg: 'singular', pl: 'plural' };
  var GENDER_NAMES = { m: 'masculine', f: 'feminine', n: 'neuter' };
  var VERB_NAMES = {
    inf: 'infinitive', pres: 'present tense', past: 'past tense', fut: 'future tense',
    imper: 'imperative', imp: 'imperative', ger: 'gerund', part: 'participle',
    short: 'short form', comp: 'comparative', sup: 'superlative',
    '1sg': 'first person singular', '2sg': 'second person singular', '3sg': 'third person singular',
    '1pl': 'first person plural', '2pl': 'second person plural', '3pl': 'third person plural'
  };

  /* Deterministic ordering for paradigm slots, in the order a Russian grammar
   * recites them. A single written word usually fills several slots (нос is nom_sg
   * and acc_sg; кота is gen_sg and acc_sg), and this array decides both which slot
   * a diagnosis reports in `gotForm` and the order they are read out in the
   * message, so the game never contradicts itself between one attempt and the next. */
  var SLOT_ORDER = [
    'nom_sg', 'gen_sg', 'dat_sg', 'acc_sg', 'ins_sg', 'pre_sg', 'loc_sg', 'voc_sg',
    'nom_pl', 'gen_pl', 'dat_pl', 'acc_pl', 'ins_pl', 'pre_pl',
    'inf', 'pres_1sg', 'pres_2sg', 'pres_3sg', 'pres_1pl', 'pres_2pl', 'pres_3pl',
    '1sg', '2sg', '3sg', '1pl', '2pl', '3pl',
    'past_m', 'past_f', 'past_n', 'past_pl', 'imper_sg', 'imper_pl'
  ];

  /* How many cases a single "that is the X or Y" phrase will name before it stops
   * being a help and starts being a grammar lecture. */
  var MAX_NAMED_CASES = 3;

  /* ASR fuzzy-match thresholds. See matchTranscript() for the rationale. */
  var ASR_THRESHOLD = 0.75;
  var ASR_MAX_EDITS = 2;

  /* Near-miss = a typo, defined as exactly one edit from an accepted answer. */
  var NEAR_MISS_MAX = 1;

  var hasOwn = Object.prototype.hasOwnProperty;

  function isArray(x) {
    return Object.prototype.toString.call(x) === '[object Array]';
  }

  /* ------------------------------------------------------------------ *
   * normalise
   * ------------------------------------------------------------------ */

  /* Lower-case, NFC, trim, collapse internal whitespace, strip punctuation,
   * ё → е, strip the combining acute. Exported: the engine, the lint fixtures and
   * the tests all compare through this function, so "the same string" means the
   * same thing everywhere.
   *
   * Order matters. NFC first, so that е+U+0308 becomes ё before the ё→е fold and so
   * that и+U+0306 recomposes to й before the punctuation pass could strip a bare
   * combining mark. The acute comes off after NFC because no precomposed Cyrillic
   * vowel-with-acute exists, so it always survives composition as its own code point. */
  function normalise(s) {
    if (s === null || s === undefined) return '';
    var t = String(s);
    var canNormalize = typeof t.normalize === 'function';
    if (canNormalize) t = t.normalize('NFC');
    t = t.toLowerCase();
    if (canNormalize) t = t.normalize('NFC');   // a few lower-case mappings can decompose
    t = t.replace(INVISIBLES, '');
    t = t.replace(COMBINING_ACUTE, '');         // stress marks are display, never identity
    t = t.replace(YO_DECOMPOSED, '\u0435');
    t = t.replace(YO, '\u0435');                // yo -> e: Russian text writes both
    t = t.replace(DASHES, ' ');
    t = t.replace(PUNCT_RE, '');
    t = t.replace(/\s+/g, ' ');
    return t.trim();
  }

  function words(nrm) {
    if (!nrm) return [];
    return nrm.split(' ');
  }

  function countVowels(w) {
    var m = String(w).toLowerCase().match(RU_VOWELS);
    return m ? m.length : 0;
  }

  function joinList(arr) {
    if (!arr || !arr.length) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, arr.length - 1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  function quote(s) {
    return '«' + s + '»';   // « » — the Russian quotation marks
  }

  /* ------------------------------------------------------------------ *
   * Levenshtein
   * ------------------------------------------------------------------ */

  /* Iterative two-row Levenshtein with an early-exit band.
   *
   * USED ONLY FOR: (1) near-miss typo detection against an authored accepted-answer
   * set, where we care about distance <= 1, and (2) matching a noisy ASR transcript
   * against that same authored set. NEVER on free text, and never as a mastery
   * signal — a one-character difference in Russian is routinely a different case,
   * and a correct paraphrase is routinely far away. That is defect #1 in
   * PLAN_AUDIT §14, and this comment is the guard rail against reintroducing it.
   *
   * `limit` caps the work: any distance greater than `limit` is reported as
   * limit + 1 rather than computed exactly. Only the diagonal band of width
   * 2*limit+1 is evaluated, and a row whose minimum already exceeds `limit` ends
   * the computation. Cells outside the band are written as INF guards so the next
   * row never reads a stale value.
   */
  function levenshtein(a, b, limit) {
    a = (a === null || a === undefined) ? '' : String(a);
    b = (b === null || b === undefined) ? '' : String(b);
    if (typeof limit !== 'number' || !isFinite(limit) || limit < 0) limit = 2;
    limit = Math.floor(limit);

    if (a === b) return 0;
    var la = a.length, lb = b.length;
    var INF = limit + 1;
    if (Math.abs(la - lb) > limit) return INF;      // length alone rules it out
    if (la === 0) return lb > limit ? INF : lb;
    if (lb === 0) return la > limit ? INF : la;

    // prev/cur index columns 0..la (over `a`); rows walk `b`.
    var prev = new Array(la + 1);
    var cur = new Array(la + 1);
    var j, hi0 = Math.min(la, limit);
    for (j = 0; j <= hi0; j++) prev[j] = j;
    if (hi0 + 1 <= la) prev[hi0 + 1] = INF;         // right guard for row 1's prev[hi] read

    for (var i = 1; i <= lb; i++) {
      var lo = Math.max(0, i - limit);
      var hi = Math.min(la, i + limit);
      var bch = b.charCodeAt(i - 1);
      var rowMin = INF;

      if (lo === 0) {
        cur[0] = i;                                 // lo === 0 implies i <= limit
        rowMin = i;
        j = 1;
      } else {
        cur[lo - 1] = INF;                          // left guard for cur[j-1] at j === lo
        j = lo;
      }

      for (; j <= hi; j++) {
        var cost = a.charCodeAt(j - 1) === bch ? 0 : 1;
        var d = prev[j] + 1;                        // deletion
        var ins = cur[j - 1] + 1;                   // insertion
        if (ins < d) d = ins;
        var sub = prev[j - 1] + cost;               // substitution
        if (sub < d) d = sub;
        if (d > INF) d = INF;
        cur[j] = d;
        if (d < rowMin) rowMin = d;
      }
      if (hi + 1 <= la) cur[hi + 1] = INF;          // right guard for the next row's prev[hi]

      if (rowMin > limit) return INF;               // early exit: no later row can recover

      var swap = prev; prev = cur; cur = swap;
    }
    var out = prev[la];                             // |la - lb| <= limit, so la is inside the last band
    return (out === undefined || out > limit) ? INF : out;
  }

  /* ------------------------------------------------------------------ *
   * Grammatical naming
   * ------------------------------------------------------------------ */

  /* "gen_sg" → "genitive singular", "past_f" → "feminine past tense",
   * "nom_m_sg" → "nominative masculine singular". An unknown key degrades to the key
   * with its underscores opened out, so a message is always readable. */
  function describeForm(key) {
    if (!key) return '';
    var parts = String(key).toLowerCase().split(/[_\-\s]+/);
    var caseName = null, num = null, gender = null, other = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      if (hasOwn.call(CASE_NAMES, p)) caseName = CASE_NAMES[p];
      else if (hasOwn.call(NUMBER_NAMES, p)) num = NUMBER_NAMES[p];
      else if (hasOwn.call(GENDER_NAMES, p) && parts.length > 1) gender = GENDER_NAMES[p];
      else if (hasOwn.call(VERB_NAMES, p)) other.push(VERB_NAMES[p]);
      else other.push(p);
    }
    var bits;
    if (caseName) {
      bits = [caseName];
      if (gender) bits.push(gender);
      if (num) bits.push(num);
      if (other.length) bits = bits.concat(other);
    } else {
      bits = [];
      if (gender) bits.push(gender);
      bits = bits.concat(other);
      if (num) bits.push(num);
    }
    var out = bits.join(' ').replace(/\s+/g, ' ').trim();
    return out || String(key).replace(/_/g, ' ');
  }

  /* Which paradigm slot holds this lexeme's dictionary (citation) form? */
  function dictionarySlot(lexeme) {
    var pos = (lexeme && lexeme.pos) ? String(lexeme.pos).toLowerCase() : '';
    if (pos === 'verb') return 'inf';
    if (pos === 'adj' || pos === 'adjective') return 'nom_m_sg';
    return 'nom_sg';
  }

  /* Name a slot the way Anya would in English. The dictionary form is called that,
   * because "nominative singular" means nothing on day one — but the case is still
   * given in brackets, because the contract asks for precise terminology and the
   * learner needs the word soon. */
  function nameSlot(lexeme, key) {
    var desc = describeForm(key);
    if (key === dictionarySlot(lexeme)) {
      return desc ? 'the dictionary form (' + desc + ')' : 'the dictionary form';
    }
    return desc ? 'the ' + desc : 'that form';
  }

  /* Name EVERY slot a word fills, not just the first.
   *
   * This matters more than it looks. For an animate masculine noun the accusative
   * is the genitive — "кота" is genuinely both — and for нос the nominative is the
   * accusative. Announcing one of them as though it were the only reading teaches a
   * false fact, and a learner who checks a table will find the module contradicting
   * it. So the shared tail is factored out and the cases are read as alternatives:
   * "the genitive or accusative singular", not "the accusative singular".
   *
   * Falls back to naming the first slot whenever the set does not factor cleanly
   * (mixed numbers, verb slots, unknown keys). */
  function nameSlots(lexeme, slots) {
    if (!slots || !slots.length) return 'that form';
    if (slots.length === 1) return nameSlot(lexeme, slots[0]);

    var cases = [], tail = null, i, j;
    for (i = 0; i < slots.length; i++) {
      var parts = String(slots[i]).toLowerCase().split(/[_\-\s]+/);
      var caseName = null, rest = [];
      for (j = 0; j < parts.length; j++) {
        var p = parts[j];
        if (!p) continue;
        if (hasOwn.call(CASE_NAMES, p)) caseName = CASE_NAMES[p];
        else if (hasOwn.call(NUMBER_NAMES, p)) rest.push(NUMBER_NAMES[p]);
        else if (hasOwn.call(GENDER_NAMES, p)) rest.push(GENDER_NAMES[p]);
        else { caseName = null; break; }          // not a plain case slot: give up
      }
      if (!caseName) return nameSlot(lexeme, slots[0]);
      var t = rest.join(' ');
      if (tail === null) tail = t;
      else if (tail !== t) return nameSlot(lexeme, slots[0]);   // mixed numbers: give up
      if (cases.indexOf(caseName) < 0) cases.push(caseName);
    }
    if (!cases.length) return nameSlot(lexeme, slots[0]);
    if (cases.length > MAX_NAMED_CASES) cases = cases.slice(0, MAX_NAMED_CASES);

    var out = 'the ' + cases.join(' or ') + (tail ? ' ' + tail : '');
    // If one of those readings is the citation form, say so — it is the label the
    // learner has actually been taught at this point in the course.
    if (slots.indexOf(dictionarySlot(lexeme)) >= 0) out += ' (the dictionary form)';
    return out;
  }

  /* The display string for a paradigm slot, WITH its stress mark where we honestly
   * know it.
   *
   * CONTRACT NOTE: `lexeme.forms` is specified as carrying no stress marks, and only
   * the dictionary form has an authored `stressed` twin. So for a non-dictionary
   * slot there is no stress information in the schema at all. We do not invent one:
   * splicing the lemma's acute into an inflected form is right for fixed-stem nouns
   * and wrong for mobile-stress ones (но́с → но́са, but нос → носы́), and teaching a
   * wrong stress is worse than teaching none. Order of preference:
   *   1. lexeme.stressedForms[key]  — optional, forward-compatible authored map
   *   2. lexeme.stressed            — when the slot holds the dictionary form
   *   3. the bare form              — monosyllables carry no mark in Russian anyway
   */
  function stressedForm(lexeme, key) {
    if (!lexeme) return null;
    if (lexeme.stressedForms && typeof lexeme.stressedForms[key] === 'string') {
      return lexeme.stressedForms[key];
    }
    var forms = lexeme.forms || {};
    var raw = typeof forms[key] === 'string' ? forms[key] : null;
    if (raw === null && key === dictionarySlot(lexeme) && typeof lexeme.lemma === 'string') {
      raw = lexeme.lemma;                          // `forms` may be partial
    }
    if (raw === null) return null;
    if (typeof lexeme.stressed === 'string' && normalise(lexeme.stressed) === normalise(raw)) {
      return lexeme.stressed;
    }
    return raw;
  }

  /* True when the string stressedForm() returns actually carries stress information:
   * it has an acute, or it is a monosyllable, where Russian marks nothing. UI can use
   * this to decide whether to offer a "hear it" affordance instead of a printed mark. */
  function stressIsKnown(lexeme, key) {
    var s = stressedForm(lexeme, key);
    if (s === null) return false;
    return s.indexOf('\u0301') >= 0 || countVowels(s) <= 1;
  }

  /* ------------------------------------------------------------------ *
   * Result and diagnosis constructors
   * ------------------------------------------------------------------ */

  function diagnosis(code, message, extra) {
    // Every documented key is always present, so callers can read d.lex without a guard.
    var d = { code: code, message: message, lex: null, gotForm: null, wantForm: null };
    if (extra) {
      for (var k in extra) if (hasOwn.call(extra, k)) d[k] = extra[k];
    }
    return d;
  }

  function result(ok, diag, matched, answer) {
    return {
      ok: !!ok,
      diagnosis: diag || null,
      matched: (matched === undefined) ? null : matched,
      answer: answer || ''
    };
  }

  /* ------------------------------------------------------------------ *
   * Ladder rung 2 — Latin script
   * ------------------------------------------------------------------ */

  /* Fires when the answer contains any Latin letter. In this course every accepted
   * answer is Cyrillic by construction, so a Latin letter is a keyboard problem and
   * never a wrong answer — unless the author put Latin in an accept member, which
   * the caller checks for before reaching this rung. */
  function latinDiagnosis(nrm) {
    var seen = [];        // distinct Latin letters, in order of first appearance
    var mapped = '';      // shape-for-shape rendering into Cyrillic
    var complete = true;  // false if some Latin letter has no look-alike
    for (var i = 0; i < nrm.length; i++) {
      var ch = nrm.charAt(i);
      if (LATIN_RE.test(ch)) {
        if (seen.indexOf(ch) < 0) seen.push(ch);
        if (hasOwn.call(LATIN_LOOKALIKE, ch)) mapped += LATIN_LOOKALIKE[ch];
        else { complete = false; mapped += ch; }
      } else {
        mapped += ch;
      }
    }
    var known = [], knownCyr = [];
    for (var j = 0; j < seen.length; j++) {
      if (hasOwn.call(LATIN_LOOKALIKE, seen[j])) {
        known.push(seen[j]);
        knownCyr.push(LATIN_LOOKALIKE[seen[j]]);
      }
    }

    var msg = 'Those are Latin letters — Anya reads Cyrillic.';
    if (known.length) {
      msg += ' The Cyrillic letters shaped like ' + joinList(known) + ' are ' + joinList(knownCyr) + '.';
    }
    if (complete && known.length && CYRILLIC_RE.test(mapped)) {
      msg += ' Shape for shape, you typed ' + quote(mapped) + '.';
    }
    // Name the traps: the look-alikes whose shape lies about their sound.
    var traps = [];
    for (var k = 0; k < knownCyr.length; k++) {
      if (hasOwn.call(DECEPTIVE_SOUND, knownCyr[k]) && traps.indexOf(knownCyr[k]) < 0) {
        traps.push(knownCyr[k]);
      }
    }
    if (traps.length) {
      var notes = [];
      for (var t = 0; t < traps.length; t++) {
        notes.push(quote(traps[t]) + ' sounds like "' + DECEPTIVE_SOUND[traps[t]] + '"');
      }
      msg += ' Careful, the shapes lie: ' + joinList(notes) + '.';
    }
    msg += ' Switch the keyboard to Russian and try again.';

    return diagnosis('latin-script', msg, {
      got: nrm,
      suggest: (complete && CYRILLIC_RE.test(mapped)) ? mapped : null,
      latinLetters: seen
    });
  }

  /* ------------------------------------------------------------------ *
   * Ladder rung 3 — paradigm (formOf) checks
   * ------------------------------------------------------------------ */

  function slotRank(key) {
    var i = SLOT_ORDER.indexOf(key);
    return i < 0 ? SLOT_ORDER.length : i;
  }

  /* Every paradigm slot the given word fills for this lexeme. A word routinely fills
   * more than one (нос is nom_sg AND acc_sg), and collecting the whole set before
   * judging is the point: if the required slot is anywhere in the set, the learner
   * produced the right form and NO wrong-form diagnosis may fire. Getting this wrong
   * would tell a correct learner they are wrong, which is the worst failure this
   * module can have. */
  function slotsFilledBy(lexeme, word) {
    var out = [];
    var forms = lexeme.forms || {};
    for (var key in forms) {
      if (!hasOwn.call(forms, key)) continue;
      if (typeof forms[key] !== 'string') continue;
      if (normalise(forms[key]) === word) out.push(key);
    }
    // The lemma fills the dictionary slot even when `forms` omits it (forms may be partial).
    if (typeof lexeme.lemma === 'string' && normalise(lexeme.lemma) === word) {
      var d = dictionarySlot(lexeme);
      if (out.indexOf(d) < 0) out.push(d);
    }
    out.sort(function (a, b) {
      var ra = slotRank(a), rb = slotRank(b);
      if (ra !== rb) return ra - rb;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return out;
  }

  /* Runs every checks[] entry of type "formOf" in authored order and returns the
   * FIRST wrong-form it finds, plus the list of check lexemes whose required form
   * the learner actually did produce. */
  function runFormChecks(nrm, exercise, lexicon) {
    var checks = (exercise && exercise.checks) || [];
    var satisfied = [];
    if (!lexicon || !checks.length) return { diagnosis: null, satisfied: satisfied };

    // Candidates: the whole answer first (single-word answers, and multi-word chunks
    // that exist in the lexicon), then each word, so "это кота" is diagnosed as well
    // as bare "кота".
    var candidates = [nrm];
    var ws = words(nrm);
    for (var w = 0; w < ws.length; w++) {
      if (candidates.indexOf(ws[w]) < 0) candidates.push(ws[w]);
    }

    for (var i = 0; i < checks.length; i++) {
      var chk = checks[i];
      if (!chk || chk.type !== 'formOf') continue;
      var lexeme = lexicon[chk.lex];
      // Lint rule 6 guarantees the lexeme and the required form exist. At runtime a
      // missing one is skipped rather than thrown: a content bug must not end a session.
      if (!lexeme) continue;
      var want = chk.require;

      for (var c = 0; c < candidates.length; c++) {
        var cand = candidates[c];
        if (!cand) continue;
        var slots = slotsFilledBy(lexeme, cand);
        if (!slots.length) continue;

        if (slots.indexOf(want) >= 0) {
          // Right lemma, right slot. The answer failed for some other reason (extra
          // words, a second wrong word) — record it and keep walking the ladder.
          if (satisfied.indexOf(chk.lex) < 0) satisfied.push(chk.lex);
          break;
        }

        var got = slots[0];                       // deterministic: SLOT_ORDER decides
        var lemma = (typeof lexeme.lemma === 'string') ? lexeme.lemma : cand;
        var wantWord = stressedForm(lexeme, want);
        // nameSlots, not nameSlot: a form that fills several slots is named as all
        // of them, so the diagnosis never asserts a case reading that is only one
        // of two equally true ones.
        var msg = 'You wrote ' + quote(cand) + ' — that is ' + nameSlots(lexeme, slots)
                + ' of ' + quote(lemma) + '. Anya wants ' + nameSlot(lexeme, want)
                + (wantWord ? ': ' + quote(wantWord) : '') + '.';
        return {
          diagnosis: diagnosis('wrong-form', msg, {
            lex: chk.lex,
            gotForm: got,
            wantForm: want,
            got: cand,
            want: wantWord,
            lemma: lemma,
            gotSlots: slots
          }),
          satisfied: satisfied
        };
      }
    }
    return { diagnosis: null, satisfied: satisfied };
  }

  /* ------------------------------------------------------------------ *
   * Ladder rung 5 — some other lexeme
   * ------------------------------------------------------------------ */

  function findLexemeByWord(lexicon, word, skipIds) {
    if (!lexicon || !word) return null;
    var keys = Object.keys(lexicon);
    var i, id, lexeme;
    // Pass 1: dictionary form. Naming the lemma gives the clearer message.
    for (i = 0; i < keys.length; i++) {
      id = keys[i];
      if (skipIds && skipIds.indexOf(id) >= 0) continue;
      lexeme = lexicon[id];
      if (!lexeme) continue;
      if (typeof lexeme.lemma === 'string' && normalise(lexeme.lemma) === word) {
        return { id: id, lexeme: lexeme, formKey: dictionarySlot(lexeme), viaLemma: true };
      }
    }
    // Pass 2: any inflected form.
    for (i = 0; i < keys.length; i++) {
      id = keys[i];
      if (skipIds && skipIds.indexOf(id) >= 0) continue;
      lexeme = lexicon[id];
      if (!lexeme) continue;
      var slots = slotsFilledBy(lexeme, word);
      if (slots.length) return { id: id, lexeme: lexeme, formKey: slots[0], slots: slots, viaLemma: false };
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * closed
   * ------------------------------------------------------------------ */

  function checkClosed(rawAnswer, exercise, lexicon) {
    var choices = (exercise && exercise.choices) || [];
    var raw = (rawAnswer === null || rawAnswer === undefined) ? '' : String(rawAnswer).trim();
    var nrm = normalise(raw);
    var i;

    if (raw === '') {
      return result(false, diagnosis('empty',
        'Nothing was chosen yet — pick one of her options.'), null, nrm);
    }

    var picked = null;
    // The contract's rule: exact match against the chosen choice id.
    for (i = 0; i < choices.length; i++) {
      if (choices[i] && String(choices[i].id) === raw) { picked = choices[i]; break; }
    }
    // Tolerated fallback: a caller that passed the visible Russian text instead of the
    // id still grades correctly rather than reporting a spurious failure.
    if (!picked && nrm) {
      for (i = 0; i < choices.length; i++) {
        if (choices[i] && normalise(choices[i].ru) === nrm) { picked = choices[i]; break; }
      }
    }

    if (!picked) {
      return result(false, diagnosis('unrecognised',
        'That is not one of the options on screen. Use the number keys to pick one.',
        { got: raw }), null, nrm);
    }

    if (picked.correct === true) {
      return result(true, null, picked.id, nrm);
    }

    // Wrong option. Attributed to a lexeme where we can, so the engine can log it as a
    // confusable-pair slip (srs.deriveRating cares about that).
    var lexId = null;
    if (lexicon && picked.ru) {
      var hit = findLexemeByWord(lexicon, normalise(picked.ru), null);
      if (hit) lexId = hit.id;
    }
    /* The gloss is `en` when the UI paints it with the Russian and `enAfter`
       when it only appears once the answer is locked (CONTRACT 1.3). Either
       way we are past the answer here, so naming it is fair. */
    var pickedEn = picked.en || picked.enAfter;
    var msg = 'You picked ' + quote(picked.ru || String(picked.id))
            + (pickedEn ? ' — "' + pickedEn + '"' : '')
            + '. That is not the one she means. Listen once more.';
    return result(false, diagnosis('wrong-word', msg, {
      lex: lexId, got: picked.ru || String(picked.id), choiceId: picked.id
    }), null, nrm);
  }

  /* ------------------------------------------------------------------ *
   * constrained
   * ------------------------------------------------------------------ */

  /* True when the exercise's checks[] ask for this very lexeme. Rung 3 owns
   * those: a wrong form of the asked-for word is a wrong-form, never a wrong
   * word. Everything else is fair game for rung 3.5. */
  function isFormOfLexeme(exercise, lexId) {
    var checks = (exercise && exercise.checks) || [];
    for (var i = 0; i < checks.length; i++) {
      if (checks[i] && checks[i].type === 'formOf' && checks[i].lex === lexId) return true;
    }
    return false;
  }

  /* `{type:"notLex", lex:"lex:крот"}` is the author saying "this is the wrong
   * animal, and I mean it": the answer is a real word, it is the one the
   * session trained as the confusable, and the diagnosis must say so and carry
   * the lexeme id (CONTRACT 3 beat 4). */
  function isNotLex(exercise, lexId) {
    var checks = (exercise && exercise.checks) || [];
    for (var i = 0; i < checks.length; i++) {
      if (checks[i] && checks[i].type === 'notLex' && checks[i].lex === lexId) return true;
    }
    return false;
  }

  function otherWordDiagnosis(found, word, exercise) {
    var lexeme = found.lexeme;
    var lemma = (typeof lexeme.lemma === 'string') ? lexeme.lemma : word;
    var tail;
    if (found.viaLemma) {
      tail = 'that is ' + (lexeme.gloss ? '"' + lexeme.gloss + '"' : 'a different word');
    } else {
      tail = 'that is ' + nameSlots(lexeme, found.slots || [found.formKey]) + ' of ' + quote(lemma)
           + (lexeme.gloss ? ', "' + lexeme.gloss + '"' : '');
    }
    var msg = 'You wrote ' + quote(word) + ' — ' + tail + '.';
    if (isNotLex(exercise, found.id)) {
      msg += ' That is the other one. Read what she wrote letter by letter and'
           + ' compare it with what you typed.';
    } else {
      msg += ' That is not what she is asking about.';
    }
    return diagnosis('wrong-word', msg, {
      lex: found.id,
      got: word,
      gotForm: found.viaLemma ? null : found.formKey
    });
  }

  function checkConstrained(rawAnswer, exercise, lexicon) {
    var accept = (exercise && exercise.accept) || [];
    var nrm = normalise(rawAnswer);

    if (!accept.length && typeof console !== 'undefined' && console.error) {
      // Authoring bug (lint rule 5 requires >= 2 members). Loud in the console, graceful
      // on screen: the ladder below still produces a useful diagnosis.
      console.error('RU.grade: constrained exercise has no accept[] set:', exercise && exercise.id);
    }

    // --- the authored accepted-answer set, which is the actual grader ---
    var acceptNorm = [];
    for (var a = 0; a < accept.length; a++) {
      var an = normalise(accept[a]);
      if (!an) continue;                                  // an empty member can never be an answer
      acceptNorm.push({ raw: accept[a], nrm: an });
      if (nrm && an === nrm) return result(true, null, accept[a], nrm);
    }

    // --- rung 1: empty ---
    if (!nrm) {
      return result(false, diagnosis('empty',
        'Nothing came through. Have a go — a wrong answer is more use to both of you than a blank one.'),
        null, nrm);
    }

    // --- rung 2: Latin script ---
    // Skipped when the author deliberately put Latin into an accepted answer.
    var acceptHasLatin = false;
    for (var la = 0; la < acceptNorm.length; la++) {
      if (LATIN_RE.test(acceptNorm[la].nrm)) { acceptHasLatin = true; break; }
    }
    if (!acceptHasLatin && LATIN_RE.test(nrm)) {
      return result(false, latinDiagnosis(nrm), null, nrm);
    }

    // --- rung 3: paradigm checks (the most valuable diagnosis at beginner level) ---
    var formCheck = runFormChecks(nrm, exercise, lexicon);
    if (formCheck.diagnosis) return result(false, formCheck.diagnosis, null, nrm);

    // --- rung 3.5: the whole answer is a different real word ---
    // Deliberately BEFORE near-miss, for the same reason rung 3 is: "крот" is one edit
    // from "кот", but it is the confusable this session spent two exercises building,
    // not a slip of the finger. Telling that learner "one letter out, retype it" hides
    // the only thing worth saying (you read a Р that was not there) and, because the
    // near-miss diagnosis carries no `lex`, it also throws away the confusable-pair
    // signal srs.deriveRating needs to return "hard" instead of "again".
    // Single-word answers only: a whole phrase that happens to be one edit from an
    // accepted phrase really is a typo, and rung 5 already picks stray words out of a
    // sentence.
    if (words(nrm).length === 1) {
      var other = findLexemeByWord(lexicon, nrm, formCheck.satisfied);
      if (other && !isFormOfLexeme(exercise, other.id)) {
        return result(false, otherWordDiagnosis(other, nrm, exercise), null, nrm);
      }
    }

    // --- rung 4: near-miss (one edit from an accepted answer) ---
    // Deliberately AFTER the paradigm check: "кота" is one edit from "кот" but it is a
    // case error, not a typo, and calling it a typo would hide the grammar.
    var bestNear = null, bestDist = NEAR_MISS_MAX + 1;
    for (var n = 0; n < acceptNorm.length; n++) {
      var d = levenshtein(acceptNorm[n].nrm, nrm, NEAR_MISS_MAX);
      if (d < bestDist) { bestDist = d; bestNear = acceptNorm[n]; }
      if (bestDist === 0) break;                          // cannot happen: equality was handled above
    }
    if (bestNear && bestDist <= NEAR_MISS_MAX) {
      // ok:false, but forgiving: the caller offers a retry before revealing anything.
      // The target is handed over in `near` for the UI to use AFTER that retry — never
      // inside the message, or the retry is worthless.
      return result(false, diagnosis('near-miss',
        'So close — one letter out. Look at it again and retype it.',
        { got: nrm, near: bestNear.raw, distance: bestDist }), null, nrm);
    }

    // --- rung 5: some other lexeme ---
    // Only words the answer did NOT share with any accepted answer are candidates, so
    // in "это сон" we name сон and not это.
    var expected = {};
    for (var e = 0; e < acceptNorm.length; e++) {
      var ew = words(acceptNorm[e].nrm);
      for (var ei = 0; ei < ew.length; ei++) expected[ew[ei]] = true;
    }
    var mine = words(nrm);
    var unexpected = [];
    for (var mi = 0; mi < mine.length; mi++) {
      if (!hasOwn.call(expected, mine[mi]) && unexpected.indexOf(mine[mi]) < 0) {
        unexpected.push(mine[mi]);
      }
    }
    if (!unexpected.length && mine.length === 1) unexpected = [nrm];

    for (var u = 0; u < unexpected.length; u++) {
      // Lexemes whose required form the learner DID produce are skipped: naming those
      // as the wrong word would contradict rung 3.
      var found = findLexemeByWord(lexicon, unexpected[u], formCheck.satisfied);
      if (!found) continue;
      // Same diagnosis builder rung 3.5 uses, so a stray word inside a sentence and a
      // one-word wrong answer are worded and attributed identically.
      return result(false, otherWordDiagnosis(found, unexpected[u], exercise), null, nrm);
    }

    // --- rung 6: unrecognised ---
    if (formCheck.satisfied.length) {
      // The required word in the required form is in there; the sentence around it is not.
      var okLex = lexicon ? lexicon[formCheck.satisfied[0]] : null;
      var okWord = (okLex && okLex.lemma) ? quote(okLex.lemma) : 'That word';
      return result(false, diagnosis('unrecognised',
        okWord + ' is the right word in the right form — it is the sentence around it that Anya '
        + 'does not recognise. Play her line again and copy its shape.',
        { lex: formCheck.satisfied[0], got: nrm }), null, nrm);
    }
    return result(false, diagnosis('unrecognised',
      'Anya does not recognise ' + quote(nrm) + '. Play her line again — and take the hint if you '
      + 'want it, a hint never counts against you.',
      { got: nrm }), null, nrm);
  }

  /* ------------------------------------------------------------------ *
   * check
   * ------------------------------------------------------------------ */

  /* CONTRACT.md §2:
   *   check(rawAnswer, exercise, lexicon)
   *     → { ok, diagnosis: null | {code, message, lex, gotForm, wantForm}, matched }
   *
   * Throws on anything that must not be graded. A hard throw, not a quiet false,
   * because an open reply silently scored would corrupt the mastery record — the
   * exact defect PLAN_AUDIT §14 #1 was raised to kill.
   */
  function check(rawAnswer, exercise, lexicon) {
    if (!exercise || typeof exercise !== 'object') {
      throw new Error('RU.grade.check: no exercise given. Nothing can be graded without an authored exercise.');
    }
    if (exercise.kind === 'open' || exercise.graded === false) {
      var err = new Error(
        'RU.grade.check: refused to grade exercise "' + (exercise.id || '(no id)') + '" (kind=' +
        exercise.kind + ', graded=' + exercise.graded + '). Open replies are practice with ' +
        'self-assessment and must never reach a grader: they feed no mastery card and no FSRS ' +
        'rating. Show the self-assessment buttons and record the attempt as practice instead ' +
        '(PLAN_AUDIT.md §6.4, CONTRACT.md §2).'
      );
      err.code = 'not-gradable';
      throw err;
    }
    // Load order puts data/lexicon.js after this file, but check() only runs at
    // interaction time, by which point RU.LEXICON exists.
    if (lexicon === undefined || lexicon === null) lexicon = RU.LEXICON || null;

    if (exercise.kind === 'closed') return checkClosed(rawAnswer, exercise, lexicon);
    if (exercise.kind === 'constrained') return checkConstrained(rawAnswer, exercise, lexicon);

    throw new Error('RU.grade.check: unknown exercise kind "' + exercise.kind + '" on "' +
      (exercise.id || '(no id)') + '". Expected "closed" or "constrained".');
  }

  /* ------------------------------------------------------------------ *
   * matchTranscript — the ASR path
   * ------------------------------------------------------------------ */

  /* Fuzzy match of a speech-recognition transcript against a constrained authored
   * accepted-answer set (PLAN_AUDIT §7). The recogniser is a general-purpose Russian
   * ASR that has never heard of this lesson, so it hands back real words with real
   * spellings that are a character or two off the target, plus the odd stray filler.
   * Exact match alone would fail an intelligible utterance.
   *
   *   score = 1 - distance / max(len)        a normalised distance ratio, 0..1
   *
   * Two conditions must BOTH hold for ok:
   *
   *   score >= 0.75   and   distance <= 2
   *
   * Why 0.75. It is the loosest ratio that still refuses a whole-word swap on the
   * short answers this course actually uses. On a 3-4 character target (кот, нос, сок)
   * 0.75 demands an exact match, which is right: at that length one edit reaches код,
   * ком, кон, рот, пот — all real words, all different, and accepting them would credit
   * the learner for the minimal pair they just missed. On an 8-character target it
   * allows two edits, which is the recogniser-noise band.
   *
   * Why the absolute cap of 2 on top of the ratio. Without it a long sentence target
   * would let three or four independent word errors through on ratio alone. Recogniser
   * noise is a scatter of single-character slips, not a rewrite.
   *
   * ok:false here is NOT "you were wrong" — §7 requires the transcript always be shown
   * as "I heard: ...", because the failure is as likely to be the recogniser as the
   * speaker. `transcript` is returned raw for exactly that.
   */
  function matchTranscript(transcript, acceptList) {
    // Tolerate being handed the exercise instead of its accept[] — cheap and harmless.
    var list = acceptList;
    if (list && !isArray(list) && typeof list === 'object' && isArray(list.accept)) list = list.accept;
    if (!isArray(list)) list = list ? [list] : [];

    var raw = (transcript === null || transcript === undefined) ? '' : String(transcript);
    var t = normalise(raw);
    var out = {
      ok: false,
      score: 0,
      best: null,
      distance: -1,
      transcript: raw.trim(),
      normalised: t,
      threshold: ASR_THRESHOLD
    };
    if (!t || !list.length) return out;

    for (var i = 0; i < list.length; i++) {
      var member = list[i];
      var n = normalise(member);
      if (!n) continue;
      var maxLen = Math.max(n.length, t.length);
      if (!maxLen) continue;
      // Full distance, not the near-miss band: the ratio needs a real number, and one
      // utterance of a Session Zero answer is a few dozen characters at most.
      var d = levenshtein(n, t, maxLen);
      var score = 1 - (d / maxLen);
      if (out.best === null || score > out.score) {   // strict >, so the first member wins ties
        out.score = score;
        out.best = member;
        out.distance = d;
      }
      if (d === 0) break;
    }
    out.ok = (out.distance >= 0 && out.distance <= ASR_MAX_EDITS && out.score >= ASR_THRESHOLD);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Export
   * ------------------------------------------------------------------ */

  RU.grade = {
    // contract surface (CONTRACT.md §2)
    normalise: normalise,
    check: check,
    // ASR path (PLAN_AUDIT §7)
    matchTranscript: matchTranscript,
    // helpers the engine, the UI and the tests legitimately need
    levenshtein: levenshtein,
    describeForm: describeForm,
    nameSlots: nameSlots,
    stressedForm: stressedForm,
    stressIsKnown: stressIsKnown,
    dictionarySlot: dictionarySlot,
    words: words,
    // tunables, exposed so a test asserts against the same numbers the code uses
    ASR_THRESHOLD: ASR_THRESHOLD,
    ASR_MAX_EDITS: ASR_MAX_EDITS,
    NEAR_MISS_MAX: NEAR_MISS_MAX
  };
})(window.RU);
