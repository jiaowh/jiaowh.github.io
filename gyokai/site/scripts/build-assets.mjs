#!/usr/bin/env node
// GYOKAI — Acid Pop Archive
// Build-time asset pipeline. See design-system.md §8.
//
// CONTENT RULE (non-negotiable): this script processes ONLY the files named
// explicitly in ./allowlist.json. It never reads the source directory's file
// listing, never globs, never filters a directory scan. Every file it touches
// is named literally in allowlist.json, written by the creative director.
//
// Output:
//   site/public/art/<id>-<width>.<avif|webp>   (widths: 480 / 960 / 1600)
//   site/src/data/manifest.json                (array, allowlist order)
//
// Exits with a non-zero status (and prints a clear reason) if any allowlisted
// source file is missing, or if any image fails to process.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WIDTHS = [480, 960, 1600];
const AVIF_QUALITY = 62;
const WEBP_QUALITY = 75;
const PLACEHOLDER_WIDTH = 24;

// Fixed ink tokens (design-system.md §1.1) — candidates for --live-text.
const INK = "#0A0A12";
const PAPER = "#FFF3DC";
const MIN_CONTRAST = 4.5;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(scriptsDir, ".."); // .../site
const allowlistPath = path.join(scriptsDir, "allowlist.json");
const publicArtDir = path.join(siteRoot, "public", "art");
const manifestPath = path.join(siteRoot, "src", "data", "manifest.json");

// ---------------------------------------------------------------------------
// Small pure-JS color helpers (no deps — deterministic, testable)
// ---------------------------------------------------------------------------

function toHex([r, g, b]) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function hexToRgb(hex) {
  const n = hex.replace("#", "");
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h /= 6;
  return { h, s, l };
}

// WCAG relative luminance + contrast ratio.
function relativeLuminance([r, g, b]) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(rgbA, rgbB) {
  const La = relativeLuminance(rgbA);
  const Lb = relativeLuminance(rgbB);
  const lighter = Math.max(La, Lb);
  const darker = Math.min(La, Lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Quantize an RGB raw pixel buffer into coarse color buckets and return the
 * dominant (most frequent) and vivid (high-saturation, mid-lightness,
 * meaningfully frequent) colors as { hex, rgb } pairs.
 */
function extractPalette(data, channels, pixelCount) {
  const BUCKET = 24; // divisor -> ~11 levels/channel -> up to 1331 buckets
  const buckets = new Map();

  for (let i = 0; i < pixelCount; i++) {
    const o = i * channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const key =
      (Math.round(r / BUCKET) << 16) |
      (Math.round(g / BUCKET) << 8) |
      Math.round(b / BUCKET);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, r: 0, g: 0, b: 0 };
      buckets.set(key, bucket);
    }
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
  }

  const resolved = [...buckets.values()].map((bkt) => ({
    count: bkt.count,
    rgb: [bkt.r / bkt.count, bkt.g / bkt.count, bkt.b / bkt.count],
  }));

  resolved.sort((a, b) => b.count - a.count);
  const dominant = resolved[0];

  // Vivid: among buckets that are actually meaningfully present (>=1% of
  // sampled pixels), pick the highest-scoring high-saturation / mid-lightness
  // color. Score = saturation * tent(lightness, peak at 0.5).
  const threshold = pixelCount * 0.01;
  let best = null;
  let bestScore = -Infinity;
  for (const bucket of resolved) {
    if (bucket.count < threshold) continue;
    const { s, l } = rgbToHsl(bucket.rgb);
    const tent = 1 - Math.abs(l - 0.5) * 2; // 1 at l=0.5, 0 at l=0 or 1
    const score = s * Math.max(tent, 0);
    if (score > bestScore) {
      bestScore = score;
      best = bucket;
    }
  }
  const vivid = best ?? dominant;

  return {
    dominant: { hex: toHex(dominant.rgb), rgb: dominant.rgb.map(Math.round) },
    vivid: { hex: toHex(vivid.rgb), rgb: vivid.rgb.map(Math.round) },
  };
}

function chooseTextColor(dominantRgb, id) {
  const inkRatio = contrastRatio(hexToRgb(INK), dominantRgb);
  const paperRatio = contrastRatio(hexToRgb(PAPER), dominantRgb);
  const inkOk = inkRatio >= MIN_CONTRAST;
  const paperOk = paperRatio >= MIN_CONTRAST;

  if (inkOk && paperOk) {
    return { hex: inkRatio >= paperRatio ? INK : PAPER };
  }
  if (inkOk) return { hex: INK };
  if (paperOk) return { hex: PAPER };

  // Neither candidate reaches 4.5:1 — pick the higher ratio and note it so
  // the failure is visible in the manifest and the build log (design-system
  // §1.2: "if neither, pick higher and note it").
  const hex = inkRatio >= paperRatio ? INK : PAPER;
  const ratio = Math.max(inkRatio, paperRatio);
  const note = `no candidate reached ${MIN_CONTRAST}:1 against dominant (best: ${hex} @ ${ratio.toFixed(2)}:1)`;
  console.warn(`  ! [${id}] ${note}`);
  return { hex, note };
}

// ---------------------------------------------------------------------------
// Per-artwork processing
// ---------------------------------------------------------------------------

async function ensureSourceExists(absPath, label) {
  try {
    await fs.access(absPath);
  } catch {
    throw new Error(`missing allowlisted source file: "${label}" (expected at ${absPath})`);
  }
}

