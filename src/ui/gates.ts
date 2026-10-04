/*
 * What each control needs before it can do anything, and the one place that
 * decides.
 *
 * THIS FILE EXISTS BECAUSE GATING BY SECTION WAS WRONG. Steps 2-4 each had a
 * single gate, and Step 4's was "a pair exists" — so the moment a reader made a
 * pair, Check the signature and the tamper button both became enabled with no
 * signature to check. Pressing Check then ran `runCheck`, hit its
 * `if (!pair || !sig) return;` guard, and rendered nothing at all. A button that
 * looks available and silently does nothing is worse for a beginner than a
 * disabled one, because the only thing it teaches is that the page is broken.
 *
 * So the prerequisite is declared PER CONTROL, in markup, as `data-needs`, and
 * the sentence a reader sees names the thing that is missing and where to get
 * it. A control is enabled exactly when its own prerequisite holds.
 */
import { state } from './state';

/** The three things a control can be waiting for. */
export type Need = 'pair' | 'lock' | 'signature';

interface Prerequisite {
  readonly holds: () => boolean;
  /** What a reader must do, and where. Shown beside the disabled control. */
  readonly todo: string;
}

export const NEEDS: Record<Need, Prerequisite> = {
  pair: {
    holds: () => state.pair !== null,
    todo: 'Make a key pair in Step 1 first.',
  },
  lock: {
    holds: () => state.locked !== null,
    todo: 'Lock a note in Step 2 first — there is nothing to open yet.',
  },
  signature: {
    holds: () => state.signature !== null,
    todo: 'Sign the note first, with the button above.',
  },
};

/**
 * Enable or disable every gated control, and show one sentence per step naming
 * what is missing.
 *
 * Nothing is hidden. A hidden control cannot be read, and a reader who cannot
 * see where the path leads does not know there is one — so the shape of the
 * whole lab is legible from the first screen and the disabled controls keep
 * their accessible names. `aria-describedby` ties each disabled control to the
 * sentence explaining it, so the reason is announced rather than only painted.
 */
export function applyGates(): void {
  for (const control of Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[data-needs]')
  )) {
    const need = control.dataset.needs as Need;
    const prerequisite = NEEDS[need];
    if (!prerequisite) continue;
    control.disabled = !prerequisite.holds();
  }

  // One note per step, naming the first unmet prerequisite in it. A step whose
  // controls have different prerequisites (Step 4 needs a pair to sign and a
  // signature to check) reports the one actually blocking progress now.
  for (const note of Array.from(document.querySelectorAll<HTMLElement>('.gate-note'))) {
    const step = note.closest('section');
    if (!step) continue;
    const blocked = Array.from(
      step.querySelectorAll<HTMLButtonElement>('button[data-needs]')
    ).find((c) => c.disabled);
    const todo = blocked ? NEEDS[blocked.dataset.needs as Need]?.todo : undefined;
    note.textContent = todo ?? '';
    note.hidden = !todo;
    step.classList.toggle('step-waiting', Boolean(todo));
  }
}
