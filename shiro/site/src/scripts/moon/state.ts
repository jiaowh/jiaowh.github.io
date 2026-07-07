/**
 * 真昼の月 — moon found-state (§6.1). `localStorage` key `mahiru.moons`.
 *
 * This is the API the finale (Wave 5) subscribes to for the found-phases
 * payoff: `getFoundMoons()` / `getMoonCount()` for the initial render,
 * `onMoonsChange()` to react live if a visitor finds one mid-visit on the
 * finale screen itself.
 */

import type { SectionId } from '../active-section';
import { TOTAL_MOONS } from './positions';

const STORAGE_KEY = 'mahiru.moons';

type Listener = (found: ReadonlySet<SectionId>) => void;

const listeners = new Set<Listener>();

function readStorage(): Set<SectionId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is SectionId => typeof v === 'string'));
    }
  } catch {
    // Corrupt value or storage unavailable (e.g. private browsing) — start clean.
  }
  return new Set();
}

function writeStorage(found: Set<SectionId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...found]));
  } catch {
    // Storage unavailable — state still works for the current session via `found`.
  }
}

let found = readStorage();

export function getFoundMoons(): ReadonlySet<SectionId> {
  return found;
}

export function isMoonFound(id: SectionId): boolean {
  return found.has(id);
}

export function getMoonCount(): number {
  return found.size;
}

export function getTotalMoons(): number {
  return TOTAL_MOONS;
}

/** Marks `id` found. Returns true if this was a *new* find (counter should advance). */
export function markMoonFound(id: SectionId): boolean {
  if (found.has(id)) return false;
  found = new Set(found).add(id);
  writeStorage(found);
  listeners.forEach((fn) => fn(found));
  return true;
}

export function onMoonsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** "MOON 03/06" — §6.1's worked example format (zero-padded both halves). */
export function formatMoonCounter(count: number = getMoonCount(), total: number = TOTAL_MOONS): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `MOON ${pad(count)}/${pad(total)}`;
}
