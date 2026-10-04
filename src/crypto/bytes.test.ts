import { describe, expect, it } from 'vitest';
import { fromHex, preview, toBase64, toHex } from './bytes';

describe('byte formatting', () => {
  it('round-trips hex', () => {
    const b = new Uint8Array([0, 1, 15, 16, 255]);
    expect(toHex(b)).toBe('00010f10ff');
    expect(Array.from(fromHex('00010f10ff'))).toEqual(Array.from(b));
  });

  it('refuses malformed hex rather than guessing', () => {
    expect(() => fromHex('abc')).toThrow();
    expect(() => fromHex('zz')).toThrow();
  });

  it('marks a truncated preview and leaves a short one unmarked', () => {
    expect(preview(new Uint8Array([1, 2]), 4)).toBe('01 02');
    expect(preview(new Uint8Array([1, 2, 3, 4, 5]), 4)).toBe('01 02 03 04 …');
  });

  it('base64-encodes the full value', () => {
    expect(toBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });
});
