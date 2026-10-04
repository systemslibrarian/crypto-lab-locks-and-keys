/*
 * Verdicts — the markers the claims suite and the mutation runner both address.
 *
 * ON THE FOUR TONES, AND WHY THERE ARE FOUR.
 *
 * Colour here tracks SYSTEM INTEGRITY, never the raw return value. The wrong key
 * failing to open a lock is the padlock doing precisely its job, and painting
 * that red would teach a reader that they had broken something. So:
 *
 *   pass   the thing worked and working is correct
 *   held   it REFUSED, and refusing is correct — the lock holding shut, a bad
 *          signature rejected. Calm, not alarming. This is the tone this lab
 *          needed most and the one a generic palette does not have.
 *   alarm  a limit has just been demonstrated: every check passed and the
 *          property a reader expected is absent anyway. Step 3's stranger.
 *   fail   a real error in what the reader supplied — nothing to lock, a message
 *          longer than the lock holds.
 *
 * `alarm` is reserved for the case where nothing failed and something is wrong,
 * exactly as the standard asks. Nothing on this page paints `alarm` for a refusal.
 *
 * EVERY VERDICT IS ICON + TEXT + COLOUR (WCAG 1.4.1). The glyph is `aria-hidden`
 * and sits beside words that say the same thing, so the state survives greyscale,
 * deuteranopia and a screen reader alike.
 *
 * ON `data-verdict`. Each verdict carries its marker as an attribute. That is
 * what `e2e/claims.spec.ts` asserts against and what `mutations/mutations.json`
 * names, so a mutation record points at a surface rather than at a sentence.
 */
import { closedLock, cross, openLock, tick, warn } from './icons';
import { el, fill } from './dom';

export type Tone = 'pass' | 'held' | 'alarm' | 'fail';

/** Which glyph belongs to which tone, with the lock states taking precedence. */
export type Glyph = 'tick' | 'cross' | 'warn' | 'closed-lock' | 'open-lock';

const GLYPHS: Record<Glyph, () => SVGElement> = {
  tick,
  cross,
  warn,
  'closed-lock': closedLock,
  'open-lock': openLock,
};

export interface VerdictSpec {
  /** The stable marker. Claims tests and mutation records both use it. */
  readonly marker: string;
  readonly tone: Tone;
  readonly glyph: Glyph;
  /** The headline, in capitals, read as the state. */
  readonly headline: string;
  /** One or more plain sentences under it. */
  readonly detail: readonly string[];
}

/**
 * Everything a rendered verdict depends on, as one string.
 *
 * A verdict is a statement about inputs that existed when it was computed. Change
 * one of those inputs and the verdict on screen becomes a claim about a state the
 * page is no longer in — which is the quiet way a demo starts lying. So each slot
 * declares how to recompute its basis, the basis is stored at render time, and
 * `retireStale` compares.
 *
 * The comparison is what gives the no-op guard for free: setting a field back to
 * the value it already held recomputes an IDENTICAL basis, so a fresh verdict
 * survives it. Only a real change retires anything.
 */
export interface Slot {
  readonly marker: string;
  readonly host: HTMLElement;
  readonly basis: () => string;
}

interface Rendered {
  readonly slot: Slot;
  readonly basisAtRender: string;
  readonly headline: string;
}

const slots = new Map<string, Slot>();
const rendered = new Map<string, Rendered>();

/** Declare a verdict slot. Called once per marker, at panel build time. */
export function slot(marker: string, host: HTMLElement, basis: () => string): Slot {
  const s: Slot = { marker, host, basis };
  slots.set(marker, s);
  return s;
}

/** Render a verdict into its slot and remember what it was computed from. */
export function render(marker: string, spec: VerdictSpec, extra: Node[] = []): HTMLElement {
  const s = slots.get(marker);
  if (!s) throw new Error(`no verdict slot declared for "${marker}"`);
  const node = el(
    'div',
    { class: `verdict verdict-${spec.tone}`, 'data-verdict': marker, 'data-tone': spec.tone },
    [
      el('p', { class: 'verdict-head' }, [
        GLYPHS[spec.glyph](),
        el('span', { class: 'verdict-headline' }, [spec.headline]),
      ]),
      ...spec.detail.map((d) => el('p', { class: 'verdict-detail' }, [d])),
    ]
  );
  fill(s.host, node, ...extra);
  rendered.set(marker, { slot: s, basisAtRender: s.basis(), headline: spec.headline });
  return node;
}

/** Drop a verdict and everything rendered beside it, leaving the slot empty. */
export function clear(marker: string): void {
  const s = slots.get(marker);
  if (!s) return;
  fill(s.host);
  rendered.delete(marker);
}

/**
 * Replace every verdict whose inputs have changed with a retirement notice.
 *
 * The notice is deliberately a separate shape rather than a greyed-out copy of
 * the old verdict: a stale verdict that still reads like a result is worse than
 * no verdict, because a reader cannot tell which state the page is describing.
 * `data-verdict-retired` carries the marker that was retired, so a claims test
 * can assert BOTH that the stale verdict is gone and that the page says why.
 */
export function retireStale(): void {
  for (const [marker, r] of Array.from(rendered.entries())) {
    if (r.slot.basis() === r.basisAtRender) continue;
    fill(
      r.slot.host,
      el('div', { class: 'verdict verdict-retired', 'data-verdict-retired': marker }, [
        el('p', { class: 'verdict-head' }, [
          GLYPHS.warn(),
          el('span', { class: 'verdict-headline' }, ['RETIRED']),
        ]),
        el('p', { class: 'verdict-detail' }, [
          'Something this answer depended on has changed, so it no longer describes ' +
            'this page. Run the step again.',
        ]),
      ])
    );
    rendered.delete(marker);
  }
}

/** Whether a marker currently holds a live (non-retired) verdict. */
export function isLive(marker: string): boolean {
  return rendered.has(marker);
}
