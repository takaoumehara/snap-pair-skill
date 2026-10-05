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
