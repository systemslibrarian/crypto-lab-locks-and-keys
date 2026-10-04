/*
 * Locks and Keys — wiring.
 *
 * The page is a path, not a set of tabs: four numbered steps top to bottom, each
 * answering a question the one before it raises. A newcomer has exactly one
 * thing to do on arrival — press the button in Step 1 — and the steps that
 * cannot yet do anything say so plainly instead of offering controls that would
 * fail silently.
 *
 * NOTHING RUNS AT MOUNT EXCEPT THE PINNED CASES. Step 1's pair is made when the
 * reader asks for it, because generating it is the moment the lesson starts. The
 * pinned cases run on their own because their whole purpose is to have already
 * answered "can I trust this page" before it is asked.
 *
 * WHERE THE RULES LIVE, after a review found two of them scattered:
 *   gates.ts   what each control needs, declared per control in markup
 *   settle.ts  the one function every action calls after changing anything
 *   state.ts   the dependency graph every verdict's freshness is judged against
 * A new action added later gets invalidation, gating and the next-step link for
 * free, which is the only kind of fix that survives the next edit.
 */
import './style.css';
import { MAX_MESSAGE_BYTES } from './crypto/pair';
import { mountStep1 } from './ui/step1';
import { mountStep2 } from './ui/step2';
import { mountStep3 } from './ui/step3';
import { mountStep4 } from './ui/step4';
import { mountPinned } from './ui/pinnedPanel';
import { mountQuestions } from './ui/quiz';
import { settled } from './ui/settle';

/**
 * Report an environment that cannot run this lab, instead of leaving controls to
 * fail one by one.
 *
 * `crypto.subtle` is undefined in a non-secure context (plain http on a host
 * that is not localhost) and in a few locked-down configurations. Without this
 * check every button on the page throws on click and the reader sees four dead
 * controls with no explanation — the page would look broken rather than
 * unavailable, which is a worse failure than saying so.
 */
function webCryptoMissing(): boolean {
  return typeof crypto === 'undefined' || !crypto.subtle;
}

function reportUnavailable(): void {
  const banner = document.getElementById('unavailable');
  if (banner) banner.hidden = false;
  for (const control of Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[data-needs]')
  )) {
    control.disabled = true;
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

  mountQuestions();

  if (webCryptoMissing()) {
    reportUnavailable();
    return;
  }

  mountStep1();
  mountStep2();
  mountStep3();
  mountStep4();
  settled();

  // Awaited nowhere: the pinned run is independent of everything the reader
  // does, and a failure in it must not stop the rest of the page mounting. It
  // renders its own alarm verdict if it disagrees, and `watchPageErrors` in the
  // a11y gate catches it if it throws.
  void mountPinned();
}

boot();
