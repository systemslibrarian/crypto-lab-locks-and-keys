/*
 * The README's numbers, checked against the thing they describe.
 *
 * THIS SUITE EXISTS BECAUSE THE README WAS WRONG AND EVERYTHING ELSE WAS GREEN.
 * It said "Six of them are cases the construction is required to refuse" in two
 * places. The fixture holds four. The page itself was right — `pinnedPanel.ts`
 * counts `!mustSucceed` at run time rather than quoting a number — so the error
 * lived only in the prose, which is exactly where nothing was looking.
 *
 * That is the ordinary way a trust-building document stops being trustworthy: a
 * figure typed once, correct on the day, and never recomputed. §4.1b makes the
 * same argument about the page, and the README is a claim surface too.
 *
 * The rule applied here is the one that generalises: a count in prose must
 * either be derived or be asserted. These tests assert. Where a number can be
 * phrased out of the prose instead, that is better still — which is why the page
 * says "N of the M" from the fixture and the README now says the page counts it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { OAEP_CASES, PINNED_CASE_COUNT, PSS_CASES, VECTOR_SOURCE } from './vectors';
import { MAX_MESSAGE_BYTES, MODULUS_BITS } from './pair';

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** Written as a word in prose, which is how the wrong one got in. */
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve'] as const;

describe('the README agrees with the fixture it describes', () => {
  const refusals = [...OAEP_CASES, ...PSS_CASES].filter((c) => !c.mustSucceed).length;

  it('states the refusal count correctly, in words', () => {
    // Sentence-split rather than one clever regex. The first attempt at this
    // test used a lookahead over `[^.]{0,80}` and SILENTLY MATCHED NOTHING:
    // restoring the original wrong count left all 30 tests green, which is the
    // same class of defect as the README error it was written to catch. A test
    // whose own failure mode is "finds nothing" has to assert that it found
    // something, which is what the first expect below is for.
    // Anchored on the claim's own phrasing, which is stable across both places
    // it appears: "N of them are cases the construction is **required to
    // refuse**" and "N are cases the construction must **refuse**". A filter on
    // the literal `**refuse**` missed the first of those entirely -- the bold
    // run there is `**required to refuse**` -- so the sentence carrying the
    // wrong number was never examined and the test passed twice over a defect
    // it was written to catch.
    const CLAIM = /cases the construction/;
    const sentences = README.replace(/\n/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter((line) => CLAIM.test(line));
    // Every occurrence in the file must be one of the sentences examined, so a
    // reword that moves the claim somewhere this split cannot see fails here
    // rather than silently reducing coverage to nothing.
    expect(
      sentences.length,
      'the README must state the refusal count where this test can read it'
    ).toBe((README.match(new RegExp(CLAIM.source, 'g')) ?? []).length);
    expect(sentences.length).toBeGreaterThan(0);

    for (const sentence of sentences) {
      const words = sentence.match(/\b[A-Z][a-z]+\b/g) ?? [];
      const counts = words.filter((w) => WORDS.includes(w as (typeof WORDS)[number]));
      expect(
        counts.length,
        `this sentence names no count, so the figure cannot be checked: ${sentence.trim()}`
      ).toBeGreaterThan(0);
      for (const word of counts) {
        expect(
          WORDS.indexOf(word as (typeof WORDS)[number]),
          `README says "${word}" refusal cases; the fixture holds ${refusals}`
        ).toBe(refusals);
      }
    }
  });

  it('states the total pinned count correctly', () => {
    expect(PINNED_CASE_COUNT).toBe(12);
    expect(README).toContain('Twelve pinned cases');
    expect(README).toMatch(new RegExp(`\\*\\*${PINNED_CASE_COUNT} pinned cases`));
  });

  it('states the unit-test count correctly', () => {
    // Derived from the suite that is actually running: `expect.getState()` knows
    // nothing useful here, so this asserts the shape and leaves the number to
    // the one place that can count it — CI, which fails when Vitest reports 0.
    const stated = README.match(/\*\*(\d+) unit tests\*\* \((\d+) files?\)/);
    expect(stated, 'the README must state a unit-test count').toBeTruthy();
    expect(Number(stated?.[2])).toBeGreaterThan(0);
  });

  it('cites the vector source it actually uses', () => {
    expect(README).toContain(VECTOR_SOURCE.name);
    for (const file of VECTOR_SOURCE.detail.split(' · ')) {
      expect(README, `the README must name ${file}`).toContain(file);
    }
  });
});

describe('the page and the README agree with the constants', () => {
  it('quote the same message budget', () => {
    expect(MAX_MESSAGE_BYTES).toBe(MODULUS_BITS / 8 - 2 * 32 - 2);
    // Both documents mention the budget; neither may name a different number.
    for (const [name, text] of [['README', README], ['index.html', INDEX]] as const) {
      const numbers = Array.from(text.matchAll(/\b(\d{2,4})[- ]byte(?!s? of UTF)/g), (m) =>
        Number(m[1])
      );
      const budgets = numbers.filter((n) => n === MAX_MESSAGE_BYTES);
      expect(budgets.length, `${name} must quote the ${MAX_MESSAGE_BYTES}-byte budget`)
        .toBeGreaterThan(0);
      // 190 is the only two-to-four digit byte figure allowed besides the block
      // width and the key size, so a stale 198 or 214 fails here.
      const allowed = new Set([MAX_MESSAGE_BYTES, MODULUS_BITS / 8, MODULUS_BITS, 32, 294]);
      for (const n of numbers) {
        expect(allowed.has(n), `${name} names "${n}-byte", which is not a figure this lab has`)
          .toBe(true);
      }
    }
  });

  it('quote the same modulus size', () => {
    expect(README).toContain(`${MODULUS_BITS}-bit`);
    expect(INDEX).toContain(`${MODULUS_BITS}-bit`);
  });
});

describe('the misleading framing is gone from the shipped page', () => {
  // The claim is also asserted in the browser (e2e/claims.spec.ts), because what
  // a reader sees is rendered rather than authored. This catches it earlier and
  // in the places a browser test cannot reach: the meta description, the social
  // cards and the README.
  it('says nothing about running the pair "backwards" or "in reverse"', () => {
    expect(INDEX).not.toMatch(/backwards|in reverse|the other way round/i);
  });

  it('does not claim a signature is "all" a signature is, or not a second system', () => {
    expect(INDEX).not.toMatch(/That is all a signature is|not a second system/i);
  });

  it('only uses "backwards" in the README section that explains why it is wrong', () => {
    const sections = README.split(/^## /m);
    for (const section of sections) {
      if (!/backwards/.test(section)) continue;
      expect(
        section,
        'every mention of "backwards" must sit in the passage correcting it'
      ).toMatch(/not \*\*true\*\*|phrasing was|false mechanism claim|different constructions/);
    }
  });
});
