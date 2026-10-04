/*
 * Closing and opening the lock — RSAES-OAEP (RFC 8017 §7.1) through WebCrypto.
 *
 * Two functions, and the asymmetry between them is the whole lesson:
 * `close` takes only a public key, `open` takes only a private one.
 */
import type { Attempt, Bytes, Locked } from './types';
import { MAX_MESSAGE_BYTES, attempt, fingerprint } from './pair';

/** Why a message cannot be locked, in the reader's words. Null means it can. */
export function whyNotLockable(text: string): string | null {
  if (text.length === 0) return 'Type something first — there is nothing to lock yet.';
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_MESSAGE_BYTES) {
    return (
      `That is ${bytes} bytes and a lock this size holds ${MAX_MESSAGE_BYTES}. ` +
      'Shorten it, or see how real systems get around this in HPKE Envelope.'
    );
  }
  return null;
}

/**
 * Close the lock: encrypt to the public half.
 *
 * NOTE WHAT IS NOT A PARAMETER. There is no private key here, and none is
 * needed — that is the claim Step 2 makes and this signature is where it is
 * true. Anyone holding `lockWith` can run this.
 *
 * The result is one modulus-width block (256 bytes for a 2048-bit key) whatever
 * the message length, so the ciphertext size leaks nothing about how much was
 * said. OAEP also mixes in a fresh random seed per call, so locking the same
 * message twice gives two different blocks — which is why Step 2 lets the reader
 * press the button again and watch the bytes change completely.
 */
export async function close(lockWith: CryptoKey, text: string): Promise<Locked> {
  const refusal = whyNotLockable(text);
  if (refusal) throw new Error(refusal);
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      lockWith,
      new TextEncoder().encode(text)
    )
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', lockWith));
  return { bytes, lockedTo: await fingerprint(spki) };
}

/**
 * Open the lock: decrypt with the private half.
 *
 * Returns a refusal rather than throwing, because a refusal here is the correct
 * outcome of Step 3's second half and must not reach the UI as an error. See
 * `attempt` in pair.ts for why the message says so little: the construction
 * deliberately does not report WHY a block failed to open, so neither does this.
 */
export async function open(openWith: CryptoKey, locked: Bytes): Promise<Attempt<string>> {
  return attempt(
    async () =>
      new TextDecoder('utf-8', { fatal: true }).decode(
        await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, openWith, locked)
      ),
    'This key does not open that lock.'
  );
}
