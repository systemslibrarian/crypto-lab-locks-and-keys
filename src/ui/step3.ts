/*
 * Step 3 — Open it, fail to open it, and then the part nobody expects.
 *
 * Three experiments, and the last one is the reason this panel is the longest in
 * the lab.
 *
 *  1. OPEN IT. The private half, and nothing else, returns the note.
 *
 *  2. TRY A DIFFERENT PRIVATE KEY. A second pair is generated and its private
 *     half is handed the same bytes. It refuses. The panel paints that refusal
 *     CALM — tone `held`, not `fail` and certainly not `alarm` — because the
 *     lock holding shut against the wrong key is the single thing a lock is for.
 *     A red alarm here would teach a reader that they had broken something, when
 *     what they have just done is watch it work.
 *
 *  3. LET A STRANGER USE YOUR PUBLIC HALF. This is the lab's negative-claim
 *     fixture (§4.1d). A party holding nothing but the exported public bytes
 *     writes a message the reader never typed, and the reader's own private half
 *     opens it perfectly. Every check on the page reports success — because
 *     there is no check here that could do otherwise. RSAES-OAEP carries no
 *     sender field, so there is nothing to verify and no error code to raise.
 *     The absence of a code is the exhibit, and the verdict reads as success and
 *     limitation at once: OPENED — AND UNATTRIBUTED.
 *
 * That fixture is also the reason Step 4 exists, and it says so.
 *
 * Each experiment asks the reader to PREDICT first. The prediction is optional
 * and never blocks the button — but a reader who has committed to an answer
 * learns more from being wrong than a reader who was told the answer in the
 * paragraph above the control, which is what this panel used to do.
 */
import { importPublicForLocking, makePair } from '../crypto/pair';
import { close, open } from '../crypto/lock';
import { el, p } from './dom';
import { render, slot } from './verdict';
import { basis, state } from './state';
import { settled } from './settle';

/**
 * The one sentence this lab promises is NOT true of the construction on the page.
 *
 * Scoped to RSAES-OAEP as these panels use it, never to public-key cryptography
 * at large — "public-key encryption does not identify the sender" would be
 * false, and is falsified by the signature in Step 4 and by every authenticated
 * scheme from HPKE's auth mode onward.
 *
 * It is rendered in the fixture state, on screen, not in a disclosure and not in
 * the README. `e2e/claims.spec.ts` asserts it is present there, and the mutation
 * ledger records what happens when it is deleted.
 */
export const NEGATIVE_CLAIM =
  'A note that opens does not tell you who sent it. RSA-OAEP decryption ' +
  'establishes nothing at all about the sender: anyone holding the public half ' +
  'can produce a block this private half opens, and the block carries no record ' +
  'of who made it.';

