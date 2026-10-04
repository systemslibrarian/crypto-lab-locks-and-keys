/*
 * Step 4 — The same pair, backwards.
 *
 * The panel that earns this lab its place. Most newcomers believe signing is a
 * separate mechanism with its own keys; it is the pair from Step 1 with the two
 * halves swapping jobs. So the panel opens by PROVING the pair is the same one —
 * it exports the public half from the locking handle and from the signing handle
 * and compares the bytes — rather than asserting it in a sentence the reader has
 * no way to check.
 *
 * Then: sign with the private half, check with the public half, and change one
 * character to watch the check refuse. The tamper is deliberately done to a COPY
 * of the text rather than by editing the signature, because that is the honest
 * shape of the attack: the signature is untouched, the document moved underneath
 * it, and the check notices.
 */
import { importPublicForChecking, sameBytes } from '../crypto/pair';
import { check, sign } from '../crypto/sign';
import { preview, toBase64, toHex } from '../crypto/bytes';
import { copyButton, disclosure, el, longValue, p } from './dom';
import { closedLock, key } from './icons';
import { render, retireStale, slot } from './verdict';
import { basis, state } from './state';

/** Change exactly one character, and say which one. */
function tamperOne(text: string): { changed: string; at: number } {
  // The last letter, so the change is visible at the end of the quote rather
  // than buried. Digits roll to a different digit, letters to a different
  // letter, so the result stays the same length and reads as a plausible edit —
  // the point is that a small, sensible-looking change is still caught.
  const at = Math.max(0, text.length - 1);
  const c = text[at] ?? 'x';
  const next = /[0-9]/.test(c)
    ? String((Number(c) + 1) % 10)
    : c.toLowerCase() === 'x'
      ? 'y'
      : 'x';
  return { changed: text.slice(0, at) + next + text.slice(at + 1), at };
}

export function mountStep4(): void {
  const samePairHost = document.getElementById('s4-same-out') as HTMLElement;
  const signedHost = document.getElementById('s4-sign-out') as HTMLElement;
  const checkedHost = document.getElementById('s4-check-out') as HTMLElement;

  slot('same-pair', samePairHost, basis.pairMade);
  slot('signed', signedHost, basis.signed);
  slot('checked', checkedHost, basis.checked);

  const signBtn = document.getElementById('sign-msg') as HTMLButtonElement;
  const checkBtn = document.getElementById('check-sig') as HTMLButtonElement;
  const tamperBtn = document.getElementById('tamper-msg') as HTMLButtonElement;

  signBtn.addEventListener('click', async () => {
    const pair = state.pair;
    if (!pair) return;
    if (state.message.length === 0) {
      render('signed', {
        marker: 'signed',
        tone: 'fail',
        glyph: 'cross',
        headline: 'NOTHING SIGNED',
        detail: ['Type something in Step 2 first — a signature is over a particular text.'],
      });
      return;
    }
    state.signature = await sign(pair.signWith, state.message, pair.fingerprint);
    showSamePair();
    showSigned();
  });

  checkBtn.addEventListener('click', () => runCheck(false));
  tamperBtn.addEventListener('click', () => runCheck(true));
}

/**
 * The same-pair proof, computed rather than claimed.
 *
 * Exports the public half twice — once from the handle that closes locks, once
 * from the handle that checks signatures — and compares the bytes. These are two
 * different `CryptoKey` objects with two different algorithm names, and the
 * encoding WebCrypto writes for each is the same `rsaEncryption` SPKI, so what
 * survives the comparison is the key itself.
 */
async function showSamePair(): Promise<void> {
  const pair = state.pair;
  if (!pair) return;
  const fromLocking = new Uint8Array(await crypto.subtle.exportKey('spki', pair.lockWith));
  const fromChecking = new Uint8Array(await crypto.subtle.exportKey('spki', pair.checkWith));
  const identical = sameBytes(fromLocking, fromChecking);

  if (!identical) {
    render('same-pair', {
      marker: 'same-pair',
      tone: 'alarm',
      glyph: 'warn',
      headline: 'NOT THE SAME PAIR',
      detail: [
        'The half that checks signatures is not the half that closes locks, so this ' +
          'panel cannot claim what it claims. Something in this build is wrong.',
      ],
    });
    return;
  }

  render(
    'same-pair',
    {
      marker: 'same-pair',
      tone: 'pass',
      glyph: 'tick',
      headline: 'SAME PAIR',
      detail: [
        'Nothing new was made for this step.',
        `The public half used for locking and the public half used for checking are the ` +
          `same ${fromLocking.length} bytes, compared one by one. Both are pair ${pair.fingerprint}.`,
      ],
    },
    [
      el('div', { class: 'jobs' }, [
        el('div', { class: 'job' }, [
          el('p', { class: 'job-head' }, [closedLock(), el('span', {}, ['In Steps 2 and 3'])]),
          p('The public half closed the lock. The private half opened it.', 'job-line'),
        ]),
        el('div', { class: 'job' }, [
          el('p', { class: 'job-head' }, [key(), el('span', {}, ['Here in Step 4'])]),
          p('The private half signs. The public half checks.', 'job-line'),
        ]),
      ]),
      p(
        'Read those two boxes together and you have the whole idea: the halves have not ' +
          'changed, only the direction they are being used in. That is all a signature is.',
        'claim-note'
      ),
      disclosure('Show both exports side by side', [
        p(
          'The same public half, exported twice from two different key handles. If these ' +
            'two lines differ, Step 4 is lying and the verdict above says so.',
          'bytes-lede'
        ),
        longValue(toBase64(fromLocking), 'Exported from the locking half'),
        longValue(toBase64(fromChecking), 'Exported from the checking half'),
      ]),
    ]
  );
}

