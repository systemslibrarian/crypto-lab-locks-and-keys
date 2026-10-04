/*
 * Step 4 — The same pair, two different jobs.
 *
 * WHY THIS IS NOT CALLED "THE SAME PAIR, BACKWARDS" ANY MORE. It was, and the
 * phrase was the one genuinely misleading thing in this lab.
 *
 * What is true: one RSA key pair does both jobs here, and the halves swap roles.
 * Steps 2 and 3 encrypt with the public half and decrypt with the private half;
 * this step signs with the private half and verifies with the public half. That
 * really is the insight a newcomer is missing, and this panel PROVES the pair is
 * the same one by exporting the public half from both handles and comparing the
 * bytes.
 *
 * What is NOT true: that signing is encryption run backwards. RSAES-OAEP and
 * RSASSA-PSS are different constructions with different padding, and PSS
 * verification does not decrypt a signature to recover a message — it rebuilds
 * an encoded block and checks its structure. "Running the pair backwards" is a
 * statement about the raw trapdoor, not about either scheme, and a beginner who
 * takes it literally ends up believing a signature is a secret in reverse. Other
 * public-key families do not offer both jobs on one pair at all, and production
 * systems routinely keep signing and encryption keys separate.
 *
 * So the panel teaches "same pair, different jobs" and says the two operations
 * are distinct. The lesson survives; the false mechanism claim does not.
 *
 * Two further honesty fixes live here:
 *
 *  - A VERIFIED signature is marked with a SEAL, never the opening padlock. A
 *    lock springing open is the picture of a secret being read, and a signature
 *    reveals nothing. The panel also shows the readable note beside the
 *    signature, so "sharing a signature does not hide the message" is
 *    demonstrated rather than asserted.
 *
 *  - Verification is scoped to what it establishes. "A signature is the part
 *    that says who" is too strong on its own: it says the signature matches
 *    THIS note under THIS public key. Connecting that to a person needs the
 *    separate knowledge that the key is theirs, and the panel says so in the
 *    state where it matters.
 */
import { importPublicForChecking, sameBytes } from '../crypto/pair';
import { check, sign } from '../crypto/sign';
import { preview, toBase64, toHex } from '../crypto/bytes';
import { copyButton, disclosure, el, longValue, p } from './dom';
import { closedLock, key } from './icons';
import { render, slot } from './verdict';
import { basis, state } from './state';
import { settled } from './settle';
import { differingPositions, tamperOne } from './tamper';
import { markedDiff } from './diff';

export function mountStep4(): void {
  const samePairHost = document.getElementById('s4-same-out') as HTMLElement;
  const signedHost = document.getElementById('s4-sign-out') as HTMLElement;
  const checkedHost = document.getElementById('s4-check-out') as HTMLElement;
  const checkerBox = document.getElementById('checker-text') as HTMLTextAreaElement;
  const checkerWrap = document.getElementById('checker-wrap') as HTMLElement;

  slot('same-pair', samePairHost, basis.pairMade, 'A new pair was made. Sign again with it.');
  slot('signed', signedHost, basis.signed, 'The note changed. Sign this version again.');
  slot(
    'checked',
    checkedHost,
    basis.checked,
    'The note or the signature changed since this check. Check again.'
  );

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
        detail: ['Write something in Step 2 first — a signature is over a particular text.'],
      });
      return;
    }
    state.signature = await sign(pair.signWith, state.message, pair.fingerprint);
    // The checker starts with exactly what was signed. The reader may then edit
    // it, which is the honest shape of tampering: the signature is untouched and
    // the document moves underneath it.
    state.checkerText = state.message;
    checkerBox.value = state.message;
    checkerWrap.hidden = false;
    await showSamePair();
    showSigned();
    settled();
  });

  checkerBox.addEventListener('input', () => {
    state.checkerText = checkerBox.value;
    settled();
  });

  checkBtn.addEventListener('click', () => void runCheck());
  tamperBtn.addEventListener('click', () => {
    const sig = state.signature;
    if (!sig) return;
    const edit = tamperOne(sig.over);
    // Edit the CHECKER copy, visibly, so the reader can see the button did the
    // same thing they could have done by typing — and can then type their own.
    state.checkerText = edit.changed;
    checkerBox.value = edit.changed;
    void runCheck();
  });
}

