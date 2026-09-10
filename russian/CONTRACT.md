# Session Zero — module contract (v1)

Frozen interfaces. Every module is a plain `<script>` (no modules, no bundler) that attaches one global. Load order is fixed in `index.html`:

```
srs.js → save.js → grade.js → speech.js → data/lexicon.js → data/session0.js → engine.js → ui.js → main.js
```

Globals: `RU.srs`, `RU.save`, `RU.grade`, `RU.speech`, `RU.LEXICON`, `RU.SESSION0`, `RU.engine`, `RU.ui`.
Every file starts with `window.RU = window.RU || {};`.

Target: ES2019, no optional chaining in `.js` files is fine to use (Edge/Chrome only), no build step, no npm.

---

## 1. Data schemas

### 1.1 Lexeme (`data/lexicon.js` → `RU.LEXICON`)

```js
RU.LEXICON = {
  "lex:нос": {
    id: "lex:нос",
    lemma: "нос",            // dictionary form, no stress mark
    stressed: "но́с",         // with U+0301 after the stressed vowel
    pos: "noun",
    gender: "m",             // m | f | n | null
    gloss: "nose",
    forms: {                 // case_number → form (no stress marks; lowercase)
      nom_sg: "нос", gen_sg: "носа", dat_sg: "носу",
      acc_sg: "нос", ins_sg: "носом", pre_sg: "носе",
      nom_pl: "носы"
    },
    letters: ["Н","О","С"],  // Cyrillic letters used, for the lint
    tags: ["s0"]
  }
}
```

`forms` may be partial. `grade.js` uses it to diagnose wrong-form answers.

### 1.2 Letter (taught unit)

```js
RU.SESSION0.letters = [
  { id:"ltr:Р", upper:"Р", lower:"р", sound:"r", looksLike:"P",
    trap:"Looks like Latin P, sounds like a tapped R",
    bridge:"Japanese ら行 is already this tap — extend it, don't roll it yet.",
    contrastWith:["ltr:П"] }
]
```

### 1.3 Content node

A session is an ordered array of nodes. Every node has `id` (unique, stable) and `type`.

```js
{ type:"line",  id:"s0.l3", who:"anya"|"narrator"|"you",
  ru:"Меня зовут Аня.",            // no stress marks (display text)
  stressed:"Меня́ зову́т А́ня.",     // with marks; used for audio + stress toggle
  en:"My name is Anya.",
  translit:"Menya zovut Anya.",    // Arc 0 only
  audio:"s0.l3",                   // key into audio manifest, or null
  sprite:"neutral", bg:"flat",
  teaches:["lex:аня"], stop:false }

{ type:"letters", id:"s0.ltr1", letters:["ltr:Р","ltr:С","ltr:Н"], intro:"..." }

{ type:"exercise", id:"s0.ex1",
  kind:"closed"|"constrained"|"open",
  graded:true|false,
  modality:"typed"|"spoken"|"either"|"choice",
  decodable:false,                  // optional; opts the node out of lint rule 1
  prompt:{ ru:"Что это?", stressed:"Что э́то?", en:"What is this?", audio:"s0.ex1.p" },
  image:null,                       // optional emoji/asset shown as the referent
  // closed:  a choice carries `en` (painted with the Russian) OR `enAfter`
  //          (painted only once the answer is locked). Use `enAfter` wherever
  //          showing the gloss first would let the item be answered without
  //          reading; use `en` only where the English IS the answer space.
  choices:[{id:"a", ru:"нос", enAfter:"nose", correct:true}, ...],
  // constrained:
  accept:["это нос","нос"],         // normalised accepted answers, authored
  checks:[{ type:"formOf", lex:"lex:нос", require:"nom_sg" },   // right lemma, wrong slot -> wrong-form
           { type:"notLex", lex:"lex:крот" }],                 // the authored confusable -> wrong-word
  hint:"Она показывает на нос.",
  reviews:["lex:нос"],              // items this exercise exercises
  dimension:"recognition"|"meaning"|"controlled"|"spontaneous" }

{ type:"retrieval", id:"s0.r1", reviews:["lex:нос","lex:кот"],
  variants:[ { id:"s0.r1.v1", covers:["lex:нос"], nodes:[ <line|exercise nodes> ] }, ... ] }

{ type:"weblab", id:"s0.web1", page:"weblab/cafe.html",
  task:{ en:"...", question:{...exercise-shaped...} } }

{ type:"consent", id:"s0.mic" }     // renders the microphone disclosure screen
{ type:"checkpoint", id:"s0.end" }  // ability report
```

