#!/usr/bin/env node
/**
 * 真昼の月 — asset pipeline.
 *
 * Produces:
 *   site/public/assets/jackets/*  — 44 PNG + 6 JPG source images (22/7 jacket
 *     art + book cover crops), each as AVIF + WebP + original-format fallback
 *     at widths 1600 and 800 (never upscaled — see targetWidths()).
 *   site/public/assets/plates/*   — 27 pages rasterized from the 『真昼の月』
 *     PDF at ~2200px long edge, same derivative treatment.
 *   site/public/assets/manifest.json — flat array describing every asset.
 *
 * Run with: node --max-old-space-size=4096 tools/assets.mjs
 * (also available as `npm run assets` from site/)
 *
 * No system ImageMagick/poppler/ghostscript is available in this environment.
 * PDF rasterization uses pdfjs-dist (legacy build) + @napi-rs/canvas; all
 * resizing/format conversion uses sharp.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const napi = await import('@napi-rs/canvas');
// pdfjs-dist's legacy build wants a DOMMatrix/Path2D polyfill in Node; hand it
// @napi-rs/canvas's implementations (matches the objects it hands back from
// createCanvas(), so no mismatched-class surprises during render).
globalThis.DOMMatrix = napi.DOMMatrix;
globalThis.Path2D = napi.Path2D;
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = napi;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = '/home/jiaowh/shiro/白身魚';
const PDF_PATH = path.join(
  SRC_DIR,
  '833677981-真昼の月-白身魚-自選イラスト集-白身魚.pdf',
);
const CHUNK_DIR = '/tmp/pdfwork';
const OUT_JACKETS = path.join(SITE_ROOT, 'public/assets/jackets');
const OUT_PLATES = path.join(SITE_ROOT, 'public/assets/plates');
const MANIFEST_PATH = path.join(SITE_ROOT, 'public/assets/manifest.json');

const PDFJS_DIR = path.dirname(require.resolve('pdfjs-dist/package.json'));
const STANDARD_FONTS_URL = path.join(PDFJS_DIR, 'standard_fonts') + path.sep;
const CMAPS_URL = path.join(PDFJS_DIR, 'cmaps') + path.sep;

const WIDTHS = [1600, 800];
const QUALITY = { avif: 55, webp: 78, jpeg: 82 };
const TARGET_LONG_EDGE = 2200;

const PLATE_PAGES = [
  1, 2, 3, 4, 17, 18, 19, 20, 33, 34, 49, 50, 51, 52, 81, 82, 83, 84, 97, 98,
  113, 116, 129, 130, 131, 132, 142,
];

// Six JPGs identified by visual inspection (Read tool). Order here is the
// order they'll appear in the manifest.
const JACKET_JPG_NAMES = {
  '210524_227_1stAL_JKT_kanzenA_RGB.jpg': 'jacket_kanzen',
  '2ebeec76ec8ff9d787938967d1660539.jpg': 'jacket_urban_collage',
  '38dd2e426e5a3134a3ec466f3b99289b.jpg': 'jacket_white_uniforms',
  '68333111-1.jpg': 'jacket_animation_note',
  'c1354ddeddb3e6f84b51b4d5b588cf620e3bdeb7.jpg': 'jacket_underwater_yesno',
  'cd334fda64a89140faec5fe52e658bb5.jpg': 'jacket_yurihime_snow_umbrella',
};

/** Never upscale. Filter the standard width ladder down to what the source
 * actually supports; if the source is smaller than our smallest rung, emit a
 * single native-resolution derivative instead of stretching it. */
function targetWidths(originalWidth) {
  const widths = WIDTHS.filter((w) => w <= originalWidth);
  return widths.length ? widths : [originalWidth];
}

