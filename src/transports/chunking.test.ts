import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_PREFIX, Reassembler, splitMessage, utf8Length } from './chunking';

const MAX = 16 * 1024;

function roundTrip(text: string, maxBytes = MAX) {
  const pieces = splitMessage(text, maxBytes, 'm1');
  const reassembler = new Reassembler();
  let result: unknown = null;
  for (const piece of pieces) result = reassembler.accept(piece);
  return { pieces, result, reassembler };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('splitMessage', () => {
  it('leaves frames that fit untouched', () => {
    const text = JSON.stringify({ t: 'ping', v: 1 });
    expect(splitMessage(text, MAX, 'x')).toEqual([text]);
    expect(splitMessage('a'.repeat(MAX), MAX, 'x')).toHaveLength(1);
  });

  it.each([
    ['ASCII', 'a'.repeat(100_000)],
    ['JSON with quotes and backslashes', JSON.stringify({ s: '"\\'.repeat(40_000) })],
    ['CJK', 'あ漢字'.repeat(20_000)],
    ['emoji (surrogate pairs)', '😀🎉'.repeat(15_000)],
    ['raw control characters', '\u0001\u0002\n'.repeat(20_000)],
    ['mixed', ('x"😀あ\u0007\\').repeat(12_000)],
  ])('splits %s into chunks within the byte limit and reassembles exactly', (_label, text) => {
    const { pieces, result } = roundTrip(text);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.startsWith(CHUNK_PREFIX)).toBe(true);
      expect(utf8Length(piece)).toBeLessThanOrEqual(MAX);
    }
    expect(result).toBe(text);
  });

  it('never splits a surrogate pair', () => {
    const pieces = splitMessage('😀'.repeat(10_000), 1024, 'id');
    for (const piece of pieces) {
      const { d } = JSON.parse(piece);
      expect(d).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  });

  it('rejects absurdly small limits', () => {
    expect(() => splitMessage('a'.repeat(1000), 100, 'id')).toThrow(RangeError);
  });
});

describe('Reassembler', () => {
  it('passes non-chunk data through unchanged', () => {
    const reassembler = new Reassembler();
    const obj = { t: 'ping' };
    expect(reassembler.accept('{"t":"ping"}')).toBe('{"t":"ping"}');
    expect(reassembler.accept(obj)).toBe(obj);
  });

  it('reassembles out-of-order and interleaved messages, ignoring duplicates', () => {
    const a = splitMessage('A'.repeat(5000), 1024, 'a');
    const b = splitMessage('B'.repeat(5000), 1024, 'b');
    const reassembler = new Reassembler();
    const results: unknown[] = [];
    const order = [...a.slice(1), a[1], ...b].reverse();
    for (const piece of order) results.push(reassembler.accept(piece));
    results.push(reassembler.accept(a[0]));
    const done = results.filter((value) => value !== null);
    expect(done).toEqual(['B'.repeat(5000), 'A'.repeat(5000)]);
    expect(reassembler.size).toBe(0);
  });

  it('rejects malformed chunks', () => {
    const reassembler = new Reassembler();
    expect(reassembler.accept(`${CHUNK_PREFIX},broken`)).toBeNull();
    expect(reassembler.accept(JSON.stringify({ sp: 'chunk', id: 'x', i: 2, n: 2, d: '' }))).toBeNull();
    expect(reassembler.accept(JSON.stringify({ sp: 'chunk', id: '', i: 0, n: 1, d: '' }))).toBeNull();
    expect(reassembler.accept(JSON.stringify({ sp: 'chunk', id: 'x', i: 0, n: 1e9, d: '' }))).toBeNull();
    // A chunk count that changes mid-message drops the message.
    reassembler.accept(JSON.stringify({ sp: 'chunk', id: 'y', i: 0, n: 3, d: 'a' }));
    expect(reassembler.accept(JSON.stringify({ sp: 'chunk', id: 'y', i: 1, n: 2, d: 'b' }))).toBeNull();
    expect(reassembler.size).toBe(0);
  });

  it('drops messages larger than maxBytes', () => {
    const reassembler = new Reassembler({ maxBytes: 3000 });
    const pieces = splitMessage('z'.repeat(10_000), 1024, 'big');
    expect(pieces.map((piece) => reassembler.accept(piece)).every((value) => value === null)).toBe(true);
    expect(reassembler.size).toBeLessThanOrEqual(1);
  });

  it('expires incomplete messages and caps how many are pending', () => {
    vi.useFakeTimers();
    const reassembler = new Reassembler({ timeoutMs: 1000, maxPending: 2 });
    const part = (id: string) => JSON.stringify({ sp: 'chunk', id, i: 0, n: 2, d: 'x' });
    reassembler.accept(part('a'));
    reassembler.accept(part('b'));
    reassembler.accept(part('c')); // evicts 'a'
    expect(reassembler.size).toBe(2);
    expect(reassembler.accept(JSON.stringify({ sp: 'chunk', id: 'a', i: 1, n: 2, d: 'y' }))).toBeNull(); // restarted, incomplete
    vi.advanceTimersByTime(1500);
    expect(reassembler.accept(JSON.stringify({ sp: 'chunk', id: 'b', i: 1, n: 2, d: 'y' }))).toBeNull(); // 'b' expired
    expect(reassembler.size).toBe(1);
    reassembler.clear();
    expect(reassembler.size).toBe(0);
  });
});