`stop:true` on a line marks a safe stopping point.

A `narrator` line has no Russian, and says so with `null`, not with `""`:
`ru:null, stressed:null, translit:null` — the same not-applicable marker
`audio:null` already uses. An empty `stressed` is a Russian string whose stress
nobody marked, which is what rule 3 exists to catch, so narrator lines must not
look like one.

### 1.4 Audio manifest (`audio/s0/manifest.json`)

```json
{ "version":1, "voice":"ru-RU-SvetlanaNeural",
  "clips": { "s0.l3": {
      "file":"s0.l3.mp3", "slow":"s0.l3.slow.mp3",
      "text":"Меня́ зову́т А́ня.", "dur":2.41,
      "words":[{"t":0.10,"d":0.42,"w":"Меня́"}, ...] } } }
```

### 1.5 Save state (`localStorage`, dual slot)

```js
{ schema:1, contentVersion:"s0.1", savedAt:<ms epoch>, checksum:"<djb2 hex over the rest>",
  position:{ nodeId:"s0.l7", variantPicks:{"s0.r1":"s0.r1.v2"} },
  flags:{ name:"Wenhan", micConsent:"granted"|"declined"|"unset" },
  memory:{},                                  // what Anya remembers about you
  mastery:{ "lex:нос": { recognition:{...card}, controlled:{...card} } },
  attempts:[ {id, nodeId, itemId, dimension, modality, correct, assisted, latencyMs, raw, at} ],
  settings:{ translit:true, stressMarks:true, autoplay:true, slowDefault:false, reducedMotion:false }
}
```

---

## 2. Module APIs

### `RU.srs` (srs.js)

```js
RU.srs.newCard()                       // → card object
RU.srs.rate(card, rating, nowMs)       // rating ∈ "again"|"hard"|"good"|"easy" → new card
RU.srs.due(card, nowMs)                // → bool
RU.srs.deriveRating({correct, assisted, selfCorrected, confusablePairSlip, latencyMs, modality, interfered})
   // → "again" | "hard" | "good" | "easy" | null
   //   null means DO NOT RATE (assisted === true always returns null)
```

Rules (audit §6.4, binding):
- `assisted:true` → returns `null`. Card stays due, attempt recorded with `assisted:true`.
- wrong / skipped / revealed → `"again"`.
- correct but self-corrected, or a confusable-pair slip in the same session → `"hard"`.
- correct, unaided, first try → `"good"` (the default).
- `"easy"` only if unaided, first try, `latencyMs` under threshold, card interval already ≥ 21 days, and `modality !== "spoken"`, and `interfered !== true`.
- `latencyMs` is measured from end of audio playback; `interfered:true` (replayed audio, scrolled, tab blur) forbids `"easy"`.

Card: `{ due, stability, difficulty, reps, lapses, lastReview, interval, state }`.

### `RU.save` (save.js)

```js
RU.save.load()            // → {state, warnings:[]}  — validates, picks newest good slot
RU.save.write(state)      // debounced ~300ms, dual-slot alternating, checksummed. Returns immediately.
RU.save.flush()           // force a synchronous write now
RU.save.exportBlob(state) // → {filename, json}
RU.save.importJson(text)  // → {ok, state, error}  — validates schema + contentVersion, never partial-merges
RU.save.fresh()           // → a new empty state
RU.save.onError(cb)       // cb({kind:"quota"|"security"|"corrupt", message}) — UI shows a banner
RU.save.migrate(state)    // ordered migrations by state.schema/contentVersion → state
```

Keys: `ru.save.v1.a`, `ru.save.v1.b`. Checksum: djb2 over `JSON.stringify` of the state without `checksum`.
Every write must be wrapped in try/catch; on `QuotaExceededError` or a security exception, call the `onError` callbacks and keep playing from memory.

### `RU.grade` (grade.js)