async function makeDerivatives({ input, outDir, baseName, ext, originalWidth }) {
  const widths = targetWidths(originalWidth);
  for (const w of widths) {
    const base = () => sharp(input).resize({ width: w, withoutEnlargement: true });
    await base().avif({ quality: QUALITY.avif }).toFile(path.join(outDir, `${baseName}-${w}.avif`));
    await base().webp({ quality: QUALITY.webp }).toFile(path.join(outDir, `${baseName}-${w}.webp`));
    if (ext === 'png') {
      await base().png().toFile(path.join(outDir, `${baseName}-${w}.png`));
    } else {
      await base().jpeg({ quality: QUALITY.jpeg }).toFile(path.join(outDir, `${baseName}-${w}.jpeg`));
    }
  }
  const formats = ['avif', 'webp', ext === 'png' ? 'png' : 'jpeg'];
  return { widths, formats };
}

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/** chunk_NN.pdf files are 4-page slices named by their 1-indexed starting
 * page (see /tmp/pdfwork/split.mjs). Given a global page number, return the
 * chunk's start page and the 1-indexed page number *within* that chunk. */
function locateInChunk(page) {
  const start = page - ((page - 1) % 4);
  const localPage = page - start + 1;
  return { start, localPage };
}

async function ensureChunks() {
  const need = new Set(PLATE_PAGES.map((p) => locateInChunk(p).start));
  const missing = [...need].filter(
    (start) => !fs.existsSync(path.join(CHUNK_DIR, `chunk_${String(start).padStart(2, '0')}.pdf`)),
  );
  if (missing.length === 0) return;

  console.log(`Missing ${missing.length} chunk(s); re-splitting PDF via pdf-lib (this can take a while)...`);
  const { PDFDocument } = await import('pdf-lib');
  const bytes = await fsp.readFile(PDF_PATH);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = doc.getPageCount();
  const CHUNK = 4;
  await fsp.mkdir(CHUNK_DIR, { recursive: true });
  for (let start = 0; start < n; start += CHUNK) {
    const outStart = start + 1;
    const outPath = path.join(CHUNK_DIR, `chunk_${String(outStart).padStart(2, '0')}.pdf`);
    if (fs.existsSync(outPath)) continue;
    const out = await PDFDocument.create();
    const idx = [];
    for (let i = start; i < Math.min(start + CHUNK, n); i++) idx.push(i);
    const pages = await out.copyPages(doc, idx);
    pages.forEach((p) => out.addPage(p));
    const outBytes = await out.save();
    await fsp.writeFile(outPath, outBytes);
  }
  console.log('Re-split complete.');
}

async function processJackets(manifest) {
  await fsp.mkdir(OUT_JACKETS, { recursive: true });
  const allFiles = (await fsp.readdir(SRC_DIR)).filter((f) => !f.endsWith('Zone.Identifier'));
  const pngFiles = allFiles.filter((f) => /^Screenshot .*\.png$/.test(f)).sort();
  const jpgFiles = Object.keys(JACKET_JPG_NAMES).filter((f) => allFiles.includes(f));

  console.log(`\n=== Jackets: ${pngFiles.length} PNG, ${jpgFiles.length} JPG ===`);
  if (pngFiles.length !== 44) {
    console.warn(`WARNING: expected 44 PNGs, found ${pngFiles.length}`);
  }
  if (jpgFiles.length !== 6) {
    console.warn(`WARNING: expected 6 named JPGs, found ${jpgFiles.length}`);
  }

  for (const file of [...pngFiles, ...jpgFiles]) {
    const isPng = file.endsWith('.png');
    let id;
    if (isPng) {
      const m = file.match(/(\d{6})\.png$/);
      if (!m) {
        console.warn(`SKIP (no time suffix found): ${file}`);
        continue;
      }
      id = `jacket_${m[1]}`;
    } else {
      id = JACKET_JPG_NAMES[file];
    }
    const ext = isPng ? 'png' : 'jpeg';
    const srcPath = path.join(SRC_DIR, file);
    const meta = await sharp(srcPath).metadata();
    const { widths, formats } = await makeDerivatives({
      input: srcPath,
      outDir: OUT_JACKETS,
      baseName: id,
      ext,
      originalWidth: meta.width,
    });
    manifest.push({
      id,
      kind: 'jacket',
      srcBase: `assets/jackets/${id}`,
      formats,
      widths,
      width: meta.width,
      height: meta.height,
      aspect: +(meta.width / meta.height).toFixed(4),
      role: null,
      chapter: null,
      alt: null,
      focus: null,
      accent: null,
    });
    console.log(`  ${id.padEnd(28)} <- ${file}  (${meta.width}x${meta.height})  widths=[${widths.join(',')}]`);
  }
}

