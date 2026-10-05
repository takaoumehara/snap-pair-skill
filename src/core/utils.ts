/** Font-safe alphabet used by the room server (no 0/O/1/I). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/** Uppercases and strips separators; returns '' unless the result is a valid six-character code. */
export function normalizeRoomCode(value: string): string {
  const code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ROOM_CODE_PATTERN.test(code) ? code : '';
}

/**
 * Builds the URL a QR code should encode: `baseUrl` with the room code in a
 * query parameter (`?room=ABC234` by default, matching examples/snap-pair-lite.html).
 */
export function buildJoinUrl(baseUrl: string, code: string, param = 'room'): string {
  const url = new URL(baseUrl);
  url.searchParams.set(param, code);
  return url.toString();
}

/**
 * Returns `length` bytes from the platform CSPRNG (`crypto.getRandomValues`).
 * Throws when it is missing instead of silently falling back to `Math.random`.
 */
export function getRandomBytes(length: number): Uint8Array {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is not available in this environment.');
  }
  return cryptoObj.getRandomValues(new Uint8Array(length));
}

/** Random six-character room code from `ROOM_CODE_ALPHABET`. 256 % 32 === 0, so `byte & 31` is unbiased. */
export function generateRoomCode(): string {
  return Array.from(getRandomBytes(6), (byte) => ROOM_CODE_ALPHABET[byte & 31]).join('');
}

/** Random 24-character lowercase hex id (96 bits), safe in URLs, channel names, and PartyKit ids. */
export function createId(): string {
  return Array.from(getRandomBytes(12), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function withTimeout<T>(promise: Promise<T>, ms = 12000, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Network timeout: ${label} did not respond. Check your connection and Firebase configuration.`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
