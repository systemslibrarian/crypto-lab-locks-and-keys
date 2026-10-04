#!/usr/bin/env node
/*
 * fetch-vectors.mjs — regenerate src/crypto/vectors.ts from Project Wycheproof.
 *
 * Run: node scripts/fetch-vectors.mjs
 *
 * WHY THIS SCRIPT EXISTS, AND WHY IT IS NOT RUN IN CI.
 *
 * The lab's own correctness tests are round-trips and cross-pair rejections
 * over freshly generated key pairs — they check the lab against itself. That is
 * not worth much on its own: a build whose encrypt and decrypt are both wrong in
 * the same direction round-trips perfectly. So the lab also pins a handful of
 * cases from an outside publication and runs them unchanged, which is the only
 * check here that could disagree with us.
 *
 * `src/crypto/vectors.ts` is the committed result. It is committed, rather than
 * fetched at test time, for two reasons: a test suite that reaches the network
 * fails for reasons that have nothing to do with the code, and a vector that can
 * change under you is not pinned. This script is how that file is reproduced and
 * audited — run it and the diff should be empty.
 *
 * ON THE SOURCE. The build brief asked for "a pinned RSA-OAEP / RSA-PSS vector
 * from RFC 8017's test data". RFC 8017 publishes no test data: its appendices
 * are A (ASN.1 Syntax), B (Supporting Techniques), C (ASN.1 Module), D (Revision
 * History) and E (About PKCS), and there is no test-vector appendix. Citing it
 * for vectors it does not contain would be a false attribution, so the vectors
 * come from Project Wycheproof and RFC 8017 is cited only for what it really
 * does define — RSAES-OAEP (§7.1) and RSASSA-PSS (§8.1), the two schemes this
 * lab calls through WebCrypto.
 *
 * Wycheproof was chosen over the other two candidates on one ground: its
 * parameters are EXACTLY the ones the four panels use (2048-bit, SHA-256,
 * MGF1-SHA-256, 32-byte salt), so a pinned case exercises the same code path a
 * reader drives rather than a neighbouring one. The PKCS#1 v2.1 vectors that
 * historically shipped with the spec are SHA-1 and 1024-bit, and NIST CAVP
 * covers PSS but not OAEP.
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/C2SP/wycheproof/main/testvectors_v1';

/* The cases taken, and why each one is here. A pinned set is a set of choices,
 * so the reason is recorded beside the id rather than left to the diff. */
const WANT = {
  oaep: {
    file: 'rsa_oaep_2048_sha256_mgf1sha256_test.json',
    cases: {
      1: 'an empty message still encrypts to a full-width block',
      3: 'a four-byte message — the smallest readable case',
      5: 'a seven-byte message',
      11: 'the longest message a 2048-bit OAEP lock can hold (190 bytes)',
      12: 'padding damaged at the front — decryption must REFUSE',
      13: 'padding damaged at the back — decryption must REFUSE',
    },
  },
  pss: {
    file: 'rsa_pss_2048_sha256_mgf1_32_test.json',
    cases: {
      1: 'a signature over an empty message',
      3: 'a signature over a four-byte message',
      5: 'a signature over a seven-byte message',
      73: 'a valid signature whose salt happens to be all zero',
      62: 'the signed digest altered at the front — verification must REFUSE',
      85: 'the salt hash removed — verification must REFUSE',
    },
  },
};

