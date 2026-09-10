# Russian Game — Audit of the Codex Plan and Revised Design

Date: 2026-09-07. **Revision 2, 2026-09-08** — six defects found in revision 1 by a review pass are corrected here; see §14 for the list and what changed.
Folder: `russian/` (empty at time of audit; the Codex plan exists only as the pasted excerpt, starting at the vocabulary-count section)
Learner: English native, fluent Japanese and Chinese, zero Russian (not even the alphabet)
Goal: daily conversation + reading the Russian web, delivered as a lightweight voiced visual-novel game with a single character the learner grows attached to, with progress saved across short sessions

---

## 1. Verdict in one paragraph

The Codex plan is a good **product plan for a company** and a bad **build plan for you**. Its pedagogy is sound and most of it should be kept (four mastery dimensions, spaced retrieval at item+skill level, story-embedded checks, no streak pressure, never guilt the learner for leaving). But it assumes a team of 10+, a voice actor, PostgreSQL, a 6–7 month pre-launch and a pilot cohort. Your reality is: one learner, one static GitHub Pages site, a strong local Python/JS tooling habit, and me as the author of every line. Roughly 40% of the plan (auth, privacy review, cost ceilings, moderation, pilot cohorts, asset ledgers, consent audits) is dead weight here. And it completely ignores the single biggest lever you have: **you already speak Japanese and Chinese**, which makes Cyrillic, palatalisation, case grammar and free word order far easier than for a monolingual English speaker. The revised design below keeps the learning science, deletes the corporate scaffolding, and adds the J/C bridges.

---

## 2. What Codex got right — keep verbatim

| Codex idea | Why it stays |
| --- | --- |
| Letters taught as **sounds and contrasts**, grouped by look-alike / sound-alike, not as a poster | Correct, and doubly correct for a kana/hanzi reader who already knows how to learn a new script in groups |
| Stress marks early (`хорошо́`), fade in reading, keep in pronunciation help | Stress is the #1 intelligibility issue in Russian; this is the right policy |
| Listen → discriminate → imitate → produce loop for minimal pairs | Standard and correct |
| Four independent mastery dimensions: recognition, meaning-in-context, controlled production, spontaneous production | This is exactly what you asked for with "make sure I really get the word" — a tap is not knowledge |
| Delayed natural recall **without the English cue**, interleaved retrieval, weekly voiced mission | This is the "recursive but natural assessment" mechanic |
| Feedback order: confirm meaning → one issue → replay model → one retry → move on | Prevents the game from becoming a nagging tutor |
| Never claim "native" pronunciation, only "intelligible" + one contrast to practise | Honest and useful |
| Failing a gate branches to a practice scene, never blocks the story permanently | Essential for "easy to get on or off" |
| No guilt for leaving, no manufactured crises, no exclusivity framing | Attachment must come from warmth and continuity, not manipulation |
| Web literacy as a **central play space**, starting from a static corpus of fake pages | Correct; live-page import is a v3 problem |
| Ship **Arc 0 + Arc 1** first, then measure | Correct scope discipline |
| Immutable attempt log + recomputable mastery projection; version the content | Cheap to do in JSON, saves you when a lesson is fixed later |

---

## 3. Where the plan is wrong for you

| Codex says | Reality | Replacement |
| --- | --- | --- |
| Team: PM, 2–3 engineers, curriculum lead, native editor, narrative designer, illustrator, composer, voice actor, QA, 20–40 pilot learners | One learner (you) + me | I author scripts, curriculum, engine, and asset pipeline. You play and report. Native-speaker QA is replaced by a redundancy check (see §9) |
| Phases 0–6 = 6–7 months before anything public; 12–18 more months for the full course | You want to start learning now | A playable Cyrillic arc in days; a new arc every 1–2 weeks, authored just ahead of where you are |
| Next.js + Postgres + Redis + auth + CDN + service worker | Static GitHub Pages site; every other page on this site is a self-contained HTML/JS app | One `russian/index.html` + `russian/data/*.js` + `russian/audio/`; progress in `localStorage` with export/import JSON (same pattern as your other pages) |
| Consenting voice actor, slow + normal takes | No actor; nobody to record | Microsoft Edge neural TTS (`ru-RU-SvetlanaNeural` as Аня, `ru-RU-DmitryNeural` for male NPCs), pre-baked to files via `edge-tts`, with word-boundary timestamps for per-word replay. Detail in §7 |
| Server transcription + phoneme-alignment scorer | No server of your own | Browser `SpeechRecognition` with `lang='ru-RU'` (Chrome/Edge; Safari 14.1+ prefixed; Firefox off by default). **Not local** — the browser ships your microphone audio to the vendor's service (§7). Used only for constrained targets, never as a mastery grader. Optional local path later: faster-whisper in WSL |
| LLM phrases optional dialogue via structured outputs + moderation + rate limits | A public static site can't hold an API key | v1 is **fully authored branching**, no live LLM. Optional v3 "free talk" via a local relay you run yourself (same LAN-server pattern as the moto Studio) |
| Commission/license art, asset ledger with expiry | Solo hobby project | Generated character set with one locked reference image + free-license VN backgrounds. Detail in §8 |
| Privacy review, consent audit, account deletion/export, moderation, cost dashboards | Single user, no accounts, no backend of yours. But **speech recognition is not local** — enabling the mic sends audio to Google's or Apple's service | Drop the corporate process. Keep three things: export/import of the save file, a one-screen disclosure before the mic is ever enabled, and a setting that leaves recognition off |
| Pilot cohort vs non-narrative control group | n = 1 | Drop. Measure with the in-game ability report only |
| `RelationshipState` "bounded, non-gating" | Fine, but underspecified | Make it concrete: what she remembers about you and calls back to (§5) |
| `LearnerProfile.declared language background` — one field, never used | Your J/C fluency is the single largest accelerator available | Whole bridge table in §6; the curriculum ordering changes because of it |
| "Proficient at the end" left vague | Russian is FSI Category IV (~1,100 class hours to professional working proficiency). Self-study at 20–30 min/day reaches solid B1 in roughly 2–3 years, not months | State it plainly in-game as arcs, not dates. The game must still be pleasant on day 400 |

