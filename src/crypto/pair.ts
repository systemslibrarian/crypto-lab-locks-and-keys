/*
 * Key pairs — real RSA, generated in the browser, usable both ways round.
 *
 * Everything here is `crypto.subtle` on a 2048-bit RSA key pair. Nothing is
 * simulated and no number theory is reimplemented: RFC 8017's RSAES-OAEP (§7.1)
 * and RSASSA-PSS (§8.1) are what the browser already ships, and the teaching
 * subject of this lab is not the arithmetic — it is which half of the pair does
 * what. The arithmetic has its own lab (Educational RSA) and this one links to it
 * rather than half-explaining it.
 *
 * NO MODULUS, NO EXPONENT, AND NO PRIMES LEAVE THIS FILE. They are never
 * exported, never formatted, and never handed to the UI, because a reader who can
 * see them starts trying to read them. What the UI gets is the public half as an
 * opaque block of bytes and a four-byte fingerprint for telling two pairs apart.
 */
import type { Attempt, Bytes, Pair } from './types';

/** 2048 bits. Large enough to be real, small enough to generate while you watch. */
export const MODULUS_BITS = 2048;

/**
 * The longest message a lock this size can close over, in bytes.
 *
 * OAEP spends a fixed amount of each block on padding, so the block size minus
 * that padding is all the room left for the message. For a 2048-bit key with
 * SHA-256 that leaves 190 bytes — which is the honest reason this lab asks for a
 * short message rather than a paragraph, and the reason real systems encrypt a
 * KEY to the public half and the message to the key (see HPKE Envelope).
 *
 * Derived, not typed in: a hard-coded 190 would silently stop matching the day
 * MODULUS_BITS changed, and the page prints this number.
 */
export const MAX_MESSAGE_BYTES = MODULUS_BITS / 8 - 2 * 32 - 2;

const OAEP = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;
const PSS = { name: 'RSA-PSS', hash: 'SHA-256' } as const;

/** PSS salt length, in bytes. RFC 8017 §9.1 recommends salt length = hash length. */
export const SALT_BYTES = 32;

const subtle = (): SubtleCrypto => crypto.subtle;

/**
 * Generate one pair and return all four handles onto it.
 *
 * The export/re-import in the middle is the load-bearing part. `generateKey` for
 * RSA-OAEP returns keys that can only encrypt and decrypt; asking one to sign
 * throws `InvalidAccessError`. So the private half is exported as PKCS#8 and the
 * public half as SPKI, and both are imported a second time under `RSA-PSS`. The
 * bytes are unchanged, so it is the same pair — and `assertSamePair` below proves
 * that rather than asserting it.
 *
 * `extractable: true` on the private key is required for that export and is the
 * one thing here a production system would not do. It is also why `openWith` and
 * `signWith` never leave this module's return value and are never written to
 * storage: the pair lives in memory for the length of the visit, and reloading
 * the page destroys it.
 */
export async function makePair(): Promise<Pair> {
  const generated = await subtle().generateKey(
    { ...OAEP, modulusLength: MODULUS_BITS, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['encrypt', 'decrypt']
  );
  const { publicKey, privateKey } = generated as CryptoKeyPair;

  const spki = new Uint8Array(await subtle().exportKey('spki', publicKey));
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', privateKey));

  const checkWith = await subtle().importKey('spki', spki, PSS, true, ['verify']);
  const signWith = await subtle().importKey('pkcs8', pkcs8, PSS, false, ['sign']);

  // The same-pair claim, measured at the moment the pair is made. If a future
  // edit ever reaches for a second generateKey, this throws here rather than
  // letting Step 4 go on claiming something untrue.
  await assertSamePair(publicKey, checkWith);

  return {
    lockWith: publicKey,
    openWith: privateKey,
    signWith,
    checkWith,
    publicKeyBytes: spki,
    fingerprint: await fingerprint(spki),
  };
}

/**
 * Throw unless these two public keys are byte-identical.
 *
 * WebCrypto writes an RSA SPKI with the `rsaEncryption` algorithm identifier for
 * both RSA-OAEP and RSA-PSS, so the encoding carries no trace of which algorithm
 * the handle was imported for — which is exactly why the comparison is
 * meaningful: what is left in those bytes is the key itself.
 */
export async function assertSamePair(a: CryptoKey, b: CryptoKey): Promise<void> {
  const x = new Uint8Array(await subtle().exportKey('spki', a));
  const y = new Uint8Array(await subtle().exportKey('spki', b));
  if (!sameBytes(x, y)) {
    throw new Error(
      'the signing half and the locking half are not the same pair — Step 4 would be a lie'
    );
  }
}

/** Constant-time-ish byte comparison. Length first, then every byte. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * A short, stable label for a pair: SHA-256 over the public key, first four
 * bytes, grouped for reading.
 *
 * It exists so Step 3 can show that the second pair is a DIFFERENT pair, and
 * Step 4 can show it is the SAME one, without putting key material on screen. It
 * is an identifier, not a fingerprint anyone should trust for authentication —
 * four bytes is far too short for that, and the page says so.
 */
export async function fingerprint(spki: Bytes): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', spki));
  return Array.from(digest.slice(0, 4), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .replace(/(.{4})(.{4})/, '$1-$2');
}

/**
 * Re-import a public key SPKI for checking signatures.
 *
 * This is how a reader's hypothetical correspondent would use the public half: by
 * receiving those bytes and importing them, with no access to anything private.
 * Step 4 uses it so the verification on screen is demonstrably done with nothing
 * but the public half.
 */
export async function importPublicForChecking(spki: Bytes): Promise<CryptoKey> {
  return subtle().importKey('spki', spki, PSS, true, ['verify']);
}

/**
 * Re-import a public key SPKI for closing a lock.
 *
 * Step 3's negative-claim fixture needs a party who holds ONLY the public half,
 * and the clearest way to be sure of that is to hand it only these bytes.
 */
export async function importPublicForLocking(spki: Bytes): Promise<CryptoKey> {
  return subtle().importKey('spki', spki, OAEP, true, ['encrypt']);
}

/**
 * Wrap a rejected operation as a refusal rather than letting it throw.
 *
 * WebCrypto reports a wrong key, damaged padding and a bad signature the same
 * way — `decrypt` throws an `OperationError` carrying no detail, by design, so
 * that a decryption oracle cannot be built out of the error message. That
 * deliberate silence is itself worth teaching, so the refusal text the UI shows
 * is written here and says what is actually known, which is: it did not open, and
 * the construction will not say why.
 */
export async function attempt<T>(
  run: () => Promise<T>,
  refusedWith: string
): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await run() };
  } catch {
    return { ok: false, refused: refusedWith };
  }
}
