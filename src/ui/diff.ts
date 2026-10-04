/*
 * Show WHICH character changed, rather than naming a number.
 *
 * "One character changed — position 34" asks a reader to count. Marking the
 * character shows them. The mark is a `<mark>` with words in it, not a colour
 * alone (WCAG 1.4.1): the changed grapheme is wrapped and the sentence beside it
 * says what it was and what it became, so the information survives greyscale, a
 * screen reader and a reader who never notices the highlight.
 */
import { el } from './dom';
import { graphemes } from './tamper';

/**
 * A quoted line with the graphemes that differ from `against` marked.
 *
 * Grapheme-aligned rather than index-aligned on code units, so an emoji or an
 * accented letter is one unit here exactly as it is to the reader.
 */
export function markedDiff(text: string, against: string): HTMLElement {
  const mine = graphemes(text);
  const theirs = graphemes(against);
  const line = el('p', { class: 'recovered-text' });
  let run = '';
  const flush = (): void => {
    if (run) line.append(run);
    run = '';
  };
  for (let i = 0; i < mine.length; i++) {
    if (mine[i] === theirs[i]) {
      run += mine[i];
      continue;
    }
    flush();
    line.append(
      el('mark', { class: 'diff-mark' }, [
        mine[i],
        // Named for anyone not seeing the highlight. Visually hidden rather
        // than absent, so the fact is in the accessibility tree too.
        el('span', { class: 'sr-only' }, [' (changed)']),
      ])
    );
  }
  flush();
  return line;
}
