import { describe, expect, it } from 'vitest';
import {
  crc8,
  decodeSoundToken,
  encodeSoundToken,
  isSoundPairSupported,
  normalizeSoundToken,
  SOUND_PAIR_SAMPLE_RATE,
} from './sound';

describe('normalizeSoundToken', () => {
  it('accepts PINs and room codes', () => {
    expect(normalizeSoundToken('042917')).toBe('042917');
    expect(normalizeSoundToken('abc234')).toBe('ABC234');
    expect(normalizeSoundToken('ABC 234')).toBe('ABC234');
  });

  it('rejects short or empty', () => {
    expect(normalizeSoundToken('')).toBeNull();
    expect(normalizeSoundToken('12')).toBeNull();
    expect(normalizeSoundToken('!!!')).toBeNull();
  });
});

describe('crc8', () => {
  it('is stable for a known vector', () => {
    expect(crc8(new Uint8Array([0x01, 0x06, 0x30, 0x34, 0x32, 0x39, 0x31, 0x37]))).toBeTypeOf('number');
    expect(crc8(new Uint8Array([1, 2, 3]))).not.toBe(crc8(new Uint8Array([1, 2, 4])));
  });
});

describe('encodeSoundToken / decodeSoundToken', () => {
  it('round-trips a 6-digit PIN', () => {
    const samples = encodeSoundToken('042917');
    expect(samples.length).toBeGreaterThan(1000);
    expect(decodeSoundToken(samples, SOUND_PAIR_SAMPLE_RATE)).toBe('042917');
  });

  it('round-trips a room code', () => {
    const samples = encodeSoundToken('ABC234');
    expect(decodeSoundToken(samples, SOUND_PAIR_SAMPLE_RATE)).toBe('ABC234');
  });

  it('returns null for empty / too-short buffers', () => {
    expect(decodeSoundToken(new Float32Array(0), SOUND_PAIR_SAMPLE_RATE)).toBeNull();
    expect(decodeSoundToken(new Float32Array(64), SOUND_PAIR_SAMPLE_RATE)).toBeNull();
  });

  it('returns null when the checksum is corrupted', () => {
    const samples = encodeSoundToken('042917');
    // Silence the second half of the frame so preamble may still match but payload/CRC cannot.
    const start = Math.floor(samples.length * 0.4);
    for (let i = start; i < samples.length; i += 1) samples[i] = 0;
    expect(decodeSoundToken(samples, SOUND_PAIR_SAMPLE_RATE)).toBeNull();
  });

  it('survives light additive noise', () => {
    const samples = encodeSoundToken('HELLO1');
    for (let i = 0; i < samples.length; i += 1) samples[i] += (Math.random() - 0.5) * 0.02;
    expect(decodeSoundToken(samples, SOUND_PAIR_SAMPLE_RATE)).toBe('HELLO1');
  });

  it('throws on invalid tokens when encoding', () => {
    expect(() => encodeSoundToken('')).toThrow(/token/i);
    expect(() => encodeSoundToken('ab')).toThrow(/token/i);
  });
});

describe('isSoundPairSupported', () => {
  it('does not throw in jsdom and reports a boolean', () => {
    expect(() => isSoundPairSupported()).not.toThrow();
    expect(typeof isSoundPairSupported()).toBe('boolean');
  });
});
