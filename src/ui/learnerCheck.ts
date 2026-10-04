/*
 * The quick check in Step 4.
 *
 * It asks the one thing a reader can get wrong having just watched the whole
 * thing work, and both answers are scanned by the a11y gate: the wrong answer
 * paints a `pill-bad`, the right one a `pill-ok`, and both carry words beside
 * the colour.
 *
 * It is a `<details>` and ships shut, so a reader who already knows is not made
 * to scroll past a quiz.
 */
import { byId } from './dom';

export function mountLearnerCheck(): void {
  const result = byId('check-result');
  for (const option of Array.from(document.querySelectorAll<HTMLButtonElement>('.check-opt'))) {
    option.addEventListener('click', () => {
      const right = option.dataset.correct === 'true';
      result.className = `check-result ${right ? 'pill-ok' : 'pill-bad'}`;
      result.textContent = right
        ? 'Correct. One pair, two jobs — and the half that signs is the half you keep.'
        : 'Not quite. Look again at the SAME PAIR box above: nothing new was generated, and ' +
          'the half that signed is the private one you never hand out.';
    });
  }
}
