/*
 * Step 1 — Make a pair.
 *
 * One button, as the brief asks. The private half is generated and never
 * displayed: the panel shows that it exists and says what it is for, and the
 * disclosure below carries the PUBLIC half only. There is no control anywhere in
 * this lab that reveals the private half, which is the one design decision here
 * that a reader will remember.
 */
import { MODULUS_BITS, makePair } from '../crypto/pair';
import { toBase64 } from '../crypto/bytes';
import { copyButton, disclosure, el, fill, longValue, p } from './dom';
import { key, openLock } from './icons';
import { render, slot } from './verdict';
import { basis, state } from './state';

export function mountStep1(onPair: () => void): void {
  const host = document.getElementById('s1-out') as HTMLElement;
  const button = document.getElementById('make-pair') as HTMLButtonElement;
  slot('pair-made', host, basis.pairMade);

  button.addEventListener('click', async () => {
    button.disabled = true;
    const was = button.textContent ?? '';
    // Keygen takes a visible moment on a 2048-bit modulus. Saying so is more
    // honest than a spinner that represents nothing, and it is the only place in
    // this lab where the reader waits on real work.
    button.textContent = 'Making it…';
    try {
      state.pair = await makePair();
      state.otherPair = null;
      state.fromStranger = null;
      state.locked = null;
      state.lockedOver = null;
      state.signature = null;
      showPair();
      onPair();
    } finally {
      button.disabled = false;
      button.textContent = was === 'Making it…' ? 'Make another pair' : 'Make another pair';
    }
  });
}

function showPair(): void {
  const pair = state.pair;
  if (!pair) return;

  const halves = el('div', { class: 'halves' }, [
    el('div', { class: 'half half-public' }, [
      el('p', { class: 'half-head' }, [openLock(), el('span', {}, ['The public half'])]),
      p('Hand this one to anybody. It can only close the lock.', 'half-line'),
      p('Printing it in a newspaper would cost you nothing.', 'half-note'),
    ]),
    el('div', { class: 'half half-private' }, [
      el('p', { class: 'half-head' }, [key(), el('span', {}, ['The private half'])]),
      p('This one never leaves this page, and it is the only thing that opens the lock.', 'half-line'),
      p('It is not shown anywhere on this page. That is the point of it.', 'half-note'),
    ]),
  ]);

  render(
    'pair-made',
    {
      marker: 'pair-made',
      tone: 'pass',
      glyph: 'tick',
      headline: 'A PAIR EXISTS',
      detail: [
        `Two matching halves of one ${MODULUS_BITS}-bit key pair, made in your browser a moment ago.`,
        `This pair goes by ${pair.fingerprint} on this page, so you can tell it from another one later.`,
      ],
    },
    [
      halves,
      p(
        `${pair.fingerprint} is a short label for the public half, not a security check — ` +
          'four bytes is far too few for that. It is here so Step 3 can show you a ' +
          'different pair and Step 4 can show you the same one.',
        'aside-note'
      ),
      disclosure('Show the public half as bytes', [
        p(
          `The public half, exactly as it would travel: ${pair.publicKeyBytes.length} bytes, ` +
            'base64. This is the whole of what you would send someone.',
          'bytes-lede'
        ),
        longValue(toBase64(pair.publicKeyBytes), 'Public half'),
        copyButton('Copy the public half', () => toBase64(state.pair?.publicKeyBytes ?? new Uint8Array())),
      ]),
    ]
  );
}

/** Reset Step 1's output. Used when the page is rebuilt from scratch. */
export function resetStep1(): void {
  fill(document.getElementById('s1-out') as HTMLElement);
}