---

## 4. Premise, character, tone

**Setting.** You have moved to Saint Petersburg for a year. Аня (Anya, 24, graphic designer, lives one floor down in the same коммуналка-turned-flats building) agreed to a language exchange: she practises English with you on weekends, you speak Russian with her the rest of the time. She is patient, dry-humoured, a little nosy, loves the city and wants to show it to you. She is an adult and a friend; the warmth is that of someone who is glad you showed up. No romance-gating, no jealousy mechanics.

**Why Petersburg, not "Anya visits your city".** Every daily situation (metro, кафе, аптека, продукты, landlord, phone top-up, Avito, Yandex Maps, VK) becomes natural, and the web-browsing goal folds into the story: her phone is your Russian internet.

**Two channels, one character.**

1. **Scenes** (visual novel, 8–15 minutes): background + Аня sprite + voiced Russian line + your response. Standard VN presentation: name plate, text box, backlog, auto/skip for already-mastered lines, save anywhere.
2. **Chat** (messenger UI on "her phone", 1–3 minutes): short exchanges between scenes. This is where spaced retrieval lives — she texts you a photo and asks what it is, sends a voice note, asks you to pick a time for tomorrow. Chat is the "get on or off in 2 minutes" surface the Codex plan never designed.

**Attachment mechanics that are honest.**

- She **remembers what you tell her in Russian** (name, hometown, favourite food, what you did on Sunday) and uses it later as retrieval cues instead of English glosses. The memory is a real data structure, not flavour.
- She has **her own small arc** (a deadline at work, her grandmother in Выборг, a cat named Шпрота) that advances only when you show up, but never punishes absence. Coming back after two weeks gets "Ты где был? Я скучала. Рассказывай." and a gentle re-entry scene, not a decayed relationship meter.
- **Callbacks.** Jokes and mistakes from early arcs come back (the classic: you mixed up писать/пи́сать). This is what makes a VN feel alive and it costs nothing but authoring discipline: a `flags` object.
- **Visual consistency** (§8) matters more than visual quantity. Ten expressions of one face beats fifty stock images.
- **Her voice is one voice** for the whole course. Never swap TTS voices for her.

---

## 5. Session shape and saves

- **Sessions are 10–20 minutes**, designed to end at a natural stop. Each scene has explicit "good stopping points" flagged in data; at one of those the game shows "Аня: Пока! До завтра?" and offers to stop.
- **Save state** (single JSON, `localStorage` key `ru.save.v1`): schema version, content version, story position, flags, Аня's memory of you, every item's mastery state, attempt log (append-only), settings.

**Persistence is a core requirement, so it gets a real design, not "autosave on close".** A browser tab can be killed, a phone can drop the page, and `beforeunload` is not guaranteed to run.

