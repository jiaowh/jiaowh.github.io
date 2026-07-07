/**
 * 真昼の月 — copy deck, verbatim from design-system.md §12.
 * "do not invent Japanese beyond this" — every JP string used anywhere in
 * the site must trace back to a value in this file. `jp` holds the exact
 * value from the doc's "JP" column (even where, as with ch1/ch2, that
 * column is itself English/romaji — the table is quoted verbatim either
 * way); `en` holds the "EN" column, or `null` where the doc shows "—".
 *
 * `s2Interlude` is the one addition beyond §12's table: it is CD-authored
 * copy from tools/curation.json's `copy-extensions` block (the curatorial
 * layer's own escape hatch for copy the base doc doesn't cover), not
 * invented here — see design-system.md §7 S2's "one poem-fragment
 * interlude" and the Wave 3 brief's item 4.
 */

export interface CopyEntry {
  jp: string;
  en: string | null;
}

export type CopyKey =
  | 'title'
  | 'subtitle'
  | 'arrivalLine'
  | 'ch1'
  | 'ch2'
  | 'ch3'
  | 'ch4'
  | 'finaleObi'
  | 'moonFound'
  | 'moonCounterTemplate'
  | 'postcardTitle'
  | 'postcardNote'
  | 'postcardSend'
  | 'albumCursive'
  | 'credit'
  | 's2Interlude';

export const copyDeck: Record<CopyKey, CopyEntry> = {
  title: { jp: '真昼の月', en: 'The Midday Moon' },
  subtitle: { jp: '白身魚 自選イラスト集', en: 'Selected illustrations by Shiromizakana' },
  arrivalLine: { jp: '空にはいつも、見えない月がある。', en: 'There is always an unseen moon in the sky.' },
  ch1: { jp: 'Chapter.1 girl meets girl', en: null },
  ch2: { jp: 'Chapter.2 Novel illustration', en: null },
  ch3: { jp: 'Chapter.3 ナナブンノニジュウニ', en: '22/7' },
  ch4: { jp: 'Chapter.4 ラフと画材', en: 'Rough & materials' },
  finaleObi: { jp: 'あなただけが、いつも私を見つけてくれる。', en: 'Only you ever find me.' },
  moonFound: { jp: '月を見つけた', en: 'you found the moon' },
  // Table shows the shorthand "MOON N/6"; §6.1's own worked example
  // ("Counter in catalog mono: `MOON 03/06`") is the more specific format
  // spec, so formatMoonCounter() (src/scripts/moon/state.ts) zero-pads both
  // halves. Kept here as the literal template for reference/QA.
  moonCounterTemplate: { jp: 'MOON N/6', en: null },
  postcardTitle: { jp: '読者カード', en: 'POST CARD' },
  postcardNote: { jp: '切手は不要なので送ってね!', en: 'no stamp needed' },
  postcardSend: { jp: '送る', en: 'send' },
  albumCursive: { jp: '', en: 'An eternal prime number named 11.' },
  credit: { jp: 'All artwork © 白身魚(堀口悠紀子)/『真昼の月』復刊ドットコム 2020 — unofficial tribute', en: null },
  // tools/curation.json → copy-extensions.s2-interlude / s2-interlude-en.
  s2Interlude: { jp: 'よく見ると、どのページにも空がある。', en: 'Look closely — there is sky on every page.' },
};
