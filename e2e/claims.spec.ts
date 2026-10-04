import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { boot } from './gate';
import { witness } from './evidence';

/**
 * The claims suite: what this lab's interface SAYS, as opposed to what it is
 * shaped like. §4.1b and §4.1d of the build standard.
 *
 * These live here and not in `gate.ts`'s `boot()` on purpose. An assertion in a
 * shared setup fails every accessibility test at once, under the name
 * "Accessibility gate" — crypto-lab-mceliece-gate lost three days of corrected
 * security claims to exactly that on 2026-09-26. Here, a failure says "claims",
 * which is what actually changed.
 *
 * THE RULE THAT MAKES THESE WORTH ANYTHING: compare two values the page itself
 * printed, rather than asserting against a hardcoded string. A test that
 * re-derives the same expression the source uses will happily agree with a bug.
 *
 * But internal consistency is not enough — a page can be consistently wrong. A
 * test that only checks the page agrees with itself survives a mutation that
 * corrupts the underlying operation, because the corrupted value is reported
 * consistently everywhere. So this file mixes three shapes deliberately:
 *
 *  - CROSS-CHECKS. Two surfaces that must agree: the byte counter against the
 *    note it counts, the prose limit against the `maxlength` attribute against
 *    the refusal message, the fingerprint in Step 1 against the one Step 2
 *    prints, the two public-key exports in Step 4 against each other.
 *
 *  - INDEPENDENT RE-DERIVATIONS. Recompute the claim from the page's raw values
 *    by a different route than the source takes. The fingerprint is recomputed
 *    here with `node:crypto` over the base64 the page disclosed — a different
 *    SHA-256 implementation, in a different process, from bytes the page
 *    published. The block widths are re-derived by decoding the page's own hex
 *    rather than by reading the number it printed beside it.
 *
 *  - PARTS-SUM-TO-WHOLE. The 190-byte budget is re-derived from the block width
 *    the page actually produced: 256 - 2*32 - 2.
 *
 * Every test that asserts a verdict marker calls `witness()`, which is what
 * makes the mutation ledger enforceable rather than archival. See `evidence.ts`.
 */

/** Decode the page's own base64 the way a reader's clipboard would. */
const b64 = (s: string): Buffer => Buffer.from(s, 'base64');

/** Recompute the lab's fingerprint by an independent route. */
function refingerprint(spkiBase64: string): string {
  const digest = createHash('sha256').update(b64(spkiBase64)).digest('hex');
  return `${digest.slice(0, 4)}-${digest.slice(4, 8)}`;
}

/** Strip whitespace a wrapped `<code>` block may carry. */
const tight = (s: string): string => s.replace(/\s+/g, '');