async function buildPlaceholder(absPath) {
  const buf = await sharp(absPath)
    .resize({ width: PLACEHOLDER_WIDTH })
    .blur(3)
    .webp({ quality: 50 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

async function writeVariants(absPath, id) {
  const jobs = [];
  for (const width of WIDTHS) {
    const resizeOpts = { width, withoutEnlargement: true };
    jobs.push(
      sharp(absPath)
        .resize(resizeOpts)
        .avif({ quality: AVIF_QUALITY })
        .toFile(path.join(publicArtDir, `${id}-${width}.avif`)),
    );
    jobs.push(
      sharp(absPath)
        .resize(resizeOpts)
        .webp({ quality: WEBP_QUALITY })
        .toFile(path.join(publicArtDir, `${id}-${width}.webp`)),
    );
  }
  await Promise.all(jobs);
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

async function processArtwork(entry, sourceDirAbs) {
  const { src, id, title, titleJa, alt, role, room, accent } = entry;
  const absPath = path.join(sourceDirAbs, src);
  await ensureSourceExists(absPath, src);

  const image = sharp(absPath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`could not read dimensions for "${src}"`);
  }
  const aspect = Math.round((metadata.width / metadata.height) * 10000) / 10000;

  // Sample at a small fixed size for palette extraction — fast and stable.
  const { data, info } = await sharp(absPath)
    .resize(96, 96, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const extracted = extractPalette(data, info.channels, pixelCount);

  // Hand-tuned art-direction overrides (allowlist `room`/`accent`) win over
  // extraction; extraction stays as the fallback for entries without them.
  // `text` is always contrast-computed against the FINAL dominant.
  for (const [field, value] of [["room", room], ["accent", accent]]) {
    if (value !== undefined && !HEX_RE.test(value)) {
      throw new Error(`invalid ${field} hex "${value}" for "${id}" in allowlist.json`);
    }
  }
  const dominant = room ? { hex: room.toUpperCase(), rgb: hexToRgb(room) } : extracted.dominant;
  const vivid = accent ? { hex: accent.toUpperCase(), rgb: hexToRgb(accent) } : extracted.vivid;
  const text = chooseTextColor(dominant.rgb, id);

  const placeholder = await buildPlaceholder(absPath);
  await writeVariants(absPath, id);

  const manifestEntry = {
    id,
    title,
    titleJa,
    alt,
    ...(role ? { role } : {}),
    aspect,
    dominant: dominant.hex,
    vivid: vivid.hex,
    text: text.hex,
    ...(text.note ? { textContrastNote: text.note } : {}),
    placeholder,
    sources: {
      avif: [...WIDTHS],
      webp: [...WIDTHS],
    },
  };

  return manifestEntry;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("GYOKAI asset pipeline — reading allowlist...");
  const raw = await fs.readFile(allowlistPath, "utf8");
  const allowlist = JSON.parse(raw);

  if (!Array.isArray(allowlist.artworks) || allowlist.artworks.length === 0) {
    throw new Error("allowlist.json has no artworks[] — refusing to run");
  }

  // sourceDir ("../gyokai") is written relative to the site/ project root
  // (the parent of scripts/), which is where it lands on the real sibling
  // gyokai/ folder: site/scripts/../gyokai would only escape scripts/, not
  // site/, so we anchor at siteRoot rather than scriptsDir.
  const sourceDirAbs = path.resolve(siteRoot, allowlist.sourceDir);
  try {
    const stat = await fs.stat(sourceDirAbs);
    if (!stat.isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(
      `allowlist sourceDir does not resolve to a real directory: "${allowlist.sourceDir}" -> ${sourceDirAbs}`,
    );
  }

  console.log(`Source directory: ${sourceDirAbs}`);
  console.log(`Artworks in allowlist: ${allowlist.artworks.length}`);

  // Pre-flight: every allowlisted file must exist before we do any work.
  const missing = [];
  for (const entry of allowlist.artworks) {
    const absPath = path.join(sourceDirAbs, entry.src);
    try {
      await fs.access(absPath);
    } catch {
      missing.push(`${entry.id} -> "${entry.src}" (expected ${absPath})`);
    }
  }
  if (missing.length > 0) {
    console.error("\nBuild FAILED — missing allowlisted source file(s):");
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  // Clean output dirs for idempotency (stale files from a previous allowlist
  // never linger).
  await fs.rm(publicArtDir, { recursive: true, force: true });
  await fs.mkdir(publicArtDir, { recursive: true });
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });

  const manifest = [];
  const failures = [];

  for (const entry of allowlist.artworks) {
    process.stdout.write(`  processing ${entry.id} ("${entry.src}")... `);
    try {
      const manifestEntry = await processArtwork(entry, sourceDirAbs);
      manifest.push(manifestEntry);
      console.log(`ok  dominant=${manifestEntry.dominant} vivid=${manifestEntry.vivid} text=${manifestEntry.text}`);
    } catch (err) {
      console.log("FAILED");
      failures.push(`${entry.id}: ${err.message}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nBuild FAILED — errors while processing artwork(s):");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`\nWrote manifest: ${manifestPath} (${manifest.length} entries)`);
  console.log(`Wrote variants: ${publicArtDir} (${manifest.length} x ${WIDTHS.length} widths x 2 formats)`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("\nBuild FAILED:", err.message);
  process.exit(1);
});
