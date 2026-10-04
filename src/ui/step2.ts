/*
 * Step 2 — Maya encrypts a note to you.
 *
 * The claim this panel makes is in its own code: `close()` is called with
 * `state.pair.lockWith` and nothing else. No private key is passed, and the
 * panel says so beside the result rather than only in prose at the top.
 *
 * "Encrypt it again" keeps BOTH blocks on screen. It used to replace the only
 * preview, which asked a beginner to compare hex from memory — so the one thing
 * the button exists to show was the one thing they could not see. Now the two
 * previews sit side by side and the page computes the comparison for them:
 * different bytes, same note.
 */
import { MAX_MESSAGE_BYTES, MODULUS_BITS } from '../crypto/pair';
import { close, whyNotLockable } from '../crypto/lock';
import { preview, toHex } from '../crypto/bytes';
import { sameBytes } from '../crypto/pair';
import { copyButton, disclosure, el, longValue, p } from './dom';
import { render, slot } from './verdict';
import { basis, state } from './state';
import { settled } from './settle';

export function mountStep2(): void {
  const host = document.getElementById('s2-out') as HTMLElement;
  const input = document.getElementById('message') as HTMLTextAreaElement;
  const counter = document.getElementById('msg-count') as HTMLElement;
  const button = document.getElementById('close-lock') as HTMLButtonElement;
  slot('locked', host, basis.locked, 'The note changed. Encrypt this version again.');

  state.message = input.value;

  const updateCount = (): void => {
    const bytes = new TextEncoder().encode(input.value).length;
    // Bytes, not characters. One emoji is four bytes, so a character count
    // here would promise room the lock does not have.
    counter.textContent = `${bytes} of ${MAX_MESSAGE_BYTES} bytes used`;
    const over = bytes > MAX_MESSAGE_BYTES;
    counter.classList.toggle('over', over);
    // Announced, not only painted: the counter is the control's own description.
    input.setAttribute('aria-invalid', over ? 'true' : 'false');
  };

  input.addEventListener('input', () => {
    state.message = input.value;
    updateCount();
    // Identical text recomputes an identical basis, so retyping what was already
    // there retires nothing. Only a real change does.
    settled();
  });
  updateCount();

  button.addEventListener('click', async () => {
    const pair = state.pair;
    if (!pair) return;
    const refusal = whyNotLockable(input.value);
    if (refusal) {
      render('locked', {
        marker: 'locked',
        tone: 'fail',
        glyph: 'cross',
        headline: 'NOTHING ENCRYPTED',
        detail: [refusal],
      });
      settled();
      return;
    }
    // Keep the previous block only while the note is unchanged, so the
    // comparison is honestly about the randomness and not about two notes.
    state.previousLocked =
      state.locked && state.lockedOver === input.value ? state.locked : null;
    state.message = input.value;
    state.locked = await close(pair.lockWith, input.value);
    state.lockedOver = input.value;
    showLocked();
    settled();
  });
}

function showLocked(): void {
  const locked = state.locked;
  if (!locked) return;
  const previous = state.previousLocked;

  const extra: Node[] = [
    el('p', { class: 'byte-strip' }, [
      el('span', { class: 'byte-strip-label' }, ['First 32 bytes']),
      el('code', { class: 'byte-strip-code' }, [preview(locked.bytes)]),
    ]),
  ];

  if (previous) {
    // The comparison the reader pressed the button for, computed rather than
    // left to the eye.
    const differs = !sameBytes(previous.bytes, locked.bytes);
    extra.push(
      el('div', { class: 'compare' }, [
        el('div', { class: 'compare-col' }, [
          el('span', { class: 'byte-strip-label' }, ['First time']),
          el('code', { class: 'byte-strip-code' }, [preview(previous.bytes, 24)]),
        ]),
        el('div', { class: 'compare-col' }, [
          el('span', { class: 'byte-strip-label' }, ['Second time']),
          el('code', { class: 'byte-strip-code' }, [preview(locked.bytes, 24)]),
        ]),
      ]),
      p(
        differs
          ? 'The same note, encrypted twice, came out as completely different bytes — and ' +
            'both of them decrypt to that same note. A fresh random value goes into every ' +
            'encryption, so an eavesdropper who sees the same note sent twice cannot even ' +
            'tell it was the same note.'
          : 'Both encryptions produced IDENTICAL bytes. That should be impossible here, and ' +
            'it would mean the randomness has failed.',
        differs ? 'claim-note' : 'negative-claim'
      )
    );
  }

  extra.push(
    p(
      'Your private half was not used here, and was not needed. Encrypting takes only the ' +
        'public half — which is exactly why handing that half out is safe.',
      'claim-note'
    ),
    p(
      `Every encrypted block is ${locked.bytes.length} bytes, because the key is ` +
        `${MODULUS_BITS} bits wide — so for any note short enough to fit, the size of the ` +
        'block says nothing about how long the note was. It does not hide that you sent ' +
        'something, or when, or to whom.',
      'aside-note'
    ),
    disclosure('Show all the encrypted bytes', [
      p(
        `All ${locked.bytes.length} bytes, written as hex. Hex is a way of writing bytes ` +
          'with digits and letters; the unreadability is the encryption, not the hex.',
        'bytes-lede'
      ),
      longValue(toHex(locked.bytes), 'Encrypted bytes'),
      copyButton('Copy the encrypted bytes', () =>
        state.locked ? toHex(state.locked.bytes) : ''
      ),
    ])
  );

  render(
    'locked',
    {
      marker: 'locked',
      tone: 'pass',
      glyph: 'closed-lock',
      headline: 'ENCRYPTED',
      detail: [
        `${locked.bytes.length} bytes, and none of them readable.`,
        `Encrypted to the public half of your pair, ${locked.lockedTo}.`,
      ],
    },
    extra
  );
}