test.describe('what the page says on arrival', () => {
  test('the note box arrives holding this lab own example sentence', async ({ page }) => {
    await boot(page, 'dark');
    // The sentence itself, which is why this is here and not in boot(): a
    // reworded example must fail THIS test and nothing in the a11y gate.
    await expect(page.locator('#message')).toHaveValue(
      'Meet me at the north gate at six.'
    );
  });

  test('the byte limit is one number in three places', async ({ page }) => {
    await boot(page, 'dark');
    // A cross-check across three independent surfaces: the prose a reader reads,
    // the attribute the browser enforces, and the counter's own denominator.
    // main.ts writes all three from MAX_MESSAGE_BYTES; if one route broke, they
    // would disagree here rather than silently.
    const prose = (await page.locator('#step-2 [data-max-bytes]').first().innerText()).trim();
    const maxlength = await page.locator('#message').getAttribute('maxlength');
    const counter = await page.locator('#msg-count').innerText();
    expect(maxlength).toBe(prose);
    expect(counter).toMatch(new RegExp(`of ${prose} bytes$`));
  });

  test('the counter counts BYTES, not characters', async ({ page }) => {
    await boot(page, 'dark');
    // Independent re-derivation: the test encodes the page's own value itself
    // rather than trusting the number beside it. One accented character is two
    // UTF-8 bytes, so a character count would read 3 where this reads 6.
    const text = 'ééé';
    await page.locator('#message').fill(text);
    const expected = Buffer.byteLength(text, 'utf8');
    expect(expected).toBe(6);
    await expect(page.locator('#msg-count')).toHaveText(
      new RegExp(`^${expected} of \\d+ bytes$`)
    );
  });

  test('the pinned cases report their own count, and it matches the rows', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'pinned');
    const verdict = page.locator('[data-verdict="pinned"]');
    const headline = await verdict.locator('.verdict-headline').innerText();
    // Cross-check: the headline's denominator against the rows it counts, and
    // its numerator against the rows that agreed. A page that printed "12 OF 12"
    // over eleven rows would pass a hardcoded assertion and fails this one.
    const [, agreed, total] = headline.match(/^(\d+) OF (\d+) AGREE$/) ?? [];
    const rows = await page.locator('#pinned-out .case').count();
    const ok = await page.locator('#pinned-out .case-ok').count();
    expect(Number(total)).toBe(rows);
    expect(Number(agreed)).toBe(ok);
    expect(Number(agreed)).toBe(Number(total));
    await expect(verdict).toHaveAttribute('data-tone', 'pass');
    // Both kinds are present, so a build that refused everything could not pass.
    const mustRefuse = await page
      .locator('#pinned-out .case-kind', { hasText: 'must refuse' })
      .count();
    expect(mustRefuse).toBeGreaterThan(0);
    expect(mustRefuse).toBeLessThan(rows);
  });

  test('the pinned source is named on the page, and is not RFC 8017', async ({ page }) => {
    await boot(page, 'dark');
    const line = await page.locator('#pinned-out .source-line').innerText();
    // RFC 8017 publishes no test data. It is cited for the schemes, which is a
    // different sentence, and the page has to make that distinction visibly.
    expect(line).toContain('Project Wycheproof');
    expect(line).toMatch(/The schemes themselves are RFC 8017/);
    expect(line).not.toMatch(/vectors? from RFC 8017|RFC 8017 test/i);
  });
});

