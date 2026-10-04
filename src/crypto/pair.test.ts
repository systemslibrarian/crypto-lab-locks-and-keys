/*
 * Correctness for a lab with no known-answer tests of its own.
 *
 * A freshly generated key pair has no published answer to compare against, so
 * the two properties that CAN be asserted over random pairs are asserted
 * instead, and asserted over many pairs rather than one:
 *
 *   - ROUND-TRIP: what one half closes, the other half opens, byte for byte.
 *   - CROSS-PAIR REJECTION: what one pair closes, a DIFFERENT pair never opens;
 *     and a signature from one pair never verifies under another.
 *
 * The second is the one that has teeth. A round-trip passes in a build where
 * encrypt and decrypt are both wrong in the same direction, and it passes in a
 * build where `open` ignores its key argument entirely — which is exactly the
 * mutation `mutations/mutations.json` applies. Cross-pair rejection fails both.
 *
 * Neither is a check against the publication; `vectors.test.ts` is. The split is
 * deliberate and both halves are needed.
 */
import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  MAX_MESSAGE_BYTES,
  MODULUS_BITS,
  assertSamePair,
  fingerprint,
  importPublicForChecking,
  importPublicForLocking,
  makePair,
  sameBytes,
} from './pair';
import { close, open, whyNotLockable } from './lock';
import { check, sign } from './sign';

// Vitest runs in Node, where `crypto.subtle` exists but the `crypto` global is
// Node's module rather than the browser's. The modules under test call
// `crypto.subtle` the way the browser exposes it, so point the global at Node's
// WebCrypto implementation. This is a HOST shim, not a crypto shim: the
// algorithms exercised are Node's real RSAES-OAEP and RSASSA-PSS.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/** 2048-bit RSA keygen is slow and genuinely variable; four pairs is the budget. */
const PAIRS = 4;
const GEN_TIMEOUT = 120_000;

describe('a pair is one pair, used both ways round', () => {
  it(
    'exports the same public key from the locking handle and the signing handle',
    async () => {
      for (let i = 0; i < PAIRS; i++) {
        const p = await makePair();
        // makePair already calls assertSamePair; calling it again from the test
        // means a future edit that deletes the internal call is still caught.
        await expect(assertSamePair(p.lockWith, p.checkWith)).resolves.toBeUndefined();
        const fromSigning = new Uint8Array(await crypto.subtle.exportKey('spki', p.checkWith));
        expect(sameBytes(p.publicKeyBytes, fromSigning)).toBe(true);
      }
    },
    GEN_TIMEOUT
  );

  it(
    'generates a 2048-bit key, so every locked block and every signature is 256 bytes',
    async () => {
      const p = await makePair();
      const locked = await close(p.lockWith, 'short');
      const signature = await sign(p.signWith, 'short', p.fingerprint);
      // Re-derived from MODULUS_BITS rather than typed as 256, so the constant
      // and the observed block width cannot drift apart silently.
      expect(locked.bytes.length).toBe(MODULUS_BITS / 8);
      expect(signature.bytes.length).toBe(MODULUS_BITS / 8);
    },
    GEN_TIMEOUT
  );

  it('gives different pairs different fingerprints, and the same pair the same one', async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(await fingerprint(a)).toBe(await fingerprint(a));
    expect(await fingerprint(a)).not.toBe(await fingerprint(b));
    expect(await fingerprint(a)).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/);
  });
});

