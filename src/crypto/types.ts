/** Shared types for the lock-and-key operations. `src/crypto/` holds no DOM. */

/**
 * A byte string backed by a plain `ArrayBuffer`.
 *
 * `Uint8Array` defaults its buffer parameter to `ArrayBufferLike`, which admits a
 * `SharedArrayBuffer` — and `BufferSource`, which every `crypto.subtle` call
 * takes, does not. Naming the buffer here means the WebCrypto calls typecheck
 * without a cast at each site, and a cast is exactly what should not be reached
 * for: it would silence the one check standing between this code and handing
 * shared memory to a primitive that must not see it.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/**
 * One RSA key pair, usable both ways round.
 *
 * THE POINT OF THIS TYPE IS THAT THERE IS ONE PAIR IN IT, NOT TWO.
 *
 * WebCrypto keys are bound to an algorithm: a key generated for `RSA-OAEP`
 * cannot be handed to `RSA-PSS`, and asking it to sign throws. A lab that wanted
 * to encrypt and sign would therefore reach for two `generateKey` calls — and
 * then Step 4's whole claim, that signing is the SAME pair run backwards, would
 * be false, which is the single thing this lab exists to show.
 *
 * So one pair is generated, exported, and re-imported under the second algorithm
 * name. The key material does not change: `pair.ts` asserts that the public key
 * exported from the encryption handle and from the signing handle are byte-equal
 * SPKI, and `publicKeyBytes` below is that one shared encoding. The four handles
 * are four doors onto one pair.
 */
export interface Pair {
  /** Closes the lock. Public — the half you hand out. */
  readonly lockWith: CryptoKey;
  /** Opens the lock. Private — never leaves this object. */
  readonly openWith: CryptoKey;
  /** Signs. The SAME private half, re-imported for RSASSA-PSS. */
  readonly signWith: CryptoKey;
  /** Checks a signature. The SAME public half, re-imported for RSASSA-PSS. */
  readonly checkWith: CryptoKey;
  /**
   * The public half's SPKI bytes — identical whichever handle they are exported
   * from, which is what makes "the same pair" a measurement rather than a claim.
   */
  readonly publicKeyBytes: Bytes;
  /**
   * A short label for this pair, so two pairs can be told apart on screen
   * without showing any key material. SHA-256 over `publicKeyBytes`, first four
   * bytes. It identifies; it is not a security check.
   */
  readonly fingerprint: string;
}

/** What `lock()` produces. */
export interface Locked {
  /** The unreadable bytes. Always one modulus-width block — 256 bytes here. */
  readonly bytes: Bytes;
  /** The fingerprint of the pair whose public half closed this lock. */
  readonly lockedTo: string;
}

/**
 * The outcome of trying to open a lock, or to check a signature.
 *
 * `refused` is a first-class result rather than an exception, because in this lab
 * a refusal is the padlock working. Steps 3 and 4 both have a panel whose entire
 * point is a refusal, and a type that models refusal as an error pushes the UI
 * toward painting it as one.
 */
export type Attempt<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refused: string };
