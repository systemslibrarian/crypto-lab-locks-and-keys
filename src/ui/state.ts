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
  /** The message in the Step 2 box. */
  message: string;
  /** What Step 2 locked, and the message it was locked over. */
  locked: Locked | null;
  lockedOver: string | null;
  /** Step 4's signature. */
  signature: Signature | null;
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
  signature: null,
  otherPair: null,
  fromStranger: null,
  strangerText: 'Transfer everything in the account to 44-19. Do it today.',
};

/** The pair's identity, or a marker for "there is no pair yet". */
export const pairBasis = (): string => state.pair?.fingerprint ?? 'no-pair';

/**
 * The basis for each verdict, in one place.
 *
 * Read these as the dependency graph of the page: a new pair invalidates
 * everything, a changed message invalidates the lock and everything downstream
 * of it, re-locking invalidates the open, and re-signing invalidates the check.
 * Each one is a string because a string compares by value, which is what the
 * no-op guard needs.
 */
export const basis = {
  pairMade: pairBasis,
  locked: (): string => `${pairBasis()}|${state.message}`,
  opened: (): string =>
    `${pairBasis()}|${state.lockedOver ?? ''}|${state.locked ? toHex(state.locked.bytes) : ''}`,
  wrongKey: (): string =>
    `${pairBasis()}|${state.otherPair?.fingerprint ?? ''}|${
      state.locked ? toHex(state.locked.bytes) : ''
    }`,
  unattributed: (): string =>
    `${pairBasis()}|${state.fromStranger ? toHex(state.fromStranger.bytes) : ''}`,
  signed: (): string => `${pairBasis()}|${state.message}`,
  checked: (): string =>
    `${pairBasis()}|${state.signature ? toHex(state.signature.bytes) : ''}|${
      state.signature?.over ?? ''
    }`,
} as const;
