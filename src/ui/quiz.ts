/*
 * Predictions, and the three questions at the end.
 *
 * TWO DIFFERENT JOBS, deliberately not merged.
 *
 * A PREDICTION comes before an experiment and asks the reader to commit. It
 * matters because the paragraph above each button used to give the answer away —
 * "it will not open them", "a message that opens proves nothing" — so the
 * experiment confirmed a sentence rather than testing a belief. Being wrong
 * about something you have just committed to is the moment the idea sticks.
 * Predictions are optional, they never block a button, and the feedback explains
 * the mechanism instead of marking an answer.
 *
 * A SCENARIO CHECK comes at the end and asks the reader to apply the idea
 * somewhere the page has not already shown them. Clicking every button is not
 * evidence of understanding; these are. They are low-pressure by design: no
 * score, no gate, and the explanation is the content.
 *
 * Every option is a real button with an accessible name, every answer is
 * icon-and-text-and-colour, and the whole set ships inside disclosures that
 * start shut so a reader who already knows is not made to scroll past a quiz.
 */
import { el, fill } from './dom';
import { cross, tick } from './icons';

interface Option {
  readonly label: string;
  readonly correct: boolean;
  /** Why — shown whichever option is chosen, because the mechanism is the point. */
  readonly because: string;
}

interface Question {
  /** The element whose children this question replaces. */
  readonly host: string;
  readonly prompt: string;
  readonly options: readonly Option[];
}

