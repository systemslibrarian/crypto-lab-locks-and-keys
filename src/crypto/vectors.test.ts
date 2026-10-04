/*
 * The pinned cases, run against this build.
 *
 * This is the only suite in the repo that could disagree with the lab. Everything
 * in pair.test.ts compares the lab's own encrypt against the lab's own decrypt;
 * these bytes came from Project Wycheproof, and a build that got RSAES-OAEP or
 * RSASSA-PSS wrong in a self-consistent way fails here and nowhere else.
 *
 * The `mustSucceed: false` cases carry most of that weight. They are damaged
 * ciphertexts and damaged signatures, and the construction is REQUIRED to refuse
 * them — a build that opens whatever it is handed round-trips perfectly and fails
 * these.
 */
import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { runPinned } from './pinned';
import {
  OAEP_CASES,
  PINNED_CASE_COUNT,
  PSS_CASES,
  VECTOR_SOURCE,
} from './vectors';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

describe('pinned cases from Project Wycheproof', () => {
  it('agrees with every published case', async () => {
    const run = await runPinned();
    // Named failures, not a bare count: a run that reports "11 / 12" without
    // saying which case is a report nobody can act on.
    const disagreed = run.results
      .filter((r) => !r.agreed)
      .map((r) => `${r.label} (${r.why}) — required to ${r.mustSucceed ? 'open/verify' : 'REFUSE'}, this build ${r.observed}`);
    expect(disagreed).toEqual([]);
    expect(run.agreed).toBe(run.total);
    expect(run.total).toBe(PINNED_CASE_COUNT);
  }, 60_000);

  it('pins cases of both kinds, so a refuse-everything build cannot pass', () => {
    // Asserted rather than assumed: a regeneration that happened to select only
    // valid cases would leave the suite unable to catch the mutation that
    // matters most, and it would still read as twelve green cases.
    for (const set of [OAEP_CASES, PSS_CASES]) {
      expect(set.some((c) => c.mustSucceed)).toBe(true);
      expect(set.some((c) => !c.mustSucceed)).toBe(true);
    }
  });

  it('counts the cases the same way the page does', () => {
    expect(PINNED_CASE_COUNT).toBe(OAEP_CASES.length + PSS_CASES.length);
    expect(PINNED_CASE_COUNT).toBeGreaterThan(0);
  });

  it('names a source that is not this repository', () => {
    // The whole value of this file is its provenance, so the provenance is
    // asserted. A later edit that quietly re-derived these bytes locally would
    // leave every other test green.
    expect(VECTOR_SOURCE.name).toBe('Project Wycheproof');
    expect(VECTOR_SOURCE.url).toContain('wycheproof');
    expect(VECTOR_SOURCE.detail).toMatch(/rsa_oaep_2048_sha256/);
    expect(VECTOR_SOURCE.detail).toMatch(/rsa_pss_2048_sha256/);
  });

  it('cites RFC 8017 for the schemes and not for the numbers', () => {
    // RFC 8017 publishes no test data. If a future edit re-attributes these
    // bytes to it, this fails.
    expect(VECTOR_SOURCE.spec).toContain('RFC 8017');
    expect(VECTOR_SOURCE.name).not.toMatch(/RFC/);
    expect(VECTOR_SOURCE.detail).not.toMatch(/RFC/);
  });
});
