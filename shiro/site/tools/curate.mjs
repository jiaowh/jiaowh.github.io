#!/usr/bin/env node
/**
 * Merge the Creative Director's curation layer (tools/curation.json) into
 * public/assets/manifest.json. Run after every `npm run assets` — the asset
 * pipeline emits null curatorial fields and this script fills them.
 * Ids present in the manifest but absent from curation.json become
 * role:"reserve" (available, not placed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.resolve(__dirname, '../public/assets/manifest.json');
const CURATION = path.resolve(__dirname, 'curation.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const curation = JSON.parse(fs.readFileSync(CURATION, 'utf8'));
delete curation._meta;

const manifestIds = new Set(manifest.map((e) => e.id));
const unknown = Object.keys(curation).filter((id) => !manifestIds.has(id));
if (unknown.length) {
  console.error(`curation.json references missing manifest ids: ${unknown.join(', ')}`);
  process.exit(1);
}

let placed = 0;
let reserved = 0;
for (const entry of manifest) {
  const c = curation[entry.id];
  if (c) {
    Object.assign(entry, c);
    if (entry.role !== 'reserve') placed++;
    else reserved++;
  } else {
    entry.role = 'reserve';
    reserved++;
  }
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`curated: ${placed} placed, ${reserved} reserve, ${manifest.length} total`);
