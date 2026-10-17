/*
 * Step 1 — Make a pair.
 *
 * One button, as the brief asks. The private key is generated and never
 * displayed: the panel shows that it exists and says what it is for, and the
 * disclosure below carries the PUBLIC key only. There is no control anywhere in
 * this lab that reveals the private key, which is the one design decision here
 * a reader will remember.
 *
 * The two keys are introduced as things with an OWNER and a BOUNDARY — "you
 * are Sam", this key is shareable, that key is not — because the original
 * framing ("your note, your keys") asked one reader to play every role at once
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

  const keys = el('div', { class: 'halves' }, [
    el('div', { class: 'half half-public' }, [
      el('p', { class: 'half-head' }, [openLock(), el('span', {}, ['The public key'])]),
      el('p', { class: 'half-badge half-badge-share' }, ['Shareable']),
      p('Give this to anybody. Maya needs it to send you a private note.', 'half-line'),
      p(
        'Encrypts notes to you and verifies signatures you make. Cannot decrypt or sign.',
        'half-note'
      ),
    ]),
    el('div', { class: 'half half-private' }, [
      el('p', { class: 'half-head' }, [key(), el('span', {}, ['The private key'])]),
      el('p', { class: 'half-badge half-badge-keep' }, ['Stays with you']),
      p('Keep this secret. It opens notes encrypted to your public key.', 'half-line'),
      p(
        'It decrypts, and it signs. Never displayed on this page.',
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
        `Two related keys: one ${MODULUS_BITS}-bit RSA pair, generated in your browser.`,
        `Pair label: ${pair.fingerprint}.`,
      ],
    },
    [
      keys,
      p(
        `${pair.fingerprint} is a four-byte label, not an authentication check. ` +
          'Matching labels are not enough to trust a key.',
        'aside-note'
      ),
      disclosure('Show the public key as bytes', [
        p(
          `The public key, exactly as it would travel: ${pair.publicKeyBytes.length} bytes, ` +
            'base64. This is the whole of what you would send someone. Base64 is just a way ' +
            'of writing bytes with letters; it is not encryption and it hides nothing.',
          'bytes-lede'
        ),
        longValue(toBase64(pair.publicKeyBytes), 'Public key'),
        copyButton('Copy the public key', () =>
          toBase64(state.pair?.publicKeyBytes ?? new Uint8Array())
        ),
      ]),
    ]
  );
}