async function processPlates(manifest) {
  await fsp.mkdir(OUT_PLATES, { recursive: true });
  await ensureChunks();

  console.log(`\n=== Plates: ${PLATE_PAGES.length} pages ===`);
  const byChunk = new Map();
  for (const page of PLATE_PAGES) {
    const { start } = locateInChunk(page);
    if (!byChunk.has(start)) byChunk.set(start, []);
    byChunk.get(start).push(page);
  }

  const failedPages = [];

  for (const [start, pages] of [...byChunk.entries()].sort((a, b) => a[0] - b[0])) {
    const chunkPath = path.join(CHUNK_DIR, `chunk_${String(start).padStart(2, '0')}.pdf`);
    if (!fs.existsSync(chunkPath)) {
      console.error(`  MISSING CHUNK for start ${start}: ${chunkPath}`);
      failedPages.push(...pages);
      continue;
    }
    const data = new Uint8Array(await fsp.readFile(chunkPath));
    const loadingTask = pdfjsLib.getDocument({
      data,
      standardFontDataUrl: STANDARD_FONTS_URL,
      cMapUrl: CMAPS_URL,
      cMapPacked: true,
      disableFontFace: true,
      canvasFactory: new NodeCanvasFactory(),
    });
    const doc = await loadingTask.promise;

    for (const page of pages) {
      const { localPage } = locateInChunk(page);
      const id = `plate_p${String(page).padStart(3, '0')}`;
      try {
        const pdfPage = await doc.getPage(localPage);
        const vp1 = pdfPage.getViewport({ scale: 1 });
        const scale = TARGET_LONG_EDGE / Math.max(vp1.width, vp1.height);
        const viewport = pdfPage.getViewport({ scale });
        const w = Math.round(viewport.width);
        const h = Math.round(viewport.height);

        const canvasFactory = new NodeCanvasFactory();
        const canvasAndContext = canvasFactory.create(w, h);
        const renderTask = pdfPage.render({
          canvasContext: canvasAndContext.context,
          viewport,
          canvasFactory,
        });
        await renderTask.promise;
        const pngBuf = canvasAndContext.canvas.toBuffer('image/png');
        canvasFactory.destroy(canvasAndContext);
        pdfPage.cleanup();

        const { widths, formats } = await makeDerivatives({
          input: pngBuf,
          outDir: OUT_PLATES,
          baseName: id,
          ext: 'png',
          originalWidth: w,
        });

        manifest.push({
          id,
          kind: 'plate',
          page,
          srcBase: `assets/plates/${id}`,
          formats,
          widths,
          width: w,
          height: h,
          aspect: +(w / h).toFixed(4),
          role: null,
          chapter: null,
          alt: null,
          focus: null,
          accent: null,
        });
        console.log(`  ${id}  chunk_${String(start).padStart(2, '0')}#${localPage}  rendered ${w}x${h}  widths=[${widths.join(',')}]`);
      } catch (err) {
        console.error(`  FAILED page ${page} (chunk_${String(start).padStart(2, '0')}#${localPage}): ${err.message}`);
        failedPages.push(page);
      }
    }

    await doc.destroy();
  }

  if (failedPages.length) {
    console.error(`\nFAILED PAGES (${failedPages.length}): ${failedPages.join(', ')}`);
  } else {
    console.log('\nAll plate pages rendered successfully.');
  }
  return failedPages;
}

async function main() {
  const manifest = [];
  await processJackets(manifest);
  const failedPages = await processPlates(manifest);

  await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nWrote manifest: ${MANIFEST_PATH} (${manifest.length} entries)`);

  if (failedPages.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
