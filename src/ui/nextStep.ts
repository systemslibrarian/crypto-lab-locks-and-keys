/*
 * "Continue to Step N" — the link that appears once a step has actually produced
 * something.
 *
 * A guided path only guides if it says where the path goes next. The four steps
 * read as a sequence on the page, but after a reader gets a result there is
 * nothing telling them the result was the point of that step and that another
 * one follows — so the obvious failure is a reader who locks a note, sees bytes,
 * and stops.
 *
 * It appears only AFTER the step's own result exists, which keeps the arrival
 * screen uncluttered, and it is a plain in-page anchor: no focus is stolen and
 * no scrolling happens on its own. A reader exploring out of order is never
 * blocked, only offered.
 */
import { byId } from './dom';
import { state } from './state';

interface Hop {
  /** Where the link lives. */
  readonly host: string;
  /** True once this step has produced the thing the next step needs. */
  readonly ready: () => boolean;
  readonly href: string;
  readonly label: string;
}

const HOPS: readonly Hop[] = [
  {
    host: 's1-next',
    ready: () => state.pair !== null,
    href: '#step-2',
    label: 'Continue to Step 2 — lock a note to the public half',
  },
  {
    host: 's2-next',
    ready: () => state.locked !== null,
    href: '#step-3',
    label: 'Continue to Step 3 — open it, and find out what opening proves',
  },
  {
    host: 's3-next',
    // Not merely "it opened": the step's point is the stranger's message, so
    // the hand-off waits for the fixture the reader is meant to meet.
    ready: () => state.fromStranger !== null,
    href: '#step-4',
    label: 'Continue to Step 4 — what a signature adds',
  },
  {
    host: 's4-next',
    ready: () => state.signature !== null,
    href: '#recap',
    label: 'Finish — the recap, and three questions',
  },
];

export function refreshNextSteps(): void {
  for (const hop of HOPS) {
    const host = byId(hop.host);
    const show = hop.ready();
    host.hidden = !show;
    if (!show) {
      host.replaceChildren();
      continue;
    }
    if (host.querySelector('a')) continue;
    const link = document.createElement('a');
    link.className = 'next-step-link';
    link.href = hop.href;
    link.textContent = hop.label;
    host.replaceChildren(link);
  }
}
