/*
 * Step 2 — Close the lock.
 *
 * The claim this panel makes is in its own code: `close()` is called with
 * `state.pair.lockWith` and nothing else. No private key is passed, and the
 * panel says so beside the result rather than only in prose at the top.
 *
 * "Close it again" is here because OAEP draws a fresh random seed per call, so
 * pressing it twice over the same words produces two completely different blocks.
 * That is not a detail — a reader who thinks encryption is a lookup table learns
 * more from those two blocks than from any sentence about it.
 */
import { MAX_MESSAGE_BYTES, MODULUS_BITS } from '../crypto/pair';
import { close, whyNotLockable } from '../crypto/lock';
import { preview, toHex } from '../crypto/bytes';
import { copyButton, disclosure, el, longValue, p } from './dom';
import { render, retireStale, slot } from './verdict';
import { basis, state } from './state';

export interface Step2Hooks {
  /** Called after a successful lock, so Steps 3 and 4 can enable themselves. */
  onLocked: () => void;
  /** Called whenever the message changes, so downstream verdicts can retire. */
  onMessageChanged: () => void;
}

export function mountStep2(hooks: Step2Hooks): void {
  const host = document.getElementById('s2-out') as HTMLElement;
  const input = document.getElementById('message') as HTMLTextAreaElement;
  const counter = document.getElementById('msg-count') as HTMLElement;
  const button = document.getElementById('close-lock') as HTMLButtonElement;
  slot('locked', host, basis.locked);

  state.message = input.value;

  const updateCount = (): void => {
    const bytes = new TextEncoder().encode(input.value).length;
    // Bytes, not characters. One emoji is four bytes, so a character count here
    // would promise room the lock does not have.
    counter.textContent = `${bytes} of ${MAX_MESSAGE_BYTES} bytes`;
    counter.classList.toggle('over', bytes > MAX_MESSAGE_BYTES);
  };

  input.addEventListener('input', () => {
    state.message = input.value;
    updateCount();
    // Identical text recomputes an identical basis, so retyping what was already
    // there retires nothing. Only a real change does.
    retireStale();
    hooks.onMessageChanged();
  });
  updateCount();

  const lock = async (): Promise<void> => {
    const pair = state.pair;
    if (!pair) return;
    const refusal = whyNotLockable(input.value);
    if (refusal) {
      render('locked', {
        marker: 'locked',
        tone: 'fail',
        glyph: 'cross',
        headline: 'NOTHING LOCKED',
        detail: [refusal],
      });
      return;
    }
    state.message = input.value;
    state.locked = await close(pair.lockWith, input.value);
    state.lockedOver = input.value;
    showLocked();
    hooks.onLocked();
  };

  button.addEventListener('click', lock);
}

function showLocked(): void {
  const locked = state.locked;
  if (!locked) return;
  const hex = toHex(locked.bytes);

  render(
    'locked',
    {
      marker: 'locked',
      tone: 'pass',
      glyph: 'closed-lock',
      headline: 'LOCKED',
      detail: [
        `${locked.bytes.length} bytes, and none of them readable.`,
        `Locked to the public half of pair ${locked.lockedTo}.`,
      ],
    },
    [
      el('p', { class: 'byte-strip' }, [
        el('span', { class: 'byte-strip-label' }, ['First 32 bytes']),
        el('code', { class: 'byte-strip-code' }, [preview(locked.bytes)]),
      ]),
      p(
        'The private half was not used here, and it was not needed. Closing a lock ' +
          'takes only the public half — which is exactly why handing that half out is safe.',
        'claim-note'
      ),
      p(
        `Every locked block is ${locked.bytes.length} bytes whatever you typed, because ` +
          `the lock is ${MODULUS_BITS} bits wide. Someone watching the bytes go past ` +
          'cannot tell a one-word message from a hundred-word one.',
        'aside-note'
      ),
      disclosure('Show all the locked bytes', [
        p(`All ${locked.bytes.length} bytes, hex.`, 'bytes-lede'),
        longValue(hex, 'Locked bytes'),
        copyButton('Copy the locked bytes', () =>
          state.locked ? toHex(state.locked.bytes) : ''
        ),
      ]),
    ]
  );
}
