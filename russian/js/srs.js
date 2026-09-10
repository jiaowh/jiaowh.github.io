window.RU = window.RU || {};

/* =============================================================================
   srs.js  —  RU.srs  —  spaced-repetition scheduler for Session Zero
   CONTRACT.md section 2 "RU.srs"; PLAN_AUDIT.md section 6.4.

   WHY HINTS ARE NOT GRADED  (do not "fix" this)
   ---------------------------------------------
   An attempt flagged `assisted:true` (the learner pressed the hint button, was
   shown the answer, or was walked through it) returns `null` from
   deriveRating() and is therefore never passed to rate(). The card is left
   exactly as it was: still due, same stability, same difficulty.

   It is tempting to "at least" score an assisted-but-correct answer as "hard",
   because the learner did produce the right string in the end. That is the bug
   revision 1 of the plan shipped, and it is a real one: FSRS models the
   probability of *independent* recall at a future time. An assisted completion
   is evidence about the hint, not about the memory. Scoring it Hard pushes the
   card's due date into the future on the strength of a retrieval that never
   happened, so the item silently stops being reviewed while still not being
   known. Leaving the card due costs one extra encounter and keeps the model
   honest. Repeated hint use is handled elsewhere: it is recorded in the attempt
   log, raises the item in the priority queue, and is surfaced in the ability
   report. It is never folded into the schedule.

   The same reasoning is why latency is a Good/Easy tiebreaker only, and why
   spoken attempts ignore latency altogether: recogniser round-trip time is a
   property of the microphone path, not of the learner's memory.

   ALGORITHM
   ---------
   A self-contained implementation of FSRS-5 (Free Spaced Repetition Scheduler,
   open-spaced-repetition). No network, no npm, no ts-fsrs. The public surface
   is deliberately the one described in CONTRACT.md section 2 so this file can be
   replaced by a vendored ts-fsrs UMD build later with no caller changes.
   Every equation below is cited in a comment next to its implementation.

   Load order: this file is first; it depends on nothing.
   ============================================================================= */

