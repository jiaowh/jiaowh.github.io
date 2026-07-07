/**
 * 真昼の月 — shared "which section is active" tracker.
 *
 * Both the chapter rail (§4, current chapter name + aria-current) and the
 * moon system (§6.1, per-section position keyframes + which moon a click
 * finds) need to know the same thing: which of the six sections the
 * viewport currently regards as "current". Rather than each module running
 * its own IntersectionObserver, this is computed once and fanned out.
 *
 * "Current" = whichever observed section is crossing the vertical center
 * of the viewport — the standard scrollspy heuristic.
 */

export type SectionId = 's0' | 's1' | 's2' | 's3' | 's4' | 's5';

export const SECTION_ORDER: SectionId[] = ['s0', 's1', 's2', 's3', 's4', 's5'];

type Listener = (id: SectionId) => void;

let current: SectionId = 's0';
const listeners = new Set<Listener>();
let observer: IntersectionObserver | null = null;

function setCurrent(id: SectionId): void {
  if (id === current) return;
  current = id;
  listeners.forEach((fn) => fn(current));
}

/**
 * Starts observing the six section elements. Safe to call once; repeat
 * calls are no-ops as long as the same elements are still in the DOM.
 */
export function initActiveSectionTracker(): void {
  if (observer) return;

  const sections = SECTION_ORDER
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);

  if (sections.length === 0) return;

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id as SectionId;
          if (SECTION_ORDER.includes(id)) setCurrent(id);
        }
      });
    },
    {
      // A thin horizontal band at the vertical center of the viewport —
      // whichever section occupies it is "current".
      rootMargin: '-50% 0px -50% 0px',
      threshold: 0,
    },
  );

  sections.forEach((el) => observer!.observe(el));
}

export function getCurrentSection(): SectionId {
  return current;
}

export function onSectionChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
