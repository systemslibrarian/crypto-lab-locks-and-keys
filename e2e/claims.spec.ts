import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { boot } from './gate';
import { enforceLedger, ran, witness } from './evidence';

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
 * But internal consistency is not enough — a page can be consistently wrong. So
 * this file mixes three shapes deliberately: CROSS-CHECKS between two surfaces
 * that must agree, INDEPENDENT RE-DERIVATIONS that recompute a claim by a
 * different route (the fingerprint is recomputed here with `node:crypto` over
 * the base64 the page disclosed, in a different process), and
 * PARTS-SUM-TO-WHOLE where the maths offers one.
 *
 * THE STATE-SEMANTICS BLOCK NEAR THE BOTTOM IS NOT DECORATION. A review of the
 * built page found four defects no test here could see: a Check button enabled
 * with no signature that silently did nothing; an edit to the note retiring
 * `locked` and `signed` while `opened` and `checked` stayed green quoting a note
 * no longer on screen; re-encrypting leaving the previous OPENED verdict
 * standing under a new block; and a tamper that split an emoji into a lone
 * surrogate. Every one of them is now asserted, because every one of them
 * shipped past a green suite.
 *
 * Every test that asserts a verdict marker calls `witness()`, which is what
 * makes the mutation ledger enforceable rather than archival. See `evidence.ts`.
 */

/*
 * The mutation ledger is enforced from HERE, not from a `globalTeardown`.
 *
 * `afterEach` records that a test executed, whatever its outcome; `afterAll`
 * then fails the run if a recorded kill's own test ran without asserting the
 * marker the record names. Both hooks are root-level, so they cover every test
 * in this file regardless of declaration order.
 *
 * It lived in a `globalTeardown` first, and that was wrong: the teardown asked
 * whether `claims` was in `config.projects` to decide whether this suite had
 * run, and Playwright passes the FULL project list whatever `--project` was
 * given. So an a11y-only run enforced this ledger, found no witnesses, and
 * failed the ACCESSIBILITY GATE with all three of its tests passing — a red step
 * naming the wrong subject, which is exactly what §4.1a exists to prevent. See
 * `evidence.ts` for the whole account.
 */
test.afterEach(({}, testInfo) => ran(testInfo.title));
test.afterAll(() => enforceLedger());

/** Decode the page's own base64 the way a reader's clipboard would. */
const b64 = (s: string): Buffer => Buffer.from(s, 'base64');

/** Recompute the lab's fingerprint by an independent route. */
function refingerprint(spkiBase64: string): string {
  const digest = createHash('sha256').update(b64(spkiBase64)).digest('hex');
  return `${digest.slice(0, 4)}-${digest.slice(4, 8)}`;
}

/** Strip whitespace a wrapped `<code>` block may carry. */
const tight = (s: string): string => s.replace(/\s+/g, '');

/** The fingerprint the page printed for the reader's pair. */
async function fingerprintOf(page: Page): Promise<string> {
  const text = await page.locator('[data-verdict="pair-made"]').innerText();
  const found = text.match(/[0-9a-f]{4}-[0-9a-f]{4}/)?.[0];
  expect(found, 'Step 1 must print a fingerprint').toBeTruthy();
  return found as string;
}

/**
 * Every verdict marker's tone, and whether it has been superseded — read in ONE
 * page evaluation.
 *
 * Not `page.getAttribute` per marker: that auto-waits for a selector that is
 * deliberately absent, so a missing verdict costs the full timeout instead of
 * answering immediately. A probe written that way took minutes and looked like a
 * hung page.
 */
type Status = Record<string, 'fresh' | 'stale' | 'absent'>;
const MARKERS = ['locked', 'opened', 'wrong-key', 'unattributed', 'same-pair', 'signed', 'checked'];

function statusOf(page: Page): Promise<Status> {
  return page.evaluate((markers) => {
    const out: Record<string, string> = {};
    for (const m of markers) {
      out[m] = document.querySelector(`[data-verdict="${m}"]`)
        ? 'fresh'
        : document.querySelector(`[data-verdict-retired="${m}"]`)
          ? 'stale'
          : 'absent';
    }
    return out as Status;
  }, MARKERS);
}