/**
 * The same-pair proof, computed rather than claimed.
 *
 * Exports the public half twice — once from the handle that encrypts, once from
 * the handle that verifies — and compares the bytes. These are two different
 * `CryptoKey` objects with two different algorithm names, and WebCrypto writes
 * the same `rsaEncryption` SPKI for both, so what survives the comparison is the
 * key itself.
 */
async function showSamePair(): Promise<void> {
  const pair = state.pair;
  if (!pair) return;
  const fromLocking = new Uint8Array(await crypto.subtle.exportKey('spki', pair.lockWith));
  const fromChecking = new Uint8Array(await crypto.subtle.exportKey('spki', pair.checkWith));

  if (!sameBytes(fromLocking, fromChecking)) {
    render('same-pair', {
      marker: 'same-pair',
      tone: 'alarm',
      glyph: 'warn',
      headline: 'NOT THE SAME PAIR',
      detail: [
        'The half that verifies signatures is not the half that encrypts, so this panel ' +
          'cannot claim what it claims. Something in this build is wrong.',
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
        'No new keys were made for this step.',
        `The public half used for encrypting and the public half used for verifying are ` +
          `the same ${fromLocking.length} bytes, compared one by one. Both are your pair, ${pair.fingerprint}.`,
      ],
    },
    [
      el('div', { class: 'jobs' }, [
        el('div', { class: 'job' }, [
          el('p', { class: 'job-head' }, [closedLock(), el('span', {}, ['Steps 2 and 3'])]),
          p('Maya encrypted with your PUBLIC half. You decrypted with your PRIVATE half.', 'job-line'),
          p('Keeps a note private.', 'job-note'),
        ]),
        el('div', { class: 'job' }, [
          el('p', { class: 'job-head' }, [key(), el('span', {}, ['Step 4 — you are the signer'])]),
          p('You sign with your PRIVATE half. Maya verifies with your PUBLIC half.', 'job-line'),
          p('Lets Maya check a note matches a signature. It does not hide it.', 'job-note'),
        ]),
      ]),
      p(
        'Read those two boxes together and you have the idea: one pair, and the halves ' +
          'change jobs. Encrypting and signing are different operations — a signature is ' +
          'not a secret, and it is not encryption run backwards — but in RSA the same pair ' +
          'can do both.',
        'claim-note'
      ),
      disclosure('Show both exports side by side', [
        p(
          'The same public half, exported twice from two different key handles. If these ' +
            'two lines differ, this panel is lying and the verdict above says so.',
          'bytes-lede'
        ),
        longValue(toBase64(fromLocking), 'Exported from the encrypting half'),
        longValue(toBase64(fromChecking), 'Exported from the verifying half'),
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
        `${sig.bytes.length} bytes, made with the private half of your pair, ${sig.signedBy}.`,
        'The public half was not used and was not needed — the mirror of Step 2, where the ' +
          'private half was not used.',
      ],
    },
    [
      // The readable note beside the signature, so the next sentence is a
      // demonstration rather than a claim.
      el('blockquote', { class: 'recovered' }, [
        el('span', { class: 'recovered-label' }, ['The note — still perfectly readable']),
        el('p', { class: 'recovered-text' }, [sig.over]),
      ]),
      el('p', { class: 'byte-strip' }, [
        el('span', { class: 'byte-strip-label' }, ['The signature, first 32 bytes']),
        el('code', { class: 'byte-strip-code' }, [preview(sig.bytes)]),
      ]),
      p(
        'Sharing a signature does not hide the message. The note is right there in the ' +
          'open beside it — a signature travels WITH a readable note and says nothing ' +
          'about keeping it secret. That is what Step 2 was for.',
        'claim-note'
      ),
      p(
        'Press Sign again and the signature bytes will be completely different, and both ' +
          'signatures will verify. A fresh random salt goes into every signature, just as a ' +
          'fresh seed goes into every locked block.',
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
 * Verify the signature against whatever the checker box currently holds.
 *
 * The public half is RE-IMPORTED from the exported bytes before verifying, so
 * the check demonstrably uses nothing but the public half. A reader is entitled
 * to ask how they know the private key was not involved; this is the answer.
 */
async function runCheck(): Promise<void> {
  const pair = state.pair;
  const sig = state.signature;
  // Both are gated in markup (`data-needs="signature"`), so this is a belt-and-
  // braces guard rather than the thing standing between a reader and a silent
  // no-op. See gates.ts for why that distinction cost a rewrite.
  if (!pair || !sig) return;

  const given = state.checkerText ?? sig.over;
  const publicOnly = await importPublicForChecking(pair.publicKeyBytes);
  const result = await check(publicOnly, sig.bytes, given);

  if (!result.ok) {
    render('checked', {
      marker: 'checked',
      tone: 'fail',
      glyph: 'cross',
      headline: 'COULD NOT CHECK IT',
      detail: [result.refused],
    });
    settled();
    return;
  }

  const edited = given !== sig.over;
  const where = differingPositions(sig.over, given);

  if (result.value && !edited) {
    render(
      'checked',
      {
        marker: 'checked',
        tone: 'pass',
        glyph: 'seal',
        headline: 'VERIFIED',
        detail: [
          'This signature matches this exact note, under the public half of your pair, ' +
            `${pair.fingerprint}.`,
          'Verified with the public half alone, re-imported from the bytes anyone could have.',
        ],
      },
      [
        el('blockquote', { class: 'recovered' }, [
          el('span', { class: 'recovered-label' }, ['What the signature covers']),
          el('p', { class: 'recovered-text' }, [sig.over]),
        ]),
        // The trust boundary, in the state where a reader is most likely to
        // over-read the result.
        p(
          'Careful what that buys. It says the signature matches this note and this public ' +
            'half. To conclude that MAYA signed it, you also have to know that this public ' +
            'half really is Maya’s — nothing on this page establishes that, and it is ' +
            'what certificates and key verification exist for.',
          'negative-claim'
        ),
        p(
          'It also says nothing about whether the note is true, whether Maya meant it, or ' +
            'who was sitting at her keyboard. A valid signature is a statement about bytes ' +
            'and a key, and only that.',
          'aside-note'
        ),
        p(
          'Now compare this with Step 3. There, a block that opened told you nothing about ' +
            'who encrypted it. Here, a signature that verifies ties the note to a particular ' +
            'key. That is the gap a signature fills — and the gap it leaves.',
          'claim-note'
        ),
      ]
    );
    settled();
    return;
  }

  if (result.value && edited) {
    render('checked', {
      marker: 'checked',
      tone: 'alarm',
      glyph: 'warn',
      headline: 'VERIFIED A CHANGED NOTE',
      detail: [
        'The note handed to the checker is not the note that was signed, and the check ' +
          'accepted it anyway. That must never happen, and this build is broken.',
      ],
    });
    settled();
    return;
  }

  // The expected outcome of an edit, and a calm one: the check refusing a text
  // it was not given a signature for.
  render(
    'checked',
    {
      marker: 'checked',
      tone: 'held',
      glyph: 'closed-lock',
      headline: 'DID NOT VERIFY',
      detail: [
        edited
          ? where.length === 1
            ? `One character is different — the ${ordinal(where[0])} — and the check refused it.`
            : `${where.length} characters are different, and the check refused it.`
          : 'The signature does not match this note under this public half.',
        'Nothing went wrong. This is the check doing its job.',
      ],
    },
    [
      el('blockquote', { class: 'recovered' }, [
        el('span', { class: 'recovered-label' }, ['What was signed']),
        el('p', { class: 'recovered-text' }, [sig.over]),
      ]),
      el('blockquote', { class: 'recovered recovered-tampered' }, [
        el('span', { class: 'recovered-label' }, [
          'What the checker was given — the difference is marked',
        ]),
        markedDiff(given, sig.over),
      ]),
      p(
        'The signature was not touched. The note moved underneath it, and that was enough. ' +
          'A signature is over particular bytes, not over a topic or an intention.',
        'claim-note'
      ),
      p(
        'It cannot tell you WHICH side changed — only that the two no longer agree. Nothing ' +
          'here identifies who did the changing. Try editing the box yourself.',
        'aside-note'
      ),
    ]
  );
  settled();
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
