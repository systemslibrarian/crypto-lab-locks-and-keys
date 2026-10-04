/*
 * The pinned cases, run in the reader's browser.
 *
 * Every other result on this page is the lab agreeing with itself. This section
 * is the lab agreeing with somebody else, and it runs on arrival so that nobody
 * has to press anything to see whether this build is trustworthy.
 *
 * The half of the set that matters most is the half the construction must
 * REFUSE: damaged padding and damaged signatures that a careless build would
 * accept. The summary counts both together, and each row says which kind it is.
 */
import { runPinned } from '../crypto/pinned';
import { PINNED_CASE_COUNT, VECTOR_SOURCE } from '../crypto/vectors';
import { el, p } from './dom';
import { render, slot } from './verdict';

export async function mountPinned(): Promise<void> {
  const host = document.getElementById('pinned-out') as HTMLElement;
  // The pinned set is fixed at build time, so nothing can retire this verdict.
  slot('pinned', host, () => 'pinned');

  const run = await runPinned();
  const allAgreed = run.agreed === run.total && run.total === PINNED_CASE_COUNT;

  const rows = el(
    'ol',
    { class: 'case-list', role: 'list' },
    run.results.map((r) =>
      el('li', { class: `case case-${r.agreed ? 'ok' : 'bad'}`, role: 'listitem' }, [
        el('span', { class: 'case-id' }, [r.label]),
        el('span', { class: 'case-kind' }, [
          r.mustSucceed ? 'must open or verify' : 'must refuse',
        ]),
        el('span', { class: 'case-why' }, [r.why]),
        el('span', { class: 'case-got' }, [
          r.agreed ? 'agreed' : `DISAGREED — this build ${r.observed}`,
        ]),
      ])
    )
  );

  render(
    'pinned',
    allAgreed
      ? {
          marker: 'pinned',
          tone: 'pass',
          glyph: 'tick',
          headline: `${run.agreed} OF ${run.total} AGREE`,
          detail: [
            'Every pinned case from an outside publication came out the way that publication ' +
              'says it should, in this browser, just now.',
            `${run.results.filter((r) => !r.mustSucceed).length} of them are cases the ` +
              'construction is required to refuse, so a build that opened everything handed ' +
              'to it would fail here.',
          ],
        }
      : {
          marker: 'pinned',
          tone: 'alarm',
          glyph: 'warn',
          headline: `${run.agreed} OF ${run.total} AGREE`,
          detail: [
            'At least one pinned case did not come out the way the publication says it ' +
              'should. Do not trust anything else on this page until that is explained.',
          ],
        },
    [
      el('p', { class: 'source-line' }, [
        'Source: ',
        el('a', { href: VECTOR_SOURCE.url, target: '_blank', rel: 'noopener noreferrer' }, [
          VECTOR_SOURCE.name,
        ]),
        ` — ${VECTOR_SOURCE.detail}. The schemes themselves are ${VECTOR_SOURCE.spec}.`,
      ]),
      p(
        'These are the same parameters the four steps above use, so a disagreement here ' +
          'would implicate the code you just drove rather than a neighbouring setting.',
        'aside-note'
      ),
      rows,
    ]
  );
}