describe('round-trip: what the public half closes, the private half opens', () => {
  it(
    'returns the exact message, over several pairs and several messages',
    async () => {
      const messages = ['a', 'Meet me at the north gate at six.', '', 'x'.repeat(MAX_MESSAGE_BYTES)];
      for (let i = 0; i < PAIRS; i++) {
        const p = await makePair();
        for (const message of messages) {
          if (whyNotLockable(message)) continue; // the empty string is refused by design
          const locked = await close(p.lockWith, message);
          const opened = await open(p.openWith, locked.bytes);
          expect(opened.ok).toBe(true);
          if (opened.ok) expect(opened.value).toBe(message);
        }
      }
    },
    GEN_TIMEOUT
  );

  it(
    'produces different bytes each time the same message is locked',
    async () => {
      // OAEP draws a fresh seed per call. If this ever fails, encryption has
      // become deterministic, which is a serious break and not a cosmetic one.
      const p = await makePair();
      const one = await close(p.lockWith, 'same words');
      const two = await close(p.lockWith, 'same words');
      expect(sameBytes(one.bytes, two.bytes)).toBe(false);
      const a = await open(p.openWith, one.bytes);
      const b = await open(p.openWith, two.bytes);
      expect(a.ok && b.ok && a.value === b.value).toBe(true);
    },
    GEN_TIMEOUT
  );

  it('refuses a message longer than the lock can hold, and says the real limit', () => {
    expect(whyNotLockable('x'.repeat(MAX_MESSAGE_BYTES))).toBeNull();
    const over = whyNotLockable('x'.repeat(MAX_MESSAGE_BYTES + 1));
    expect(over).toContain(String(MAX_MESSAGE_BYTES + 1));
    expect(over).toContain(String(MAX_MESSAGE_BYTES));
  });

  it('counts the limit in BYTES, not characters', () => {
    // One emoji is four UTF-8 bytes. A length check on `text.length` would let
    // a message through that encrypt() then refuses, so the limit is asserted
    // against the encoded length.
    const emoji = '\u{1F512}';
    expect(new TextEncoder().encode(emoji).length).toBe(4);
    const justOver = emoji.repeat(MAX_MESSAGE_BYTES / 4 + 1);
    expect(justOver.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(whyNotLockable(justOver)).not.toBeNull();
  });
});

describe('cross-pair rejection: a second pair never opens the first pair lock', () => {
  it(
    'refuses every ciphertext under the wrong private key',
    async () => {
      for (let i = 0; i < PAIRS; i++) {
        const mine = await makePair();
        const theirs = await makePair();
        expect(mine.fingerprint).not.toBe(theirs.fingerprint);
        const locked = await close(mine.lockWith, 'Meet me at the north gate at six.');
        const wrong = await open(theirs.openWith, locked.bytes);
        expect(wrong.ok).toBe(false);
        if (!wrong.ok) expect(wrong.refused).toContain('does not open');
        // And the right key still does, in the same run — so a build that
        // refuses everything cannot pass this test by refusing.
        const right = await open(mine.openWith, locked.bytes);
        expect(right.ok).toBe(true);
      }
    },
    GEN_TIMEOUT
  );

  it(
    'never verifies a signature under the wrong public key',
    async () => {
      for (let i = 0; i < PAIRS; i++) {
        const mine = await makePair();
        const theirs = await makePair();
        const text = 'I agree to the terms.';
        const signature = await sign(mine.signWith, text, mine.fingerprint);
        const underTheirs = await check(theirs.checkWith, signature.bytes, text);
        expect(underTheirs.ok && underTheirs.value).toBe(false);
        const underMine = await check(mine.checkWith, signature.bytes, text);
        expect(underMine.ok && underMine.value).toBe(true);
      }
    },
    GEN_TIMEOUT
  );

  it(
    'rejects a signature over text that changed by one character',
    async () => {
      const p = await makePair();
      const text = 'Pay Alice 100.';
      const signature = await sign(p.signWith, text, p.fingerprint);
      const tampered = 'Pay Alice 900.';
      expect(tampered.length).toBe(text.length);
      const r = await check(p.checkWith, signature.bytes, tampered);
      expect(r.ok && r.value).toBe(false);
    },
    GEN_TIMEOUT
  );

  it(
    'signs the same text twice to two different signatures that both verify',
    async () => {
      // PSS draws a fresh salt per signature — the mirror of OAEP's fresh seed.
      const p = await makePair();
      const text = 'I agree to the terms.';
      const one = await sign(p.signWith, text, p.fingerprint);
      const two = await sign(p.signWith, text, p.fingerprint);
      expect(sameBytes(one.bytes, two.bytes)).toBe(false);
      for (const s of [one, two]) {
        const r = await check(p.checkWith, s.bytes, text);
        expect(r.ok && r.value).toBe(true);
      }
    },
    GEN_TIMEOUT
  );
});

describe('the public half, alone, is enough to close a lock and check a signature', () => {
  it(
    'locks and verifies using nothing but the exported public bytes',
    async () => {
      // This is the negative claim's mechanism, asserted at the crypto layer: a
      // party holding ONLY these bytes can produce a ciphertext the private half
      // opens. Nothing about that ciphertext records who made it.
      const p = await makePair();
      const strangerLock = await importPublicForLocking(p.publicKeyBytes);
      const strangerCheck = await importPublicForChecking(p.publicKeyBytes);

      const fromAStranger = await close(strangerLock, 'Transfer the funds to 44-19.');
      const opened = await open(p.openWith, fromAStranger.bytes);
      expect(opened.ok).toBe(true);
      if (opened.ok) expect(opened.value).toBe('Transfer the funds to 44-19.');

      // The stranger's handle cannot sign and cannot open — it is public-only.
      await expect(sign(strangerCheck, 'x', p.fingerprint)).rejects.toThrow();
      const cannotOpen = await open(strangerCheck, fromAStranger.bytes);
      expect(cannotOpen.ok).toBe(false);
    },
    GEN_TIMEOUT
  );
});
