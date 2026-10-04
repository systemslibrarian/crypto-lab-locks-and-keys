/*
 * The two states of this lab, drawn.
 *
 * A closed padlock and an open padlock, as stroke-only SVG in `currentColor`, so
 * each one takes the colour of the verdict it sits in and needs no second asset
 * per tone. Every one is `aria-hidden` and sits beside its own words — the state
 * is never carried by the picture alone, nor by colour alone (WCAG 1.4.1): every
 * verdict on this page is icon AND text AND colour.
 *
 * Stroke-only on purpose. A filled shape would be measured by the non-text
 * contrast oracle as an opaque region; a stroke is a boundary, which is what
 * these actually are. SVG's initial `fill` is black and `getComputedStyle`
 * reports it even for geometry that paints no fill, so the stroke-only form also
 * keeps `contrast.ts`'s underlay walk from treating a padlock as a black
 * rectangle behind the text beside it.
 */

const SVG = 'http://www.w3.org/2000/svg';

function shell(paths: { d: string; rounded?: boolean }[], extra: string): SVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `glyph ${extra}`);
  for (const spec of paths) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', spec.d);
    svg.append(path);
  }
  return svg;
}

/** The body of the padlock, shared by both states. */
const BODY = 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1H5a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1z';

/** Shackle down and seated in the body: shut. */
export const closedLock = (): SVGElement =>
  shell([{ d: BODY }, { d: 'M8 11V7a4 4 0 0 1 8 0v4' }], 'glyph-closed');

/** Shackle swung clear of the body on the right: open. */
export const openLock = (): SVGElement =>
  shell([{ d: BODY }, { d: 'M8 11V7a4 4 0 0 1 8 0v2' }], 'glyph-open');

/** A key — the private half. */
export const key = (): SVGElement =>
  shell(
    [
      { d: 'M14.5 9.5a3.5 3.5 0 1 1 -3.5 -3.5' },
      { d: 'M11 6h8' },
      { d: 'M17 6v3' },
      { d: 'M14 6v2' },
      { d: 'M11 9.5 4 16.5V20h3.5l1-1v-2h2v-2h1.5' },
    ],
    'glyph-key'
  );

/**
 * A seal with a tick in it — a checked signature.
 *
 * Deliberately NOT the opening padlock. A lock springing open is the picture of
 * a secret being read, and Step 4 exists to stop a reader believing a signature
 * does that: a verified signature reveals nothing, hides nothing and unlocks
 * nothing. Giving verification its own mark is part of teaching the difference.
 */
export const seal = (): SVGElement =>
  shell(
    [
      { d: 'M12 3l2.4 1.8 3 .2.9 2.9 2.2 2.1-1.3 2.7.3 3-2.8 1.2-1.8 2.4-3-.5-2.9 1-1.9-2.3-2.9-.9.1-3L3 11.7l1.6-2.5.3-3 2.9-.6L10 3.3z' },
      { d: 'M8.8 12.2l2.2 2.2 4.2-4.6' },
    ],
    'glyph-seal'
  );

/** A tick, for an outcome that is simply right. */
export const tick = (): SVGElement => shell([{ d: 'M4 13l5 5L20 7' }], 'glyph-tick');

/** A cross, for a real error in what the reader supplied. */
export const cross = (): SVGElement =>
  shell([{ d: 'M6 6l12 12' }, { d: 'M18 6 6 18' }], 'glyph-cross');

/** An exclamation in a triangle, for a limit that has just been demonstrated. */
export const warn = (): SVGElement =>
  shell(
    [{ d: 'M12 3 2 20h20L12 3z' }, { d: 'M12 9v5' }, { d: 'M12 17.5v.5' }],
    'glyph-warn'
  );