export function mountStep3(): void {
  const openedHost = document.getElementById('s3-out') as HTMLElement;
  const wrongHost = document.getElementById('s3-wrong-out') as HTMLElement;
  const strangerHost = document.getElementById('s3-stranger-out') as HTMLElement;

  slot('opened', openedHost, basis.opened, 'The note or the encrypted block changed. Open it again.');
  slot(
    'wrong-key',
    wrongHost,
    basis.wrongKey,
    'The encrypted block changed. Try a different private key again.'
  );
  slot(
    'unattributed',
    strangerHost,
    basis.unattributed,
    'Your pair changed. Let a stranger try again.'
  );

  const openBtn = document.getElementById('open-lock') as HTMLButtonElement;
  const wrongBtn = document.getElementById('try-wrong-key') as HTMLButtonElement;
  const strangerBtn = document.getElementById('stranger-lock') as HTMLButtonElement;

  openBtn.addEventListener('click', async () => {
    const pair = state.pair;
    const locked = state.locked;
    if (!pair || !locked) return;
    const result = await open(pair.openWith, locked.bytes);
    if (!result.ok) {
      // Unreachable with a correct build: this is the reader's own pair opening
      // its own lock. It is rendered rather than swallowed so that a build in
      // which it DOES happen says so instead of painting nothing.
      render('opened', {
        marker: 'opened',
        tone: 'alarm',
        glyph: 'warn',
        headline: 'DID NOT OPEN — AND IT SHOULD HAVE',
        detail: [
          'Your own private half failed to open your own note. That should be impossible; ' +
            'something in this build is wrong.',
        ],
      });
      settled();
      return;
    }
    render(
      'opened',
      {
        marker: 'opened',
        tone: 'pass',
        glyph: 'open-lock',
        headline: 'OPENED',
        detail: [
          'The private half returned the note, character for character.',
          `Opened with the private half of your pair, ${pair.fingerprint} — the same pair ` +
            'whose public half encrypted it.',
        ],
      },
      [
        el('blockquote', { class: 'recovered' }, [
          el('span', { class: 'recovered-label' }, ['What came back']),
          el('p', { class: 'recovered-text' }, [result.value]),
        ]),
        p(
          'The public half was not used here. Encrypting took the public half and nothing ' +
            'else; decrypting took the private half and nothing else. One pair, two jobs.',
          'claim-note'
        ),
      ]
    );
    settled();
  });

  wrongBtn.addEventListener('click', async () => {
    const locked = state.locked;
    if (!locked) return;
    wrongBtn.disabled = true;
    const was = wrongBtn.textContent ?? '';
    wrongBtn.textContent = 'Making a second pair…';
    try {
      // A genuinely fresh pair, generated now. Nothing is faked and no error is
      // simulated: WebCrypto is handed the wrong private key and asked to try.
      state.otherPair = await makePair();
      const result = await open(state.otherPair.openWith, locked.bytes);
      if (result.ok) {
        // The one state on this page that earns an alarm: something that had to
        // fail did not.
        render('wrong-key', {
          marker: 'wrong-key',
          tone: 'alarm',
          glyph: 'warn',
          headline: 'OPENED WITH THE WRONG KEY',
          detail: [
            'A key from an unrelated pair just opened this note. That must never happen, ' +
              'and this build is broken.',
          ],
        });
        return;
      }
      render(
        'wrong-key',
        {
          marker: 'wrong-key',
          tone: 'held',
          glyph: 'closed-lock',
          headline: 'DID NOT OPEN',
          detail: [
            result.refused,
            `Pair ${state.otherPair.fingerprint} is a different pair from yours, ${
              state.pair?.fingerprint ?? ''
            }, and the encryption can tell.`,
          ],
        },
        [
          p(
            'Nothing went wrong here. This is the one thing encryption has to do, and you ' +
              'just watched it do it.',
            'claim-note'
          ),
          p(
            'Notice how little it told you. It did not say which key it wanted, or how close ' +
              'you were. That silence is deliberate: a lock that explained its refusals could ' +
              'be interrogated one guess at a time.',
            'aside-note'
          ),
        ]
      );
    } finally {
      wrongBtn.disabled = false;
      wrongBtn.textContent = was;
      settled();
    }
  });

  strangerBtn.addEventListener('click', async () => {
    const pair = state.pair;
    if (!pair) return;
    strangerBtn.disabled = true;
    try {
      // The stranger is given the exported public bytes and nothing else. Not a
      // flag, not a mode — a separate imported key that can only encrypt.
      const strangerHandle = await importPublicForLocking(pair.publicKeyBytes);
      state.fromStranger = await close(strangerHandle, state.strangerText);
      const result = await open(pair.openWith, state.fromStranger.bytes);

      if (!result.ok) {
        render('unattributed', {
          marker: 'unattributed',
          tone: 'alarm',
          glyph: 'warn',
          headline: 'THE FIXTURE DID NOT HOLD',
          detail: [
            'The stranger block did not open, so this panel cannot demonstrate what it ' +
              'claims. Something in this build is wrong.',
          ],
        });
        return;
      }

      render(
        'unattributed',
        {
          marker: 'unattributed',
          tone: 'alarm',
          glyph: 'warn',
          headline: 'OPENED — AND UNATTRIBUTED',
          detail: [
            'It opened. The text is intact. Every check this page performs reports success.',
            'You did not write it, and Maya did not write it.',
          ],
        },
        [
          el('blockquote', { class: 'recovered recovered-stranger' }, [
            el('span', { class: 'recovered-label' }, ['What came back']),
            el('p', { class: 'recovered-text' }, [result.value]),
          ]),
          p(NEGATIVE_CLAIM, 'negative-claim'),
          p(
            'There is no failure code to show you, because there is no check here that could ' +
              'fail. The encrypted block has no sender field in it — nothing to verify, ' +
              'nothing to get wrong. The missing error is the whole exhibit.',
            'claim-note'
          ),
          el('p', { class: 'handoff' }, [
            'This is why Step 4 exists. A signature is the part that ties a note to a key. ',
            el('a', { href: '#step-4' }, ['Go to Step 4']),
            '.',
          ]),
        ]
      );
    } finally {
      strangerBtn.disabled = false;
      settled();
    }
  });
}
