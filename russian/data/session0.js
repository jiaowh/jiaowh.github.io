/* Session Zero: English-first story, explicit teaching, then supported practice.
 * Stable node IDs and recorded Russian dialogue are retained for saved games.
 * lesson is presentation data consumed by ui.js; it introduces no new engine node type.
 */
window.RU = window.RU || {};
RU.SESSION0 = {
  "id": "s0",
  "contentVersion": "s0.1",
  "title": "Session Zero — your first Russian words",
  "letters": [
    {
      "id": "ltr:Р",
      "upper": "Р",
      "lower": "р",
      "sound": "r",
      "looksLike": "P",
      "trap": "Use the r sound. РОК reads rok: rock music.",
      "bridge": "Touch the tip of your tongue lightly just behind your upper teeth. A tap is enough to start.",
      "contrastWith": []
    },
    {
      "id": "ltr:С",
      "upper": "С",
      "lower": "с",
      "sound": "s",
      "looksLike": "C",
      "trap": "Use s as in sun. СОК reads sok: juice.",
      "bridge": "Keep a soft stream of air flowing, just as you do for an English s.",
      "contrastWith": []
    },
    {
      "id": "ltr:Н",
      "upper": "Н",
      "lower": "н",
      "sound": "n",
      "looksLike": "H",
      "trap": "Use n as in nose. НОС reads nos: nose.",
      "bridge": "The sound is familiar; only the written shape is new.",
      "contrastWith": []
    }
  ],
  "nodes": [
    {
      "type": "line",
      "id": "s0.welcome",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "translit": null,
      "en": "You have just moved into a building in Saint Petersburg. Your neighbour Anya offers to help with your first Russian words. No alphabet knowledge needed. We will learn a sound, see it in a word, then try it together.",
      "audio": null,
      "bg": "stairwell",
      "sprite": "soft",
      "teaches": [],
      "stop": false,
      "lesson": {
        "kind": "welcome",
        "title": "A little Russian. At your pace.",
        "note": "English leads the story. Open the Russian when you are curious. Nothing moves on until you choose Continue."
      }
    },
    {
      "type": "line",
      "id": "s0.l1",
      "who": "anya",
      "ru": "Привет. Я Аня.",
      "stressed": "Приве́т. Я А́ня.",
      "en": "Hi. I'm Anya.",
      "translit": "Privet. Ya Anya.",
      "audio": "s0.l1",
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [
        "lex:аня"
      ],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.n1",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "Warm light spills onto the landing. Anya settles onto a moving box, turns over an envelope, and makes room for you by the window.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l2",
      "who": "anya",
      "ru": "Ты наверх?",
      "stressed": "Ты наве́рх?",
      "en": "You going up?",
      "translit": "Ty naverkh?",
      "audio": "s0.l2",
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l3",
      "who": "anya",
      "ru": "Я живу этажом ниже.",
      "stressed": "Я живу́ этажо́м ни́же.",
      "en": "I live one floor down.",
      "translit": "Ya zhivu etazhom nizhe.",
      "audio": "s0.l3",
      "sprite": "soft",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.n2",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "Tonight has a small goal: read a few letters, recognise a handful of words, and find a cake on a café menu. We will practise each part before moving on.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l4",
      "who": "anya",
      "ru": "Ладно. Давай с букв.",
      "stressed": "Ла́дно. Дава́й с букв.",
      "en": "Right. Letters first.",
      "translit": "Ladno. Davay s bukv.",
      "audio": "s0.l4",
      "sprite": "dry",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.n3",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "Let’s start with shapes that look familiar. These sound guides are a starting point; Russian vowels can change in unstressed syllables.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false,
      "lesson": {
        "kind": "alphabet",
        "title": "Six familiar shapes",
        "pairs": [
          [
            "А",
            "ah"
          ],
          [
            "К",
            "k"
          ],
          [
            "М",
            "m"
          ],
          [
            "О",
            "o"
          ],
          [
            "Т",
            "t"
          ],
          [
            "Е",
            "ye / e"
          ]
        ],
        "note": "А as in father · К as in key · М as in mum · О as in more · Т as in top. Е often sounds like ye at the start of a word, or e after a consonant."
      }
    },
    {
      "type": "letters",
      "id": "s0.ltr1",
      "letters": [
        "ltr:Р"
      ],
      "intro": "One new sound. Р looks like an English P, but says r. Put it beside О and К and you get РОК: rok, meaning rock music.",
      "title": "Р makes an R sound"
    },
    {
      "type": "exercise",
      "id": "s0.ex1",
      "kind": "closed",
      "graded": false,
      "modality": "choice",
      "prompt": {
        "ru": "Что тут написано?",
        "stressed": "Что тут напи́сано?",
        "en": "Let’s try the word we just built. Р = r, О = o, К = k. How does РОК sound? This is a warm-up; take your time.",
        "audio": "s0.ex1.p"
      },
      "image": "РОК",
      "choices": [
        {
          "id": "a",
          "ru": "РОК",
          "en": "'pock' — rhymes with sock",
          "correct": false
        },
        {
          "id": "b",
          "ru": "РОК",
          "en": "'rock' — like the music",
          "correct": true
        },
        {
          "id": "c",
          "ru": "РОК",
          "en": "I would like another look",
          "correct": false
        }
      ],
      "reviews": [],
      "dimension": "recognition",
      "practiceFeedback": "Р says r, so Р–О–К becomes rok: rock music. You can always open the notebook for help."
    },
    {
      "type": "line",
      "id": "s0.n4",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "РОК reads rok — rock music. One new letter, and you can already read a word. Two more familiar-looking letters will open up more words.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [
        "lex:рок"
      ],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l5",
      "who": "anya",
      "ru": "Это не пэ. Это эр.",
      "stressed": "Э́то не пэ. Э́то эр.",
      "en": "That isn't 'pe'. That's 'er'.",
      "translit": "Eto ne pe. Eto er.",
      "audio": "s0.l5",
      "sprite": "dry",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "letters",
      "id": "s0.ltr2",
      "letters": [
        "ltr:С"
      ],
      "title": "С makes an S sound",
      "intro": "С sounds like s in sun. С–О–К reads sok: juice."
    },
    {
      "type": "letters",
      "id": "s0.ltr3",
      "letters": [
        "ltr:Н"
      ],
      "title": "Н makes an N sound",
      "intro": "Н sounds like n in nose. Н–О–С reads nos: nose. You now have all nine letters for tonight."
    },
    {
      "type": "line",
      "id": "s0.n5",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "For р, try a light tap with the tip of your tongue just behind your top teeth. A perfect rolled r can wait. You can listen to Anya or simply move on.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l6",
      "who": "anya",
      "ru": "Ра. Ро. Ру. Слышишь?",
      "stressed": "Ра. Ро. Ру. Слы́шишь?",
      "en": "Ra. Ro. Ru. Hear it?",
      "translit": "Ra. Ro. Ru. Slyshish'?",
      "audio": "s0.l6",
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.learn.rocket",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "translit": null,
      "en": "First, look at the word, its approximate pronunciation, and its meaning. On the next screen, try recognising it. Capital letters in the sound guide show which syllable to emphasise.",
      "audio": null,
      "bg": "stairwell",
      "sprite": "soft",
      "teaches": [
        "lex:ракета"
      ],
      "stop": false,
      "lesson": {
        "kind": "words",
        "title": "One new word: rocket",
        "words": [
          [
            "РАКЕ́ТА",
            "ra-KYEH-ta",
            "rocket",
            "🚀"
          ],
          [
            "КОМЕ́ТА",
            "ka-MYEH-ta",
            "comet",
            "☄"
          ],
          [
            "КА́РТА",
            "KAR-ta",
            "map / card",
            "🗺"
          ],
          [
            "КА́ССА",
            "KAS-sa",
            "cash desk",
            "▣"
          ]
        ],
        "note": "Read → say it → remember the meaning. The notebook stays available during practice."
      }
    },
    {
      "type": "exercise",
      "id": "s0.ex2",
      "kind": "closed",
      "graded": true,
      "modality": "choice",
      "prompt": {
        "ru": "Что это?",
        "stressed": "Что э́то?",
        "en": "Which word means rocket? You have just seen it. Try sounding it out, or open the notebook for a reminder.",
        "audio": "s0.ex2.p"
      },
      "image": "🚀",
      "choices": [
        {
          "id": "a",
          "ru": "РАКЕТА",
          "enAfter": "a rocket",
          "correct": true
        },
        {
          "id": "b",
          "ru": "КОМЕТА",
          "enAfter": "a comet",
          "correct": false
        },
        {
          "id": "c",
          "ru": "КАРТА",
          "enAfter": "a map, or a card",
          "correct": false
        },
        {
          "id": "d",
          "ru": "КАССА",
          "enAfter": "the till, the cash desk",
          "correct": false
        }
      ],
      "reviews": [
        "lex:ракета"
      ],
      "dimension": "recognition"
    },
    {
      "type": "line",
      "id": "s0.learn.nose",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "translit": null,
      "en": "First, look at the word, its approximate pronunciation, and its meaning. On the next screen, try recognising it. Capital letters in the sound guide show which syllable to emphasise.",
      "audio": null,
      "bg": "stairwell",
      "sprite": "soft",
      "teaches": [
        "lex:нос",
        "lex:сон"
      ],
      "stop": false,
      "lesson": {
        "kind": "words",
        "title": "Meet these short words",
        "words": [
          [
            "НОС",
            "nos",
            "nose",
            "👃"
          ],
          [
            "СОН",
            "son",
            "sleep / dream",
            "☾"
          ],
          [
            "СОК",
            "sok",
            "juice",
            "🧃"
          ]
        ],
        "note": "Read → say it → remember the meaning. The notebook stays available during practice."
      }
    },
    {
      "type": "exercise",
      "id": "s0.ex3",
      "kind": "closed",
      "graded": true,
      "modality": "choice",
      "prompt": {
        "ru": "А это что?",
        "stressed": "А э́то что?",
        "en": "Choose the word for nose. Keep an eye on the order of the letters. The notebook is there if you need a reminder.",
        "audio": "s0.ex3.p"
      },
      "image": "👃",
      "choices": [
        {
          "id": "a",
          "ru": "СОН",
          "enAfter": "sleep, a dream",
          "correct": false
        },
        {
          "id": "b",
          "ru": "НОС",
          "enAfter": "a nose",
          "correct": true
        },
        {
          "id": "c",
          "ru": "СОК",
          "enAfter": "juice",
          "correct": false
        },
        {
          "id": "d",
          "ru": "МОСТ",
          "enAfter": "a bridge",
          "correct": false
        }
      ],
      "reviews": [
        "lex:нос",
        "lex:сон"
      ],
      "dimension": "recognition"
    },
    {
      "type": "line",
      "id": "s0.learn.bridge",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "translit": null,
      "en": "First, look at the word, its approximate pronunciation, and its meaning. On the next screen, try recognising it. Capital letters in the sound guide show which syllable to emphasise.",
      "audio": null,
      "bg": "stairwell",
      "sprite": "soft",
      "teaches": [
        "lex:мост",
        "lex:морс"
      ],
      "stop": false,
      "lesson": {
        "kind": "words",
        "title": "A bridge and a berry drink",
        "words": [
          [
            "МОСТ",
            "most",
            "bridge",
            "🌉"
          ],
          [
            "МОРС",
            "mors",
            "berry drink",
            "🧃"
          ]
        ],
        "note": "Read → say it → remember the meaning. The notebook stays available during practice."
      }
    },
    {
      "type": "exercise",
      "id": "s0.ex4",
      "kind": "closed",
      "graded": true,
      "modality": "choice",
      "prompt": {
        "ru": "Ну а это?",
        "stressed": "Ну а э́то?",
        "en": "Choose the word for bridge. Compare the endings of МОСТ and МОРС.",
        "audio": "s0.ex4.p"
      },
      "image": "🌉",
      "choices": [
        {
          "id": "a",
          "ru": "МОРС",
          "enAfter": "mors — a cold berry drink",
          "correct": false
        },
        {
          "id": "b",
          "ru": "МОСТ",
          "enAfter": "a bridge",
          "correct": true
        },
        {
          "id": "c",
          "ru": "МАМА",
          "enAfter": "mum",
          "correct": false
        },
        {
          "id": "d",
          "ru": "СОН",
          "enAfter": "sleep, a dream",
          "correct": false
        }
      ],
      "reviews": [
        "lex:мост",
        "lex:морс"
      ],
      "dimension": "recognition"
    },
    {
      "type": "line",
      "id": "s0.l7",
      "who": "anya",
      "ru": "Хорошо. А теперь смотри.",
      "stressed": "Хорошо́. А тепе́рь смотри́.",
      "en": "Good. Now watch.",
      "translit": "Khorosho. A teper' smotri.",
      "audio": "s0.l7",
      "sprite": "smile",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.learn.metro",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "translit": null,
      "en": "First, look at the word, its approximate pronunciation, and its meaning. On the next screen, try recognising it. Capital letters in the sound guide show which syllable to emphasise.",
      "audio": null,
      "bg": "stairwell",
      "sprite": "soft",
      "teaches": [
        "lex:метро"
      ],
      "stop": false,
      "lesson": {
        "kind": "words",
        "title": "A word you already know",
        "words": [
          [
            "МЕТРО́",
            "mee-TRO",
            "metro / underground",
            "Ⓜ"
          ]
        ],
        "note": "Read → say it → remember the meaning. The notebook stays available during practice."
      }
    },
    {
      "type": "line",
      "id": "s0.n6",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "Anya writes four arrangements of the same letters. Find the spelling of metro that you just learned: М–Е–Т–Р–О.",
      "translit": null,
      "audio": null,
      "sprite": "dry",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l8",
      "who": "anya",
      "ru": "Ну, читай.",
      "stressed": "Ну, чита́й.",
      "en": "Go on — read it.",
      "translit": "Nu, chitay.",
      "audio": "s0.l8",
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "exercise",
      "id": "s0.ex5",
      "kind": "closed",
      "graded": true,
      "modality": "choice",
      "prompt": {
        "ru": "Где тут настоящее слово?",
        "stressed": "Где тут настоя́щее сло́во?",
        "en": "Which spelling means metro? Say the letters slowly and look for the word you learned.",
        "audio": "s0.ex5.p"
      },
      "image": null,
      "choices": [
        {
          "id": "a",
          "ru": "НЕТРО",
          "enAfter": "nothing — you just said 'netro'",
          "correct": false
        },
        {
          "id": "b",
          "ru": "МЕТОР",
          "enAfter": "nothing — you just said 'metor'",
          "correct": false
        },
        {
          "id": "c",
          "ru": "МЕТРО",
          "enAfter": "the metro, the underground",
          "correct": true
        },
        {
          "id": "d",
          "ru": "ТЕМРО",
          "enAfter": "nothing — you just said 'temro'",
          "correct": false
        }
      ],
      "reviews": [
        "lex:метро"
      ],
      "dimension": "recognition"
    },
    {
      "type": "line",
      "id": "s0.l9",
      "who": "anya",
      "ru": "Вот! Ты читаешь. Не угадываешь — читаешь.",
      "stressed": "Вот! Ты чита́ешь. Не уга́дываешь — чита́ешь.",
      "en": "There! You're reading. Not guessing — reading.",
      "translit": "Vot! Ty chitaesh'. Ne ugadyvaesh' — chitaesh'.",
      "audio": "s0.l9",
      "sprite": "bright",
      "bg": "stairwell",
      "teaches": [
        "lex:метро"
      ],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l10",
      "who": "anya",
      "ru": "Первое слово, которое ты читаешь в Питере. Поздравляю.",
      "stressed": "Пе́рвое сло́во, кото́рое ты чита́ешь в Пи́тере. Поздравля́ю.",
      "en": "First word you've read in Piter. Congratulations, seriously.",
      "translit": "Pervoe slovo, kotoroe ty chitaesh' v Pitere. Pozdravlyayu.",
      "audio": "s0.l10",
      "sprite": "smile",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.n7",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "You read МЕТРО: М–Е–Т–Р–О. The meaning was already familiar; now you know its Russian spelling too.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l11",
      "who": "anya",
      "ru": "У меня есть кот.",
      "stressed": "У меня́ есть кот.",
      "en": "I have a cat.",
      "translit": "U menya yest' kot.",
      "audio": "s0.l11",
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [
        "lex:кот"
      ],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.learn.cat",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "translit": null,
      "en": "First, look at the word, its approximate pronunciation, and its meaning. On the next screen, try recognising it. Capital letters in the sound guide show which syllable to emphasise.",
      "audio": null,
      "bg": "stairwell",
      "sprite": "soft",
      "teaches": [
        "lex:кот",
        "lex:крот"
      ],
      "stop": false,
      "lesson": {
        "kind": "words",
        "title": "Meet Anya’s cat",
        "words": [
          [
            "КОТ",
            "kot",
            "male cat",
            "🐈"
          ],
          [
            "КРОТ",
            "krot",
            "mole",
            "●"
          ]
        ],
        "note": "Read → say it → remember the meaning. The notebook stays available during practice."
      }
    },
    {
      "type": "exercise",
      "id": "s0.ex6",
      "kind": "closed",
      "graded": true,
      "modality": "choice",
      "prompt": {
        "ru": "Кто это?",
        "stressed": "Кто э́то?",
        "en": "Which word means cat? One extra letter changes cat to mole. Try reading each word slowly.",
        "audio": "s0.ex6.p"
      },
      "image": "🐈",
      "choices": [
        {
          "id": "a",
          "ru": "СОТ",
          "enAfter": "not a word you need tonight — 'sot'",
          "correct": false
        },
        {
          "id": "b",
          "ru": "КРОТ",
          "enAfter": "a mole — the animal that digs",
          "correct": false
        },
        {
          "id": "c",
          "ru": "КОТ",
          "enAfter": "a cat",
          "correct": true
        },
        {
          "id": "d",
          "ru": "КОН",
          "enAfter": "not a word you need tonight — 'kon'",
          "correct": false
        }
      ],
      "reviews": [
        "lex:кот",
        "lex:крот"
      ],
      "dimension": "recognition"
    },
    {
      "type": "line",
      "id": "s0.l12",
      "who": "anya",
      "ru": "Его зовут Шпрота. Не спрашивай.",
      "stressed": "Его́ зову́т Шпро́та. Не спра́шивай.",
      "en": "His name is Shprota — 'Sprat'. Don't ask.",
      "translit": "Yego zovut Shprota. Ne sprashivay.",
      "audio": "s0.l12",
      "sprite": "dry",
      "bg": "stairwell",
      "teaches": [
        "lex:шпрота"
      ],
      "stop": true
    },
    {
      "type": "line",
      "id": "s0.n8",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "Anya points to the cat again. This time, build the word yourself. You can tap the letter keys, type, or use the notebook.",
      "translit": null,
      "audio": null,
      "sprite": "dry",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "exercise",
      "id": "s0.ex7",
      "kind": "constrained",
      "graded": true,
      "modality": "typed",
      "prompt": {
        "ru": "Кто это?",
        "stressed": "Кто э́то?",
        "en": "Same question as before, and this time she wants the word from you. Type it in Russian. Every letter you need is one of tonight's nine, and you only need three of them.",
        "audio": "s0.ex7.p"
      },
      "image": "🐈",
      "accept": [
        "кот",
        "это кот",
        "кот, а не крот"
      ],
      "checks": [
        {
          "type": "formOf",
          "lex": "lex:кот",
          "require": "nom_sg"
        },
        {
          "type": "notLex",
          "lex": "lex:крот"
        }
      ],
      "hint": "Three letters, all of them on the card in front of you, and the word is exactly the shape she wrote on the envelope — unchanged. If you are adding something to the end to make it feel like a finished sentence, take it off. Russian will want that ending from you later, for a completely different job.",
      "reviews": [
        "lex:кот"
      ],
      "dimension": "controlled"
    },
    {
      "type": "line",
      "id": "s0.l13",
      "who": "anya",
      "ru": "Кот. Три буквы, и это уже слово.",
      "stressed": "Кот. Три бу́квы, и э́то уже́ сло́во.",
      "en": "Cat. Three letters, and it's already a word.",
      "translit": "Kot. Tri bukvy, i eto uzhe slovo.",
      "audio": "s0.l13",
      "sprite": "smile",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.n9",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "Tonight we use the naming form: кот, cat. Russian words can change their endings in sentences. You do not need those endings yet.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l14",
      "who": "anya",
      "ru": "Гляди. Это кафе внизу.",
      "stressed": "Гляди́. Э́то кафе́ внизу́.",
      "en": "Look. This is the café downstairs.",
      "translit": "Glyadi. Eto kafe vnizu.",
      "audio": "s0.l14",
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.learn.cake",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "translit": null,
      "en": "First, look at the word, its approximate pronunciation, and its meaning. On the next screen, try recognising it. Capital letters in the sound guide show which syllable to emphasise.",
      "audio": null,
      "bg": "stairwell",
      "sprite": "soft",
      "teaches": [
        "lex:торт",
        "lex:сок",
        "lex:сметана"
      ],
      "stop": false,
      "lesson": {
        "kind": "words",
        "title": "Your café words",
        "words": [
          [
            "ТОРТ",
            "tort",
            "cake",
            "🍰"
          ],
          [
            "СОК",
            "sok",
            "juice",
            "🧃"
          ],
          [
            "СМЕТА́НА",
            "smyeh-TA-na",
            "sour cream",
            "🥣"
          ]
        ],
        "note": "Read → say it → remember the meaning. The notebook stays available during practice."
      }
    },
    {
      "type": "weblab",
      "id": "s0.web1",
      "page": "weblab/cafe.html",
      "teaches": [
        "lex:комета"
      ],
      "task": {
        "en": "She hands you the phone. This is the counter board of КОМЕТА, the café on the ground floor of your building — four things, four prices, and a cat's name card taped to the till. Every word on the board itself is built from tonight's nine letters; the small line under the café's name is not, and you are meant to skip it. Read the board; the English on this screen is not going to help you find a row.",
        "question": {
          "type": "exercise",
          "id": "s0.web1.q",
          "kind": "closed",
          "graded": true,
          "modality": "choice",
          "prompt": {
            "ru": "Сколько стоит торт?",
            "stressed": "Ско́лько сто́ит торт?",
            "en": "How much is the cake? Find the row on the board.",
            "audio": "s0.web1.q.p"
          },
          "image": null,
          "choices": [
            {
              "id": "a",
              "ru": "150 Р",
              "en": "150 roubles",
              "correct": false
            },
            {
              "id": "b",
              "ru": "140 Р",
              "en": "140 roubles",
              "correct": false
            },
            {
              "id": "c",
              "ru": "260 Р",
              "en": "260 roubles",
              "correct": true
            },
            {
              "id": "d",
              "ru": "60 Р",
              "en": "60 roubles",
              "correct": false
            }
          ],
          "reviews": [
            "lex:торт"
          ],
          "dimension": "meaning"
        }
      }
    },
    {
      "type": "line",
      "id": "s0.l15",
      "who": "anya",
      "ru": "Двести шестьдесят. Дорого. Но торт вкусный.",
      "stressed": "Две́сти шестьдеся́т. До́рого. Но торт вку́сный.",
      "en": "Two hundred and sixty. Pricey. But the cake's good.",
      "translit": "Dvesti shest'desyat. Dorogo. No tort vkusnyy.",
      "audio": "s0.l15",
      "sprite": "dry",
      "bg": "stairwell",
      "teaches": [
        "lex:торт"
      ],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.n10",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "That was reading a real thing for a real reason: not a flashcard, a price. It is the same job you will be doing on Yandex Maps and on a pharmacy shelf, and tonight it took you four letters and a rouble sign. This is a good place to stop if ten minutes is what you had. Everything so far is saved.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": true
    },
    {
      "type": "line",
      "id": "s0.n11",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "One real choice before the next screen, and it belongs to you rather than to her. It asks whether you want the microphone on. Switch recognition on and the browser sends that audio to its speech service and hands back a transcript — that is how it works in every browser that has it, and it is not local. Leave it off and typing still advances everything and still counts as production; the microphone only buys you automatic checking. Change it any time in settings.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "consent",
      "id": "s0.mic"
    },
    {
      "type": "line",
      "id": "s0.l16",
      "who": "anya",
      "ru": "Как тебе удобнее.",
      "stressed": "Как тебе́ удо́бнее.",
      "en": "Whatever suits you.",
      "translit": "Kak tebe udobneye.",
      "audio": "s0.l16",
      "sprite": "dry",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "exercise",
      "id": "s0.ex8",
      "kind": "open",
      "graded": false,
      "modality": "either",
      "prompt": {
        "ru": "Повтори за мной: метро.",
        "stressed": "Повтори́ за мной: метро́.",
        "en": "Say it after her: metro. Nothing here is scored and nothing is stored — this one is just your mouth against hers. Play her line again, say it, rate yourself. The microphone changes nothing about that.",
        "audio": "s0.ex8.p"
      },
      "image": null,
      "reviews": [],
      "dimension": "spontaneous"
    },
    {
      "type": "line",
      "id": "s0.n12",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "Rate yourself honestly, because there is one thing worth catching early: Russian stress lands on МЕТРО's last syllable, me-TRO, and English mouths reliably put it on the first.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.n13",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "She stands, gets a hand under the box, and gets it about half a metre off the floor before deciding that was a mistake. She puts it down again on the step below and does not comment. Then she remembers something and turns round.",
      "translit": null,
      "audio": null,
      "sprite": "dry",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "retrieval",
      "id": "s0.r1",
      "reviews": [
        "lex:кот",
        "lex:метро",
        "lex:карта",
        "lex:нос",
        "lex:сон"
      ],
      "variants": [
        {
          "id": "s0.r1.v1",
          "covers": [
            "lex:кот"
          ],
          "nodes": [
            {
              "type": "line",
              "id": "s0.r1.v1.l1",
              "who": "anya",
              "ru": "Погоди. Одно слово, и я тебя отпускаю.",
              "stressed": "Погоди́. Одно́ сло́во, и я тебя́ отпуска́ю.",
              "en": "Hang on. One word, and then I'll let you go.",
              "translit": "Pogodi. Odno slovo, i ya tebya otpuskayu.",
              "audio": "s0.r1.v1.l1",
              "sprite": "dry",
              "bg": "stairwell",
              "teaches": [],
              "stop": false
            },
            {
              "type": "exercise",
              "id": "s0.r1.v1.ex",
              "kind": "constrained",
              "graded": true,
              "modality": "either",
              "prompt": {
                "ru": "Кто у меня дома?",
                "stressed": "Кто у меня́ до́ма?",
                "en": "Who is waiting at her flat? One word — type it, or say it if you turned the microphone on.",
                "audio": "s0.r1.v1.ex.p"
              },
              "image": null,
              "accept": [
                "кот",
                "это кот",
                "там кот"
              ],
              "checks": [
                {
                  "type": "formOf",
                  "lex": "lex:кот",
                  "require": "nom_sg"
                },
                {
                  "type": "notLex",
                  "lex": "lex:крот"
                }
              ],
              "hint": "You have met him twice tonight, once as three letters on an envelope and once as a very bad drawing. Naming form. Nothing added to the end.",
              "reviews": [
                "lex:кот"
              ],
              "dimension": "controlled"
            },
            {
              "type": "line",
              "id": "s0.r1.v1.l2",
              "who": "anya",
              "ru": "Кот. Шпрота. Всё, беги.",
              "stressed": "Кот. Шпро́та. Всё, беги́.",
              "en": "A cat. Shprota. Right, off you go.",
              "translit": "Kot. Shprota. Vsyo, begi.",
              "audio": "s0.r1.v1.l2",
              "sprite": "smile",
              "bg": "stairwell",
              "teaches": [],
              "stop": false
            }
          ]
        },
        {
          "id": "s0.r1.v2",
          "covers": [
            "lex:метро",
            "lex:карта"
          ],
          "nodes": [
            {
              "type": "line",
              "id": "s0.r1.v2.l1",
              "who": "anya",
              "ru": "Допустим, завтра тебе в центр.",
              "stressed": "Допу́стим, за́втра тебе́ в центр.",
              "en": "Say you need to get into the centre tomorrow.",
              "translit": "Dopustim, zavtra tebe v tsentr.",
              "audio": "s0.r1.v2.l1",
              "sprite": "neutral",
              "bg": "stairwell",
              "teaches": [],
              "stop": false
            },
            {
              "type": "exercise",
              "id": "s0.r1.v2.ex",
              "kind": "closed",
              "graded": true,
              "modality": "choice",
              "prompt": {
                "ru": "Что ты ищешь?",
                "stressed": "Что ты и́щешь?",
                "en": "You want the underground. Which of these words is on the sign you are looking for?",
                "audio": "s0.r1.v2.ex.p"
              },
              "image": null,
              "choices": [
                {
                  "id": "a",
                  "ru": "КАРТА",
                  "enAfter": "a map, or a card",
                  "correct": false
                },
                {
                  "id": "b",
                  "ru": "МЕТРО",
                  "enAfter": "the metro, the underground",
                  "correct": true
                },
                {
                  "id": "c",
                  "ru": "КАССА",
                  "enAfter": "the till, the cash desk",
                  "correct": false
                },
                {
                  "id": "d",
                  "ru": "МОСТ",
                  "enAfter": "a bridge",
                  "correct": false
                }
              ],
              "reviews": [
                "lex:метро",
                "lex:карта"
              ],
              "dimension": "recognition"
            },
            {
              "type": "line",
              "id": "s0.r1.v2.l2",
              "who": "anya",
              "ru": "Метро. Синяя буква М. Увидишь.",
              "stressed": "Метро́. Си́няя бу́ква М. Уви́дишь.",
              "en": "The metro. A blue letter M. You'll see it.",
              "translit": "Metro. Sinyaya bukva M. Uvidish'.",
              "audio": "s0.r1.v2.l2",
              "sprite": "smile",
              "bg": "stairwell",
              "teaches": [],
              "stop": false
            }
          ]
        },
        {
          "id": "s0.r1.v3",
          "covers": [
            "lex:сон",
            "lex:нос"
          ],
          "nodes": [
            {
              "type": "line",
              "id": "s0.r1.v3.l1",
              "who": "anya",
              "ru": "И последнее.",
              "stressed": "И после́днее.",
              "en": "One last thing.",
              "translit": "I poslednee.",
              "audio": "s0.r1.v3.l1",
              "sprite": "neutral",
              "bg": "stairwell",
              "teaches": [],
              "stop": false
            },
            {
              "type": "exercise",
              "id": "s0.r1.v3.ex",
              "kind": "closed",
              "graded": true,
              "modality": "choice",
              "prompt": {
                "ru": "Что это?",
                "stressed": "Что э́то?",
                "en": "Earlier she drew the nose. Same two words, other direction: this one is sleep.",
                "audio": "s0.r1.v3.ex.p"
              },
              "image": "💤",
              "choices": [
                {
                  "id": "a",
                  "ru": "НОС",
                  "enAfter": "a nose",
                  "correct": false
                },
                {
                  "id": "b",
                  "ru": "СОН",
                  "enAfter": "sleep, a dream",
                  "correct": true
                },
                {
                  "id": "c",
                  "ru": "МОСТ",
                  "enAfter": "a bridge",
                  "correct": false
                }
              ],
              "reviews": [
                "lex:сон",
                "lex:нос"
              ],
              "dimension": "recognition"
            },
            {
              "type": "line",
              "id": "s0.r1.v3.l2",
              "who": "anya",
              "ru": "Нос. И сон. Те же буквы, другой порядок.",
              "stressed": "Нос. И сон. Те же бу́квы, друго́й поря́док.",
              "en": "Nose. And sleep. The same letters, a different order.",
              "translit": "Nos. I son. Te zhe bukvy, drugoy poryadok.",
              "audio": "s0.r1.v3.l2",
              "sprite": "dry",
              "bg": "stairwell",
              "teaches": [],
              "stop": false
            }
          ]
        }
      ]
    },
    {
      "type": "line",
      "id": "s0.l17",
      "who": "anya",
      "ru": "Так. Смотри, что получилось.",
      "stressed": "Так. Смотри́, что получи́лось.",
      "en": "Right. Look what you've got.",
      "translit": "Tak. Smotri, chto poluchilos'.",
      "audio": "s0.l17",
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.n14",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "Here is what you practised today. Reading and typing count separately from speaking. Untried skills are simply things to explore next.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "checkpoint",
      "id": "s0.end"
    },
    {
      "type": "line",
      "id": "s0.l18",
      "who": "anya",
      "ru": "Читаешь ты хорошо. А как говоришь — пока не знаю.",
      "stressed": "Чита́ешь ты хорошо́. А как говори́шь — пока́ не зна́ю.",
      "en": "You read well. How you speak — I don't know yet.",
      "translit": "Chitaesh' ty khorosho. A kak govorish' — poka ne znayu.",
      "audio": "s0.l18",
      "sprite": "dry",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.n15",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "You can come back to speaking whenever you feel ready. Reading is a useful first step.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l19",
      "who": "anya",
      "ru": "Метро, кот, торт. Это уже чтение.",
      "stressed": "Метро́, кот, торт. Э́то уже́ чте́ние.",
      "en": "Metro, cat, cake. That's reading already.",
      "translit": "Metro, kot, tort. Eto uzhe chtenie.",
      "audio": "s0.l19",
      "sprite": "smile",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l20",
      "who": "anya",
      "ru": "Завтра я дома. И Шпрота тоже.",
      "stressed": "За́втра я до́ма. И Шпро́та то́же.",
      "en": "I'm home tomorrow. Shprota too.",
      "translit": "Zavtra ya doma. I Shprota tozhe.",
      "audio": "s0.l20",
      "sprite": "soft",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    },
    {
      "type": "line",
      "id": "s0.l21",
      "who": "anya",
      "ru": "Пока.",
      "stressed": "Пока́.",
      "en": "Bye.",
      "translit": "Poka.",
      "audio": "s0.l21",
      "sprite": "smile",
      "bg": "stairwell",
      "teaches": [],
      "stop": true
    },
    {
      "type": "line",
      "id": "s0.n16",
      "who": "narrator",
      "ru": null,
      "stressed": null,
      "en": "Anya picks up her box and heads downstairs. You have read your first Russian words and found a cake on the menu. Come back whenever you like; your place is saved.",
      "translit": null,
      "audio": null,
      "sprite": "neutral",
      "bg": "stairwell",
      "teaches": [],
      "stop": false
    }
  ]
};