```js
RU.grade.normalise(s)   // lowercase, trim, collapse spaces, strip punctuation, ё→е, strip U+0301
RU.grade.check(rawAnswer, exercise, lexicon)
// → { ok:bool,
//     diagnosis:null | { code, message, lex, gotForm, wantForm },
//     matched:string|null }
```

Diagnosis codes: `"wrong-form"` (right lemma, wrong paradigm slot — message names both), `"wrong-word"` (a different real word; carries its `lex` so the engine can log a confusable-pair slip), `"empty"`, `"latin-script"` (they typed Latin letters), `"near-miss"` (edit distance 1 from an accepted answer, e.g. a typo), `"unrecognised"` (nothing in the answer resolves — no lexeme, no accepted shape, or a chosen option that is not on screen).

Never grade an exercise with `graded:false` — `check` throws if called on one.
Edit distance is used ONLY for `near-miss` detection on constrained answers and for ASR transcript matching. Never on open text.

### `RU.speech` (speech.js)

```js
RU.speech.load(manifestUrl)                 // → Promise
RU.speech.play(clipKey, {slow, onWord, onEnd})   // → handle with .stop()
RU.speech.replayWord(clipKey, wordIndex)
RU.speech.available()                       // → {tts:bool, asr:bool, asrReason:string}
RU.speech.consentState()                    // → "unset"|"granted"|"declined"
RU.speech.setConsent(v)
RU.speech.listen({lang:"ru-RU", onPartial, onFinal, onError})  // → handle with .stop()
```

`listen()` MUST throw if `consentState() !== "granted"`.
`available().asr` is by feature detection of `SpeechRecognition || webkitSpeechRecognition`, never by user-agent sniffing.
When a clip is missing, `play` falls back to `speechSynthesis` with a `ru-RU` voice and reports `fallback:true` to `onEnd`.

### `RU.engine` (engine.js)

```js
RU.engine.start(session, state)  // → engine
engine.current()                 // → node
engine.advance(payload)          // → next node; payload carries an answer when the node is an exercise
engine.answer(raw, {assisted, latencyMs, interfered})  // grade + schedule + record + save
engine.pickVariant(node)         // choose the variant covering most due items; deterministic tiebreak by variant id
engine.on(event, cb)             // "node", "graded", "saved", "error", "report"
engine.report()                  // ability report: per-dimension counts, evidence counts, "not enough evidence" flags
```

Binding rules:
- `pickVariant` result is written to `state.position.variantPicks` and reused on reload, so a resumed session shows the same variant.
- After every graded answer and every node advance, `RU.save.write(state)` is called. Never defer to unload.
- Typed answers write to the `controlled`/`typed` evidence bucket only. Spoken answers write to the spoken bucket. `report()` must never infer one from the other and must say "not enough evidence" below 3 attempts.
- Cards are created lazily: an item gets a `recognition` card on first exposure; higher dimensions only when the level below has at least one `good`.

### `RU.ui` (ui.js)

Renders. Owns no state. Subscribes to engine events. Must support: keyboard only (Space/Enter advance, 1-9 choose, R replay, S slow, T translit), `prefers-reduced-motion`, and a persistent error banner from `RU.save.onError`.

---

## 3. Session Zero content constraints

**Letters.** Free (look-alike, sound-alike, no teaching needed): А К М О Т Е.
Taught by contrast in this session: **Р** (not Latin P), **С** (not Latin C), **Н** (not Latin H).
No other Cyrillic letter may appear in any Russian word the learner READS off the screen. What counts as read rather than heard or typed is fixed by rule 1 in §4: her spoken lines, exercise prompts, hints and `accept[]` members are all outside it.

Readable word pool for exercises and the web lab: НОС, СОН, СОК, КОТ, ТОРТ, МОСТ, МОРС, КАРТА, КАССА, МЕТРО, МАМА, РОК, КРОТ, СМЕТАНА, ТОМАТ, РАКЕТА, КОМЕТА, АРОМАТ. Eighteen words, and nothing outside them may be offered to the learner as a common word to read.

