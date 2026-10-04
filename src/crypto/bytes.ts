/** Byte formatting. No crypto here — just the four conversions the lab needs. */
import type { Bytes } from './types';

/** Hex string to bytes. Throws on anything that is not an even run of hex. */
export function fromHex(hex: string): Bytes {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error(`not hex: ${hex.slice(0, 16)}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Bytes to lowercase hex. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Bytes to standard base64, for the disclosure that carries the real key. */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * The first `count` bytes as spaced hex, with a trailing marker when there is
 * more.
 *
 * Step 2 shows the locked bytes to make one point — that they are unreadable —
 * and 256 bytes of hex makes that point no better than 32 do while costing the
 * page a wall of digits and a reflow risk at 320px. The full value is in the
 * disclosure below it, which is where a reader who wants all of it should get it.
 */
export function preview(bytes: Uint8Array, count = 32): string {
  const head = Array.from(bytes.slice(0, count), (b) => b.toString(16).padStart(2, '0'));
  return head.join(' ') + (bytes.length > count ? ' …' : '');
}