(function () {
  "use strict";

  var MIN_MS = 60000;
  var DAY_MS = 86400000;

  /* --------------------------------------------------------------------------
     FSRS-5 default weights (19 parameters), as published by
     open-spaced-repetition (ts-fsrs / fsrs-rs default_params for FSRS v5).
     Index map used below:
       w0..w3   initial stability per first rating (Again, Hard, Good, Easy)
       w4,w5    initial difficulty
       w6       difficulty delta per rating
       w7       difficulty mean-reversion weight
       w8..w10  stability increase on successful recall
       w11..w14 stability after a lapse
       w15      hard penalty       w16  easy bonus
       w17,w18  same-day (short-term) stability
     -------------------------------------------------------------------------- */
  var DEFAULT_W = [
    0.40255, 1.18385, 3.173, 15.69105,
    7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925, 1.9395,
    0.11, 0.29605, 2.2698, 0.2315,
    2.9898, 0.51655, 0.6621
  ];

  /* Forgetting-curve constants. FSRS-5 fixes DECAY = -0.5 and derives
     FACTOR so that R = 0.9 exactly when the elapsed time equals stability:
       FACTOR = 0.9^(1/DECAY) - 1  = 19/81 = 0.234567...                       */
  var DECAY = -0.5;
  var FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

  /* --------------------------------------------------------------------------
     Tunables. Mutate FIELDS of these objects to retune or to test; do not
     replace the objects themselves, because the functions below hold a direct
     reference (that is also what makes an override take effect immediately).
     -------------------------------------------------------------------------- */

  var PARAMS = {
    algorithm: "fsrs-5-local",
    w: DEFAULT_W.slice(),

    requestRetention: 0.9,     // target probability of recall at the due date
    maximumIntervalDays: 36500,
    minStability: 0.01,
    maxStability: 36500,
    decay: DECAY,
    factor: FACTOR,

    /* Sub-day steps, in minutes. These are a presentation policy, not part of
       FSRS: they decide how soon a failed item comes back *inside the current
       10-20 minute session*. A "good" or "easy" always graduates straight to a
       real FSRS interval, so a clean first recall of a new item leaves for
       ~w2 = 3.2 days, which is FSRS's own answer and not an invention here. */
    learningDelaysMin:   { again: 1,  hard: 6  },
    relearningDelaysMin: { again: 10, hard: 20 }
  };

  /* deriveRating boundary values. Exported so they are inspectable and testable
     rather than buried as literals (CONTRACT.md section 2 / audit section 6.4). */
  var THRESHOLDS = {
    /* "easy" is deliberately hard to earn. ALL of these must hold, on top of
       unaided + first try + correct. */
    easyMinIntervalDays: 21,   // the card must already be at a long interval
    easyLatencyMs: 4000,       // default answer-time ceiling
    /* Per-modality ceilings: typing Cyrillic on a keyboard you do not own the
       muscle memory for is slower than clicking one of four choices, and that
       difference is about the input device, not about memory strength.
       "spoken" is absent on purpose: a spoken attempt can never be "easy". */
    easyLatencyMsByModality: { choice: 2500, typed: 6000, either: 6000 }
  };

  var RATINGS = ["again", "hard", "good", "easy"];
  var GRADE_OF = { again: 1, hard: 2, good: 3, easy: 4 };

  /* ==========================================================================
     Small helpers
     ========================================================================== */

  function nowOr(nowMs) {
    return (typeof nowMs === "number" && isFinite(nowMs)) ? nowMs : Date.now();
  }

  function clampDifficulty(d) {
    if (!isFinite(d)) return 5;
    return Math.min(10, Math.max(1, d));
  }

  function clampStability(s) {
    if (!isFinite(s)) return PARAMS.minStability;
    return Math.min(PARAMS.maxStability, Math.max(PARAMS.minStability, s));
  }

  /* Accepts "good" / "GOOD" / 3 / {rating:"good"} shapes. Returns 0 for
     null/undefined, which rate() treats as DO NOT RATE. Anything else that
     cannot be resolved is a programming error and throws. */
  function toGrade(rating) {
    if (rating === null || rating === undefined) return 0;
    if (typeof rating === "number") {
      if (rating >= 1 && rating <= 4 && rating === Math.floor(rating)) return rating;
    } else if (typeof rating === "string") {
      var g = GRADE_OF[rating.toLowerCase()];
      if (g) return g;
    }
    throw new Error('RU.srs: invalid rating "' + rating + '" (expected "again"|"hard"|"good"|"easy" or null)');
  }

  /* ==========================================================================
     FSRS-5 equations
     ========================================================================== */

  /* S_0(G) = w[G-1]                                              (initial stability) */
  function initialStability(g) {
    return clampStability(PARAMS.w[g - 1]);
  }

  /* D_0(G) = w4 - e^(w5*(G-1)) + 1                               (initial difficulty) */
  function initialDifficulty(g) {
    return clampDifficulty(PARAMS.w[4] - Math.exp(PARAMS.w[5] * (g - 1)) + 1);
  }

  /* D' = D + (-w6*(G-3)) * (10-D)/9          (linear damping, new in FSRS-5)
     D'' = w7*D_0(4) + (1-w7)*D'                            (mean reversion to Easy) */
  function nextDifficulty(d, g) {
    var deltaD = -PARAMS.w[6] * (g - 3);
    var damped = d + deltaD * (10 - d) / 9;
    var reverted = PARAMS.w[7] * initialDifficulty(4) + (1 - PARAMS.w[7]) * damped;
    return clampDifficulty(reverted);
  }

  /* R(t,S) = (1 + FACTOR * t/S)^DECAY                            (forgetting curve) */
  function forgettingCurve(elapsedDays, stability) {
    if (!(stability > 0)) return 0;
    var t = Math.max(0, elapsedDays);
    return Math.pow(1 + FACTOR * t / stability, DECAY);
  }

  /* I(r,S) = (S/FACTOR) * (r^(1/DECAY) - 1)                    (interval for target r) */
  function nextIntervalDays(stability) {
    var s = clampStability(stability);
    var raw = (s / FACTOR) * (Math.pow(PARAMS.requestRetention, 1 / DECAY) - 1);
    var days = Math.round(raw);
    if (!isFinite(days) || days < 1) days = 1;
    return Math.min(PARAMS.maximumIntervalDays, days);
  }

  /* S'_r = S * (1 + e^w8 * (11-D) * S^(-w9) * (e^(w10*(1-R)) - 1) * hard * easy)
     hard = w15 when G = Hard, easy = w16 when G = Easy, else 1.  (recall stability) */
  function recallStability(d, s, r, g) {
    var hardPenalty = (g === 2) ? PARAMS.w[15] : 1;
    var easyBonus   = (g === 4) ? PARAMS.w[16] : 1;
    return clampStability(
      s * (1 + Math.exp(PARAMS.w[8]) *
               (11 - d) *
               Math.pow(s, -PARAMS.w[9]) *
               (Math.exp(PARAMS.w[10] * (1 - r)) - 1) *
               hardPenalty * easyBonus)
    );
  }

  /* S'_f = w11 * D^(-w12) * ((S+1)^w13 - 1) * e^(w14*(1-R))       (lapse stability)
     FSRS-5 additionally clamps it so post-lapse stability cannot exceed
     S / e^(w17*w18) — forgetting must never make a card stronger.             */
  function forgetStability(d, s, r) {
    var raw = PARAMS.w[11] *
              Math.pow(d, -PARAMS.w[12]) *
              (Math.pow(s + 1, PARAMS.w[13]) - 1) *
              Math.exp(PARAMS.w[14] * (1 - r));
    var ceiling = s / Math.exp(PARAMS.w[17] * PARAMS.w[18]);
    return clampStability(Math.min(raw, ceiling));
  }

  /* S' = S * e^(w17 * (G - 3 + w18))            (same-day / short-term review) */
  function shortTermStability(s, g) {
    return clampStability(s * Math.exp(PARAMS.w[17] * (g - 3 + PARAMS.w[18])));
  }

  /* ==========================================================================
     Cards
     ========================================================================== */

  /* Exactly the shape frozen in CONTRACT.md section 2:
       { due, stability, difficulty, reps, lapses, lastReview, interval, state }
     due        ms epoch; 0 means "due now, never scheduled"
     stability  FSRS S, in days
     difficulty FSRS D, 1..10
     interval   whole days between the last review and `due`; 0 while the card is
                in a sub-day learning/relearning step (this is what the "easy"
                rule's "interval >= 21 days" reads)
     state      "new" | "learning" | "review" | "relearning"                     */
  function newCard() {
    return {
      due: 0,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastReview: null,
      interval: 0,
      state: "new"
    };
  }

  var STATES = { "new": 1, learning: 1, review: 1, relearning: 1 };

  /* Defensive copy + repair. Cards come back from localStorage and may predate a
     field, so nothing here may throw on a partial object. Always returns a new
     object: rate() must not mutate its argument. */
  function normaliseCard(card) {
    var c = newCard();
    if (!card || typeof card !== "object") return c;

    if (typeof card.due === "number" && isFinite(card.due)) c.due = card.due;
    if (typeof card.stability === "number" && isFinite(card.stability) && card.stability > 0) {
      c.stability = card.stability;
    }
    if (typeof card.difficulty === "number" && isFinite(card.difficulty) && card.difficulty > 0) {
      c.difficulty = clampDifficulty(card.difficulty);
    }
    if (typeof card.reps === "number" && isFinite(card.reps) && card.reps > 0) {
      c.reps = Math.floor(card.reps);
    }
    if (typeof card.lapses === "number" && isFinite(card.lapses) && card.lapses > 0) {
      c.lapses = Math.floor(card.lapses);
    }
    if (typeof card.lastReview === "number" && isFinite(card.lastReview)) {
      c.lastReview = card.lastReview;
    }
    if (typeof card.interval === "number" && isFinite(card.interval) && card.interval > 0) {
      c.interval = card.interval;
    }
    if (typeof card.state === "string" && STATES[card.state]) c.state = card.state;

    /* A card that claims a non-new state but carries no memory state is broken;
       treat it as new rather than feeding NaN into the equations. */
    if (c.state !== "new" && !(c.stability > 0 && c.difficulty > 0)) {
      c.state = "new";
      c.stability = 0;
      c.difficulty = 0;
      c.lastReview = null;
      c.interval = 0;
    }
    return c;
  }

  /* Fractional elapsed days since the last review. FSRS was fitted on whole-day
     gaps; fractions are used here because a language session revisits an item
     minutes later, and the same-day branch below is what actually handles that
     case. Never negative (clock changes, imported saves). */
  function elapsedDaysSince(card, now) {
    if (card.lastReview === null) return 0;
    return Math.max(0, (now - card.lastReview) / DAY_MS);
  }

  function graduate(card, now) {
    var days = nextIntervalDays(card.stability);
    card.state = "review";
    card.interval = days;
    card.due = now + days * DAY_MS;
  }

  function stepTo(card, state, delayMin, now) {
    card.state = state;
    card.interval = 0;              // sub-day: no scheduled day gap
    card.due = now + delayMin * MIN_MS;
  }

  /* rate(card, rating, nowMs) -> NEW card (input untouched).
     rating === null is the assisted case: the card is returned unchanged, still
     due. deriveRating() already guarantees this, but rate() enforces it too so
     that a caller which forwards a null rating cannot accidentally schedule. */
  function rate(card, rating, nowMs) {
    var now = nowOr(nowMs);
    var c = normaliseCard(card);
    var g = toGrade(rating);
    if (g === 0) return c;                 // DO NOT RATE — see the header comment

    var prevState = c.state;
    var elapsed = elapsedDaysSince(c, now);

    /* ---- memory state (S, D) ---- */
    if (prevState === "new") {
      c.stability = initialStability(g);
      c.difficulty = initialDifficulty(g);
    } else if (elapsed < 1) {
      /* Same-day repeat: the forgetting curve has barely moved, so FSRS-5 uses
         the short-term formula instead of R. Difficulty still updates. */
      c.stability = shortTermStability(c.stability, g);
      c.difficulty = nextDifficulty(c.difficulty, g);
    } else {
      var r = forgettingCurve(elapsed, c.stability);
      /* stability first: both updates read the OLD difficulty */
      c.stability = (g === 1)
        ? forgetStability(c.difficulty, c.stability, r)
        : recallStability(c.difficulty, c.stability, r, g);
      c.difficulty = nextDifficulty(c.difficulty, g);
    }

    c.reps += 1;
    /* A lapse is a failure of a card that had actually graduated. Failing again
       while already relearning is not counted twice. */
    if (g === 1 && prevState === "review") c.lapses += 1;
    c.lastReview = now;

    /* ---- when to show it again ----
       "again" and "hard" hold a new/learning/relearning card in a sub-day step
       so it returns inside the same session; "good"/"easy" graduate it to a real
       FSRS interval. A card already in "review" always gets an FSRS interval
       except on "again", which sends it to relearning.
       Note: repeated "hard" repeats the same sub-day step rather than advancing
       (this is Anki's learning-step behaviour, and it is deliberate). Such a card
       stays permanently due, which is exactly the signal the priority queue in
       audit section 6.2 wants for an item that is not sticking; the session
       length, not the scheduler, bounds how often the learner sees it. */
    if (g === 1) {
      if (prevState === "review" || prevState === "relearning") {
        stepTo(c, "relearning", PARAMS.relearningDelaysMin.again, now);
      } else {
        stepTo(c, "learning", PARAMS.learningDelaysMin.again, now);
      }
    } else if (g === 2 && prevState === "relearning") {
      stepTo(c, "relearning", PARAMS.relearningDelaysMin.hard, now);
    } else if (g === 2 && (prevState === "new" || prevState === "learning")) {
      stepTo(c, "learning", PARAMS.learningDelaysMin.hard, now);
    } else {
      graduate(c, now);
    }

    return c;
  }

  /* due(card, nowMs) -> bool. A missing card is due: an item that has never been
     scheduled must never be filtered out of the queue by a null check. */
  function due(card, nowMs) {
    if (!card) return true;
    var now = nowOr(nowMs);
    var d = card.due;
    if (typeof d !== "number" || !isFinite(d)) return true;
    return now >= d;
  }

  /* Extra (not in the frozen contract, additive only): current probability of
     recall, for the priority queue in audit section 6.2 — overdue first.
     0 for a card with no review history. */
  function retrievability(card, nowMs) {
    var c = normaliseCard(card);
    if (c.state === "new" || c.lastReview === null || !(c.stability > 0)) return 0;
    var r = forgettingCurve(elapsedDaysSince(c, nowOr(nowMs)), c.stability);
    return Math.min(1, Math.max(0, r));
  }

  /* Extra: what each of the four ratings would do, without committing. Useful in
     tests and in a debug overlay. */
  function preview(card, nowMs) {
    var now = nowOr(nowMs);
    return {
      again: rate(card, "again", now),
      hard:  rate(card, "hard",  now),
      good:  rate(card, "good",  now),
      easy:  rate(card, "easy",  now)
    };
  }

  /* ==========================================================================
     deriveRating — the binding part (CONTRACT.md section 2, audit section 6.4)

     attempt: { correct, assisted, selfCorrected, confusablePairSlip,
                latencyMs, modality, interfered }
     plus these OPTIONAL fields, which the frozen signature does not name but
     the frozen rules require (see the notes on each):
                skipped, revealed, firstTry, intervalDays | card

     Returns "again" | "hard" | "good" | "easy" | null.
     null means DO NOT RATE: record the attempt, leave the card due. It is
     returned for an assisted attempt (always) and for an attempt that reports no
     outcome at all (an ungraded/open exercise).
     ========================================================================== */

  /* The card's current interval, in days. The rules say "easy" requires the card
     to already be at >= 21 days, but the frozen deriveRating signature carries no
     card, so the caller may pass `intervalDays`, `interval`, or the whole `card`.
     If none is present the interval is UNKNOWN, and unknown must not certify
     "easy" — the attempt falls through to "good", which is the documented
     default. NaN is returned so that every comparison below is false. */
  function intervalDaysOf(a) {
    if (typeof a.intervalDays === "number" && isFinite(a.intervalDays)) return a.intervalDays;
    if (typeof a.interval === "number" && isFinite(a.interval)) return a.interval;
    if (a.card && typeof a.card.interval === "number" && isFinite(a.card.interval)) {
      return a.card.interval;
    }
    return NaN;
  }

  function easyLatencyCeiling(modality) {
    var byModality = THRESHOLDS.easyLatencyMsByModality;
    if (byModality && typeof byModality[modality] === "number") return byModality[modality];
    return THRESHOLDS.easyLatencyMs;
  }

  /* Every condition for "easy". Read THRESHOLDS live, so overriding a field
     changes behaviour immediately (tests do this). */
  function qualifiesAsEasy(a) {
    /* Spoken attempts are never "easy": latency is dominated by the recogniser
       round-trip, so the only signal that separates good from easy is missing.
       Audit section 6.4: "ignored entirely for spoken attempts". */
    if (a.modality === "spoken") return false;

    /* Replayed the audio, scrolled, or switched tabs: the measured time is not
       the learner's answer time. Any truthy value blocks easy — the conservative
       direction, since easy is the rating that costs the most if wrong. */
    if (a.interfered) return false;

    /* Only items already on a long interval can be effortless in the sense FSRS
       means; a card seen twice this session cannot. Unknown interval -> NaN ->
       false. */
    if (!(intervalDaysOf(a) >= THRESHOLDS.easyMinIntervalDays)) return false;

    /* Latency is the ONLY thing latency decides — this boundary and nothing
       else. A missing or nonsensical measurement simply means "not easy". */
    var lat = a.latencyMs;
    if (typeof lat !== "number" || !isFinite(lat) || lat < 0) return false;
    return lat < easyLatencyCeiling(a.modality);
  }

  function deriveRating(attempt) {
    var a = attempt || {};

    /* RULE 1, first and unconditional: an assisted attempt is never rated.
       Checked before correctness, before latency, before anything. Any truthy
       `assisted` counts (a hint id, a count, `true`) — see the file header for
       why this must not be softened into "hard". */
    if (a.assisted) return null;

    /* RULE 2: no independent retrieval happened -> "again".
       `skipped` and `revealed` are not in the frozen signature; a caller that
       does not use them must fold those cases into `correct:false`. Checked
       before `correct` so that an answer typed after the reveal is "again" even
       when the string matches. */
    if (a.skipped || a.revealed || a.answeredAfterReveal) return "again";

    /* No outcome at all is NOT the same as a wrong outcome. An ungraded
       exercise (kind:"open", graded:false) has no `correct` field, and audit
       section 6.4 is explicit that open replies must feed no mastery card. An
       absent/null `correct` therefore means DO NOT RATE, like an assisted
       attempt; only a present-and-falsy `correct` is a failed retrieval. */
    if (a.correct === undefined || a.correct === null) return null;
    if (!a.correct) return "again";

    /* RULE 3: correct, but not cleanly.
       - selfCorrected: wrong form or wrong word first, then repaired
       - confusablePairSlip: hit the other member of a trained confusable pair
         (Р/P, С/C, Н/H, ы/и ...) earlier in this session
       - firstTry === false: same thing, stated by the caller directly. Optional;
         absent means true. */
    var firstTry = (a.firstTry === undefined || a.firstTry === null) ? true : !!a.firstTry;
    if (a.selfCorrected || a.confusablePairSlip || !firstTry) return "hard";

    /* RULE 4: "easy" is deliberately hard to earn. */
    if (qualifiesAsEasy(a)) return "easy";

    /* RULE 5: correct, unaided, first try. THE DEFAULT. Revision 1 of the plan
       omitted this case and that was a defect: without it a clean answer has no
       rating to fall to. Slow but clean is still "good" — latency never
       downgrades anything. */
    return "good";
  }

  /* ========================================================================== */

  window.RU.srs = {
    /* frozen contract surface */
    newCard: newCard,
    rate: rate,
    due: due,
    deriveRating: deriveRating,

    /* inspectable configuration */
    THRESHOLDS: THRESHOLDS,
    PARAMS: PARAMS,
    RATINGS: RATINGS,

    /* additive helpers (safe to ignore; kept out of the frozen four) */
    retrievability: retrievability,
    nextIntervalDays: nextIntervalDays,
    forgettingCurve: forgettingCurve,
    normaliseCard: normaliseCard,
    preview: preview,

    ALGORITHM: "fsrs-5-local",
    VERSION: 1
  };
})();
