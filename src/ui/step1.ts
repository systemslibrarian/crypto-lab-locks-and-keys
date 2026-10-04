/*
 * Step 1 — Make a pair.
 *
 * One button, as the brief asks. The private half is generated and never
 * displayed: the panel shows that it exists and says what it is for, and the
 * disclosure below carries the PUBLIC half only. There is no control anywhere in
 * this lab that reveals the private half, which is the one design decision here
 * a reader will remember.
 *
 * The two halves are introduced as things with an OWNER and a BOUNDARY — "you
 * are Sam", this half is shareable, that half is not — because the original
 * framing ("your note, your halves") asked one reader to play every role at once
 * and never said which role they were in.
 */
import { MODULUS_BITS, makePair } from '../crypto/pair';
import { toBase64 } from '../crypto/bytes';
import { copyButton, disclosure, el, longValue, p } from './dom';
import { key, openLock } from './icons';
import { render, slot } from './verdict';
import { basis, state } from './state';
import { settled } from './settle';

export function mountStep1(): void {
  const host = document.getElementById('s1-out') as HTMLElement;
  const button = document.getElementById('make-pair') as HTMLButtonElement;
  slot('pair-made', host, basis.pairMade, 'Make a key pair to start again.');

  button.addEventListener('click', async () => {
    button.disabled = true;
    // 2048-bit keygen takes a visible moment. Saying so is more honest than a
    // spinner that represents nothing, and it is the only place in this lab
    // where a reader waits on real work.
    button.textContent = 'Making it…';
    try {
      state.pair = await makePair();
      // A new pair invalidates everything downstream, including the signature
      // and the checker copy, so none of it is left describing an older pair.
      state.otherPair = null;
      state.fromStranger = null;
      state.locked = null;
      state.lockedOver = null;
      state.previousLocked = null;
      state.signature = null;
      state.checkerText = null;
      const checkerWrap = document.getElementById('checker-wrap');
      if (checkerWrap) checkerWrap.hidden = true;
      showPair();
    } finally {
      button.disabled = false;
      button.textContent = 'Make another pair';
      settled();
    }
  });
}

function showPair(): void {
  const pair = state.pair;
  if (!pair) return;

  const halves = el('div', { class: 'halves' }, [
    el('div', { class: 'half half-public' }, [
      el('p', { class: 'half-head' }, [openLock(), el('span', {}, ['The public half'])]),
      el('p', { class: 'half-badge half-badge-share' }, ['Shareable']),
      p('Give this to anybody. Maya needs it to send you a private note.', 'half-line'),
      p(
        'It encrypts notes to you, and it verifies signatures you make. It can do neither ' +
          'of the other two jobs: it cannot decrypt and it cannot sign.',
        'half-note'
      ),
    ]),
    el('div', { class: 'half half-private' }, [
      el('p', { class: 'half-head' }, [key(), el('span', {}, ['The private half'])]),
      el('p', { class: 'half-badge half-badge-keep' }, ['Stays with you']),
      p('Never give this to anybody. It is the only thing that opens notes sent to you.', 'half-line'),
      p(
        'It decrypts, and it signs. It is not shown anywhere on this page — that is the ' +
          'point of it.',
        'half-note'
      ),
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
          'four bytes is far too few for that, and matching labels would never be grounds ' +
          'for trusting a key. It is here so Step 3 can show you a different pair and Step 4 ' +
          'can show you the same one.',
        'aside-note'
      ),
      disclosure('Show the public half as bytes', [
        p(
          `The public half, exactly as it would travel: ${pair.publicKeyBytes.length} bytes, ` +
            'base64. This is the whole of what you would send someone. Base64 is just a way ' +
            'of writing bytes with letters; it is not encryption and it hides nothing.',
          'bytes-lede'
        ),
        longValue(toBase64(pair.publicKeyBytes), 'Public half'),
        copyButton('Copy the public half', () =>
          toBase64(state.pair?.publicKeyBytes ?? new Uint8Array())
        ),
      ]),
    ]
  );
}