| Concern | Rule |
| --- | --- |
| When to write | After **every completed interaction** — a line advanced, an answer graded, a scheduler update, a settings change. Writes are debounced ~300 ms and coalesced, never deferred to close |
| Write failure | Every write is wrapped. On `QuotaExceededError` or a security exception (private mode, blocked site data), the game shows a persistent banner, keeps playing from memory, and offers "download your save now". It must never fail silently |
| Corruption | Keep a **rotating pair** of slots (`ru.save.v1.a`, `ru.save.v1.b`) written alternately, each with a checksum and timestamp. On load, take the newest slot that parses and validates; if the newest fails, fall back to the other and say so |
| Import validation | An imported file is parsed, schema-validated, and checked for a content version the build knows. Reject with a readable reason. Never merge a partially-valid save over a good one — import always goes through the "this will replace your progress, current save downloaded first" path |
| Attempt-log growth | The append-only log is capped (most recent ~5,000 attempts) with older entries folded into per-item aggregates, so the save cannot grow unbounded |
| Content migrations | Stable IDs are necessary but **not sufficient**. Every content release carries a `contentVersion` and an ordered list of migrations: renamed IDs get an alias map; a scene that changed meaning is re-flagged as unseen; a deleted item's cards are archived, not dropped. Migrations run on load, are logged into the save, and are covered by a fixture test with an old save file |
| Backup | Automatic download prompt of the save every ~10 sessions, and a manual **Export/Import** at any time. This is also the sync path between PC and phone. Treat it as required, not optional: Safari evicts script-writable storage from sites unused for 7 days, so a browser-only save is not durable across a holiday |
- **Return flow.** Opening the game: 1) a 1–3 minute chat with due items woven in, 2) offer to continue the story or do a free review in the "Lounge" (Аня's kitchen, endless), 3) weekly on first open after 7 days since last checkpoint: the voiced mission.
- **No streaks, no timers, no daily quota.** The ability report (§6.4) is the only progress display.

---

## 6. Curriculum

### 6.1 Use the Japanese and Chinese you already have

The Codex plan treats you as a generic English speaker. You are not. These bridges go into the first ten sessions and into every grammar explanation.

**How to read this table.** Every row is a **starting analogy, not an equivalence.** None of them is exact, and several are wrong if pushed. They exist to get your mouth and intuition to roughly the right place on first contact, after which the Russian sound or rule is taught on its own terms and the analogy is dropped. Each bridge is presented in-game as "close to X, then listen for the difference", with the difference named. The table below has not had a dedicated linguistic review; treat the phonetic rows as hypotheses to check against reference audio during Arc 0 authoring (§9), and expect to soften or cut some. In particular the Mandarin consonant rows and the aspect row are the most likely to mislead.

| Russian feature | Bridge from what you know | How the game uses it |
| --- | --- | --- |
| Cyrillic as a new script | You learned kana and hanzi; Cyrillic is 33 letters, phonetic, no readings to memorise | Frame Arc 0 as "a katakana-sized job, a week not a month" |
| я ю ё е as iotated vowels | や ゆ よ いぇ | Teach them as one group with kana labels beside them |
| Soft (palatalised) consonants: нь, ть, ля, ня | Japanese きゃ/にゃ/りゃ rows, Mandarin j/q/x palatals | Hard/soft drill uses kana-row analogies before IPA |
| ы | No J/C equivalent, but Mandarin 子/四 apical vowel is the closest starting point: tongue back, lips unrounded | Discrimination drill ы/и with that hint |
| р | Japanese ら行 is already a tap; extend to a trill | Practise the tap first, trill later |
| х | Mandarin h in 喝 | Close starting point; Russian х is often further back. Listen and adjust |
| ц, ч, ш, щ, ж | Mandarin c ≈ ц, ch/q ≈ ч, sh ≈ ш, x (西) ≈ щ, r in 日 ≈ ж | Useful first approximations, all imperfect: Russian ш/ж are hard and retroflex-ish where Mandarin sh is different in lip posture, and ж is a true fricative where Mandarin r is not. Use to get in range, then drill щ vs ш on Russian audio only |
| Voiced/voiceless б/п д/т г/к | English handles this; note that Mandarin aspiration is **not** the distinction | One warning card, then move on |
| Vowel reduction (unstressed о → а-ish) | Like English schwa; nothing in J/C | Stress marks + listening |
| **Six cases** | Japanese particles: が/は≈nominative, を≈accusative, に≈dative, で≈instrumental, の≈genitive, で/に (location)≈prepositional | Introduced as "particles that fuse onto the end of the word". The most useful analogy in the course, and still only an entry point: unlike particles, case endings also encode gender and number, change the stem's stress, agree across adjectives, and are frequently chosen by a preposition or a verb rather than by meaning. Say all of that out loud in Arc 2 rather than letting it be discovered as a betrayal |
| Free-ish word order because of case marking | Similar to Japanese, with a key difference: Russian is not verb-final, and order carries given/new information rather than being free | Explain once, then treat non-SVO order as normal rather than marked |
| No articles, no "to be" in present | Like J/C in both respects, though Russian does use есть and past/future forms of быть | Note it, celebrate it, move on |
| Verb aspect (perfective/imperfective) | Chinese 了 and Japanese ～てしまう vs ～ている are the nearest things you know, and the fit is poor: Russian aspect is a lexical property of the verb pair, marked in every tense including the infinitive, not a completion marker you add | Mention the analogy once as a hook, then **teach aspect only through verb pairs in context**. This row is the most likely candidate to cut after review |
| Formal/informal address (ты/вы) | Japanese 敬語 instinct | Аня is ты from scene 3 on; strangers are вы |
| Patronymics and name forms (Анна → Аня → Анечка → Анька) | Japanese name suffixes (-さん/-ちゃん) | Small joke scene in Arc 1 |

### 6.2 Arc roadmap (10 arcs, story spine only)

**The revision-1 version of this roadmap did not add up, and the corrected numbers change the design.** It carried Codex's 3,500 lemmas and put them inside 10 arcs totalling ~108 story sessions. That is ~33 new lemmas per session on top of new grammar, story, listening and review, inside a 10–20 minute session. It is not achievable, and 3,500 items × 4 dimensions would also mean ~14,000 scheduled cards, whose steady-state review load alone would swamp the session budget.

The fix is to stop treating the arc list as a vocabulary container.

| Rule | Value |
| --- | --- |
| New lemmas per session | **6–10 in Arc 0–1, 10–15 later**, hard-capped in the engine. Never a quota to hit, only a ceiling |
| Cards created per item | **One at introduction** (recognition). Meaning-in-context, controlled and spontaneous cards are **created only when the learner has produced evidence at the level below**. An item that is only ever recognised carries one card, not four |
| Review load | Capped per session (default ~40 retrievals). Overflow is deferred, and the scheduler prioritises: overdue > confusable-pair errors > items needed by the next scene > everything else |
| Arc length | **Expandable.** An arc is a story spine plus a pool of optional scenes, chats and lounge material. If an arc's vocabulary is not sticking, the engine adds scenes from the pool instead of advancing. Session counts below are the spine, not the total |
| Total vocabulary | An **outcome, not a plan.** At the caps above, ~3,500 lemmas is roughly 300–450 sessions, i.e. one to two years of near-daily play. That is consistent with the FSI Category IV estimate in §3, and inconsistent with reading "10 arcs" as a finish line |

**On "B1+".** Finishing ten arcs does not confer B1. B1 is a set of demonstrated abilities, and the only honest test is behavioural: hold a 10-minute unscripted conversation, read an unfamiliar news article and answer questions about it, handle a transaction with a stranger. The arc gates (§6.4) are proxies for those abilities and should be described that way in-game. The roadmap below is therefore labelled by **what you can do**, and the CEFR letter is an estimate attached to the evidence, never awarded for completion.

Words per arc are targets, not gates; a word only counts as known at the "spontaneous" dimension.

| Arc | Setting / story | Language | Web lab | Spine sessions |
| --- | --- | --- | --- | --- |
| 0 — Буквы | Arrival, the flat, Аня introduces herself, the city at night | Full Cyrillic in 5 contrast groups, stress, reading loanwords you already know (метро, кафе, такси, банк, компьютер, суши) so you feel literate on day 2; hello/yes/no/thanks/please | Read signs, a metro map, a menu of loanwords | 8–10 |
| 1 — Знакомство | Neighbours, a кафе, her cat | Introductions, кто/что/где, gender of nouns, я/ты/он/она, есть/нет, numbers 1–20, prices | Menu with prices; her VK-like profile | 8 |
| 2 — Город | Metro, pharmacy, продукты, getting lost | Accusative and prepositional (first two "particles"), present tense of common verbs, у меня есть, numbers to 1000, time | Yandex-Maps-like page, 2GIS-like listing, a timetable | 10 |
| 3 — Дом и быт | Landlord, a broken tap, her studio | Past tense, genitive (нет + genitive, quantities), possessives, days/months, weather | Avito-like listing, a chat with the landlord, weather site | 10 |
| 4 — Люди | Her friends, a birthday, her grandmother's call | Dative, instrumental, adjectives agreeing, likes (нравится), modal words (можно/нужно/надо) | Group chat, event page, gift shop | 10 |
| 5 — Планы | A weekend trip to Выборг, tickets, hotel | Future tense, perfective/imperfective intro, motion verbs идти/ехать/ходить, imperatives | Train booking, hotel reviews, search queries | 12 |
| 6 — Работа и учёба | Her deadline, your visa/paperwork | Aspect in earnest, reflexive verbs, conditional бы, complex sentences (который, потому что, чтобы) | Government-services page, forms, a news article | 12 |
| 7 — Мнения | Arguments about films, food, the city | Comparatives/superlatives, opinion phrases, discourse markers (ну, вот, же, ведь), colloquial register | Reviews, comment threads, memes | 12 |
| 8 — Истории | She tells family stories; you tell yours | Narrative past with aspect, participles (reading only), reported speech, longer listening | Long-form blog post, a podcast transcript | 12 |
| 9 — Своими словами | You navigate a week alone; she is in Выборг | Consolidation, prefixed verbs, idioms, register shifting; extended speaking | Live-page import (opt-in, local), any Russian site | 12+ |

After Arc 9 the "Lounge" becomes the main mode: news-of-the-day reading, free chat via the optional local LLM relay, and continuing review.

### 6.3 Content release rule (from Codex, kept)

Every new item must recur in at least: one dialogue line, one listening check, one reading (web lab), one typed production, and one spoken production before the arc gate. Authoring tool enforces this (§9).

### 6.4 Assessment: how "recursive but natural" actually works

Each item (lemma, chunk, or grammar skill) can carry up to four FSRS cards, created one at a time as evidence appears (§6.2):

1. **Recognition** — hear/see it, pick the meaning. Cheapest; used in chat.
2. **Meaning in context** — a line uses it; you respond appropriately (choice or short typed reply). Wrong meaning → she rephrases, no English.
3. **Controlled production** — she sets up a slot ("Ты хочешь чай или ...?") and you type or say the word.
4. **Spontaneous production** — she asks an open question in a new setting; you produce a whole reply.

#### What can actually be graded, and what cannot

Revision 1 promised open-ended replies and then proposed to score them by edit distance against one target string. That does not work in either direction: "Я не хочу, спасибо" is a correct answer that scores far from "Нет, спасибо", and "Я хочу чай" versus "Я хочу чая" differ by one character with a real grammatical difference. Splitting exercises by what is checkable:

| Exercise type | What the learner does | How it is graded | Feeds which card |
| --- | --- | --- | --- |
| **Closed** | Pick a reply, pick the meaning, tap the odd one out, choose the case ending | Exact match against the authored key | Recognition, meaning-in-context |
| **Constrained production** | Fill the slot, give the right form of a given word, answer a question whose answer set is small and authored | Against an **authored accepted-answer set** (all reasonable variants, written with the line), plus **explicit form checks** from the lexicon's paradigm tables: is this the accusative singular of this lemma, does the adjective agree, is the aspect the one the frame requires. Near-misses are diagnosed by rule ("right word, wrong case"), not by string distance | Controlled production |
| **Open** | Answer her open question in your own words; tell her about your weekend | **Not auto-graded and not a mastery signal.** She responds in character, the target form is modelled back naturally, and you get a **self-assessment**: "did that come out the way you meant?" with three buttons. Recorded as practice with a self-rating, visibly separate from graded evidence in the ability report | Nothing automatically. A self-rating can *unlock* a spontaneous-production card for scheduling but never advances it |

Edit distance survives in exactly one place: comparing an ASR transcript to a **constrained** target, as a fuzzy match tolerant of recogniser noise (§7). It is never used on free text.

An authored accepted-answer set is cheap when the frame is tight, which is the argument for keeping graded production tight. When a genuinely open reply is the point of the scene, the scene is practice, and the plan says so instead of pretending to measure it. If a credible evaluator becomes available later — a local model behind the same relay as free talk, checked against a held-out set of your own past answers — open replies can be promoted from practice to evidence. Not before.

**Typed answers are not evidence of speaking.** Revision 1 said typed replies were "equally scored", which would let a course completed entirely by keyboard report speaking progress. Corrected: production cards carry a modality tag, typing fills the typed-production card, speaking fills the spoken one, and the ability report shows the two separately and never infers one from the other. Typing still always advances the story (§7).

Scheduler: **FSRS** (the open-source `ts-fsrs` package, vendored as UMD — no build step). Its four ratings map as follows, and the mapping avoids letting reading speed or microphone lag decide mastery:

| Rating | When |
| --- | --- |
| **Again** | Wrong, skipped, or answered only after the answer was revealed |
| **Hard** | Correct, but with a self-corrected error, a wrong-form-then-right-form sequence, or a confusable-pair slip in the same session |
| **Good** | Correct, unaided, first try. **This is the default outcome** and revision 1 omitted it |
| **Easy** | Correct, unaided, first try, and clearly effortless — used sparingly, and only for items already at a long interval |

**Hints are recorded, never rated.** Asking for a hint marks the attempt `assisted: true`, which excludes it from the FSRS grade entirely: the card is left due rather than being scored Hard, so an assisted completion is never mistaken for independent retrieval. Repeated hint use on one item raises it in the priority queue and flags it in the ability report.

**Latency is a tiebreaker, not a grade.** It only separates Good from Easy, is measured from the end of audio playback rather than from scene entry, is ignored entirely for spoken attempts (recogniser round-trip dominates) and for any attempt where the learner scrolled, replayed audio or switched tabs.

**Retrieval variants (replaces "slots").** Revision 1 said the engine would drop due vocabulary into part-of-speech-tagged slots at runtime. That is unsound in a language with agreement — substituting a noun changes the adjective, the verb's government, the case ending and often the stress — and it has no valid audio, since Аня's lines are pre-baked clips that cannot be re-spliced per word.

For v1, review happens by **variant selection, not word substitution**:

- A retrieval beat (a chat opener, a lounge exchange, an optional scene) is authored as **a set of complete alternative exchanges**, each one written, linted and voiced as a whole.
- Each variant is tagged with the items it exercises and the dimension it exercises them at.
- At runtime the engine picks the variant whose tags best cover currently-due items, subject to the review cap and to what has been introduced. If nothing fits, it plays a neutral variant.
- Combinatorics are handled at authoring time, so the Russian is always prevalidated and the audio always exists. The cost is authoring volume, which is why variants are written only for high-value beats (chat, lounge, checkpoint warm-ups) rather than for every line of the story spine.

Word-level substitution is possible later, but only for a closed set of pre-baked, agreement-safe frames where the variable word is the final element and every filler has its own clip. It is out of scope for v1. This is still the mechanism behind "delayed natural recall in a new setting"; it just achieves it by choosing among authored exchanges rather than by generating them.

**Weekly checkpoint** (voiced mission): a scene with no word bank, then an **ability report** in her voice: "Ты хорошо понимаешь на слух. Тебе трудно с ы и и. И падежи после у — давай завтра." plus the numbers behind it in English. No score inflation. The report separates listening, reading, typed production and spoken production, states how many attempts each figure rests on, and says "not enough evidence" rather than guessing — in particular it reports no speaking ability at all if you have been typing.

**Arc gate:** a real task (find a real event in Petersburg on a fake-listings page and tell her when, where, how much) + a spoken role-play. Fail → tailored practice scene → retry next session.

**Feedback order** (Codex, kept): confirm the meaning you intended → one issue → replay model audio → one retry → move on.

---

## 7. Voice pipeline

**Playback (Аня and NPCs).**

- Tool: `edge-tts` (Python, free, no key). Voices: `ru-RU-SvetlanaNeural` = Аня; `ru-RU-DmitryNeural` = male NPCs. It returns audio plus **word-boundary timestamps**, which gives karaoke highlighting and click-a-word replay for free. Slow take: regenerate with `--rate=-30%` rather than time-stretching.
- Format: mono Opus/WebM at ~24 kbps (roughly 3 KB/s). Estimate: ~8,000 clips × ~3 s ≈ 70–80 MB for the whole course, ~10 MB for Arc 0+1. Acceptable for this repo; keep generated audio in `russian/audio/<arc>/` and never commit source WAVs.
- Fallback when a clip is missing: browser `speechSynthesis` with the Edge online natural Russian voice, so you never hit silence during authoring.
- **Stress caveat to test on day 1:** neural TTS gets stress right on common words but can pick the wrong one on ambiguous forms (за́мок/замо́к, больша́я/бо́льшая). Test whether a combining acute accent (U+0301) in the input steers Svetlana; if not, hand-check the ~200 ambiguous items in the wordlist and pick alternate wording where wrong.
- Every clip's manifest entry: text with stress, voice, rate, duration, word timings, content version.

**Your speaking.**

- `SpeechRecognition` / `webkitSpeechRecognition` (`lang='ru-RU'`, `interimResults`). Free and low-latency, with good Russian.
- **It is not local, and the plan must not claim otherwise.** The Web Speech API's recognition side is server-based: the browser sends your microphone audio to the vendor's speech service (Google for Chrome, Apple for Safari) and returns text. Nothing reaches *me* and there is still no backend of yours, but audio does leave the machine. Consequences, all required for v1:
  - **Disclosure before first use.** A one-screen explanation in plain English, naming where audio goes, shown before the mic is ever opened, with "enable" and "keep it off" as equal choices. The choice is stored and revocable in settings; recognition defaults to off.
  - **Feature detection, not browser sniffing.** Support is uneven: full in Chrome, Edge and Opera; Safari from 14.1 on macOS and 14.5 on iOS behind the `webkit` prefix; Firefox has it behind `dom.webspeech.recognition.enable` and off by default. Detect the constructor, and where it is missing show the typed and self-record paths without an error.
  - **Visible mic state** whenever the recogniser is live, and a hard stop control.
  - No audio is stored by the game. Only the returned transcript, the derived score and error tags are written to the save.
- Scoring is a **fuzzy match against a constrained authored target set** — normalised Levenshtein over lower-cased, punctuation-stripped, ё→е text, tolerant of recogniser noise. It is used only where the expected answer is small and authored (§6.4), never on open speech. Always show the transcript: "I heard: ..." never "you were wrong".
- Pronunciation *contrast* work (ы/и, hard/soft, stress) is done as **listening discrimination** first, because ASR is not a phoneme grader. Self-record + replay next to the model is available for everything and needs no recogniser.
- **Voice is never required to advance.** A typed reply always continues the story and always scores the typed-production card. It does not score the spoken card, and the ability report keeps the two apart (§6.4).
- Optional local path later: faster-whisper in your WSL venv behind the same relay used for free talk. That one genuinely keeps audio on the machine, and is the upgrade if the disclosure bothers you.

---

## 8. Art and presentation

**Character.** One locked reference of Аня (face, hair, palette, default outfit), then a **sprite set of 10–14 expressions** generated from that reference with an image model that supports reference-image editing, cut into layers (base body, 4 outfits by season, eyes ×5, mouths ×4, blush/sweat overlays) so combinations multiply without new generations. Consistency checklist before accepting a frame: eye colour, hair part, mole, earring, height ratio. Store the prompt, seed and model with each accepted frame so the set can be extended in a year.

Style target: clean modern anime (think recent Key/Aquaplus keyvisual softness rather than 2000s gal-game), warm skin, cool Petersburg palette in the backgrounds. Do not imitate a named artist.

**Backgrounds.** 12–16 painted evening/day city scenes: the flat, stairwell, her kitchen, the кафе, a metro platform, Nevsky at night, the canal embankment, a продукты shop, Vitebsky station, the Vyborg train, her studio, winter street. Sources in order of preference: (1) free-license VN background packs on itch.io (check each pack's licence page, many are "free with credit", some CC0), (2) generated from your own Petersburg photo references if you have any, (3) generated from prompt with a consistent style string. Keep a `CREDITS.md` — that is the whole asset ledger you need.

**UI.** Reuse the site's design tokens and the single-viewport approach used on the other pages. VN text box bottom third, Аня centre-right, chat as a phone panel that slides in. Reduced-motion respected; everything keyboard operable (Space/Enter advance, number keys pick replies, R replays audio, S slow).

**Music.** A few loopable lo-fi/ambient tracks (CC0 or CC-BY from itch.io/FreePD). Muted by default on return visits if you left it muted.

---

## 9. Authoring pipeline and Russian quality without a native speaker

This is the real risk: I write the Russian, and you can't check it. Mitigations, in order of value:

1. **Word list from data, not memory.** Seed the 3,500 lemmas from a frequency list (OpenSubtitles/Sharoff-style) intersected with TORFL A1–B1 lists; stress, declension tables, gender and English glosses come from the OpenRussian dictionary dump (CC BY-SA 4.0, credit it). Never hand-type a paradigm.
2. **Lint before ship.** A Python script (`russian/tools/lint.py`) checks every scene: all words either previously introduced or tagged as new; new lemmas per session within the cap from §6.2; every new item has ≥2 planned retrievals in later scenes; every line has audio; every learner-facing English string exists; branches reachable; stress mark present on every polysyllabic Russian word. Added in revision 2: **every retrieval variant is complete, tagged and voiced** (no half-authored variant can be selected at runtime); **every constrained exercise has an accepted-answer set with at least two members** where variants are plausible, and each member parses against the lexicon's paradigm tables; **every open exercise is marked `graded: false`** so nothing open can leak into mastery; every graded production exercise declares its modality.
3. **Redundancy check.** Every authored Russian line is back-translated and grammar-checked in a separate pass (different prompt, different session) and disagreements are flagged for me to resolve. Not a native speaker, but it catches most agreement and aspect slips.
4. **Register control.** Аня speaks natural colloquial Petersburg Russian; NPCs speak formal вы register. Both are tagged in data so the lint can complain about a formal verb form in her mouth.
5. **Corpus-attested chunks.** High-frequency conversational chunks (Да ладно. / Ну как? / Давай.) are taken from subtitle frequency, not invented.
6. **You report.** A "this line felt wrong / I want this explained" button appends to a `feedback.json` you paste back to me.

Scene format: one JS/JSON file per scene, human-readable. A line is `{who, ru, stress, en, audio, teaches:[...], choices:[...]}`. An exercise is `{kind: 'closed'|'constrained'|'open', prompt, accept:[...], checks:[...], modality, graded, reviews:[...]}`. A retrieval beat is `{variants:[ <complete exchange>, ... ]}`, each variant carrying its own `reviews:[...]` tags and its own audio. No custom editor UI; the lint is the editor.

---

## 10. Engine and repo layout

```
russian/
  index.html            single-file app shell (VN + chat + lounge + settings)
  css/                  tokens shared with the rest of the site
  js/
    engine.js           scene runner, variant selector
    save.js             write-after-every-interaction, dual-slot + checksum, quota handling
    migrate.js          ordered content migrations, ID alias map, import validation
    srs.js              ts-fsrs vendored (UMD) + rating rules (§6.4)
    grade.js            accepted-answer matching + paradigm-based form checks
    speech.js           playback, word highlighting, ASR wrapper + consent gate
    ui-vn.js  ui-chat.js  ui-lounge.js
  data/
    lexicon.js          lemmas, stress, full paradigms, glosses, J/C bridge notes
    arcs/arc0/*.js      scenes, chat variants, exercises with accepted-answer sets
    weblab/             fake Russian pages (static HTML, sanitised)
  audio/<arc>/*.webm    generated clips + manifest.json
  art/anya/*.webp       layered sprite set
  art/bg/*.webp
  tools/
    gen_audio.py        edge-tts batch with word boundaries → manifest
    lint.py             content checks (§9.2)
    build_lexicon.py    frequency list ∩ TORFL ∩ OpenRussian → lexicon.js
  CREDITS.md
  PLAN_AUDIT.md         this file
```

Vanilla JS, no bundler (same as most pages on this site; avoids the WSL/NTFS npm problems noted elsewhere in the repo). The only npm dependency, `ts-fsrs`, is vendored as a UMD file.

Save format is versioned (`v1`) and content IDs are stable strings (`lex:хлеб`, `gram:acc-sg`). Stable IDs are necessary but not sufficient: a revised scene can change what an ID means, so every content release also ships the ordered migrations described in §5, and a fixture test loads a save from the previous release on every build.

---

## 11. Build order (solo, with me authoring)

**Step 0 comes before everything, and it is the change that matters most in this revision.** Building the engine and the asset set first would mean discovering the authoring and grading problems after hundreds of items exist. So the first deliverable is **one complete vertical session**, end to end, deliberately ugly.

| Step | Deliverable | Effort |
| --- | --- | --- |
| **0** | **Session Zero.** One playable 10-minute session containing every hard mechanic exactly once: 6–8 voiced exchanges with Аня; 3 Cyrillic letters taught by contrast; one constrained exercise with a real accepted-answer set and a paradigm form check; **one delayed retrieval** that fires later in the same session via variant selection; one tiny web-lab task (read a 4-line café sign, answer one question); the mic disclosure screen with both paths; save, reload mid-scene, and resume in place. Placeholder art, one background, one expression. No lexicon build, no arc structure, no sprite set | 2–3 days |
| **0.5** | **You play Session Zero and we look at what broke.** Specifically: did TTS stress survive, did the accepted-answer set actually cover what you typed, did the delayed retrieval feel natural or bolted on, did the variant selector pick something sensible, did reload land you where you left | your time, then 1 day of fixes |
| 1 | Engine proper, generalised from what Session Zero proved: scene runner, variant selector, save/migrate modules, grading module, ASR wrapper with consent gate, settings | 2 days |
| 2 | Аня reference image + first 6 expressions; 3 backgrounds; UI skin | 1 day, iterate later |
| 3 | Lexicon build for Arc 0–1 from frequency + OpenRussian with full paradigms; audio generation; TTS stress audit | 1 day |
| 4 | Arc 0 spine (8–10 scenes) + chat variants + Lounge + lint passing | 2–3 days |
| 5 | You play Arc 0. Fix what's wrong. | your time |
| 6 | Arc 1 + first weekly checkpoint + ability report + first web-lab pages | 3–4 days |
| 7+ | One arc every 1–2 weeks, authored ahead of your position; expansion pool scenes added where items are not sticking; sprites/backgrounds per arc | ongoing |

Compare: Codex's phases 0–6 were 27 weeks before a learner touched Arc 0.

---

## 12. Decisions taken by default (change any of them)

1. **Platform:** responsive web page inside this repo, playable on PC and phone. No native app.
2. **Voice:** Edge neural TTS pre-baked; browser speech recognition for speaking, **off by default**, enabled only after a disclosure that audio goes to the browser vendor. No actor, no paid API.
3. **Character:** Аня, 24, adult friend/neighbour in Petersburg. Warm, not romance-gated. No "story-light mode" (n = 1; you asked for the story).
4. **LLM at runtime:** none in v1. All dialogue authored. Free-talk via a local relay is a later, optional feature.
5. **Live web import:** not before Arc 9; fake pages first.
6. **Transliteration:** shown for Arc 0 only, then off by default with a hold-to-peek key.
7. **Art:** generated character from one locked reference + free-license backgrounds. If you have Petersburg photos, they become background references.
8. **Progress storage:** `localStorage`, written after every interaction, dual-slot with checksums, plus export/import JSON as the real backup and sync path. No accounts.
9. **Grading scope:** closed and constrained exercises are graded; genuinely open replies are practice with self-assessment until a credible evaluator exists. Typed and spoken production are tracked and reported separately.
10. **Vocabulary total:** an outcome of how long you play, not a target inside ten arcs. Arcs expand rather than accelerate.

## 13. Risks that remain

- **Russian correctness without a native speaker.** Mitigated by §9, not eliminated. Expect occasional unnatural lines; the feedback button is how they get fixed.
- **TTS stress errors** on ambiguous words. Test on day 1; hand-audit the ambiguous list.
- **Visual consistency across generated expressions.** The layered-sprite approach reduces the number of generations needed; accept fewer expressions rather than an inconsistent face.
- **Motivation over 2–3 years.** The character arc and the return-flow design are the mitigation; the honest expectation in §3 and §6.2 is the other half.
- **Browser dependency.** Word-boundary highlighting works everywhere (the timings are baked at build time). Recognition is Chrome/Edge-first, Safari prefixed, Firefox off by default; those browsers get typed input, self-record and plain playback, which is a complete course minus automated speech checks.
- **Speaking may end up under-practised** precisely because typing is always available and recognition is off by default. The ability report naming the gap explicitly is the mitigation; if it persists, the answer is more listen-and-repeat with self-rating, not forcing the mic.
- **Authoring volume for retrieval variants.** Variant selection buys correct Russian and correct audio at the cost of writing several complete exchanges per retrieval beat. If it proves too slow, the response is fewer variants per beat, not a return to runtime word substitution.
- **Grading gaps.** Constrained-only grading means some real progress goes unmeasured, and an accepted-answer set will occasionally miss a good answer. The "was this accepted wrongly?" button feeds the same feedback file as bad lines, and the set grows.

---

## 14. Revision 2 changelog

A review pass on revision 1 found six defects. All six were checked and all six were real; each is corrected above rather than annotated.

| # | Defect in revision 1 | Verified | Fix |
| --- | --- | --- | --- |
| 1 | Promised open-ended replies but graded them by edit distance against one target string | Yes. A correct paraphrase would fail and a one-character meaning change would pass | §6.4 now splits exercises into closed, constrained and open. Constrained use authored accepted-answer sets plus paradigm-based form checks. Open replies are practice with self-assessment and feed no mastery card. Edit distance survives only as fuzzy matching of an ASR transcript to a constrained target. Typed answers no longer count as speaking evidence |
| 2 | Runtime "slot filling" of due vocabulary into part-of-speech-tagged holes | Yes, and worse than stated: substitution breaks agreement, government and stress, and pre-baked clips cannot be re-spliced | §6.4 replaces slots with **variant selection**: complete, prevalidated, individually voiced alternative exchanges tagged with the items they review. Word-level substitution is deferred to closed, agreement-safe frames |
| 3 | "Nothing leaves the browser" | Yes, factually wrong. The Web Speech API recognition side is server-based; the browser sends microphone audio to the vendor's service. Support also varies by browser | §3 and §7 corrected. Added a required disclosure screen, recognition off by default, feature detection, visible mic state, transcript-only storage, and the existing typed fallback |
| 4 | ~3,500 lemmas inside ~108 sessions | Yes. That is ~33 new lemmas per session before grammar, story and review, and ~14,000 cards at four per item | §6.2 rewritten: per-session caps on new items, cards created only when evidence exists at the level below, a per-session review cap, expandable arcs, and vocabulary total restated as an outcome. B1+ reframed as demonstrated abilities, not an award for finishing ten arcs |
| 5 | Rating rules omitted "Good" and scored hinted answers as "Hard" | Yes. That conflates assisted completion with independent retrieval | §6.4 defines all four ratings with Good as the default, records hints as `assisted` and excludes them from grading, and demotes latency to a Good/Easy tiebreaker that is ignored for spoken attempts. The UMD packaging of `ts-fsrs` was re-checked and is fine |
| 6 | "Autosave on close" for the central persistence requirement | Yes, and `beforeunload` is not reliable | §5 now specifies writing after every completed interaction, dual-slot writes with checksums, quota and security failure handling, import validation, capped attempt log, ordered content migrations with a fixture test, and periodic export as the real backup |

Two further improvements from the same review, both adopted:

- **Japanese and Chinese bridges are now labelled as limited analogies**, with a preamble saying none is an equivalence, and the phonetic and aspect rows flagged as the most likely to be softened or cut after linguistic review. The "direct mapping" and "same as" phrasings are gone.
- **Session Zero is now step 0 of the build order**, ahead of the engine and the asset set: one complete 10-minute session with voiced exchanges, a delayed retrieval, a constrained exercise, a small web-reading task, the mic disclosure, and save/reload. The point is to hit the authoring and grading problems while the content is small enough to throw away.

---

## Sources checked for this audit

- edge-tts (Python, free Edge neural voices incl. `ru-RU-SvetlanaNeural`, `ru-RU-DmitryNeural`, word-boundary metadata): https://github.com/rany2/edge-tts , https://pypi.org/project/edge-tts/
- OpenRussian dictionary data, CC BY-SA 4.0, with stress and full paradigms: https://en.openrussian.org/about , https://github.com/Badestrand/russian-dictionary
- ts-fsrs (FSRS scheduler, UMD build available; ratings Again/Hard/Good/Easy): https://github.com/open-spaced-repetition/ts-fsrs
- Web Speech API — recognition is server-based, audio is sent to a web service, and browser support varies (Chrome/Edge full, Safari 14.1+ prefixed, Firefox behind a flag): https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API , https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- Free VN sprites/backgrounds on itch.io (licences vary per pack, check each): https://itch.io/game-assets/free/genre-visual-novel/tag-sprites