Proper nouns sit outside that pool and are counted separately: **Аня** and **Шпрота** are heard, never decoded; **ТОМ** (the café cat's name card) is spelled entirely from free letters and may appear as a web-lab prop. A name is never a pool word, so nothing that keys off the pool may treat it as one.

**Required beats, in order:**
1. English-first welcome. Russian story text is opt-in in beginner mode, with pronunciation available alongside it. Recorded introductions remain available through Listen.
2. Introduce А К М О Т Е explicitly, then teach Р, С and Н one at a time. Teach Р before the ungraded РОК warm-up. Sound descriptions must not assume another language.
3. Teach the spelling, approximate pronunciation and meaning of first-use vocabulary before recognition checks. The notebook is always available; opening it during a check marks the attempt assisted. Keep option translations hidden until an answer is locked.
4. `constrained` exercise: "Кто это?" → "Это кот" / "кот". (**Кто**, not что: кот is animate and Russian selects кто for animates. The same question is asked once for recognition and once for production, so the session never contradicts itself on the animacy contrast this beat exists to teach.) Accepted-answer set has ≥3 members. A `formOf` check must fire a `wrong-form` diagnosis when the learner answers "кота", and a `notLex` check must fire `wrong-word` — naming the lexeme, so the engine can log a confusable-pair slip — when the learner answers "крот".
5. Web lab: the café sign, one question.
6. Microphone consent screen, both paths equally weighted, "keep it off" is not styled as the lesser choice.
7. Delayed retrieval node with ≥3 variants, at least one of which reviews the item from beat 4.
8. Checkpoint: ability report that reports typed and spoken separately and says "not enough evidence" for speaking if the learner typed.

**Register.** Аня uses ты with the learner from her second line. She is warm, dry, never gushing. No pet names. No guilt about leaving. English is used freely for instruction at this level and is clearly marked as English.

---

## 4. Lint rules (`tools/lint.py`, must pass)

1. Every learner-decodable Russian word uses only letters in the free set plus letters taught by an earlier node.
   **Learner-decodable** = the Russian the learner READS off the screen: `choices[].ru`, `image` when it holds a written word, letter-drill word lists, and the Russian text of a `weblab` page. It is NOT `ru`/`stressed` on a spoken line, NOT exercise `prompt` text, NOT `hint`, and NOT `accept[]` — accept members are production targets that are typed and never displayed, which is what makes beat 4's "Это кот" authorable while Э is untaught.
   Two authored opt-outs, both explicit in the source so neither is folklore:
   - a node carrying `decodable:false` is skipped by this rule. It is for a node that is not a decoding check at all — use this only for non-decoding demonstrations. The revised s0.ex1 teaches before checking and no longer needs this exemption.
   - inside a `weblab` page, an element carrying `data-ru-noise="true"` is skipped. It is for text the learner is meant to skip past rather than read, and any node showing such a page must say so in its English.
2. Every node with `audio` has a manifest entry; every manifest entry is referenced.
3. Every polysyllabic Russian string in `stressed` carries exactly one U+0301.
4. Every `exercise` with `graded:true` declares `modality`, `dimension`, and `reviews`.
5. Every `constrained` exercise has `accept.length >= 2`, and every `accept` member normalises to something distinct.
6. Every `checks[].lex` exists in the lexicon and the required form exists in `forms`.
7. Every `open` exercise has `graded:false`.
8. Every `retrieval` node has ≥2 variants, each with ≥1 `covers` entry, and every variant's lines have audio.
9. Every node id is unique and matches `^s0\.`.
10. No learner-facing English string is empty, and every choice carries a non-empty `en` or `enAfter`.

## Beginner revision (September 2026)

User direction supersedes the former cold-open/trap curriculum. Line nodes may carry optional `lesson` presentation data (`kind`, `title`, `pairs`, `words`, `note`). Word tuples contain Russian spelling, approximate pronunciation, English meaning and a visual referent. These are teaching material, not assessment choices. Added vocabulary is honestly recorded in `teaches`; the launch uses an explicit new-item warning cap of 24 to accommodate this guided vocabulary scope. Existing node IDs, content version and recorded dialogue are retained for save/audio compatibility. Fresh saves use `guided:true` and `autoplay:false`; guided mode prevents automatic dialogue playback/advancement until the learner opens Russian or presses Continue.
