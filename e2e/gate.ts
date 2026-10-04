import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * The three widths every state is scanned at.
 *
 * WIDE is the two-column rendering: the hero's why-box beside its title block,
 * the two halves of the pair side by side, the pinned cases on one row each.
 * PHONE is the single-column one. NARROWEST is 320px, which is the floor WCAG
 * 1.4.10 names and the width at which this page's hazards actually live — a
 * 512-character hex run, two `auto-fit` grids whose automatic minimum size is
 * the min-content width of their widest child, and a monospace byte strip.
 * 390 passes those by a margin that 320 does not, so scanning only a "phone"
 * width would miss them.
 */
export const WIDE = { width: 1280, height: 900 };
export const PHONE = { width: 390, height: 844 };
export const NARROWEST = { width: 320, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Copied from `crypto-lab-schnorr-forge` — the gate verified clean on every
 * known oracle defect, including the per-side `paintedSides` fix that 129 of the
 * fleet's 131 `nontext.ts` files still lack — and then rewritten passage by
 * passage for what THIS lab paints. The oracle engines in `contrast.ts` and
 * `nontext.ts` are byte-identical to that lab's; everything that describes a
 * page is about this one.
 *
 * Five rules govern everything here, and each one corrects something the
 * retired template gate did:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The old spec pushed
 *     `animation:none!important; transition:none!important` through
 *     `addStyleTag`, which BYPASSES a lab's own
 *     `@media (prefers-reduced-motion: reduce)` block instead of exercising it.
 *     This lab's block is the whole of its motion story — there are no
 *     keyframes at all, only hover and skip-link transitions — so the thing
 *     worth measuring is that the block is in effect and that nothing
 *     disappeared once it was. The preference is set through `emulateMedia`,
 *     asserted from inside the page (`test.use({ reducedMotion })` is a
 *     measured no-op on Playwright 1.61.x), and nothing is injected.
 *
 *  2. IT FORCED EVERY PANEL VISIBLE FROM SCRIPT. The old drive stripped every
 *     `[hidden]` attribute and set every `<details>.open` by JS before its only
 *     scan — so the SHUT state, which is what every reader arrives at, was
 *     never scanned, and the `[hidden]` cascade trap became invisible. This lab
 *     has four disclosures and two gate notes that all ship shut or hidden, and
 *     this gate opens each one through its own `<summary>` or its own button,
 *     scanning before and after.
 *
 *  3. IT DROVE BLIND AND THEN THREW THE STATES AWAY. The old drive clicked
 *     every button matching a regex, swallowed every failure with
 *     `.catch(() => {})`, waited a fixed 120ms, and scanned ONCE at the end.
 *     Every interesting rendering in this lab is destroyed by the next click:
 *     the locked verdict is replaced by the opened one, the opened one by the
 *     stranger's, the verified one by the tampered one. So this drive names
 *     every control it touches, asserts a real completion signal after each,
 *     and scans after every step, at all three widths.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. Every surface that
 *     carries this lab's meaning is a `color-mix()` fill axe files under
 *     `incomplete` rather than judging: all four verdict tones, the retirement
 *     notice, the negative-claim box, both quick-check pills, the two halves of
 *     the pair and the hero aside. A violations-only gate measured almost none
 *     of this page.
 *
 *  5. IT HAD NO REFLOW, NON-TEXT-CONTRAST OR GENERATED-CONTENT ORACLE. The old
 *     spec hand-rolled one luminance check over two input selectors, reading
 *     DECLARED colours — blind to `color-mix()`, to composited backdrops, and
 *     to every state past first paint. `nontext.ts` replaces it with a measured
 *     oracle over every control at every driven state, and
 *     `expectNoHorizontalOverflow` adds the 1.4.10 check axe has no rule for —
 *     which on this page, at 320px, is the check most likely to bite.
 */
/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough. A transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will happily report it: elsewhere in
 * this fleet that produced a phantom 2.00:1 failure on a button whose settled
 * ratio is 9:1. Transitions also drain in waves rather than in one batch, so a
 * poll for "nothing running right now" can exit through a gap between waves —
 * hence six consecutive quiet frames rather than one.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * animations that never finish (`iterations: Infinity`) are excluded from the
 * quiescence test rather than waited on, a wall-clock budget inside the page
 * gives up and proceeds, and Playwright's own timeout is the backstop.
 *
 * This lab declares NO keyframes, so under the reduced motion this gate asserts
 * there is normally nothing running and this returns on the sixth frame. It
 * stays for two reasons: the shared top bar's `.cl-btn` transitions are declared
 * OUTSIDE this lab's `@media` block and are only cancelled by its
 * `* { transition: none !important }` — a property of today's stylesheet rather
 * than of the page — and the copy button's label revert is a real timer the
 * drive has to not race.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        // An infinite decorative animation never drains; waiting on it hangs.
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set.
 *
 * THIS LAB IS CURRENTLY IMMUNE BY CONSTRUCTION, and the assertion is how that
 * stays true. `src/style.css` declares no `@keyframes` whatever, so no content
 * here is parked at `opacity: 0` waiting for an animation's `forwards` fill to
 * reveal it, and the reduced-motion block has nothing to cancel but hover and
 * skip-link transitions. The shape is a real hazard in this fleet — patron-shield
 * scanned both its query masks invisible in every run — and it would arrive here
 * the first time somebody animates a verdict in, which is a natural thing to want
 * for a page built out of verdicts. Running it at every state means that edit
 * fails this rather than shipping.
 *
 * `aria-hidden` subtrees are excluded; what this lab hides is the padlock, key,
 * tick, cross and warning glyphs, each beside words that say the same thing —
 * and `scan()` measures their contrast separately with the exemption lifted.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page
 * is created. Attach before `boot`, assert after the drive.
 *
 * This matters more here than in a lab whose panels render at mount. Every
 * verdict on this page is rendered by a click handler, and `mountPinned()` is
 * deliberately not awaited — so a renderer that throws leaves an EMPTY output
 * region, and an empty region is exactly what a scan reports as perfectly
 * accessible. The pinned section is the sharpest case: it runs real WebCrypto on
 * arrival with nobody waiting on the promise, so a rejection there would be
 * silent in the DOM and loud only here.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * The shared `.cl-topbar` carries an explicit `role="banner"`. This lab's hero is
 * a `<div class="cl-hero">` and not a `<header>`, so nothing here implies a
 * second banner today — but the shared bar ships `dedupeBanner()` because other
 * labs in this fleet DID ship one, and the hero markup is the part of this page
 * most likely to be re-templated from a lab that uses `<header>`. The page's one
 * real `<header>`-shaped element, the `.scripture-footer`, is a `<footer>`.
 * Asserting the OUTCOME rather than the markup is what catches that edit.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * List semantics survive their styling.
 *
 * This lab has two lists and both are styled `list-style: none`, which is exactly
 * the declaration that makes Safari and VoiceOver DROP a list's implicit role:
 * `ol.case-list` (the pinned cases) and `ul.check-opts` (the quick check's
 * answers). Both compensate the documented way — an explicit `role="list"` on the
 * container and `role="listitem"` on every child — so here, unlike most of this
 * fleet, an explicit role on a list is the fix rather than the defect.
 *
 * What is asserted is therefore the SHAPE of that fix: any explicit role on a
 * `ul`/`ol` must be `list` (any other value orphans every `<li>` under it), and a
 * `role="list"` must never sit on an empty element, because axe applies
 * `aria-required-children` to the explicit role and fails it the day the pinned
 * list renders with no rows — which, since `mountPinned()` builds it from an
 * un-awaited async run, is a state this page can really reach.
 *
 * Roles can be assigned as JS properties rather than attributes, so this asks the
 * DOM rather than grepping the source. `src/ui/dom.ts` sets them with
 * `setAttribute` for that reason.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els
      .filter((e) => e.getAttribute('role') !== 'list' || e.children.length === 0)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] with ${e.children.length} children`
      )
  );
  expect(
    broken,
    'an explicit non-list role on a list deletes its semantics; an empty role="list" fails aria-required-children'
  ).toEqual([]);
}

/**
 * Shared setup. Runs before EVERY test that imports it, so an assertion here
 * fails all of them at once, under whatever name those tests carry.
 *
 * SO THIS FUNCTION ASSERTS STRUCTURE AND NEVER PRODUCT COPY. On 2026-09-26
 * crypto-lab-mceliece-gate changed one textarea's default string; its `gate.ts`
 * still asserted the old sentence, `boot()` threw, both axe runs failed, the
 * build job failed, the deploy was skipped, and `deploy-sync` reported the lab
 * stale. The step that went red was called "Accessibility gate", and four of its
 * six a11y tests had passed. For three days the live site served security claims
 * that `main` had already corrected, and the one red thing in sight named the
 * wrong subject.
 *
 * Structure is: the control EXISTS, the arrival state is the one that ships,
 * counts, `[hidden]`/`toBeEmpty()` on regions nothing has rendered into yet,
 * `details[open]` at zero, no theme control, and a default matching a SHAPE
 * rather than a sentence. What a string SAYS belongs in `e2e/claims.spec.ts`,
 * where a failure names copy as the subject — including the one assertion this
 * lab would most want here, that the note box arrives holding its own example
 * sentence.
 *
 * The arrival state is worth asserting at this length because it is unusual: the
 * lab deliberately does NOTHING at mount except run the pinned cases. No pair
 * exists, every output region is empty, and Steps 2 to 4 are gated. A navigation
 * that resolves proves none of that — a `main.ts` that threw before `applyGates()`
 * would leave the buttons enabled, and an enabled button over a null pair is a
 * silent no-op a scan would call accessible.
 *
 * The theme is seeded through `localStorage` rather than by clicking a toggle
 * (there is none), which pins down a real coupling as a side effect: index.html's
 * anti-flash script WRITES `theme` and this reads it back off `data-theme`. If the
 * script were ever dropped or renamed, this fails on `data-theme` rather than
 * quietly scanning an unpinned page.
 */
export async function boot(page: Page, theme: 'dark'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the whole
  // test timeout and reports nothing useful. 30s turns that silent hang into a
  // named failure naming the locator — generous because real 2048-bit keygen
  // happens behind several of these clicks.
  page.setDefaultTimeout(30_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await assertSingleBanner(page);

  // ── The page really rendered ────────────────────────────────────────────
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  // Four numbered steps, the recap, and the pinned section. A fifth numbered
  // step, or a lost one, is a change to the shape of the lab and should fail
  // here rather than silently.
  await expect(page.locator('main > section.step')).toHaveCount(6);
  for (const id of ['step-1', 'step-2', 'step-3', 'step-4', 'recap', 'pinned-section']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }

  // The shared skip link points at an id that exists. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it — a skip link
  // aimed at a missing element is exactly the kind of thing a green axe run says
  // nothing about.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#app')).toHaveCount(1);

  // Dark is the only theme, so the page must carry no theme control at all —
  // not the shared bar's, which was removed, and not a lab-local one.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, .theme-toggle-btn, [data-theme-toggle]')
  ).toHaveCount(0);
  await expect(page.locator('#cl-theme-toggle')).toHaveCount(0);

  // ── Arrival: no pair, nothing computed, every action gated ──────────────
  for (const id of ['s1-out', 's2-out', 's3-out', 's3-wrong-out', 's3-stranger-out',
                    's4-same-out', 's4-sign-out', 's4-check-out']) {
    await expect(page.locator(`#${id}`)).toBeEmpty();
  }
  // Exactly ONE verdict exists on arrival and it is the pinned run's, which is
  // the only thing this lab computes without being asked. Asserted as a total
  // rather than per-marker so a panel that started auto-running on mount — the
  // easy way to lose the "press the button" moment Step 1 is built around —
  // fails here.
  await expect(page.locator('[data-verdict]')).toHaveCount(1);
  await expect(page.locator('[data-verdict="pinned"]')).toHaveCount(1);

  // GATING IS PER CONTROL, and that is the structural fact worth asserting.
  // Step 4 used to carry one section-wide gate on "a pair exists", so Check and
  // tamper enabled with no signature and then silently did nothing when pressed.
  // Every gated control declares its own prerequisite in markup; on arrival the
  // only enabled action in the whole document is Step 1's button.
  const gated = page.locator('button[data-needs]');
  const gatedCount = await gated.count();
  expect(gatedCount, 'the steps must declare their prerequisites in markup').toBeGreaterThan(3);
  await expect(page.locator('button[data-needs]:disabled')).toHaveCount(gatedCount);
  await expect(page.locator('#make-pair')).toBeEnabled();
  for (const step of ['step-2', 'step-3', 'step-4']) {
    await expect(page.locator(`#${step} .gate-note`)).toBeVisible();
    await expect(page.locator(`#${step} .gate-note`)).not.toBeEmpty();
  }

  // The next-step links appear only once a step has produced something, so on
  // arrival every one of them is hidden and empty.
  await expect(page.locator('.next-step-link')).toHaveCount(0);

  // The checker copy does not exist until there is a signature to check.
  await expect(page.locator('#checker-wrap')).toBeHidden();

  // WebCrypto is present in this browser, so the unavailable banner stays shut.
  // Asserting it HIDDEN rather than absent keeps the element — and the branch
  // that shows it — in the document where a reader of this file can find it.
  await expect(page.locator('#unavailable')).toBeHidden();

  // ── Shipped control defaults, as SHAPES ─────────────────────────────────
  await expect(page.locator('#message')).not.toHaveValue('');
  await expect(page.locator('[data-max-bytes]').first()).toHaveText(/^\d+$/);
  await expect(page.locator('#msg-count')).toHaveText(/^\d+ of \d+ bytes used$/);
  await expect(page.locator('#message')).toHaveAttribute('aria-invalid', 'false');
  // The counter and the limit note are the textarea's own description, so the
  // reason a note is refused is announced rather than only painted.
  await expect(page.locator('#message')).toHaveAttribute(
    'aria-describedby',
    'msg-count limit-note'
  );

  // ── Disclosures ship shut ───────────────────────────────────────────────
  await expect(page.locator('details[open]')).toHaveCount(0);
  // The on-ramp disclosure, three predictions, and the pinned case list.
  await expect(page.locator('details')).toHaveCount(5);

  // ── The pinned run finishes, because nothing awaits it ──────────────────
  await expect(page.locator('#pinned-out [data-verdict="pinned"]')).toBeVisible();

  // ── The closing questions are rendered, and unanswered ──────────────────
  // Three questions, each with real options and an unanswered result. The
  // per-question shape is asserted rather than one magic total: a total is the
  // kind of number that is wrong on the first write (it was, by one) and tells
  // you nothing about WHICH question lost its options.
  await expect(page.locator('#recap .scenario')).toHaveCount(3);
  await expect(page.locator('#recap .check-result')).toHaveCount(3);
  for (const n of [1, 2, 3]) {
    const options = page.locator(`#scenario-${n} .check-opt`);
    expect(
      await options.count(),
      `scenario ${n} must offer a choice, not a single button`
    ).toBeGreaterThan(1);
    await expect(page.locator(`#scenario-${n} .check-q`)).not.toBeEmpty();
    await expect(page.locator(`#scenario-${n} .check-result`)).toBeEmpty();
  }

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and on this page it
 * is the oracle most likely to find something, because the lab's longest values
 * are 512-character hex runs and its layout is built from two `auto-fit` grids.
 *
 * Three shapes are at risk and all three are deliberately defended in
 * `src/style.css` rather than hidden behind a scroller:
 *
 *  - the full locked block, the full signature and both base64 public-key
 *    exports, which wrap through `overflow-wrap: anywhere` plus
 *    `word-break: break-all` instead of scrolling;
 *  - `.halves`, `.jobs` and `.case-list`, whose grid items carry `min-width: 0`
 *    because a grid item's automatic minimum size is the min-content width of
 *    its widest child — which for an unbroken hex run is the whole run;
 *  - the monospace `.byte-strip-code`, 32 bytes of spaced hex.
 *
 * At 320px that is precisely what this check exists to catch, which is why 320
 * is scanned and not only a comfortable phone width. Both of this lab's real
 * reflow defects were found here, and only one of them at 390px: the standard
 * hero's `.cl-hero-why` adding its own padding to a `width: 100%` under
 * `content-box` (411px against 390), and `.source-line` running its two
 * underscore-joined upstream filenames to 321px inside a 260px box (351px
 * against 320). Each is fixed in `src/style.css` with the measurement recorded
 * beside it.
 *
 * ONE LIMITATION OF THE REPORT, worth knowing before chasing a finding. The
 * culprit search looks for an ELEMENT whose bounding rect extends past the
 * viewport, and the second defect above had none: the inline content overflowed
 * a box that kept its own width, so `widest` read "(none identified)" while
 * `scrollWidth` was plainly 351. When that happens the element is still findable
 * — walk `body *` for `scrollWidth > clientWidth + 1` instead of comparing
 * rects — and the shape to look for is a long unbreakable token, not a wide box.
 * The engine is deliberately left byte-identical to the lab it came from rather
 * than forked to improve this, so the knowledge lives here.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * This lab avoids scrollers on purpose — every long value wraps — so the
 * assertion is usually vacuous here. It runs at every state anyway, because the
 * requirement MATERIALISES the moment someone reaches for `overflow-x: auto` on
 * a byte strip or the pinned case list, which is the obvious first instinct for
 * both, and a scroller born without a keyboard route is invisible to axe.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps
 * `tabIndex: 0`, so a keyboard reader tabs to a control that is not on screen and
 * the focus ring lands nowhere. `display: none` and `visibility: hidden` DO remove
 * an element from the tab order, so those are skipped rather than flagged — the
 * failure is specifically the invisible-but-tabbable pair.
 *
 * Two shapes on this page are legitimately near that line and neither is flagged.
 * The disabled controls in a gated step are at `opacity: .5` and are removed from
 * the tab order by `disabled`, not by CSS. The `.out:empty { display: none }` rule
 * takes the `display` route, which is why eight empty output regions on arrival
 * contribute nothing to the tab order.
 *
 * Off-screen-but-focusable is the WCAG-sanctioned skip-link idiom and is
 * deliberately not flagged: the shared skip link parks at `top:-3rem` with full
 * opacity and slides in on focus. The drive scans it focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      // display:none / visibility:hidden already remove it from the tab order.
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        effective *= parseFloat(getComputedStyle(n).opacity);
      }
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      // Confirm it really is reachable rather than inferring it.
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()}` +
            ` (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run.
 * It is a debugging aid only: `A11Y_COLLECT` is never set in CI, and a run
 * with it set prints every finding as it happens and then fails at the end, so
 * a green collection run cannot be mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    // Generous, not 900: a truncated oracle dump is how a second and third
    // finding in the same state get missed on a collection pass.
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no
 * text node.
 *
 * IT IS CALLED FROM `scan()`, deliberately and not by accident. Fleet-wide
 * this oracle had been called from inside a soft wrapper AFTER its
 * `if (!COLLECTING) return` guard — so in a strict run, which is every run in
 * CI and every run anyone reads as a pass, the guard returned first and
 * `nontext.ts` never executed at all. Thirteen repos certified themselves
 * clean on an oracle that had never looked. Calling it here means it runs at
 * every driven state, including `:hover`, and this repo's baseline was
 * captured by that live path.
 *
 * A check that merely logs is not a gate, so it ratchets: anything NOT in the
 * baseline fails, anything in the baseline that got WORSE fails, and anything
 * in the baseline that has been FIXED fails until its entry is deleted. That
 * last rule is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the
 * point — or the drive stopped reaching the state that shows it, which is a
 * coverage regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Nine assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those ratios
 *    arithmetically — which matters here because EVERY surface carrying this
 *    lab's meaning is a `color-mix()` fill axe refuses to resolve: all four
 *    verdict tones, the retirement notice, the negative-claim box, both
 *    quick-check pills, the two halves of the pair, the two job boxes, the
 *    hero aside and the shared bar's ink. Everything else in that bucket is a
 *    real result axe simply could not finish — including `aria-prohibited-attr`,
 *    which is where an `aria-label` on a role-less element hides, and
 *    `aria-required-children`, which is where an empty `role="list"` hides. This
 *    page leans on both: `ol.case-list` and `ul.check-opts` carry explicit list
 *    roles, and the pinned list is built from an un-awaited async run.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - the same walk over `aria-hidden` content with the exemption lifted — SC
 *    1.4.3 is about what a reader SEES, and what this lab hides is its padlock,
 *    key, tick, cross and warning glyphs, each painted in a semantic ink on its
 *    own `color-mix()` tint. See `contrast.ts`.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted; see
 *    `expectNoNewNonTextFailures`. This is the only oracle that judges a
 *    control's boundary against the surface OUTSIDE it, which is what caught the
 *    primary button drawing its border in its own fill colour.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first —
  // the axe-core/playwright source says so in as many words on `withRules`
  // ("Cannot be used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])`, axe runs those FOUR
  // best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass. For scale, `withTags(TAGS)` selects 69 of
  // axe-core 4.12's 105 rule definitions; the chained form executes 4.
  //
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them — and this page has
  // exactly the shape they catch: a sticky `<header role="banner">` above a
  // `<div id="app">` holding an `<aside class="cl-hero-why">`, one `<nav>` (the
  // shared bar's actions), one `<main>` of five `<section>`s, and a `<footer>`.
  // The hero aside is a top-level complementary landmark inside `#app` and not
  // inside the `<main>`, which is the arrangement
  // `landmark-complementary-is-top-level` exists to judge.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  // The `incomplete` bucket is asserted, not skimmed. `aria-prohibited-attr`
  // and `aria-required-children` appear ONLY here — never in `violations` — so
  // a gate that ignores this bucket cannot see either. Only `color-contrast`
  // is allowed to remain, and only because the arithmetic walk below judges
  // those ratios for real; no other rule is filtered out.
  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  // The aria-hidden walk, exemption lifted — axe skips this text entirely and
  // the default walk honours the same boundary, so this second call is the
  // ONLY thing that ever measures it. See `contrast.ts` for the inventory.
  const hiddenContrast = Array.from(
    new Set(
      formatContrastFailures(
        await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true)
      )
    )
  );
  softExpect(hiddenContrast, `measured aria-hidden contrast failures in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

// ── The drive ───────────────────────────────────────────────────────────────

/**
 * Press a button and wait for the verdict it is supposed to produce.
 *
 * Named rather than inferred: a click that silently did nothing is
 * indistinguishable from one that worked unless something is asserted after it,
 * and that is precisely how the retired gate drove — `.catch(() => {})` around
 * every click, then a fixed wait. Waiting on the marker ALSO waits out the real
 * 2048-bit keygen behind several of these presses without a timeout anywhere.
 *
 * `tone` is asserted alongside the marker because on this page the tone IS the
 * teaching. A wrong key that paints `fail` instead of `held` would be a
 * regression in what the lab says, not in whether it says it, and the drive is
 * where that gets noticed in the state it happens in.
 */
async function press(
  page: Page,
  name: string | RegExp,
  marker: string,
  tone: 'pass' | 'held' | 'alarm' | 'fail'
): Promise<void> {
  await page.getByRole('button', { name }).click();
  const verdict = page.locator(`[data-verdict="${marker}"]`);
  await expect(verdict).toBeVisible();
  await expect(verdict).toHaveAttribute('data-tone', tone);
}

/**
 * Open a disclosure the way a reader does, and prove it opened.
 *
 * `nth` is needed because the three predictions deliberately share one summary
 * wording ("Predict first — optional"): a reader meets them one at a time and a
 * different label for each would be noise. `.first()` would silently reopen the
 * same one, so the index is explicit where it matters.
 */
async function reveal(page: Page, summary: string | RegExp, nth = 0): Promise<void> {
  const details = page.locator('details', { has: page.getByText(summary) }).nth(nth);
  await details.locator('> summary').click();
  await expect(details).toHaveAttribute('open', '');
}

/**
 * Drive the lab through every state that renders content, scanning each.
 *
 * Six things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, exactly as a reader gets it: no pair,
 *    eight empty output regions, three gated steps each showing one note, every
 *    disclosure shut, and the pinned cases already green. The retired gate
 *    force-revealed everything before its only scan.
 *
 *  - EVERY VERDICT IS DESTROYED BY THE NEXT CLICK. The locked verdict is
 *    replaced by the opened one, the opened one by the stranger's, the verified
 *    one by the tampered one. So each is scanned where it is produced rather
 *    than at the end, and the order below is the order a reader would take.
 *
 *  - ALL FOUR TONES ARE SCANNED, which is the point of a page whose palette has
 *    four. `pass` on the pair, the lock, the open and the signature; `held` on
 *    the wrong key and the tampered check; `alarm` on the negative-claim
 *    fixture; `fail` on both refusals Step 2 can produce. A tone nothing drives
 *    is a tone nothing measures.
 *
 *  - THE REFUSAL PATHS ARE REACHED THROUGH THE UI, not from script. The
 *    over-length refusal is reached by typing 100 accented characters — 200
 *    bytes inside a 190-byte budget and well inside a `maxlength` of 190, which
 *    is the whole reason the limit is counted in bytes. The empty-message
 *    refusal is reached by clearing the box. Neither is reachable without
 *    deliberately getting it wrong, and neither had ever been scanned.
 *
 *  - RETIREMENT IS A STATE. Changing the note after computing a verdict replaces
 *    it with a retirement notice in its own tone, which is a rendering a reader
 *    meets by ordinary use and which no other scan would reach.
 *
 *  - HOVER PERSISTS AFTER A CLICK. `:hover` stays on the element under the
 *    pointer after `page.click()` resolves, so it is the state a reader occupies
 *    the instant after pressing a button — and `.btn:hover`, `.check-opt:hover`
 *    and `.cl-btn:hover` all repaint their fill. Each is scanned explicitly.
 *
 *  - NO FIXED TIMEOUTS. Every wait is on a real DOM completion signal: a verdict
 *    marker appearing, a tone attribute, a counter's shape, `details[open]`.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);
  const message = page.locator('#message');
  const checker = page.locator('#checker-text');

  await scanAt('arrival: no pair, every action gated, disclosures shut, pinned cases green');

  // ── The shared skip link, focused ───────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('the shared skip link focused, slid in from top:-3rem');

  // ── The on-ramp disclosure, which carries everything the intro no longer does
  await reveal(page, /Why RSA here/);
  await scanAt('the on-ramp disclosure open — the honesty note and the scoping');

  // ── Step 1: a real pair ─────────────────────────────────────────────────
  await press(page, 'Make a key pair', 'pair-made', 'pass');
  await expect(page.locator('#close-lock')).toBeEnabled();
  await expect(page.locator('#step-2 .gate-note')).toBeHidden();
  // The next-step link is a new paint, and it only exists after a result.
  await expect(page.locator('#s1-next .next-step-link')).toBeVisible();
  await scanAt('Step 1: a pair exists — both halves badged, the next-step link painted');

  await reveal(page, 'Show the public half as bytes');
  await scanAt('Step 1: the public half disclosed as base64');

  // ── Step 2: the refusals first, so the pass verdict is not what replaces them
  await message.fill('');
  await press(page, 'Encrypt the note', 'locked', 'fail');
  await scanAt('Step 2: nothing typed — the empty-note refusal');

  // 100 accented characters: 200 UTF-8 bytes, 100 UTF-16 units. Inside the
  // maxlength, outside the key's capacity. This state is why the limit is
  // counted in bytes and not in characters, and it also paints the counter's
  // alarm colour and the textarea's `aria-invalid` boundary.
  await message.fill('é'.repeat(100));
  await expect(page.locator('#msg-count')).toHaveClass(/over/);
  await expect(message).toHaveAttribute('aria-invalid', 'true');
  await press(page, 'Encrypt the note', 'locked', 'fail');
  await scanAt('Step 2: 200 bytes in a 190-byte budget — refusal, counter and input in alarm');

  await message.fill('Meet me at the north gate at six.');
  await expect(page.locator('#msg-count')).not.toHaveClass(/over/);
  await press(page, 'Encrypt the note', 'locked', 'pass');
  await expect(page.locator('#open-lock')).toBeEnabled();
  await scanAt('Step 2: encrypted — the byte strip and the private-half-unused note');

  // Encrypting again keeps BOTH blocks on screen, which is a layout the single
  // preview never produced: two monospace columns inside a step card.
  await press(page, 'Encrypt the note', 'locked', 'pass');
  await expect(page.locator('.compare .byte-strip-code')).toHaveCount(2);
  await scanAt('Step 2: encrypted twice — both blocks side by side and the comparison stated');

  await reveal(page, 'Show all the encrypted bytes');
  await scanAt('Step 2: all 256 encrypted bytes disclosed');

  // The copy interaction repaints the button's label; either wording is a real
  // state, because headless Chromium denies the clipboard. Scanned while still
  // hovered, then waited out so no later scan races the 1.2s revert.
  const copyBtn = page.locator('#s2-out .copy-btn').first();
  await copyBtn.click();
  await expect(copyBtn).toHaveText(/Copied|Copy failed/);
  await scanAt('Step 2: a copy button in its just-clicked state, still hovered');
  await expect(copyBtn).not.toHaveText(/Copied|Copy failed/, { timeout: 5000 });

  // ── Step 3: predictions, then the three experiments ─────────────────────
  await press(page, 'Open it with my private half', 'opened', 'pass');
  await scanAt('Step 3: opened — the recovered note quoted back');

  await reveal(page, /Predict first/, 0);
  await page.locator('#predict-wrong-key .check-opt').last().click();
  await expect(page.locator('#predict-wrong-key .check-result')).toHaveClass(/pill-bad/);
  await scanAt('Step 3: a prediction answered wrong — the pill-bad tint and its explanation');

  await page.locator('#predict-wrong-key .check-opt').first().click();
  await expect(page.locator('#predict-wrong-key .check-result')).toHaveClass(/pill-ok/);
  await scanAt('Step 3: the same prediction answered right — the pill-ok tint');

  // A genuinely fresh second pair, generated behind this click.
  await press(page, 'Try a different private key', 'wrong-key', 'held');
  await scanAt('Step 3: the wrong private key — a CALM refusal, held and not fail');

  await press(page, 'Let a stranger use my public half', 'unattributed', 'alarm');
  await expect(page.locator('.negative-claim')).toBeVisible();
  await expect(page.locator('#s3-next .next-step-link')).toBeVisible();
  await scanAt('Step 3: OPENED AND UNATTRIBUTED — the negative-claim fixture in alarm');

  // ── Step 4: the same pair, a different job ──────────────────────────────
  await press(page, 'Sign the note with my private half', 'signed', 'pass');
  await expect(page.locator('[data-verdict="same-pair"]')).toHaveAttribute('data-tone', 'pass');
  // The checker copy appears only now, which is a new control and a new label.
  await expect(page.locator('#checker-wrap')).toBeVisible();
  await expect(page.locator('#check-sig')).toBeEnabled();
  await scanAt('Step 4: SAME PAIR proved by export, the signature made, the checker box revealed');

  await reveal(page, 'Show both exports side by side');
  await scanAt('Step 4: both public-key exports disclosed for comparison');

  await reveal(page, 'Show the whole signature');
  await scanAt('Step 4: the whole signature disclosed');

  await press(page, 'Check the signature', 'checked', 'pass');
  await scanAt('Step 4: VERIFIED — the seal glyph and the trust-boundary note');

  await press(page, /Change one character for me/, 'checked', 'held');
  await expect(page.locator('.diff-mark')).toHaveCount(1);
  await scanAt('Step 4: an edited note refused — the marked diff inside the quote');

  // Tampering by hand, which is the route the button only demonstrates. A longer
  // edit paints several marks, so the diff is scanned at more than one length.
  const signedText = await page.locator('#s4-check-out .recovered-text').first().innerText();
  await checker.fill(`${signedText} and bring the money.`);
  await press(page, 'Check the signature', 'checked', 'held');
  await scanAt('Step 4: a hand-typed tamper — several marked graphemes');

  // ── The recap and the closing questions ─────────────────────────────────
  await page.locator('#scenario-1 .check-opt').nth(1).click();
  await expect(page.locator('#scenario-1 .check-result')).toHaveClass(/pill-bad/);
  await scanAt('the recap table, with a closing question answered wrong');

  await page.locator('#scenario-1 .check-opt').first().click();
  await expect(page.locator('#scenario-1 .check-result')).toHaveClass(/pill-ok/);
  await scanAt('the recap table, with a closing question answered right');

  // The recap table is the one shape on this page allowed to scroll sideways,
  // so it is scanned focused — that is where its keyboard route and label are
  // judged (WCAG 2.1.1).
  await page.locator('.table-wrap').focus();
  await expect(page.locator('.table-wrap')).toBeFocused();
  await scanAt('the recap table focused as a scroll region');

  // ── The pinned case list, which ships shut ──────────────────────────────
  await reveal(page, /Show all 12 cases/);
  await expect(page.locator('#pinned-out .case')).toHaveCount(12);
  await scanAt('the pinned case list expanded — twelve rows, both kinds');

  // ── Supersession is a state a reader reaches by ordinary use ────────────
  await message.fill('Meet me at the south gate at seven.');
  await expect(page.locator('[data-verdict-retired="locked"]')).toBeVisible();
  await expect(page.locator('[data-verdict="locked"]')).toHaveCount(0);
  await scanAt('a changed note supersedes four verdicts at once — the OUT OF DATE notices');

  // ── Hover, which persists after a click ─────────────────────────────────
  await page.getByRole('button', { name: 'Encrypt the note' }).hover();
  await scanAt('a primary button hovered — its accent fill repainted');

  await page.locator('#s1-out .copy-btn').first().hover();
  await scanAt('a quiet copy button hovered');

  await page.locator('#scenario-2 .check-opt').first().hover();
  await scanAt('a closing-question option hovered — its accent wash repainted');

  await page.locator('#s1-next .next-step-link').hover();
  await scanAt('a next-step link hovered');

  await page.locator('.cl-topbar .cl-btn').first().hover();
  await scanAt('a shared top bar control hovered');

  // ── Focus rings on the controls that take them ──────────────────────────
  await message.focus();
  await expect(message).toBeFocused();
  await scanAt('the note textarea focused, showing its focus-visible outline');

  await checker.focus();
  await expect(checker).toBeFocused();
  await scanAt('the checker textarea focused');

  await page.getByRole('button', { name: 'Make another pair' }).focus();
  await scanAt('a primary button focused');

  await page.locator('#pinned-out .source-line a').focus();
  await scanAt('the pinned-source link focused — an inline link with a persistent underline');

  // ── A gated control, after a new pair resets the path ───────────────────
  // Disabled controls are inactive components and exempt from contrast, but the
  // gate notes beside them are real prose and are not. This is the only state
  // where a note is visible next to a FRESH verdict rather than on arrival.
  await press(page, 'Make another pair', 'pair-made', 'pass');
  await expect(page.locator('#check-sig')).toBeDisabled();
  await expect(page.locator('#step-4 .gate-note')).toBeVisible();
  await scanAt('a new pair re-gates Steps 3 and 4 — gate notes beside a fresh verdict');
}
