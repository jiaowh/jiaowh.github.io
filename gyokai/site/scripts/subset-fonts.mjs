#!/usr/bin/env node
// GYOKAI — Acid Pop Archive
// Manual font subsetting (design-system.md §9: "fonts subset (JP display
// face: load only glyphs used — use unicode-range subsets from fontsource,
// or a glyphhanger-style manual subset with the exact strings if size
// explodes)").
//
// The @fontsource/dela-gothic-one Japanese-script file ships the *entire*
// Japanese glyph repertoire (~922KB woff2) — the "size explodes" case the
// spec calls out. This script cuts it down to exactly the characters the
// site renders in var(--font-jp), derived programmatically from the only
// two places such strings are allowed to live:
//
//   1. src/data/strings.ts — the single source of truth for fixed JP/display
//      strings (parsed as text: every double-quoted literal in the file).
//   2. scripts/allowlist.json — every artwork's `titleJa` (street captions,
//      takeover meta plates).
//
// If a glyph is missing on the page, add its string to src/data/strings.ts
// (NOT here) and re-run `npm run assets`.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(scriptsDir, "..");
const sourceWoff2 = path.join(
  siteRoot,
  "node_modules/@fontsource/dela-gothic-one/files/dela-gothic-one-japanese-400-normal.woff2",
);
const stringsModulePath = path.join(siteRoot, "src", "data", "strings.ts");
const allowlistPath = path.join(scriptsDir, "allowlist.json");
const outDir = path.join(siteRoot, "public", "fonts");
const outFile = path.join(outDir, "dela-gothic-one-subset.woff2");

/** Every double-quoted string literal in src/data/strings.ts (which, per
 * that file's header contract, contains only plain one-line literals —
 * no escapes, no templates, no concatenation). */
async function readStringsModule() {
  const text = await fs.readFile(stringsModulePath, "utf8");
  const literals = [...text.matchAll(/"([^"\\]+)"/g)].map((m) => m[1]);
  if (literals.length === 0) {
    throw new Error(`no string literals found in ${stringsModulePath} — format contract broken?`);
  }
  return literals;
}

/** Every titleJa from the allowlist (street captions, meta plates). */
async function readTitleJa() {
  const allowlist = JSON.parse(await fs.readFile(allowlistPath, "utf8"));
  return allowlist.artworks.map((a) => a.titleJa).filter(Boolean);
}

async function main() {
  console.log("Font subsetting — Dela Gothic One (JP display face)...");

  let original;
  try {
    original = await fs.readFile(sourceWoff2);
  } catch {
    throw new Error(`could not read source font at ${sourceWoff2} — is @fontsource/dela-gothic-one installed?`);
  }

  const strings = [...(await readStringsModule()), ...(await readTitleJa())];
  // Plus digits & display punctuation for index/counter runs set in the JP face.
  const chars = new Set([..."0123456789/·-—", ...strings.join("")]);
  const text = [...chars].sort().join("");

  const subsetBuffer = await subsetFont(original, text, { targetFormat: "woff2" });

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, subsetBuffer);

  const before = original.length;
  const after = subsetBuffer.length;
  console.log(`  source:  ${(before / 1024).toFixed(1)} KB`);
  console.log(`  subset:  ${(after / 1024).toFixed(1)} KB (${((after / before) * 100).toFixed(1)}% of source)`);
  console.log(`  glyph set (${chars.size}): ${text}`);
  console.log(`Wrote ${path.relative(siteRoot, outFile)}`);
}

main().catch((err) => {
  console.error("\nFont subsetting FAILED:", err.message);
  process.exit(1);
});