/** Drive the whole happy path, so a state test can start from a finished page. */
async function fullRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Make a key pair' }).click();
  await page.waitForSelector('[data-verdict="pair-made"]');
  await page.getByRole('button', { name: 'Encrypt the note' }).click();
  await page.waitForSelector('[data-verdict="locked"]');
  await page.getByRole('button', { name: 'Open it with my private half' }).click();
  await page.waitForSelector('[data-verdict="opened"]');
  await page.getByRole('button', { name: 'Sign the note with my private half' }).click();
  await page.waitForSelector('[data-verdict="signed"]');
  await page.getByRole('button', { name: 'Check the signature' }).click();
  await page.waitForSelector('[data-verdict="checked"]');
}

test.describe('what the page says on arrival', () => {
  test('the note box arrives holding this lab own example sentence', async ({ page }) => {
    await boot(page, 'dark');
    // The sentence itself, which is why this is here and not in boot(): a
    // reworded example must fail THIS test and nothing in the a11y gate.
    await expect(page.locator('#message')).toHaveValue('Meet me at the north gate at six.');
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
    expect(counter).toMatch(new RegExp(`of ${prose} bytes used$`));
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
      new RegExp(`^${expected} of \\d+ bytes used$`)
    );
  });

  test('an over-budget note is reported in the counter and on the control', async ({ page }) => {
    await boot(page, 'dark');
    // 100 accented characters: 200 UTF-8 bytes inside a 190-byte budget and well
    // inside a maxlength of 190, which is the whole reason the limit is counted
    // in bytes. The state is announced (`aria-invalid`), not only coloured.
    await page.locator('#message').fill('é'.repeat(100));
    await expect(page.locator('#msg-count')).toHaveClass(/over/);
    await expect(page.locator('#message')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#message').fill('short');
    await expect(page.locator('#msg-count')).not.toHaveClass(/over/);
    await expect(page.locator('#message')).toHaveAttribute('aria-invalid', 'false');
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
    await page.locator('#pinned-out details > summary').click();
    const rows = await page.locator('#pinned-out .case').count();
    const ok = await page.locator('#pinned-out .case-ok').count();
    expect(Number(total)).toBe(rows);
    expect(Number(agreed)).toBe(ok);
    expect(Number(agreed)).toBe(Number(total));
    await expect(verdict).toHaveAttribute('data-tone', 'pass');

    // THE REFUSAL FIGURE IS COUNTED, NOT QUOTED. The README said six when the
    // fixture held four; the page was right because it counts. This asserts the
    // page's sentence against the rows, so it cannot start quoting.
    const mustRefuse = await page
      .locator('#pinned-out .case-kind', { hasText: 'must refuse' })
      .count();
    expect(mustRefuse).toBeGreaterThan(0);
    expect(mustRefuse).toBeLessThan(rows);
    await expect(verdict).toContainText(`${mustRefuse} of the ${rows} are cases`);
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

  test('the on-ramp puts the first action near the top', async ({ page }) => {
    await boot(page, 'dark');
    // The intro was 493 words and put this button 1.3 screens down at 1280px and
    // 3.3 screens down at 320px — a beginner lab whose first action was below
    // three screens of prose. The depth moved into a disclosure rather than
    // being deleted, and this is the regression guard on that: a budget, not a
    // pixel value, so ordinary copy edits are free and another essay is not.
    const screens = await page.evaluate(() => {
      const button = document.querySelector('#make-pair');
      if (!button) return Infinity;
      return (button.getBoundingClientRect().top + window.scrollY) / window.innerHeight;
    });
    expect(screens, 'the first action must be within one screen at desktop width').toBeLessThan(1);
    // And the depth really is still available.
    await expect(page.locator('.intro-more')).toBeVisible();
    await expect(page.locator('.intro-more[open]')).toHaveCount(0);
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
    const shown = await fingerprintOf(page);

    // INDEPENDENT RE-DERIVATION of the headline claim: node:crypto over the
    // base64 the page disclosed. Two SHA-256 implementations in two processes,
    // agreeing about bytes the page published.
    await page.locator('#s1-out details > summary').click();
    const exported = tight(await page.locator('#s1-out .long-value-code').innerText());
    expect(refingerprint(exported)).toBe(shown);
    expect(b64(exported).length).toBe(294);
    await expect(page.locator('#s1-out .bytes-lede')).toContainText('294 bytes');

    // WHICH HALF IS SHAREABLE, in words and not only in colour.
    await expect(page.locator('.half-public .half-badge')).toHaveText('Shareable');
    await expect(page.locator('.half-private .half-badge')).toHaveText('Stays with you');
    // Both of the public half's jobs are named, and both of the private half's.
    await expect(page.locator('.half-public')).toContainText('verifies signatures');
    await expect(page.locator('.half-private')).toContainText('decrypts, and it signs');

    // The private half is described and never shown.
    const text = await page.locator('#app').innerText();
    expect(text).not.toMatch(/BEGIN (RSA )?PRIVATE KEY/);
  });

  test('Step 2 encrypts to the same pair Step 1 made, in one full block', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'locked');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    const fingerprint = await fingerprintOf(page);

    await page.getByRole('button', { name: 'Encrypt the note' }).click();
    const verdict = page.locator('[data-verdict="locked"]');
    await expect(verdict).toHaveAttribute('data-tone', 'pass');
    await expect(verdict.locator('.verdict-headline')).toHaveText('ENCRYPTED');
    // CROSS-CHECK across panels: Step 2 must name the pair Step 1 printed.
    await expect(verdict).toContainText(fingerprint);

    // INDEPENDENT RE-DERIVATION of the width: decode the hex the page disclosed
    // and count it, rather than reading the number printed beside it.
    await page.locator('#s2-out details > summary').click();
    const hex = tight(await page.locator('#s2-out .long-value-code').innerText());
    expect(hex).toMatch(/^[0-9a-f]+$/);
    const width = hex.length / 2;
    expect(width).toBe(256);
    await expect(verdict).toContainText('256 bytes');

    // PARTS-SUM-TO-WHOLE: the budget the page promises is the block width less
    // OAEP's two SHA-256 digests and two framing bytes.
    const promised = Number(
      (await page.locator('#step-2 [data-max-bytes]').first().innerText()).trim()
    );
    expect(promised).toBe(width - 2 * 32 - 2);

    await expect(page.locator('#s2-out .claim-note').first()).toContainText(
      'private half was not used'
    );
    // The fixed block size is scoped to notes that FIT, and does not claim to
    // hide metadata. "A one-word message from a hundred-word one" was wrong:
    // a hundred-word note does not fit in 190 bytes.
    const aside = await page.locator('#s2-out .aside-note').first().innerText();
    expect(aside).toContain('short enough to fit');
    expect(aside).toMatch(/does not hide that you sent something/);
  });

  test('Step 2 shows both encryptions side by side and compares them for you', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Encrypt the note' }).click();
    await expect(page.locator('.compare')).toHaveCount(0);

    await page.getByRole('button', { name: 'Encrypt the note' }).click();
    // Both previews stay on screen. Replacing the only one asked a beginner to
    // compare hex from memory, which is the one thing the button exists to show.
    const columns = page.locator('.compare .byte-strip-code');
    await expect(columns).toHaveCount(2);
    const [first, second] = await columns.allInnerTexts();
    expect(tight(second)).not.toBe(tight(first));
    // And the page states the comparison rather than leaving it to the eye.
    await expect(page.locator('#s2-out .claim-note').first()).toContainText(
      'completely different bytes'
    );
  });

  test('Step 3 returns exactly the note that was typed', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'opened');
    const note = 'Nineteen barrels, pier four, before the tide.';
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.locator('#message').fill(note);
    await page.getByRole('button', { name: 'Encrypt the note' }).click();
    await page.getByRole('button', { name: 'Open it with my private half' }).click();

    const verdict = page.locator('[data-verdict="opened"]');
    await expect(verdict).toHaveAttribute('data-tone', 'pass');
    await expect(verdict.locator('.verdict-headline')).toHaveText('OPENED');
    // CROSS-CHECK between two surfaces the page printed: the note the reader
    // typed and the text the page says came back.
    const typed = await page.locator('#message').inputValue();
    await expect(page.locator('#s3-out .recovered-text')).toHaveText(typed);
    expect(typed).toBe(note);
  });

  test('Step 3 wrong key is refused CALMLY, and the page names the cause', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'wrong-key');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    const mine = await fingerprintOf(page);
    await page.getByRole('button', { name: 'Encrypt the note' }).click();
    await page.getByRole('button', { name: 'Try a different private key' }).click();

    const verdict = page.locator('[data-verdict="wrong-key"]');
    await expect(verdict.locator('.verdict-headline')).toHaveText('DID NOT OPEN');
    // THE TONE IS THE CLAIM. A refusal here is the lock working, and the brief
    // requires it not read as a system error: `held`, never `fail`, never
    // `alarm`. Asserting the attribute is how that survives a palette edit.
    await expect(verdict).toHaveAttribute('data-tone', 'held');
    await expect(verdict).toContainText('does not open');

    // Two DIFFERENT pairs, named.
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
    const mine = await fingerprintOf(page);
    await page.getByRole('button', { name: 'Sign the note with my private half' }).click();

    const same = page.locator('[data-verdict="same-pair"]');
    await expect(same).toHaveAttribute('data-tone', 'pass');
    await expect(same.locator('.verdict-headline')).toHaveText('SAME PAIR');

    // CROSS-CHECK, and the load-bearing one in this lab: the two public-key
    // exports the page discloses must be byte-identical, because Step 4's whole
    // claim is that one pair does both jobs.
    await page.locator('#s4-same-out details > summary').click();
    const exports = await page.locator('#s4-same-out .long-value-code').allInnerTexts();
    expect(exports).toHaveLength(2);
    expect(tight(exports[0])).toBe(tight(exports[1]));
    expect(refingerprint(tight(exports[0]))).toBe(mine);

    const signed = page.locator('[data-verdict="signed"]');
    await expect(signed).toHaveAttribute('data-tone', 'pass');
    await expect(signed).toContainText(mine);
    // The readable note sits beside the signature, so the claim below it is a
    // demonstration rather than an assertion. Asserted against the OUTPUT
    // REGION rather than the verdict element: `render()` appends its extra
    // nodes as siblings of `[data-verdict]`, so a quote or a claim note is
    // never inside it.
    await expect(page.locator('#s4-sign-out')).toContainText('still perfectly readable');
    await expect(page.locator('#s4-sign-out .recovered-text')).toHaveText(
      await page.locator('#message').inputValue()
    );
    await expect(page.locator('#s4-sign-out .claim-note')).toContainText(
      'Sharing a signature does not hide the message'
    );

    await page.locator('#s4-sign-out details > summary').click();
    const sigHex = tight(await page.locator('#s4-sign-out .long-value-code').innerText());
    expect(sigHex.length / 2).toBe(256);
    await expect(signed).toContainText('256 bytes');

    await page.getByRole('button', { name: 'Check the signature' }).click();
    const checked = page.locator('[data-verdict="checked"]');
    await expect(checked).toHaveAttribute('data-tone', 'pass');
    await expect(checked.locator('.verdict-headline')).toHaveText('VERIFIED');
    // A SEAL, not an opening padlock: a verified signature unlocks nothing, and
    // reusing the lock glyph redraws the confusion this step exists to remove.
    await expect(checked.locator('.glyph-seal')).toHaveCount(1);
    await expect(checked.locator('.glyph-open')).toHaveCount(0);
  });

  test('Step 4 refuses an edited note, marks the change, and reports it honestly', async ({
    page,
  }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'checked');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Sign the note with my private half' }).click();
    await page.getByRole('button', { name: 'Change one character for me' }).click();

    const verdict = page.locator('[data-verdict="checked"]');
    await expect(verdict.locator('.verdict-headline')).toHaveText('DID NOT VERIFY');
    await expect(verdict).toHaveAttribute('data-tone', 'held');

    // INDEPENDENT RE-DERIVATION of the page's own claim about the edit: the test
    // finds the differing position itself by comparing the two quotes the page
    // printed, and the page's sentence must agree.
    const quotes = await page.locator('#s4-check-out .recovered-text').allInnerTexts();
    expect(quotes).toHaveLength(2);
    const [signedText, givenText] = quotes;
    // The second quote carries the "(changed)" marker text, so compare on the
    // value the checker box actually holds.
    const given = await page.locator('#checker-text').inputValue();
    expect(given).not.toBe(signedText);
    expect([...given].length).toBe([...signedText].length);
    const differing = [...signedText].reduce<number[]>(
      (acc, ch, i) => (ch === [...given][i] ? acc : [...acc, i + 1]),
      []
    );
    expect(differing).toHaveLength(1);
    expect(await verdict.innerText()).toContain(`${differing[0]}`);
    expect(givenText).toContain('(changed)');

    // The change is MARKED, not merely numbered.
    await expect(page.locator('.diff-mark')).toHaveCount(1);
    // And the signature itself was not touched — the honest shape of tampering.
    await expect(page.locator('#s4-check-out .claim-note')).toContainText(
      'signature was not touched'
    );
  });

  test('Step 4 scopes what a verified signature establishes', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Sign the note with my private half' }).click();
    await page.getByRole('button', { name: 'Check the signature' }).click();

    // THE TRUST BOUNDARY. "A signature is the part that says who" is too strong
    // on its own: verification ties a note to a KEY, and tying that key to a
    // person is a separate problem this page does not solve. It must be visible
    // in the state where a reader is most likely to over-read the result.
    const scope = page.locator('#s4-check-out .negative-claim');
    await expect(scope).toBeVisible();
    await expect(scope).toContainText('really is Maya');
    await expect(scope).toContainText('nothing on this page establishes that');
    expect(await scope.evaluate((n) => n.closest('details') !== null)).toBe(false);
    await expect(page.locator('#s4-check-out .aside-note')).toContainText(
      'says nothing about whether the note is true'
    );
  });

  test('the page never says signing is the pair run backwards', async ({ page }) => {
    await boot(page, 'dark');
    // The one genuinely misleading claim this lab used to make. RSAES-OAEP and
    // RSASSA-PSS are different constructions, and PSS verification does not
    // decrypt a signature to recover a message — "backwards" describes the raw
    // trapdoor, not either scheme, and a beginner who takes it literally ends up
    // believing a signature is a secret in reverse.
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Sign the note with my private half' }).click();
    const text = (await page.locator('#app').innerText()).replace(/\s+/g, ' ');

    // The page is ALLOWED to use the word while denying it — "it is not
    // encryption run backwards" is the correct teaching sentence and the page
    // says it on purpose. What is forbidden is an AFFIRMATIVE use. So every
    // occurrence must be negated: a blanket ban would have failed on the very
    // sentence that fixes the misconception, which is how a well-meant guard
    // ends up deleting the correction instead of the error.
    for (const match of text.matchAll(/(.{0,24})(backwards|in reverse|the other way round)/gi)) {
      expect(
        match[1],
        `"${match[2]}" is used affirmatively here: "...${match[1]}${match[2]}..."`
      ).toMatch(/\bnot\b|\bnever\b/i);
    }
    expect(text).not.toMatch(/the same pair,? backwards/i);
    expect(text).not.toMatch(/That is all a signature is|not a second system/i);
    // And the true version IS said.
    await expect(page.locator('#s4-head')).toContainText('a different job');
    await expect(page.locator('#s4-same-out .claim-note')).toContainText(
      'not encryption run backwards'
    );
  });
});

