/* russian/data/lexicon.js — Session Zero lexicon.
 *
 * Contract: CONTRACT.md 1.1. Every entry is
 *   { id, lemma, stressed, pos, gender, gloss, forms, letters, tags }
 * and nothing else. No extra keys: lint rule 6 and grade.js both read this
 * table, and an unknown key here is a silent liability later.
 *
 * Scope. Session Zero teaches Р С Н against the free set А К М О Т Е, so the
 * only common words the learner can DECODE are the eighteen in CONTRACT.md 3's
 * readable pool. Those eighteen are all here and they are the only entries
 * tagged "pool". Three proper nouns are also here — Аня, Том, Шпрота —
 * because lines teach them (`teaches:["lex:аня"]` is in the contract's own
 * node example). None of the three is a pool word: Аня and Шпрота are tagged
 * "heard-only" because the learner never decodes them, and Том is spelled
 * from free letters and is read off the café's cat card in the web lab, which
 * CONTRACT.md 3 allows proper nouns to do without joining the pool. So the
 * tags separate three things a later lint will want apart: "the learner may
 * read this" (pool), "the learner may only recognise this" (heard-only), and
 * "this is a name" (name).
 *
 * Animacy is tagged on every entry that denotes a living thing, whether or not
 * the paradigm exposes it: кот, крот and Том expose it in the accusative
 * singular, мама, Аня and Шпрота only in the accusative plural, and a rule
 * that reasons about animacy must not have to guess which is which.
 *
 * Stress marks. `stressed` follows the contract's own lexeme example
 * (`stressed:"но́с"`), which marks even a monosyllable, so every entry here
 * carries exactly one U+0301. Node strings in session0.js follow the
 * contract's node example instead (`"Что э́то?"` — monosyllables unmarked).
 * The two files differ on purpose; each matches its own authority.
 *
 * `forms` values are lowercase and unmarked, per the contract. That includes
 * the proper nouns, whose display capital lives in `lemma`/`stressed` — the
 * grader normalises case before it compares, so a lowercase paradigm is what
 * it wants to see.
 *
 * Paradigms are the machinery behind the "wrong-form" diagnosis, so animacy
 * is honoured: кот, крот and Том are animate masculines and their accusative
 * singular is the genitive (кота, крота, Тома), which is exactly the slip the
 * beat-4 exercise is built to catch.
 */
window.RU = window.RU || {};