test.describe('each step verdict, read off the computed result', () => {
  test('Step 1 names the pair it just made, and both halves are described', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'pair-made');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    const verdict = page.locator('[data-verdict="pair-made"]');
    await expect(verdict).toHaveAttribute('data-tone', 'pass');
    await expect(verdict.locator('.verdict-headline')).toHaveText('A PAIR EXISTS');

    // INDEPENDENT RE-DERIVATION of the headline claim. The page prints a
    // fingerprint; the test recomputes it with node:crypto over the base64 the
    // page disclosed. Two SHA-256 implementations in two processes, agreeing
    // about bytes the page published.
    const detail = await verdict.innerText();
    const shown = detail.match(/[0-9a-f]{4}-[0-9a-f]{4}/)?.[0];
    expect(shown, 'Step 1 must print a fingerprint').toBeTruthy();

    await page.locator('#s1-out details > summary').click();
    const exported = tight(await page.locator('#s1-out .long-value-code').innerText());
    expect(refingerprint(exported)).toBe(shown);

    // The exported SPKI is a real 2048-bit RSA public key: 294 bytes, and the
    // page's own byte count agrees with what decoding it produces.
    expect(b64(exported).length).toBe(294);
    await expect(page.locator('#s1-out .bytes-lede')).toContainText('294 bytes');

    // The private half is described and never shown. Asserted as an absence,
    // because a leak here would be the one unforgivable defect in this lab.
    await expect(page.locator('.half-private')).toBeVisible();
    const page_text = await page.locator('#app').innerText();
    expect(page_text).not.toMatch(/BEGIN (RSA )?PRIVATE KEY/);
  });

  test('Step 2 locks to the same pair Step 1 made, in one full block', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'locked');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    const fingerprint = (await page.locator('[data-verdict="pair-made"]').innerText()).match(
      /[0-9a-f]{4}-[0-9a-f]{4}/
    )?.[0];

    await page.getByRole('button', { name: 'Close the lock' }).click();
    const verdict = page.locator('[data-verdict="locked"]');
    await expect(verdict).toHaveAttribute('data-tone', 'pass');
    await expect(verdict.locator('.verdict-headline')).toHaveText('LOCKED');
    // CROSS-CHECK across panels: Step 2 must name the pair Step 1 printed.
    await expect(verdict).toContainText(`pair ${fingerprint}`);

    // INDEPENDENT RE-DERIVATION of the width: decode the hex the page disclosed
    // and count it, rather than reading the number the page printed beside it.
    await page.locator('#s2-out details > summary').click();
    const hex = tight(await page.locator('#s2-out .long-value-code').innerText());
    expect(hex).toMatch(/^[0-9a-f]+$/);
    const width = hex.length / 2;
    expect(width).toBe(256);
    await expect(verdict).toContainText('256 bytes');

    // PARTS-SUM-TO-WHOLE: the message budget the page promises is the block
    // width less OAEP's two SHA-256 digests and two framing bytes.
    const promised = Number(
      (await page.locator('#step-2 [data-max-bytes]').first().innerText()).trim()
    );
    expect(promised).toBe(width - 2 * 32 - 2);

    // The claim the panel exists to make, in the panel.
    await expect(page.locator('#s2-out .claim-note')).toContainText(
      'private half was not used'
    );
  });

  test('Step 2 locks the same words to different bytes each time', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    const read = async (): Promise<string> => {
      await page.locator('#s2-out details > summary').click();
      return tight(await page.locator('#s2-out .long-value-code').innerText());
    };
    await page.getByRole('button', { name: 'Close the lock' }).click();
    const first = await read();
    await page.getByRole('button', { name: 'Close the lock' }).click();
    const second = await read();
    // OAEP draws a fresh seed per call. Equal blocks would mean encryption had
    // become deterministic, which is a serious break the page claims it is not.
    expect(second).not.toBe(first);
    expect(second.length).toBe(first.length);
    await expect(page.locator('#s2-out .aside-note').first()).toContainText(
      'whatever you typed'
    );
  });

  test('Step 3 returns exactly the note that was typed', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'opened');
    const note = 'Nineteen barrels, pier four, before the tide.';
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.locator('#message').fill(note);
    await page.getByRole('button', { name: 'Close the lock' }).click();
    await page.getByRole('button', { name: 'Open with my private half' }).click();

    const verdict = page.locator('[data-verdict="opened"]');
    await expect(verdict).toHaveAttribute('data-tone', 'pass');
    await expect(verdict.locator('.verdict-headline')).toHaveText('OPENED');
    // CROSS-CHECK between two surfaces the page printed: the note the reader
    // typed and the text the page says came back. Not a hardcoded string — the
    // comparison is against the live value of the input.
    const typed = await page.locator('#message').inputValue();
    await expect(page.locator('#s3-out .recovered-text')).toHaveText(typed);
    expect(typed).toBe(note);
  });

  test('Step 3 wrong key is refused CALMLY, and the page names the cause', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'wrong-key');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    const mine = (await page.locator('[data-verdict="pair-made"]').innerText()).match(
      /[0-9a-f]{4}-[0-9a-f]{4}/
    )?.[0];
    await page.getByRole('button', { name: 'Close the lock' }).click();
    await page.getByRole('button', { name: 'Try a different private key' }).click();

    const verdict = page.locator('[data-verdict="wrong-key"]');
    await expect(verdict.locator('.verdict-headline')).toHaveText('DID NOT OPEN');
    // THE TONE IS THE CLAIM. A refusal here is the lock working, and the brief
    // requires it not read as a system error: `held`, never `fail`, never
    // `alarm`. Asserting the attribute is how that survives a palette edit.
    await expect(verdict).toHaveAttribute('data-tone', 'held');
    await expect(verdict).toContainText('does not open');

    // Two DIFFERENT pairs, named: the verdict must print a fingerprint that is
    // not the one Step 1 made, which is the whole reason fingerprints exist.
    const named = (await verdict.innerText()).match(/[0-9a-f]{4}-[0-9a-f]{4}/g) ?? [];
    expect(named).toContain(mine);
    expect(named.filter((f) => f !== mine).length).toBeGreaterThan(0);
    await expect(page.locator('#s3-wrong-out .claim-note')).toContainText('Nothing went wrong');
  });

  test('Step 4 proves the pair is the SAME pair, then signs and verifies', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'same-pair');
    witness(test.info().title, 'signed');
    witness(test.info().title, 'checked');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    const mine = (await page.locator('[data-verdict="pair-made"]').innerText()).match(
      /[0-9a-f]{4}-[0-9a-f]{4}/
    )?.[0];
    await page.getByRole('button', { name: 'Sign my note with the private half' }).click();

    const same = page.locator('[data-verdict="same-pair"]');
    await expect(same).toHaveAttribute('data-tone', 'pass');
    await expect(same.locator('.verdict-headline')).toHaveText('SAME PAIR');

    // CROSS-CHECK, and the load-bearing one in this lab: the two public-key
    // exports the page discloses must be byte-identical, because Step 4's whole
    // claim is that signing is the pair from Step 1 run backwards. Compared
    // here independently of the page's own comparison.
    await page.locator('#s4-same-out details > summary').click();
    const exports = await page.locator('#s4-same-out .long-value-code').allInnerTexts();
    expect(exports).toHaveLength(2);
    expect(tight(exports[0])).toBe(tight(exports[1]));
    // And it is the same key Step 1 published, re-derived through the
    // fingerprint rather than taken on trust.
    expect(refingerprint(tight(exports[0]))).toBe(mine);

    const signed = page.locator('[data-verdict="signed"]');
    await expect(signed).toHaveAttribute('data-tone', 'pass');
    await expect(signed).toContainText(`pair ${mine}`);
    // The signature is a full block, re-derived by decoding the page's own hex.
    await page.locator('#s4-sign-out details > summary').click();
    const sigHex = tight(await page.locator('#s4-sign-out .long-value-code').innerText());
    expect(sigHex.length / 2).toBe(256);
    await expect(signed).toContainText('256 bytes');

    await page.getByRole('button', { name: 'Check the signature' }).click();
    const checked = page.locator('[data-verdict="checked"]');
    await expect(checked).toHaveAttribute('data-tone', 'pass');
    await expect(checked.locator('.verdict-headline')).toHaveText('VERIFIED');
    await expect(checked).toContainText(`pair ${mine}`);
    // What the signature covers is the note on screen — cross-checked, not
    // asserted against a literal.
    await expect(page.locator('#s4-check-out .recovered-text')).toHaveText(
      await page.locator('#message').inputValue()
    );
  });

  test('Step 4 refuses a text that changed by one character, and says which', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'checked');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Sign my note with the private half' }).click();
    await page.getByRole('button', { name: /Change one character and check again/ }).click();

    const verdict = page.locator('[data-verdict="checked"]');
    await expect(verdict.locator('.verdict-headline')).toHaveText('DID NOT VERIFY');
    // Calm again: the check refusing is the check working.
    await expect(verdict).toHaveAttribute('data-tone', 'held');

    // INDEPENDENT RE-DERIVATION of the page's own claim about the edit. The page
    // says a position; the test finds the differing position itself by comparing
    // the two quotes the page printed, and the two must agree. A page that
    // reported the wrong position, or tampered more than one character, fails
    // here while every round-trip stays green.
    const quotes = await page.locator('#s4-check-out .recovered-text').allInnerTexts();
    expect(quotes).toHaveLength(2);
    const [signedText, givenText] = quotes;
    expect(givenText.length).toBe(signedText.length);
    const differing = [...signedText].reduce<number[]>(
      (acc, ch, i) => (ch === givenText[i] ? acc : [...acc, i]),
      []
    );
    expect(differing).toHaveLength(1);
    const reported = Number((await verdict.innerText()).match(/position (\d+)/)?.[1]);
    expect(reported).toBe(differing[0] + 1);
  });
});

