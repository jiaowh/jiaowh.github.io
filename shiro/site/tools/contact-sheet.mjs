#!/usr/bin/env node
/**
 * Contact sheets for the curatorial pass: every manifest asset as a labeled
 * thumbnail grid, written to the path given as argv[2] (default /tmp).
 * Run from site/: node tools/contact-sheet.mjs [outDir]
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, '..');
const ASSETS = path.join(SITE, 'public/assets');
const OUT = process.argv[2] || '/tmp/contact-sheets';

const manifest = JSON.parse(
  fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'),
);

const COLS = 4;
const CELL_W = 300;
const LABEL_H = 26;
const GAP = 10;

function labelSvg(text, w) {
  return Buffer.from(
    `<svg width="${w}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#38342E"/><text x="6" y="18" font-family="monospace" font-size="14" fill="#F5F1E6">${text}</text></svg>`,
  );
}

async function sheet(entries, cellH, outName) {
  const rows = Math.ceil(entries.length / COLS);
  const W = COLS * (CELL_W + GAP) + GAP;
  const H = rows * (cellH + LABEL_H + GAP) + GAP;
  const composites = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = GAP + col * (CELL_W + GAP);
    const y = GAP + row * (cellH + LABEL_H + GAP);
    const smallest = Math.min(...e.widths);
    const ext = e.formats.includes('png') ? 'png' : 'jpeg';
    const src = path.join(ASSETS, `${e.srcBase.replace('assets/', '')}-${smallest}.${ext}`);
    const thumb = await sharp(src)
      .resize({ width: CELL_W, height: cellH, fit: 'contain', background: '#ECE6D6' })
      .png()
      .toBuffer();
    composites.push({ input: thumb, left: x, top: y });
    composites.push({ input: labelSvg(e.id, CELL_W), left: x, top: y + cellH });
  }
  await sharp({
    create: { width: W, height: H, channels: 3, background: '#F5F1E6' },
  })
    .composite(composites)
    .jpeg({ quality: 80 })
    .toFile(path.join(OUT, outName));
  console.log(`${outName}: ${entries.length} thumbs`);
}

await fsp.mkdir(OUT, { recursive: true });
const plates = manifest.filter((e) => e.kind === 'plate');
const jackets = manifest.filter((e) => e.kind === 'jacket');

const PER_PLATE_SHEET = 12;
for (let i = 0; i < plates.length; i += PER_PLATE_SHEET) {
  await sheet(plates.slice(i, i + PER_PLATE_SHEET), 400, `plates-${i / PER_PLATE_SHEET + 1}.jpg`);
}
const PER_JACKET_SHEET = 12;
for (let i = 0; i < jackets.length; i += PER_JACKET_SHEET) {
  await sheet(jackets.slice(i, i + PER_JACKET_SHEET), 200, `jackets-${i / PER_JACKET_SHEET + 1}.jpg`);
}
console.log('done ->', OUT);
