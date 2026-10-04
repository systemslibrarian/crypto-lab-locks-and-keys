/*
 * Locks and Keys — wiring.
 *
 * The page is a path, not a set of tabs: four numbered steps top to bottom, each
 * one answering a question the one before it raises. A newcomer has exactly one
 * thing to do on arrival — press the button in Step 1 — and the steps that cannot
 * yet do anything say so plainly instead of offering controls that would fail.
 *
 * NOTHING RUNS AT MOUNT EXCEPT THE PINNED CASES. Step 1's pair is made when the
 * reader asks for it, because generating it is the moment the lesson starts. The
 * pinned cases run on their own because their whole purpose is to have already
 * answered the question "can I trust this page" before it is asked.
 */
import './style.css';
import { MAX_MESSAGE_BYTES } from './crypto/pair';
import { mountStep1 } from './ui/step1';
import { mountStep2 } from './ui/step2';
import { mountStep3 } from './ui/step3';
import { mountStep4 } from './ui/step4';
import { mountPinned } from './ui/pinnedPanel';
import { mountLearnerCheck } from './ui/learnerCheck';
import { retireStale } from './ui/verdict';
import { state } from './ui/state';

/**
 * Steps 2-4 need something from the step before them. Rather than hiding those
 * controls — a hidden control cannot be read, and a reader who cannot see where
 * the path leads does not know there is one — each gate disables its buttons and
 * shows one sentence naming what is missing.
 *
 * Disabled buttons keep their accessible names and stay in the document, so the
 * shape of the whole lab is legible from the first screen.
 *
 * ONLY BUTTONS ARE GATED, never the note box. Writing a note before a pair
 * exists is harmless, and a disabled textarea would mean the byte counter — the
 * one place the 190-byte budget is learnable rather than asserted — sat inert
 * until the reader had already pressed something. The gate is on the action, not
 * on the thinking.
 */
const GATES: { readonly id: string; readonly needs: () => boolean; readonly why: string }[] = [
  {
    id: 'step-2',
    needs: () => state.pair !== null,
    why: 'Make a key pair in Step 1 first — there is no lock to close yet.',
  },
  {
    id: 'step-3',
    needs: () => state.locked !== null,
    why: 'Close the lock in Step 2 first — there is nothing to open yet.',
  },
  {
    id: 'step-4',
    needs: () => state.pair !== null,
    why: 'Make a key pair in Step 1 first — signing uses that same pair.',
  },
];

function applyGates(): void {
  for (const gate of GATES) {
    const section = document.getElementById(gate.id);
    if (!section) continue;
    const open = gate.needs();
    section.classList.toggle('step-waiting', !open);
    const note = section.querySelector('.gate-note');
    if (note) {
      note.textContent = open ? '' : gate.why;
      (note as HTMLElement).hidden = open;
    }
    for (const control of Array.from(
      section.querySelectorAll<HTMLButtonElement>('button[data-gated]')
    )) {
      control.disabled = !open;
    }
  }
}

function boot(): void {
  // The byte budget is printed from the same constant the check uses, so the
  // sentence, the maxlength attribute and the refusal cannot drift apart.
  for (const node of Array.from(document.querySelectorAll('[data-max-bytes]'))) {
    node.textContent = String(MAX_MESSAGE_BYTES);
  }
  const message = document.getElementById('message') as HTMLTextAreaElement | null;
  message?.setAttribute('maxlength', String(MAX_MESSAGE_BYTES));

  mountStep1(() => {
    retireStale();
    applyGates();
  });
  mountStep2({
    onLocked: () => applyGates(),
    onMessageChanged: () => applyGates(),
  });
  mountStep3({ onOpened: () => applyGates() });
  mountStep4();
  mountLearnerCheck();
  applyGates();

  // Awaited nowhere: the pinned run is independent of everything the reader
  // does, and a failure in it must not stop the rest of the page mounting. It
  // renders its own alarm verdict if it disagrees, and `watchPageErrors` in the
  // a11y gate catches it if it throws.
  void mountPinned();
}

boot();