test.describe('retirement, and the no-op guard', () => {
  test('changing the note retires the stale verdicts and says they were retired', async ({
    page,
  }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Close the lock' }).click();
    await page.getByRole('button', { name: 'Open with my private half' }).click();
    await expect(page.locator('[data-verdict="locked"]')).toBeVisible();

    await page.locator('#message').fill('A different note entirely.');

    // Both halves of the requirement: the stale verdict is GONE, and the page
    // says it was retired rather than simply going blank.
    await expect(page.locator('[data-verdict="locked"]')).toHaveCount(0);
    const retired = page.locator('[data-verdict-retired="locked"]');
    await expect(retired).toBeVisible();
    await expect(retired.locator('.verdict-headline')).toHaveText('RETIRED');
    await expect(retired).toContainText('no longer describes');
  });

  test('re-entering the SAME note does not retire a fresh verdict', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Close the lock' }).click();
    const verdict = page.locator('[data-verdict="locked"]');
    await expect(verdict).toBeVisible();

    // The no-op guard. `fill()` dispatches a real `input` event, so the page's
    // listener runs and recomputes the basis — it just recomputes an identical
    // one. A page that retired on every keystroke rather than on every CHANGE
    // would fail here, and that is the easy mistake to make.
    const unchanged = await page.locator('#message').inputValue();
    await page.locator('#message').fill(unchanged);
    await expect(verdict).toBeVisible();
    await expect(page.locator('[data-verdict-retired="locked"]')).toHaveCount(0);
  });
});