const QUESTIONS: readonly Question[] = [
  {
    host: 'predict-wrong-key',
    prompt: 'Before you press it: will a different private key open this note?',
    options: [
      {
        label: 'No — only the matching private key opens it',
        correct: true,
        because:
          'Right. The note was encrypted to one particular public key, and only its partner ' +
          'opens it. An unrelated key is not a worse key; it is the wrong key.',
      },
      {
        label: 'Yes — any private key can decrypt',
        correct: false,
        because:
          'Not quite. A private key is not a universal decryptor. It only opens notes ' +
          'encrypted to its own public key, which is the whole reason you can publish that ' +
          'key safely.',
      },
    ],
  },
  {
    host: 'predict-stranger',
    prompt:
      'Before you press it: your public key is public. If a stranger uses it to encrypt ' +
      'something, will your private key open it?',
    options: [
      {
        label: 'Yes — and nothing will say who sent it',
        correct: true,
        because:
          'Right, and this is the uncomfortable part. Anyone with the public key can produce ' +
          'something your private key opens. Decryption working tells you the note was ' +
          'encrypted to you; it says nothing about who did it.',
      },
      {
        label: 'No — it only opens notes I was meant to receive',
        correct: false,
        because:
          'Not quite. There is no "meant to" in the mechanism. The public key is public, so ' +
          'anybody can use it, and the result is indistinguishable from a note sent by someone ' +
          'you trust.',
      },
    ],
  },
  {
    host: 'predict-sign',
    prompt: 'Before you sign: does signing a note hide it?',
    options: [
      {
        label: 'No — the note stays readable',
        correct: true,
        because:
          'Right. A signature is a separate value that travels alongside a readable note. ' +
          'Encryption hides; a signature does not. They are different operations.',
      },
      {
        label: 'Yes — signing is a kind of encryption',
        correct: false,
        because:
          'Not quite, and this is the most common thing to get wrong. A signature is checked ' +
          'against a message and a public key; it never hides the message. You will see the ' +
          'note sitting in the open beside its signature.',
      },
    ],
  },
  {
    host: 'check-roles',
    prompt: 'You just signed a note and verified it. Which key did each job?',
    options: [
      {
        label: 'The private key signed; the public key verified',
        correct: true,
        because:
          'Right. The key you keep is the key that signs — which is what makes a signature ' +
          'worth anything, since nobody else has it. The key you publish is the key that ' +
          'checks, which is why anybody can check.',
      },
      {
        label: 'A separate signing key, generated for this step',
        correct: false,
        because:
          'Not here. This demo generated exactly ONE pair, in Step 1, and the SAME PAIR box ' +
          'above proves it by exporting the public key from both handles. Worth knowing, ' +
          'though: real systems often DO keep separate keys for signing and encryption, on ' +
          'purpose. That is a choice about key management, not something the maths requires.',
      },
      {
        label: 'The public key signed; the private key verified',
        correct: false,
        because:
          'The other way round. If the public key could sign, everybody could sign as you — ' +
          'and if checking needed the private key, nobody but you could check.',
      },
    ],
  },
  {
    host: 'scenario-1',
    prompt: 'A friend wants to send you a private note. Which key do you give them?',
    options: [
      {
        label: 'The public key',
        correct: true,
        because:
          'Right. They encrypt with your public key; only your private key opens the result. ' +
          'You can send the public key over anything, even a channel somebody is reading.',
      },
      {
        label: 'The private key',
        correct: false,
        because:
          'No — and this is the one mistake with no recovery. Handing out the private key ' +
          'means anyone who ever recorded a note encrypted to you can now read it.',
      },
      {
        label: 'Both, so either one works',
        correct: false,
        because:
          'No. The keys are not interchangeable, and sending the private key undoes the ' +
          'whole arrangement. Only the public key travels.',
      },
    ],
  },
  {
    host: 'scenario-2',
    prompt: 'A note decrypts successfully with your private key. Does that establish who sent it?',
    options: [
      {
        label: 'No — anyone with the public key could have made it',
        correct: true,
        because:
          'Right, and you proved it in Step 3. Successful decryption establishes that the note ' +
          'was encrypted to your public key, and nothing more.',
      },
      {
        label: 'Yes — only someone I trust could have encrypted it',
        correct: false,
        because:
          'No. The public key is public by design, so "someone who could encrypt to you" is ' +
          'everybody. A signature is what narrows it down.',
      },
    ],
  },
  {
    host: 'scenario-3',
    prompt:
      'A signature verifies against a public key labelled "Maya". What must you know before ' +
      'attributing the note to Maya?',
    options: [
      {
        label: 'That this public key really is Maya’s',
        correct: true,
        because:
          'Right. Verification ties a note to a KEY. Tying that key to a person is a separate ' +
          'problem, and it is the one certificates, fingerprint comparison and in-person key ' +
          'exchange exist to solve. Nothing on this page establishes it.',
      },
      {
        label: 'Nothing — a valid signature proves the sender',
        correct: false,
        because:
          'Not quite. The signature is valid for that key. If the key is not actually Maya’s, ' +
          'the signature is still perfectly valid and the attribution is still wrong.',
      },
      {
        label: 'That the note is true',
        correct: false,
        because:
          'No — a signature says nothing about whether a note is true, only that it matches ' +
          'the signature under that key. Someone can sign a lie.',
      },
    ],
  },
];

export function mountQuestions(): void {
  for (const question of QUESTIONS) {
    const host = document.getElementById(question.host);
    if (!host) continue;
    const answer = el('p', { class: 'check-result', role: 'status', 'aria-live': 'polite' });
    const options = el(
      'ul',
      { class: 'check-opts', role: 'list' },
      question.options.map((option) =>
        el('li', { role: 'listitem' }, [
          (() => {
            const btn = el('button', { type: 'button', class: 'check-opt' }, [option.label]);
            btn.addEventListener('click', () => {
              answer.className = `check-result ${option.correct ? 'pill-ok' : 'pill-bad'}`;
              fill(
                answer,
                el('span', { class: 'pill-head' }, [
                  option.correct ? tick() : cross(),
                  el('span', {}, [option.correct ? 'Correct' : 'Not quite']),
                ]),
                el('span', { class: 'pill-why' }, [option.because])
              );
            });
            return btn;
          })(),
        ])
      )
    );
    fill(host, el('p', { class: 'check-q' }, [question.prompt]), options, answer);
  }
}