async function grab(file) {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

/* Wycheproof's `result` is "valid" | "invalid" | "acceptable". Only the first
 * two are pinned: "acceptable" means implementations legitimately disagree, so
 * asserting either answer would be asserting a preference as a requirement. */
function take(group, wanted, pull) {
  const byId = new Map(group.tests.map((t) => [t.tcId, t]));
  return Object.entries(wanted).map(([id, why]) => {
    const t = byId.get(Number(id));
    if (!t) throw new Error(`case ${id} is not in the upstream file any more`);
    if (t.result !== 'valid' && t.result !== 'invalid') {
      throw new Error(`case ${id} is "${t.result}"; only valid/invalid may be pinned`);
    }
    return { tcId: t.tcId, why, mustSucceed: t.result === 'valid', ...pull(t) };
  });
}

const oaepDoc = await grab(WANT.oaep.file);
const pssDoc = await grab(WANT.pss.file);
const og = oaepDoc.testGroups[0];
const pg = pssDoc.testGroups[0];

/* Assert the upstream parameters are still the lab's own. If Wycheproof ever
 * re-cuts these files with a different hash or salt length, the fixture would
 * silently start testing a scheme the panels do not use. */
const expect = (actual, want, what) => {
  if (actual !== want) throw new Error(`${what}: upstream says ${actual}, this lab uses ${want}`);
};
expect(og.sha, 'SHA-256', 'OAEP hash');
expect(og.mgfSha, 'SHA-256', 'OAEP MGF1 hash');
expect(pg.sha, 'SHA-256', 'PSS hash');
expect(pg.mgfSha, 'SHA-256', 'PSS MGF1 hash');
expect(pg.sLen, 32, 'PSS salt length');

const oaep = take(og, WANT.oaep.cases, (t) => ({ ct: t.ct, pt: t.msg }));
const pss = take(pg, WANT.pss.cases, (t) => ({ msg: t.msg, sig: t.sig }));

const lit = (s) => JSON.stringify(s);
const body = `/*
 * Pinned test cases from Project Wycheproof — THE ONLY CHECK IN THIS LAB THAT
 * COULD DISAGREE WITH US.
 *
 * GENERATED by scripts/fetch-vectors.mjs. Do not hand-edit: re-run that script
 * and commit the diff, which is also how the provenance is audited.
 *
 * Everything else here tests the lab against itself — a message is encrypted and
 * decrypted by the same two functions, a signature made and verified by the same
 * pair. Those round-trips pass just as happily when both halves are wrong in the
 * same direction. These cases were produced by someone else, so they cannot.
 *
 * Two shapes, and both are deliberate:
 *   - OAEP is checked by DECRYPTING a pinned ciphertext. Encryption draws a
 *     random seed, so a pinned ciphertext cannot be reproduced — only opened.
 *   - PSS is checked by VERIFYING a pinned signature, for the same reason: PSS
 *     draws a random salt per signature.
 * In both cases the half that is deterministic is the half that is pinnable, and
 * it is also the half this lab's Steps 3 and 4 actually perform.
 *
 * Cases whose \`mustSucceed\` is false are the more interesting half: the
 * construction has to REFUSE them. A build that opens everything handed to it
 * passes every round-trip in this repo and fails here.
 *
 * Parameters match the panels exactly — 2048-bit, SHA-256, MGF1-SHA-256, 32-byte
 * salt — so a failure here implicates the code a reader just drove, not a
 * neighbouring configuration. RFC 8017 defines the two schemes (§7.1 RSAES-OAEP,
 * §8.1 RSASSA-PSS) but publishes no test data of its own; see the generator's
 * header for why that is said out loud.
 */

/** Where these bytes came from, shown on the page rather than only in a comment. */
export const VECTOR_SOURCE = {
  name: ${lit('Project Wycheproof')},
  detail: ${lit(`${WANT.oaep.file} · ${WANT.pss.file}`)},
  url: ${lit('https://github.com/C2SP/wycheproof')},
  /** What RFC 8017 is actually cited for: the schemes, not the numbers. */
  spec: ${lit('RFC 8017 §7.1 (RSAES-OAEP), §8.1 (RSASSA-PSS)')},
} as const;

export interface OaepCase {
  /** Upstream case id, so a failure can be looked up in the source file. */
  readonly tcId: number;
  /** Why this case is in the pinned set. */
  readonly why: string;
  /** False means the library is REQUIRED to refuse it. */
  readonly mustSucceed: boolean;
  /** Ciphertext, hex, exactly as published. */
  readonly ct: string;
  /** The plaintext it must open to, hex. Empty string is a real case. */
  readonly pt: string;
}

export interface PssCase {
  readonly tcId: number;
  readonly why: string;
  readonly mustSucceed: boolean;
  /** Message, hex. */
  readonly msg: string;
  /** Signature over it, hex. */
  readonly sig: string;
}

/** PKCS#8 private key for the OAEP cases, hex, as published. */
export const OAEP_KEY_PKCS8 = ${lit(og.privateKeyPkcs8)};

/** SPKI public key for the PSS cases, hex, as published. */
export const PSS_KEY_SPKI = ${lit(pg.publicKeyDer)};

export const OAEP_CASES: readonly OaepCase[] = ${JSON.stringify(oaep, null, 2)};

export const PSS_CASES: readonly PssCase[] = ${JSON.stringify(pss, null, 2)};

/** Every pinned case, as one count the page and the tests both quote. */
export const PINNED_CASE_COUNT = OAEP_CASES.length + PSS_CASES.length;
`;

writeFileSync(new URL('../src/crypto/vectors.ts', import.meta.url), body);
console.log(
  `wrote src/crypto/vectors.ts — ${oaep.length} OAEP + ${pss.length} PSS = ${oaep.length + pss.length} pinned cases`
);