function showSigned(): void {
  const sig = state.signature;
  if (!sig) return;
  render(
    'signed',
    {
      marker: 'signed',
      tone: 'pass',
      glyph: 'tick',
      headline: 'SIGNED',
      detail: [
        `${sig.bytes.length} bytes, made with the private half of pair ${sig.signedBy}.`,
        'The public half was not used, and was not needed — the mirror image of Step 2.',
      ],
    },
    [
      el('p', { class: 'byte-strip' }, [
        el('span', { class: 'byte-strip-label' }, ['First 32 bytes']),
        el('code', { class: 'byte-strip-code' }, [preview(sig.bytes)]),
      ]),
      p(
        'Press Sign again and these bytes will be completely different, and both ' +
          'signatures will check out. A fresh random salt goes into every signature, ' +
          'just as a fresh seed goes into every locked block.',
        'aside-note'
      ),
      disclosure('Show the whole signature', [
        p(`All ${sig.bytes.length} bytes, hex.`, 'bytes-lede'),
        longValue(toHex(sig.bytes), 'Signature'),
        copyButton('Copy the signature', () =>
          state.signature ? toHex(state.signature.bytes) : ''
        ),
      ]),
    ]
  );
}

/**
 * Check the signature, against the text as signed or against a tampered copy.
 *
 * The public half is RE-IMPORTED from the exported bytes before checking, so the
 * check demonstrably uses nothing but the public half. A reader is entitled to
 * ask how they know the private key was not involved; this is the answer.
 */
async function runCheck(tampered: boolean): Promise<void> {
  const pair = state.pair;
  const sig = state.signature;
  if (!pair || !sig) return;

  const publicOnly = await importPublicForChecking(pair.publicKeyBytes);
  const edit = tamperOne(sig.over);
  const target = tampered ? edit.changed : sig.over;
  const result = await check(publicOnly, sig.bytes, target);

  if (!result.ok) {
    render('checked', {
      marker: 'checked',
      tone: 'fail',
      glyph: 'cross',
      headline: 'COULD NOT CHECK IT',
      detail: [result.refused],
    });
    return;
  }

  const shown = tampered
    ? [
        el('blockquote', { class: 'recovered' }, [
          el('span', { class: 'recovered-label' }, ['What was signed']),
          el('p', { class: 'recovered-text' }, [sig.over]),
        ]),
        el('blockquote', { class: 'recovered recovered-tampered' }, [
          el('span', { class: 'recovered-label' }, ['What the checker was given']),
          el('p', { class: 'recovered-text' }, [target]),
        ]),
      ]
    : [
        el('blockquote', { class: 'recovered' }, [
          el('span', { class: 'recovered-label' }, ['What the signature covers']),
          el('p', { class: 'recovered-text' }, [sig.over]),
        ]),
      ];

  if (result.value && !tampered) {
    render(
      'checked',
      {
        marker: 'checked',
        tone: 'pass',
        glyph: 'open-lock',
        headline: 'VERIFIED',
        detail: [
          `This signature was made by the private half of pair ${pair.fingerprint}, over ` +
            'exactly this text.',
          'Checked with the public half alone, re-imported from the bytes anyone could have.',
        ],
      },
      [
        ...shown,
        p(
          'Now compare this with Step 3. There, a block that opened told you nothing about ' +
            'who closed it. Here, a signature that checks out tells you which pair made it ' +
            'and over which words. That is the gap a signature fills.',
          'claim-note'
        ),
      ]
    );
    return;
  }

  if (result.value && tampered) {
    render('checked', {
      marker: 'checked',
      tone: 'alarm',
      glyph: 'warn',
      headline: 'VERIFIED THE TAMPERED TEXT',
      detail: [
        'One character was changed and the check accepted it anyway. That must never ' +
          'happen, and this build is broken.',
      ],
    });
    return;
  }

  // The expected outcome of the tamper button, and a calm one: the check refusing
  // a text it was not given a signature for.
  render(
    'checked',
    {
      marker: 'checked',
      tone: 'held',
      glyph: 'closed-lock',
      headline: tampered ? 'DID NOT VERIFY' : 'DID NOT VERIFY',
      detail: [
        tampered
          ? `One character changed — position ${edit.at + 1} — and the check refused it.`
          : 'The signature does not match this text under this public half.',
        'Nothing went wrong. This is the check doing its job.',
      ],
    },
    [
      ...shown,
      p(
        'The signature was not touched. The text moved underneath it, and that was enough. ' +
          'A signature is over particular bytes, not over a topic or an intention.',
        'claim-note'
      ),
      p(
        'It cannot tell you WHICH side changed — only that the two no longer agree. ' +
          'Nothing here identifies who did the changing.',
        'aside-note'
      ),
    ]
  );
  retireStale();
}
