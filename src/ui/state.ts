/*
 * What the page is currently holding.
 *
 * All of it is in memory for the length of the visit. Nothing is written to
 * `localStorage`, nothing is sent anywhere — there is no backend — and reloading
 * the page destroys the pair. The only thing this lab ever stores is the theme
 * pin in index.html.
 *
 * Steps 2, 3 and 4 all read from here rather than from each other, which is what
 * lets a verdict's basis be computed from one place and keeps "the same pair" a
 * fact about this object rather than a promise in a comment.
 */
import type { Locked, Pair } from '../crypto/types';
import type { Signature } from '../crypto/sign';
import { toHex } from '../crypto/bytes';

export interface LabState {
  /** The pair from Step 1. Null until the reader presses the button. */
  pair: Pair | null;
  /** The draft in the Step 2 box — Maya's note to Sam. */
  message: string;
  /** What Step 2 locked, and the message it was locked over. */
  locked: Locked | null;
  lockedOver: string | null;
  /** The previous locked block, kept so Step 2 can show two side by side. */
  previousLocked: Locked | null;
  /** Step 4's signature. */
  signature: Signature | null;
  /**
   * The text the CHECKER is given, which starts as the signed text and which the
   * reader may edit. Kept separate from `signature.over` on purpose: tampering
   * must leave the signature and the signed snapshot untouched and move the
   * document underneath them, which is the honest shape of the attack. Editing
   * the Step 2 draft must never silently pretend it changed something already
   * signed.
   */
  checkerText: string | null;
  /** The second, unrelated pair Step 3 generates to try the wrong key. */
  otherPair: Pair | null;
  /** The ciphertext Step 3's stranger produced with the public half alone. */
  fromStranger: Locked | null;
  /** What the stranger wrote in it — the reader never typed this. */
  strangerText: string;
}

export const state: LabState = {
  pair: null,
  message: '',
  locked: null,
  lockedOver: null,
  previousLocked: null,
  signature: null,
  checkerText: null,
  otherPair: null,
  fromStranger: null,
  strangerText: 'Transfer everything in the account to 44-19. Do it today.',
};

/** The pair's identity, or a marker for "there is no pair yet". */
export const pairBasis = (): string => state.pair?.fingerprint ?? 'no-pair';

const lockedHex = (): string => (state.locked ? toHex(state.locked.bytes) : '');

/**
 * The basis for each verdict, in one place: the dependency graph of the page.
 *
 * A verdict is a statement about inputs that existed when it was computed.
 * Change one of those inputs and the verdict on screen becomes a claim about a
 * state the page is no longer in — the quiet way a demo starts lying. So each
 * slot declares how to recompute its basis, the basis is stored at render time,
 * and `retireStale()` compares.
 *
 * TWO CORRECTIONS WORTH RECORDING, both found by driving the built page rather
 * than by reading this file.
 *
 * FIRST, `opened` and `checked` now depend on the DRAFT as well as on the bytes
 * they actually processed. Strictly, opening a ciphertext is a fact about that
 * ciphertext and editing the draft afterwards does not change it — which is why
 * they did not depend on the draft at first. But both verdicts QUOTE recovered
 * or signed text on screen directly beneath the box the reader edits, and a
 * reader comparing the two is entitled to assume they describe the same thing.
 * After an edit they did not: `locked` and `signed` retired while `opened` and
 * `checked` stayed green, quoting a note that was no longer in the box. The
 * stricter reading was correct about the cryptography and wrong about the page.
 *
 * SECOND, a basis is only consulted when something calls `retireStale()`, and
 * for a while nothing did after locking or signing. Re-locking a different note
 * left the previous OPENED verdict standing — green, with the OLD note quoted
 * under a NEW lock, which is the worst version of this defect because it reads
 * as evidence about the ciphertext that is actually on screen. Every mutating
 * action in the UI now calls `retireStale()`; `main.ts` routes them through one
 * `settled()` helper so a new action cannot forget.
 */
export const basis = {
  pairMade: pairBasis,
  locked: (): string => `${pairBasis()}|${state.message}`,
  opened: (): string => `${pairBasis()}|${state.message}|${state.lockedOver ?? ''}|${lockedHex()}`,
  wrongKey: (): string =>
    `${pairBasis()}|${state.otherPair?.fingerprint ?? ''}|${lockedHex()}`,
  unattributed: (): string =>
    `${pairBasis()}|${state.fromStranger ? toHex(state.fromStranger.bytes) : ''}`,
  signed: (): string => `${pairBasis()}|${state.message}`,
  checked: (): string =>
    `${pairBasis()}|${state.message}|${
      state.signature ? toHex(state.signature.bytes) : ''
    }|${state.signature?.over ?? ''}|${state.checkerText ?? ''}`,
} as const;
