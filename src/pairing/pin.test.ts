import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveChannelName,
  deriveRoomId,
  formatPin,
  generatePin,
  isValidPin,
  normalizePin,
  verifyPin,
} from './pin';
import { sha256Bytes, sha256Hex, toHex } from './sha256';

const nodeSha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Stubs `crypto.getRandomValues` to return the given 32-bit words, big-endian, in order. */
function stubRandomWords(words: number[]) {
  const queue = [...words];
  const getRandomValues = vi.fn(<T extends ArrayBufferView>(array: T): T => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const word = queue.shift() ?? 0;
    new DataView(bytes.buffer, bytes.byteOffset, 4).setUint32(0, word);
    return array;
  });
  vi.stubGlobal('crypto', { getRandomValues, subtle: globalThis.crypto.subtle });
  return getRandomValues;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generatePin', () => {
  it('returns six ASCII digits', () => {
    for (let i = 0; i < 200; i += 1) expect(generatePin()).toMatch(/^\d{6}$/);
  });

  it('keeps leading zeros', () => {
    stubRandomWords([42]);
    expect(generatePin()).toBe('000042');
  });

  it('rejects draws in the biased tail instead of reducing them modulo 10^6', () => {
    // floor(2^32 / 10^6) * 10^6 = 4_294_000_000; anything at or above is redrawn.
    const getRandomValues = stubRandomWords([4_294_000_000, 0xffffffff, 4_293_999_999]);
    expect(generatePin()).toBe('999999');
    expect(getRandomValues).toHaveBeenCalledTimes(3);
  });

  it('fails loudly without crypto.getRandomValues rather than using Math.random', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => generatePin()).toThrow('crypto.getRandomValues');
  });

  it('is roughly uniform across leading digits', () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 5000; i += 1) counts[Number(generatePin()[0])] += 1;
    for (const count of counts) expect(count).toBeGreaterThan(350); // expected 500 each
  });
});

describe('normalizePin / isValidPin / formatPin', () => {
  it('strips spaces, dashes, and dash look-alikes', () => {
    expect(normalizePin(' 123 456 ')).toBe('123456');
    expect(normalizePin('123-456')).toBe('123456');
    expect(normalizePin('123—456')).toBe('123456');
    expect(normalizePin('123ー456')).toBe('123456');
    expect(normalizePin('123　456')).toBe('123456');
  });

  it('converts full-width digits to ASCII', () => {
    expect(normalizePin('１２３４５６')).toBe('123456');
    expect(normalizePin('１２３－４５６')).toBe('123456');
  });

  it('keeps other characters so invalid input stays invalid', () => {
    expect(normalizePin('12a456')).toBe('12a456');
    expect(isValidPin(normalizePin('12a456'))).toBe(false);
  });

  it('accepts exactly six ASCII digits', () => {
    expect(isValidPin('012345')).toBe(true);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('１２３４５６')).toBe(false);
    expect(isValidPin(123456)).toBe(false);
  });

  it('formats for display', () => {
    expect(formatPin('123456')).toBe('123 456');
    expect(formatPin('１２３４５６', '-')).toBe('123-456');
  });
});

describe('verifyPin', () => {
  it('matches after normalization', () => {
    expect(verifyPin('123456', '123 456')).toBe(true);
    expect(verifyPin('123456', '１２３４５６')).toBe(true);
  });

  it('rejects mismatches, prefixes, extensions, and invalid expected values', () => {
    expect(verifyPin('123456', '123457')).toBe(false);
    expect(verifyPin('123456', '12345')).toBe(false);
    expect(verifyPin('123456', '1234567')).toBe(false);
    expect(verifyPin('123456', '')).toBe(false);
    expect(verifyPin('', '')).toBe(false);
    expect(verifyPin('abcdef', 'abcdef')).toBe(false);
  });
});

describe('sha256', () => {
  it('matches Node for empty, ASCII, multi-block, and non-ASCII input', () => {
    for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(200), 'ピン番号１２３']) {
      expect(toHex(sha256Bytes(new TextEncoder().encode(text)))).toBe(nodeSha256(text));
    }
  });

  it('falls back to the pure-JS digest without SubtleCrypto and agrees with it', async () => {
    const withSubtle = await sha256Hex('snap-pair');
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    expect(await sha256Hex('snap-pair')).toBe(withSubtle);
    expect(withSubtle).toBe(nodeSha256('snap-pair'));
  });

  it('falls back when subtle.digest rejects', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: () => Promise.reject(new Error('nope')) } });
    expect(await sha256Hex('x')).toBe(nodeSha256('x'));
  });
});

describe('deriveRoomId / deriveChannelName', () => {
  it('is deterministic, opaque, and separated by namespace and kind', async () => {
    const id = await deriveRoomId('123456');
    expect(id).toMatch(/^sp[0-9a-f]{24}$/);
    expect(id).not.toContain('123456');
    expect(await deriveRoomId('123456')).toBe(id);
    expect(await deriveRoomId('123456', { namespace: 'other-app' })).not.toBe(id);
    expect(await deriveRoomId('123456', { kind: 'code' })).not.toBe(id);
    expect(id).toBe(`sp${nodeSha256('snap-pair/v1|snap-pair|pin|123456').slice(0, 24)}`);
  });

  it('builds a channel name from a normalized PIN', async () => {
    expect(await deriveChannelName('123 456', { prefix: 'demo' })).toBe(`demo:${await deriveRoomId('123456')}`);
  });
});
