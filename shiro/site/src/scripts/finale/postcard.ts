/**
 * 真昼の月 — Wave 5: the Postcard (§6.6). "送る" IS a real `mailto:`
 * hyperlink — not a `<button>` guarded by `preventDefault`+`location.href`
 * — its `href` is kept in sync with the two fields on every keystroke, so
 * the link is honest about exactly where it goes at all times (inspectable
 * directly, e.g. for QA) and needs no bespoke submit plumbing: a plain
 * anchor is already keyboard-operable (Tab to focus, Enter to follow) with
 * no extra JS required for that part.
 *
 * No recipient email exists anywhere in design-system.md or the copy deck
 * — this is "No backend" (§6.6) taken literally, so the mailto has no `to`
 * address either (`mailto:?subject=...&body=...`); a fabricated or
 * unmonitored address would be more misleading than an honestly empty one
 * the visitor's own mail client lets them fill in themselves.
 *
 * Body/subject text reuses only words already used verbatim in
 * design-system.md itself (§6.6's own "ペンネーム (P.N.)" / "感想" field
 * names, §12's title/postcard-title copy-deck entries) — no new Japanese
 * sentences are constructed.
 */

import { gsap } from 'gsap';
import { prefersReducedMotion, REDUCED_MOTION_FADE_MS } from '../motion-gate';
import { copyDeck } from '../copy';

function buildMailto(name: string, message: string): string {
  const subject = `${copyDeck.title.jp} ${copyDeck.postcardTitle.jp}`;
  const body = `ペンネーム (P.N.): ${name}\n\n感想:\n${message}`;
  // Deliberately NOT `URLSearchParams` — its `application/x-www-form-urlencoded`
  // serialization encodes spaces as `+`, which is correct for a query
  // string but not for a `mailto:` URI (RFC 6068 requires percent-encoding
  // throughout; some mail clients will insert a literal "+" character
  // instead of a space if given one). `encodeURIComponent` percent-encodes
  // spaces as `%20`, which every mail client handles correctly.
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * §6.6: "stamp thunks on (single 300ms transform — the site's ONLY hard
 * motion — a stamp should thunk)." Deliberately NOT `ease: 'soak'`/`'ink'`
 * — every other motion in the site is watercolor physics (fast attack,
 * long settle); this one moment is meant to feel mechanical and immediate
 * instead, the one deliberate exception the design system itself calls
 * out by name. Reduced motion still gives clear "sent" feedback (the
 * permanent `.is-stamped` end state), just as a quick, non-bouncy settle
 * rather than the full overshoot (§5's "≤200ms" reduced-motion contract).
 */
function playStampThunk(send: HTMLElement): void {
  send.classList.add('is-stamped');

  if (prefersReducedMotion()) {
    gsap.fromTo(send, { scale: 0.96 }, { scale: 1, duration: REDUCED_MOTION_FADE_MS / 1000, ease: 'none' });
    return;
  }

  gsap.fromTo(
    send,
    { scale: 1.22, rotate: -6 },
    { scale: 1, rotate: -3, duration: 0.3, ease: 'back.out(2.2)' },
  );
}

export function initPostcard(): void {
  const nameInput = document.querySelector<HTMLInputElement>('[data-postcard-name]');
  const messageInput = document.querySelector<HTMLTextAreaElement>('[data-postcard-message]');
  const send = document.querySelector<HTMLAnchorElement>('[data-postcard-send]');
  if (!nameInput || !messageInput || !send) return;

  const syncHref = (): void => {
    send.href = buildMailto(nameInput.value.trim(), messageInput.value.trim());
  };

  syncHref();
  nameInput.addEventListener('input', syncHref);
  messageInput.addEventListener('input', syncHref);

  send.addEventListener('click', () => {
    syncHref(); // belt-and-braces: guarantees the href the browser is about to follow reflects the latest keystroke even if an 'input' event were ever missed
    playStampThunk(send);
  });
}
