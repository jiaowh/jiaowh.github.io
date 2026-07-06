// GYOKAI — Acid Pop Archive
// SINGLE SOURCE OF TRUTH for every string the site renders in the JP
// display face (Dela Gothic One, var(--font-jp)).
//
// scripts/subset-fonts.mjs derives the font subset from:
//   (every double-quoted string literal in THIS file)
//   ∪ (every `titleJa` in scripts/allowlist.json)
//
// RULES FOR THIS FILE (the subset script parses it as text):
//   - String values must be plain double-quoted literals on one line.
//   - No escape sequences, no template literals, no string concatenation.
//   - If you render ANY new text in --font-jp anywhere in the app, it must
//     either come from this module or from an allowlist `titleJa`.

/** Japanese display strings (Dela Gothic One). */
export const JP = {
  /** 魚介 — the artist's name; hero vertical wordmark, encore ticker, brand. */
  artist: "魚介",
  /** ギョカイ — katakana reading of the artist's name. */
  artistKana: "ギョカイ",
  /** アシッドポップ — acid pop; tape/ticker strings. */
  acidPop: "アシッドポップ",
  /** インクチェック — ink check; loader caption. */
  inkCheck: "インクチェック",
  /** カンバン — kanban/signboard; hero section caption. */
  kanban: "カンバン",
  /** 掟 — the code (rules); THE CODE section heading. */
  okite: "掟",
  /** ストリート — street; gallery section caption. */
  street: "ストリート",
  /** クローズアップ — close-up; takeover caption. */
  closeup: "クローズアップ",
  /** アンコール — encore; finale section caption. */
  encore: "アンコール",
  /** 最高!!! — the best!!!; HYPE-button overload banner. */
  saikou: "最高!!!",
  /** マスターアップ!! — master up!!; finale artwork title. */
  masterUp: "マスターアップ!!",
} as const;

/**
 * Latin strings that ALSO render in Dela Gothic One (section headings set
 * in --font-jp). The fontsource japanese slice happens to carry basic
 * Latin capitals, but only glyphs listed here survive the subset — keep in
 * sync with any English text styled with var(--font-jp).
 */
export const JP_FACE_LATIN = {
  theCode: "THE CODE",
  theStreet: "THE STREET",
  encore: "ENCORE",
  gyokai: "GYOKAI",
} as const;
