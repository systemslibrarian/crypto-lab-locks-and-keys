/*
 * Run the pinned Wycheproof cases, in the reader's own browser.
 *
 * The page shows the result because a count the reader can see is worth more than
 * a count in a README: the claim "this build agrees with someone else's numbers"
 * is being made about the code that is running in front of them, not about a CI
 * run they are asked to take on trust.
 *
 * Both halves check the DETERMINISTIC direction, which is also the direction
 * Steps 3 and 4 perform. See vectors.ts for why the other direction cannot be
 * pinned at all.
 */
import { fromHex, toHex } from './bytes';
import { SALT_BYTES } from './pair';
import {
  OAEP_CASES,
  OAEP_KEY_PKCS8,
  PSS_CASES,
  PSS_KEY_SPKI,
  type OaepCase,
  type PssCase,
} from './vectors';

export interface CaseResult {
  readonly label: string;
  readonly tcId: number;
  readonly why: string;
  /** What the published case requires: open/verify, or refuse. */
  readonly mustSucceed: boolean;
  /** Whether this build did the required thing. */
  readonly agreed: boolean;
  /** What this build actually did, for a failure to be readable. */
  readonly observed: string;
}

export interface PinnedRun {
  readonly results: readonly CaseResult[];
  readonly agreed: number;
  readonly total: number;
}

async function runOaep(key: CryptoKey, c: OaepCase): Promise<CaseResult> {
  let observed: string;
  let opened: string | null = null;
  try {
    opened = toHex(
      new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, fromHex(c.ct)))
    );
    observed = opened === c.pt ? 'opened to the published plaintext' : 'opened to the WRONG bytes';
  } catch {
    observed = 'refused to open';
  }
  const agreed = c.mustSucceed ? opened === c.pt : opened === null;
  return { label: `OAEP ${c.tcId}`, tcId: c.tcId, why: c.why, mustSucceed: c.mustSucceed, agreed, observed };
}

async function runPss(key: CryptoKey, c: PssCase): Promise<CaseResult> {
  let verified = false;
  let observed: string;
  try {
    verified = await crypto.subtle.verify(
      { name: 'RSA-PSS', saltLength: SALT_BYTES },
      key,
      fromHex(c.sig),
      fromHex(c.msg)
    );
    observed = verified ? 'accepted the signature' : 'rejected the signature';
  } catch {
    observed = 'could not check it at all';
  }
  return {
    label: `PSS ${c.tcId}`,
    tcId: c.tcId,
    why: c.why,
    mustSucceed: c.mustSucceed,
    agreed: verified === c.mustSucceed,
    observed,
  };
}

/**
 * Run every pinned case and report what this build did.
 *
 * The keys are imported `extractable: false` — nothing in the lab needs to export
 * them, and a published private key is the one piece of key material here that
 * genuinely must not be copyable out of the page.
 */
export async function runPinned(): Promise<PinnedRun> {
  const oaepKey = await crypto.subtle.importKey(
    'pkcs8',
    fromHex(OAEP_KEY_PKCS8),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
  const pssKey = await crypto.subtle.importKey(
    'spki',
    fromHex(PSS_KEY_SPKI),
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const results = [
    ...(await Promise.all(OAEP_CASES.map((c) => runOaep(oaepKey, c)))),
    ...(await Promise.all(PSS_CASES.map((c) => runPss(pssKey, c)))),
  ];
  return { results, agreed: results.filter((r) => r.agreed).length, total: results.length };
}
