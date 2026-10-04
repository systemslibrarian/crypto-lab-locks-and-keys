/*
 * Changing exactly one VISIBLE character — and saying which one.
 *
 * The first version indexed `text[text.length - 1]`, which is a UTF-16 code
 * unit, not a character. Signing "Hello <lock emoji>" and pressing the tamper
 * button produced "Hello \ud83dx" on screen: a lone high surrogate followed by
 * an x, which renders as a replacement glyph. The demonstration still worked —
 * the signature was correctly refused — but the page was showing mojibake while
 * claiming it had changed one character, and a reader cannot learn "one small
 * change is enough" from a line they cannot read.
 *
 * So the unit of change is a GRAPHEME, which is what a reader means by "one
 * character": an emoji, a letter with a combining accent, a flag made of two
 * regional indicators. `Intl.Segmenter` knows where those boundaries are;
 * `[...text]` (code points) is the fallback, and it is still a real improvement
 * on code units because it never splits a surrogate pair.
 */

/** Split into what a reader would call characters. */
export function graphemes(text: string): string[] {
  const Segmenter = (
    Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }
  ).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  }
  // Code points, not code units: never splits a surrogate pair.
  return [...text];
}

export interface Tamper {
  /** The altered text. Readable, and the same grapheme length as the original. */
  readonly changed: string;
  /** 1-based index of the altered grapheme, for the page to name. */
  readonly position: number;
  /** The grapheme that was there, and the one now in its place. */
  readonly was: string;
  readonly now: string;
}

/**
 * Replace the last grapheme with a different, printable one.
 *
 * The LAST one so the change is visible at the end of the quote rather than
 * buried mid-sentence. The replacement is chosen to stay the same kind of thing
 * — a digit rolls to another digit, a letter to another letter — so the result
 * reads as a plausible edit somebody might make rather than as obvious
 * corruption. That is the point: a small, sensible-looking change is still
 * caught.
 */
export function tamperOne(text: string): Tamper {
  const parts = graphemes(text);
  if (parts.length === 0) return { changed: 'x', position: 1, was: '', now: 'x' };
  const at = parts.length - 1;
  const was = parts[at];
  const now = replacementFor(was);
  parts[at] = now;
  return { changed: parts.join(''), position: at + 1, was, now };
}

function replacementFor(grapheme: string): string {
  if (/^[0-9]$/.test(grapheme)) return String((Number(grapheme) + 1) % 10);
  if (/^[a-z]$/.test(grapheme)) return grapheme === 'z' ? 'y' : 'z';
  if (/^[A-Z]$/.test(grapheme)) return grapheme === 'Z' ? 'Y' : 'Z';
  // Punctuation, whitespace, an emoji, a non-Latin letter: swap in a visible
  // full stop, or an exclamation mark if a full stop was already there. Always
  // printable, always one grapheme, never a lone surrogate.
  return grapheme === '.' ? '!' : '.';
}

/** The 1-based positions at which two texts differ, by grapheme. */
export function differingPositions(a: string, b: string): number[] {
  const x = graphemes(a);
  const y = graphemes(b);
  const out: number[] = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) out.push(i + 1);
  }
  return out;
}
