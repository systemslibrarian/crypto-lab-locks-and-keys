/*
 * The pair's other job — RSASSA-PSS (RFC 8017 §8.1) through WebCrypto.
 *
 * Step 4's panel is built on one fact newcomers reliably get wrong: signing does
 * not need a different key pair from the encryption in Steps 2 and 3. It is the
 * same pair with the halves swapping roles. The private half, which was the only
 * thing that could DECRYPT, is now the only thing that can SIGN; the public half,
 * which could only ENCRYPT, can now only VERIFY.
 *
 * It is NOT the same operation run backwards, and this file deliberately does not
 * say so. RSAES-OAEP and RSASSA-PSS are different constructions with different
 * padding, and `verify` below does not decrypt a signature to recover a message —
 * it hands the whole job to WebCrypto, which rebuilds an encoded block and checks
 * its structure. See `src/ui/step4.ts` for why that distinction earned a rewrite.
 *
 * The keys passed in here are re-imported handles onto the pair made in pair.ts,
 * and `assertSamePair` has already proved they carry the same key. Nothing new is
 * generated in this file — deliberately, because something generated here would
 * make the lesson false.
 */
import type { Attempt, Bytes } from './types';
import { SALT_BYTES, attempt } from './pair';

/** A signature, with the pair it came from so two pairs can be told apart. */
export interface Signature {
  readonly bytes: Bytes;
  readonly signedBy: string;
  /** The exact text the signature covers. A signature is over bytes, not a topic. */
  readonly over: string;
}

/**
 * Sign with the private half.
 *
 * No public key is a parameter, exactly as `close` took no private key. PSS draws
 * a fresh random salt per signature, so signing the same sentence twice produces
 * two different signatures that both verify — the mirror image of OAEP's fresh
 * seed, and worth noticing side by side.
 */
export async function sign(
  signWith: CryptoKey,
  text: string,
  signedBy: string
): Promise<Signature> {
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'RSA-PSS', saltLength: SALT_BYTES },
      signWith,
      new TextEncoder().encode(text)
    )
  );
  return { bytes, signedBy, over: text };
}

/**
 * Check with the public half.
 *
 * `crypto.subtle.verify` returns false for a bad signature rather than throwing,
 * so unlike `open` this has a real boolean to report — but the result is still an
 * `Attempt`, because an unusable key or a truncated signature CAN throw and those
 * two outcomes must not be collapsed into "the signature was bad".
 *
 * The refusal text names the cause the construction can actually distinguish: a
 * signature that does not match THIS text under THIS public key. It cannot tell
 * you whether the text changed or the signature did, and does not pretend to.
 */
export async function check(
  checkWith: CryptoKey,
  signature: Bytes,
  text: string
): Promise<Attempt<boolean>> {
  return attempt(
    () =>
      crypto.subtle.verify(
        { name: 'RSA-PSS', saltLength: SALT_BYTES },
        checkWith,
        signature,
        new TextEncoder().encode(text)
      ),
    'That signature could not be checked at all — the key or the signature is unusable.'
  );
}