RU.LEXICON = {

  /* ---- the readable pool: masculine nouns ------------------------------ */

  "lex:нос": {
    id: "lex:нос",
    lemma: "нос",
    stressed: "но́с",
    pos: "noun",
    gender: "m",
    gloss: "nose",
    forms: {
      nom_sg: "нос", gen_sg: "носа", dat_sg: "носу",
      acc_sg: "нос", ins_sg: "носом", pre_sg: "носе",
      nom_pl: "носы"
    },
    letters: ["Н","О","С"],
    tags: ["s0","pool","noun-m"]
  },

  "lex:сон": {
    id: "lex:сон",
    lemma: "сон",
    stressed: "со́н",
    pos: "noun",
    gender: "m",
    gloss: "sleep; a dream",
    /* Fleeting о: it is in the nominative and gone everywhere else (сна, сну).
       Worth having early — the learner will meet this vowel-drop again. */
    forms: {
      nom_sg: "сон", gen_sg: "сна", dat_sg: "сну",
      acc_sg: "сон", ins_sg: "сном", pre_sg: "сне",
      nom_pl: "сны"
    },
    letters: ["С","О","Н"],
    tags: ["s0","pool","noun-m"]
  },

  "lex:сок": {
    id: "lex:сок",
    lemma: "сок",
    stressed: "со́к",
    pos: "noun",
    gender: "m",
    gloss: "juice",
    forms: {
      nom_sg: "сок", gen_sg: "сока", dat_sg: "соку",
      acc_sg: "сок", ins_sg: "соком", pre_sg: "соке",
      nom_pl: "соки"
    },
    letters: ["С","О","К"],
    tags: ["s0","pool","noun-m"]
  },

  "lex:кот": {
    id: "lex:кот",
    lemma: "кот",
    stressed: "ко́т",
    pos: "noun",
    gender: "m",
    gloss: "cat (male cat, tomcat)",
    /* ANIMATE masculine, and this is the load-bearing entry of the session.
       acc_sg === gen_sg === "кота". The beat-4 constrained exercise requires
       nom_sg, so an answer of "кота" is a real form of the right lemma in the
       wrong slot, and grade.js can say so instead of saying "wrong". */
    forms: {
      nom_sg: "кот", gen_sg: "кота", dat_sg: "коту",
      acc_sg: "кота", ins_sg: "котом", pre_sg: "коте",
      nom_pl: "коты"
    },
    letters: ["К","О","Т"],
    tags: ["s0","pool","noun-m","animate"]
  },

  "lex:крот": {
    id: "lex:крот",
    lemma: "крот",
    stressed: "кро́т",
    pos: "noun",
    gender: "m",
    gloss: "mole (the animal)",
    /* Also animate: acc_sg = крота. Kept in the session as the one-letter
       neighbour of кот, which is how the Р tap gets tested under pressure. */
    forms: {
      nom_sg: "крот", gen_sg: "крота", dat_sg: "кроту",
      acc_sg: "крота", ins_sg: "кротом", pre_sg: "кроте",
      nom_pl: "кроты"
    },
    letters: ["К","Р","О","Т"],
    tags: ["s0","pool","noun-m","animate"]
  },

  "lex:торт": {
    id: "lex:торт",
    lemma: "торт",
    stressed: "то́рт",
    pos: "noun",
    gender: "m",
    gloss: "cake",
    forms: {
      nom_sg: "торт", gen_sg: "торта", dat_sg: "торту",
      acc_sg: "торт", ins_sg: "тортом", pre_sg: "торте",
      nom_pl: "торты"
    },
    letters: ["Т","О","Р"],
    tags: ["s0","pool","noun-m"]
  },

  "lex:мост": {
    id: "lex:мост",
    lemma: "мост",
    stressed: "мо́ст",
    pos: "noun",
    gender: "m",
    gloss: "bridge",
    forms: {
      nom_sg: "мост", gen_sg: "моста", dat_sg: "мосту",
      acc_sg: "мост", ins_sg: "мостом", pre_sg: "мосте",
      nom_pl: "мосты"
    },
    letters: ["М","О","С","Т"],
    tags: ["s0","pool","noun-m"]
  },

  "lex:морс": {
    id: "lex:морс",
    lemma: "морс",
    stressed: "мо́рс",
    pos: "noun",
    gender: "m",
    gloss: "mors — a cold berry drink",
    forms: {
      nom_sg: "морс", gen_sg: "морса", dat_sg: "морсу",
      acc_sg: "морс", ins_sg: "морсом", pre_sg: "морсе",
      nom_pl: "морсы"
    },
    letters: ["М","О","Р","С"],
    tags: ["s0","pool","noun-m"]
  },

  "lex:рок": {
    id: "lex:рок",
    lemma: "рок",
    stressed: "ро́к",
    pos: "noun",
    gender: "m",
    gloss: "rock (the music)",
    /* The trap word. It is the first thing she shows the learner, precisely
       because an English reader says "pock" and is wrong. */
    forms: {
      nom_sg: "рок", gen_sg: "рока", dat_sg: "року",
      acc_sg: "рок", ins_sg: "роком", pre_sg: "роке"
    },
    letters: ["Р","О","К"],
    tags: ["s0","pool","noun-m"]
  },

  "lex:томат": {
    id: "lex:томат",
    lemma: "томат",
    stressed: "тома́т",
    pos: "noun",
    gender: "m",
    gloss: "tomato",
    forms: {
      nom_sg: "томат", gen_sg: "томата", dat_sg: "томату",
      acc_sg: "томат", ins_sg: "томатом", pre_sg: "томате",
      nom_pl: "томаты"
    },
    letters: ["Т","О","М","А"],
    tags: ["s0","pool","noun-m"]
  },

  "lex:аромат": {
    id: "lex:аромат",
    lemma: "аромат",
    stressed: "арома́т",
    pos: "noun",
    gender: "m",
    gloss: "smell, aroma",
    forms: {
      nom_sg: "аромат", gen_sg: "аромата", dat_sg: "аромату",
      acc_sg: "аромат", ins_sg: "ароматом", pre_sg: "аромате",
      nom_pl: "ароматы"
    },
    letters: ["А","Р","О","М","Т"],
    tags: ["s0","pool","noun-m"]
  },

  /* ---- the readable pool: feminine nouns ------------------------------- */

  "lex:карта": {
    id: "lex:карта",
    lemma: "карта",
    stressed: "ка́рта",
    pos: "noun",
    gender: "f",
    gloss: "map; card",
    /* Hard first declension, stem stress throughout. Note dat_sg and pre_sg
       are both "карте" — that collision is normal and the grader must not
       treat it as ambiguity. */
    forms: {
      nom_sg: "карта", gen_sg: "карты", dat_sg: "карте",
      acc_sg: "карту", ins_sg: "картой", pre_sg: "карте",
      nom_pl: "карты"
    },
    letters: ["К","А","Р","Т"],
    tags: ["s0","pool","noun-f"]
  },

  "lex:касса": {
    id: "lex:касса",
    lemma: "касса",
    stressed: "ка́сса",
    pos: "noun",
    gender: "f",
    gloss: "till, cash desk, ticket office",
    forms: {
      nom_sg: "касса", gen_sg: "кассы", dat_sg: "кассе",
      acc_sg: "кассу", ins_sg: "кассой", pre_sg: "кассе",
      nom_pl: "кассы"
    },
    letters: ["К","А","С"],
    tags: ["s0","pool","noun-f"]
  },

  "lex:мама": {
    id: "lex:мама",
    lemma: "мама",
    stressed: "ма́ма",
    pos: "noun",
    gender: "f",
    gloss: "mum, mother",
    /* Animate feminine, but animacy only shows in the plural accusative for
       feminines of this class; acc_sg is the ordinary -у form. */
    forms: {
      nom_sg: "мама", gen_sg: "мамы", dat_sg: "маме",
      acc_sg: "маму", ins_sg: "мамой", pre_sg: "маме",
      nom_pl: "мамы"
    },
    letters: ["М","А"],
    tags: ["s0","pool","noun-f","animate"]
  },

  "lex:сметана": {
    id: "lex:сметана",
    lemma: "сметана",
    stressed: "смета́на",
    pos: "noun",
    gender: "f",
    gloss: "sour cream",
    forms: {
      nom_sg: "сметана", gen_sg: "сметаны", dat_sg: "сметане",
      acc_sg: "сметану", ins_sg: "сметаной", pre_sg: "сметане"
    },
    letters: ["С","М","Е","Т","А","Н"],
    tags: ["s0","pool","noun-f"]
  },

  "lex:ракета": {
    id: "lex:ракета",
    lemma: "ракета",
    stressed: "раке́та",
    pos: "noun",
    gender: "f",
    gloss: "rocket",
    forms: {
      nom_sg: "ракета", gen_sg: "ракеты", dat_sg: "ракете",
      acc_sg: "ракету", ins_sg: "ракетой", pre_sg: "ракете",
      nom_pl: "ракеты"
    },
    letters: ["Р","А","К","Е","Т"],
    tags: ["s0","pool","noun-f"]
  },

  "lex:комета": {
    id: "lex:комета",
    lemma: "комета",
    stressed: "коме́та",
    pos: "noun",
    gender: "f",
    gloss: "comet",
    /* Also the name of the café in the web lab, and of its house cake. */
    forms: {
      nom_sg: "комета", gen_sg: "кометы", dat_sg: "комете",
      acc_sg: "комету", ins_sg: "кометой", pre_sg: "комете",
      nom_pl: "кометы"
    },
    letters: ["К","О","М","Е","Т","А"],
    tags: ["s0","pool","noun-f"]
  },

  /* ---- the readable pool: neuter --------------------------------------- */

  "lex:метро": {
    id: "lex:метро",
    lemma: "метро",
    stressed: "метро́",
    pos: "noun",
    gender: "n",
    gloss: "the metro, the underground",
    /* INDECLINABLE. Every slot is the same string, and that is not laziness —
       it is the fact, and it is the first grammatical gift Russian gives a
       beginner. A form check against any slot therefore always passes, so no
       exercise in this session uses метро for a formOf test. */
    forms: {
      nom_sg: "метро", gen_sg: "метро", dat_sg: "метро",
      acc_sg: "метро", ins_sg: "метро", pre_sg: "метро",
      nom_pl: "метро"
    },
    letters: ["М","Е","Т","Р","О"],
    tags: ["s0","pool","noun-n","indeclinable","loanword"]
  },

  /* ---- proper nouns ----------------------------------------------------- */

  "lex:аня": {
    id: "lex:аня",
    lemma: "Аня",
    stressed: "А́ня",
    pos: "noun",
    gender: "f",
    gloss: "Anya (short form of Анна)",
    /* Soft first declension: Аня, Ани, Ане, Аню, Аней, Ане. Her name contains
       Я, which this session does not teach, so she is heard and never
       decoded — hence the "heard-only" tag. */
    forms: {
      nom_sg: "аня", gen_sg: "ани", dat_sg: "ане",
      acc_sg: "аню", ins_sg: "аней", pre_sg: "ане"
    },
    letters: ["А","Н","Я"],
    tags: ["s0","name","noun-f","animate","heard-only"]
  },

  "lex:том": {
    id: "lex:том",
    lemma: "Том",
    stressed: "То́м",
    pos: "noun",
    gender: "m",
    gloss: "Tom (here: the café cat)",
    /* Decodable — Т О М are all free letters — and it is on the café's cat
       card in the web lab, which is why the retrieval beat can ask for it.
       As a person's or animal's name it is ANIMATE, so acc_sg is Тома. (The
       common noun "том" = volume of a book is inanimate; this entry is the
       name, because that is what the learner meets. Hence the capital in
       `stressed` as well as in `lemma`: grade.js stressedForm() hands
       `stressed` straight to the UI, and a lower-case "то́м" there would print
       the café cat's name as the other word entirely.)
       NOT tagged "pool": CONTRACT.md 3's readable pool is eighteen common
       nouns and does not list ТОМ, so a pool-driven lint must not admit it. */
    forms: {
      nom_sg: "том", gen_sg: "тома", dat_sg: "тому",
      acc_sg: "тома", ins_sg: "томом", pre_sg: "томе"
    },
    letters: ["Т","О","М"],
    tags: ["s0","name","noun-m","animate"]
  },

  "lex:шпрота": {
    id: "lex:шпрота",
    lemma: "Шпрота",
    stressed: "Шпро́та",
    pos: "noun",
    gender: "f",
    gloss: "Shprota — 'Sprat', the name of Anya's cat",
    /* The one personal detail of Session Zero, kept as a real lexeme so later
       arcs can call it back. Ш and П are untaught, so this is heard only.
       The name is a feminine noun on a male cat; Anya heads that off in the
       line itself ("Не спрашивай"). */
    forms: {
      nom_sg: "шпрота", gen_sg: "шпроты", dat_sg: "шпроте",
      acc_sg: "шпроту", ins_sg: "шпротой", pre_sg: "шпроте"
    },
    letters: ["Ш","П","Р","О","Т","А"],
    tags: ["s0","name","noun-f","animate","heard-only","anya-memory"]
  }

};