/**
 * §4.1d — the negative claim.
 *
 * One sentence naming a security property the construction on this page does NOT
 * provide, scoped to that construction and not to the field: RSA-OAEP decryption
 * establishes nothing about who encrypted. "Public-key encryption does not
 * identify the sender" would be false, and Step 4 on this very page falsifies it.
 *
 * Three assertions, as the standard requires: reach the fixture through the UI,
 * show that EVERYTHING is green in that state, and show the limitation is on
 * screen in that state — visible, not in the README, not behind a disclosure.
 *
 * Assertion 2 is the one that makes this a result rather than a disclaimer. If
 * any check in the fixture failed, the fixture would be demonstrating the
 * mechanism working rather than its limit.
 */
test.describe('the negative claim: a lock that opens does not say who closed it', () => {
  test('every check passes, and the message is unattributed anyway', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'unattributed');

    // 1. REACH THE FIXTURE, through the controls a reader has.
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    const typed = await page.locator('#message').inputValue();
    await page.getByRole('button', { name: 'Close the lock' }).click();
    await page.getByRole('button', { name: 'Open with my private half' }).click();
    await page.getByRole('button', { name: 'Let a stranger use my public half' }).click();

    const fixture = page.locator('[data-verdict="unattributed"]');
    await expect(fixture).toBeVisible();

    // 2. EVERYTHING IS GREEN — asserted against the RENDERED verdicts, not a
    // flag this test set. No verdict anywhere on the page may be in the `fail`
    // tone, and the opened and locked verdicts must still be passing: the
    // stranger's block opened because the mechanism works, which is the point.
    await expect(page.locator('[data-verdict][data-tone="fail"]')).toHaveCount(0);
    await expect(page.locator('[data-verdict-retired]')).toHaveCount(0);
    for (const marker of ['pair-made', 'locked', 'opened', 'pinned']) {
      await expect(page.locator(`[data-verdict="${marker}"]`)).toHaveAttribute(
        'data-tone',
        'pass'
      );
    }
    // The fixture's own verdict reads as success AND limitation at once.
    await expect(fixture.locator('.verdict-headline')).toHaveText('OPENED — AND UNATTRIBUTED');
    await expect(fixture).toHaveAttribute('data-tone', 'alarm');
    await expect(fixture).toContainText('Every check this page performs reports success');

    // The property really is violated: the text that came back is NOT the text
    // the reader typed, and the reader's own private half opened it. Compared
    // between two surfaces the page printed.
    const recovered = await page.locator('#s3-stranger-out .recovered-text').innerText();
    expect(recovered).not.toBe(typed);
    expect(recovered.length).toBeGreaterThan(0);

    // 3. THE LIMITATION IS ON SCREEN IN THIS STATE — visible, and tied to this
    // fixture rather than floating somewhere else on the page.
    const claim = page.locator('#s3-stranger-out .negative-claim');
    await expect(claim).toBeVisible();
    await expect(claim).toContainText('does not tell you who closed it');
    await expect(claim).toContainText('anyone holding the public half');
    // Not behind a disclosure: no ancestor <details> anywhere above it.
    expect(
      await claim.evaluate((node) => node.closest('details') !== null),
      'the negative claim must not sit inside a disclosure'
    ).toBe(false);

    // And the page says why there is no error code, which is the exhibit.
    await expect(page.locator('#s3-stranger-out .claim-note')).toContainText(
      'no check here that could fail'
    );
  });

  test('Step 4 is offered as the answer to it, and delivers', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Close the lock' }).click();
    await page.getByRole('button', { name: 'Let a stranger use my public half' }).click();
    // The hand-off is a real link to a real section, not a sentence about one.
    const link = page.locator('#s3-stranger-out .handoff a');
    await expect(link).toHaveAttribute('href', '#step-4');
    await expect(page.locator('#step-4')).toBeVisible();

    // The gap the negative claim names is the gap Step 4 closes, and the page
    // says so in the state where it closes it.
    await page.getByRole('button', { name: 'Sign my note with the private half' }).click();
    await page.getByRole('button', { name: 'Check the signature' }).click();
    await expect(page.locator('#s4-check-out .claim-note')).toContainText('Now compare this with Step 3');
  });
});
