import { expect, test } from '@playwright/test';
import {
  NARROWEST,
  PHONE,
  WIDE,
  boot,
  driveAllStates,
  expectBaselineNotStale,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches, and every state is scanned at
 * each of three widths: the arrival state exactly as a reader gets it, with no
 * pair made and three steps gated; the shared skip link focused; Step 1's pair
 * and its base64 disclosure; both of Step 2's refusals — an empty note, and 200
 * UTF-8 bytes typed inside a 190-byte budget — then the locked block, its
 * disclosure, and a copy button in its just-clicked state; Step 3's opened
 * verdict, its CALM wrong-key refusal, and the negative-claim fixture where
 * every check passes and the message is unattributed anyway; Step 4's same-pair
 * proof, its two disclosures, the verified signature and the tampered check;
 * the quick check answered wrong and then right; a changed note retiring the
 * stale verdicts; four hover states; and three focus rings.
 *
 * All four verdict tones are reached, which is the reason the drive is as long
 * as it is: on this page the tone carries the teaching, and a tone nothing
 * drives is a tone nothing measures.
 *
 * See `gate.ts` for why nothing is injected into the page (the retired gate's
 * `addStyleTag` motion kill bypassed the stylesheet's own reduced-motion block,
 * so the rendering reduced-motion readers get was never the one scanned), why
 * every disclosure is opened through its own `<summary>` rather than from
 * script, why the arrival state is asserted at length rather than assumed, and
 * why `violations` is not the whole oracle.
 */

const WIDTHS = [
  { label: '1280px', size: WIDE },
  { label: '390px', size: PHONE },
  { label: '320px', size: NARROWEST },
] as const;

for (const { label, size } of WIDTHS) {
  test(`no WCAG A/AA violations in dark theme at ${label}`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    await page.setViewportSize(size);
    await boot(page, 'dark');
    await driveAllStates(page, `dark @${label}`);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });
}