/**
 * State semantics — every one of these was a live defect found by driving the
 * built page, and every one of them shipped past a green suite.
 */
test.describe('a result always describes inputs that are still on screen', () => {
  test('a control whose prerequisite is missing is disabled and says what is missing', async ({
    page,
  }) => {
    await boot(page, 'dark');
    // Check and tamper used to enable the moment a PAIR existed, because Step 4
    // had one section-wide gate. Pressing Check then rendered nothing at all — a
    // button that looks available and silently does nothing, which teaches a
    // beginner only that the page is broken.
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await expect(page.locator('#sign-msg')).toBeEnabled();
    await expect(page.locator('#check-sig')).toBeDisabled();
    await expect(page.locator('#tamper-msg')).toBeDisabled();
    await expect(page.locator('#step-4 .gate-note')).toContainText('Sign the note first');
    // Opening needs a ciphertext, not a pair.
    await expect(page.locator('#open-lock')).toBeDisabled();
    await expect(page.locator('#step-3 .gate-note')).toContainText('Lock a note in Step 2 first');

    await page.getByRole('button', { name: 'Sign the note with my private half' }).click();
    await expect(page.locator('#check-sig')).toBeEnabled();
    await expect(page.locator('#step-4 .gate-note')).toBeHidden();
  });

  test('editing the note supersedes every result that quoted it', async ({ page }) => {
    await boot(page, 'dark');
    await fullRun(page);
    expect(await statusOf(page)).toMatchObject({
      locked: 'fresh',
      opened: 'fresh',
      signed: 'fresh',
      checked: 'fresh',
    });

    await page.locator('#message').fill('A different note entirely.');

    // All four, not just two. `locked` and `signed` retired while `opened` and
    // `checked` stayed green quoting a note that was no longer in the box — the
    // stricter reading was right about the cryptography and wrong about the page.
    expect(await statusOf(page)).toMatchObject({
      locked: 'stale',
      opened: 'stale',
      signed: 'stale',
      checked: 'stale',
    });
    // The pair did not change, so the same-pair proof is still true.
    expect((await statusOf(page))['same-pair']).toBe('fresh');

    // And the notice names the NEXT ACTION, not the machinery.
    const notice = page.locator('[data-verdict-retired="locked"]');
    await expect(notice.locator('.verdict-headline')).toHaveText('OUT OF DATE');
    await expect(notice).toContainText('Encrypt this version again');
    await expect(page.locator('[data-verdict-retired="signed"]')).toContainText(
      'Sign this version again'
    );
  });

  test('re-encrypting supersedes the result that opened the previous block', async ({ page }) => {
    await boot(page, 'dark');
    await fullRun(page);
    // The worst version of this defect: a fresh ENCRYPTED verdict with the
    // previous OPENED verdict still standing green beneath it, quoting the old
    // note, reading as evidence about the block now on screen.
    await page.getByRole('button', { name: 'Encrypt the note' }).click();
    await expect(page.locator('[data-verdict="locked"]')).toBeVisible();
    const status = await statusOf(page);
    expect(status.locked).toBe('fresh');
    expect(status.opened).toBe('stale');
  });

  test('a new pair supersedes everything downstream of it', async ({ page }) => {
    await boot(page, 'dark');
    await fullRun(page);
    const before = await fingerprintOf(page);
    await page.getByRole('button', { name: 'Make another pair' }).click();
    // Waiting for `[data-verdict="pair-made"]` to be VISIBLE proves nothing here
    // -- the previous pair's verdict is already on screen, so the assertion
    // resolves instantly and the rest of the test reads a page where keygen has
    // not finished. Wait for something only the NEW pair can produce.
    await expect(page.locator('[data-verdict="pair-made"]')).not.toContainText(before);
    const status = await statusOf(page);
    for (const marker of ['locked', 'opened', 'signed', 'checked']) {
      expect(status[marker], `${marker} must not survive a new pair`).not.toBe('fresh');
    }
    // And the checker copy is gone with it, rather than describing an old pair.
    await expect(page.locator('#checker-wrap')).toBeHidden();
    await expect(page.locator('#check-sig')).toBeDisabled();
  });

  test('re-entering the SAME note does not supersede a fresh result', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Encrypt the note' }).click();
    await page.getByRole('button', { name: 'Open it with my private half' }).click();

    // The no-op guard. `fill()` dispatches a real `input` event, so the page's
    // listener runs and recomputes the basis — it just recomputes an identical
    // one. A page that retired on every keystroke rather than on every CHANGE
    // would fail here, and that is the easy mistake to make.
    const unchanged = await page.locator('#message').inputValue();
    await page.locator('#message').fill(unchanged);
    const status = await statusOf(page);
    expect(status.locked).toBe('fresh');
    expect(status.opened).toBe('fresh');
  });

  test('tampering changes one VISIBLE character, even an emoji', async ({ page }) => {
    await boot(page, 'dark');
    // `text[text.length - 1]` is a UTF-16 code unit, not a character. Signing
    // "Hello <lock>" and pressing tamper produced "Hello \ud83dx" — a lone
    // surrogate, which renders as a replacement glyph. The demonstration worked
    // and the page was unreadable, so a reader could not learn the lesson from
    // the line that was supposed to teach it.
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.locator('#message').fill('Hello \u{1F512}');
    await page.getByRole('button', { name: 'Sign the note with my private half' }).click();
    await page.getByRole('button', { name: 'Change one character for me' }).click();

    const given = await page.locator('#checker-text').inputValue();
    // No unpaired surrogate anywhere in it.
    expect(given).not.toMatch(/[\uD800-\uDFFF]/);
    expect(given).not.toContain('�');
    // One grapheme changed, and the lengths match.
    expect([...given].length).toBe([...'Hello \u{1F512}'].length);
    await expect(page.locator('[data-verdict="checked"]')).toHaveAttribute('data-tone', 'held');
  });

  test('the reader can tamper by hand, not only by button', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    await page.getByRole('button', { name: 'Sign the note with my private half' }).click();
    const signed = await page.locator('#checker-text').inputValue();

    await page.locator('#checker-text').fill(`${signed} and bring the money.`);
    await page.getByRole('button', { name: 'Check the signature' }).click();
    await expect(page.locator('[data-verdict="checked"]')).toHaveAttribute('data-tone', 'held');

    // Editing the checker copy must leave the SIGNED snapshot alone, which is
    // the honest shape: the signature is untouched and the document moved.
    await expect(page.locator('#s4-check-out .recovered-text').first()).toHaveText(signed);
    await expect(page.locator('#message')).toHaveValue(signed);

    // Putting it back verifies again, with no new signature.
    await page.locator('#checker-text').fill(signed);
    await page.getByRole('button', { name: 'Check the signature' }).click();
    await expect(page.locator('[data-verdict="checked"]')).toHaveAttribute('data-tone', 'pass');
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
test.describe('the negative claim: a note that opens does not say who sent it', () => {
  test('every check passes, and the message is unattributed anyway', async ({ page }) => {
    await boot(page, 'dark');
    witness(test.info().title, 'unattributed');

    // 1. REACH THE FIXTURE, through the controls a reader has.
    await page.getByRole('button', { name: 'Make a key pair' }).click();
    const typed = await page.locator('#message').inputValue();
    await page.getByRole('button', { name: 'Encrypt the note' }).click();
    await page.getByRole('button', { name: 'Open it with my private half' }).click();
    await page.getByRole('button', { name: 'Let a stranger use my public half' }).click();

    const fixture = page.locator('[data-verdict="unattributed"]');
    await expect(fixture).toBeVisible();

    // 2. EVERYTHING IS GREEN — asserted against the RENDERED verdicts, not a
    // flag this test set. No verdict anywhere may be in the `fail` tone, nothing
    // may be superseded, and the opened and encrypted verdicts must still be
    // passing: the stranger's block opened because the mechanism works.
    await expect(page.locator('[data-verdict][data-tone="fail"]')).toHaveCount(0);
    await expect(page.locator('[data-verdict-retired]')).toHaveCount(0);
    for (const marker of ['pair-made', 'locked', 'opened', 'pinned']) {
      await expect(page.locator(`[data-verdict="${marker}"]`)).toHaveAttribute(
        'data-tone',
        'pass'
      );
    }
    await expect(fixture.locator('.verdict-headline')).toHaveText('OPENED — AND UNATTRIBUTED');
    await expect(fixture).toHaveAttribute('data-tone', 'alarm');
    await expect(fixture).toContainText('Every check this page performs reports success');

    // The property really is violated: the text that came back is NOT the text
    // the reader typed, and the reader's own private half opened it.
    const recovered = await page.locator('#s3-stranger-out .recovered-text').innerText();
    expect(recovered).not.toBe(typed);
    expect(recovered.length).toBeGreaterThan(0);

    // 3. THE LIMITATION IS ON SCREEN IN THIS STATE — visible, and tied to this
    // fixture rather than floating somewhere else on the page.
    const claim = page.locator('#s3-stranger-out .negative-claim');
    await expect(claim).toBeVisible();
    await expect(claim).toContainText('does not tell you who sent it');
    await expect(claim).toContainText('anyone holding the public half');
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
    await page.getByRole('button', { name: 'Encrypt the note' }).click();
    await page.getByRole('button', { name: 'Let a stranger use my public half' }).click();
    // The hand-off is a real link to a real section, not a sentence about one.
    await expect(page.locator('#s3-stranger-out .handoff a')).toHaveAttribute('href', '#step-4');
    await expect(page.locator('#step-4')).toBeVisible();

    await page.getByRole('button', { name: 'Sign the note with my private half' }).click();
    await page.getByRole('button', { name: 'Check the signature' }).click();
    await expect(page.locator('#s4-check-out .claim-note')).toContainText(
      'Now compare this with Step 3'
    );
  });
});

test.describe('the signing-role question, kept and scoped', () => {
  test('names the halves, and does not call separate signing keys a mistake', async ({ page }) => {
    await boot(page, 'dark');
    // It ships shut, like every disclosure here, so a reader opens it first and
    // so does this test. Clicking into a closed <details> would time out on
    // visibility rather than on the assertion, which reads as a broken page.
    await page.locator('details', { has: page.getByText(/which half did which job/) })
      .locator('> summary')
      .click();
    const wrong = page.locator('#check-roles .check-opt', { hasText: 'A separate signing key' });
    await wrong.click();
    const result = page.locator('#check-roles .check-result');
    await expect(result).toHaveClass(/pill-bad/);
    // Scoped to what THIS demo generated. Separate signing and encryption keys
    // are normal practice, so the distractor must be wrong about this page
    // without being wrong about the world.
    await expect(result).toContainText('This demo generated exactly ONE pair');
    await expect(result).toContainText('real systems often DO keep separate keys');

    await page.locator('#check-roles .check-opt').first().click();
    await expect(result).toHaveClass(/pill-ok/);
    await expect(result).toContainText('The half you keep is the half that signs');
  });
});

test.describe('the recap says what each job does not establish', () => {
  test('every row names a key and a limit', async ({ page }) => {
    await boot(page, 'dark');
    const rows = page.locator('.recap-table tbody tr');
    await expect(rows).toHaveCount(4);
    // The two encryption rows must BOTH deny sender identification — that is the
    // lesson of Step 3, restated where a reader can take it away.
    await expect(rows.nth(0)).toContainText('Who sent the note');
    await expect(rows.nth(1)).toContainText('Who sent the note');
    // And the signature rows must deny secrecy and identity respectively.
    await expect(rows.nth(2)).toContainText('Secrecy');
    await expect(rows.nth(3)).toContainText('Whose key it is');
  });

  test('the closing questions explain the mechanism, not just the answer', async ({ page }) => {
    await boot(page, 'dark');
    // A wrong answer has to teach. Picking the plausible-but-wrong option on the
    // identity question must produce the explanation, not a bare "incorrect".
    const wrong = page.locator('#scenario-3 .check-opt', {
      hasText: 'a valid signature proves the sender',
    });
    await wrong.click();
    const result = page.locator('#scenario-3 .check-result');
    await expect(result).toHaveClass(/pill-bad/);
    await expect(result).toContainText('still perfectly valid and the attribution is still wrong');

    const right = page.locator('#scenario-3 .check-opt', { hasText: 'really is Maya' });
    await right.click();
    await expect(result).toHaveClass(/pill-ok/);
    await expect(result).toContainText('Verification ties a note to a KEY');
  });
});
