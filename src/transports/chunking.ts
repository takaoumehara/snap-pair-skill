/**
 * Splits text frames that are too large for one RTCDataChannel message and
 * reassembles them on the other side.
 *
 * SCTP message limits differ between browsers (Firefox and Chrome negotiate
 * up to 256 KiB or more, older Safari and some stacks fail above ~16–64 KiB),
 * so 16 KiB is the portable default. Chunk frames are JSON objects whose text
 * starts with `{"sp":"chunk"` (wire-protocol frames start with `{"t":`), so
 * unchunked traffic passes through untouched and old peers simply ignore
 * chunks.
 *
 * ```text
 * {"sp":"chunk","id":"<message id>","i":<index>,"n":<count>,"d":"<slice of the original text>"}
 * ```
 */

export const CHUNK_PREFIX = '{"sp":"chunk"';
/** Portable SCTP message size. */
export const DEFAULT_MAX_MESSAGE_BYTES = 16 * 1024;
/** Largest message (before chunking) a receiver reassembles. */
export const DEFAULT_MAX_REASSEMBLED_BYTES = 1024 * 1024;

/** Room for `{"sp":"chunk","id":"…","i":…,"n":…,"d":""}`. */
const ENVELOPE_RESERVE = 96;

let encoder: TextEncoder | undefined;

/** UTF-8 byte length of `text`. */
export function utf8Length(text: string): number {
  encoder ??= new TextEncoder();
  return encoder.encode(text).length;
}

interface ChunkFrame {
  sp: 'chunk';
  id: string;
  i: number;
  n: number;
  d: string;
}

const encodeChunk = (id: string, i: number, n: number, d: string) => JSON.stringify({ sp: 'chunk', id, i, n, d } satisfies ChunkFrame);

/**
 * Returns `[text]` when it fits in `maxBytes`, otherwise chunk frames that
 * each encode to at most `maxBytes` UTF-8 bytes. Never splits a surrogate pair.
 */
export function splitMessage(text: string, maxBytes: number, id: string): string[] {
  if (utf8Length(text) <= maxBytes) return [text];
  if (maxBytes < ENVELOPE_RESERVE * 2) throw new RangeError(`maxBytes must be at least ${ENVELOPE_RESERVE * 2}.`);
  // A UTF-16 unit costs at most 3 UTF-8 bytes, and JSON-escaping `"`/`\` costs 2, so budget/3 units
  // usually fit; raw control characters (6 bytes escaped) are handled by shrinking the piece.
  const budget = maxBytes - ENVELOPE_RESERVE;
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    let size = Math.floor(budget / 3);
    let piece: string;
    for (;;) {
      let end = Math.min(text.length, start + size);
      const code = text.charCodeAt(end - 1);
      if (end < text.length && end - start > 1 && code >= 0xd800 && code <= 0xdbff) end -= 1; // keep surrogate pairs together
      piece = text.slice(start, end);
      if (utf8Length(JSON.stringify(piece)) <= budget || size <= 1) break;
      size = Math.max(1, Math.floor(size / 2));
    }
    pieces.push(piece);
    start += piece.length;
  }
  return pieces.map((piece, i) => encodeChunk(id, i, pieces.length, piece));
}

interface Pending {
  parts: Array<string | undefined>;
  received: number;
  chars: number;
  startedAt: number;
}

export interface ReassemblerOptions {
  /** Drop messages whose reassembled text would exceed this many UTF-16 units. Default: 1 MiB. */
  maxBytes?: number;
  /** Drop incomplete messages older than this. Default: 10000 ms. */
  timeoutMs?: number;
  /** Most incomplete messages kept at once (oldest dropped first). Default: 16. */
  maxPending?: number;
}

/**
 * Collects chunk frames from one channel. `accept(data)` returns the full text
 * once every chunk of a message arrived, `null` while it is incomplete (or
 * when a chunk is invalid), and anything that is not a chunk unchanged.
 */
export class Reassembler {
  private readonly pending = new Map<string, Pending>();
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly maxPending: number;

  constructor({ maxBytes = DEFAULT_MAX_REASSEMBLED_BYTES, timeoutMs = 10000, maxPending = 16 }: ReassemblerOptions = {}) {
    this.maxBytes = maxBytes;
    this.timeoutMs = timeoutMs;
    this.maxPending = maxPending;
  }

  /** Number of incomplete messages being held. */
  get size(): number {
    return this.pending.size;
  }

  accept(data: unknown): unknown {
    if (typeof data !== 'string' || !data.startsWith(CHUNK_PREFIX)) return data;
    let frame: Partial<ChunkFrame>;
    try {
      frame = JSON.parse(data);
    } catch {
      return null;
    }
    const { id, i, n, d } = frame;
    if (typeof id !== 'string' || !id || typeof d !== 'string' || !Number.isInteger(n) || !Number.isInteger(i)) return null;
    if ((n as number) < 1 || (i as number) < 0 || (i as number) >= (n as number)) return null;

    const now = Date.now();
    this.prune(now);
    let entry = this.pending.get(id);
    if (!entry) {
      // A sender honoring maxBytes needs at most this many chunks; refuse absurd counts up front.
      if ((n as number) > Math.ceil(this.maxBytes / 16) + 1) return null;
      if (this.pending.size >= this.maxPending) this.pending.delete(this.pending.keys().next().value as string);
      entry = { parts: new Array(n), received: 0, chars: 0, startedAt: now };
      this.pending.set(id, entry);
    }
    if (entry.parts.length !== n) {
      this.pending.delete(id);
      return null;
    }
    if (entry.parts[i as number] === undefined) {
      entry.parts[i as number] = d;
      entry.received += 1;
      entry.chars += d.length;
    }
    if (entry.chars > this.maxBytes) {
      this.pending.delete(id);
      return null;
    }
    if (entry.received < (n as number)) return null;
    this.pending.delete(id);
    return entry.parts.join('');
  }

  clear(): void {
    this.pending.clear();
  }

  private prune(now: number): void {
    for (const [id, entry] of this.pending) {
      if (now - entry.startedAt > this.timeoutMs) this.pending.delete(id);
    }
  }
}
