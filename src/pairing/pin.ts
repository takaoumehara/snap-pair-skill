import { getRandomBytes } from '../core/utils';
import { sha256Hex } from './sha256';

/**
 * Six-digit numeric PINs for the serverless pairing paths (BroadcastChannel,
 * PartyKit, WebRTC signaling). A PIN is easy to type on a phone keypad but has
 * only 10^6 values: it identifies a room, it does not protect one. Hosts that
 * need gatekeeping should use the transport's `admit` hook.
 *
 * The Firebase room server does not accept numeric PINs; see docs/plan-phase2.md.
 */

export const PIN_LENGTH = 6;

const PIN_SPACE = 10 ** PIN_LENGTH;
// Largest multiple of 10^6 that fits in 2^32; draws at or above it are rejected
// so `value % 10^6` is uniform (no modulo bias).
const PIN_DRAW_LIMIT = Math.floor(0x100000000 / PIN_SPACE) * PIN_SPACE;
const PIN_PATTERN = /^\d{6}$/;
// ASCII/Unicode whitespace, hyphen and dash variants, minus signs, and the
// Japanese long-vowel mark (often typed instead of a dash on JP keyboards).
const PIN_SEPARATORS = /[\s\-_.‐-―−ー－＿．　]/g;

/** Uniformly random six-digit PIN; leading zeros are kept (`'004217'`). */
export function generatePin(): string {
  for (;;) {
    const bytes = getRandomBytes(4);
    const value = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
    if (value < PIN_DRAW_LIMIT) return String(value % PIN_SPACE).padStart(PIN_LENGTH, '0');
  }
}

/**
 * Cleans user input: full-width digits become ASCII (`'１２３'` -> `'123'`) and
 * spaces/dashes are removed. Other characters are kept so the result can be
 * checked with `isValidPin`; it is not guaranteed to be a valid PIN.
 */
export function normalizePin(value: string): string {
  return String(value ?? '')
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30))
    .replace(PIN_SEPARATORS, '');
}

/** True for exactly six ASCII digits. Normalize first to accept `'123 456'` or full-width input. */
export function isValidPin(value: unknown): value is string {
  return typeof value === 'string' && PIN_PATTERN.test(value);
}

/** Groups a PIN for display: `'123456'` -> `'123 456'`. */
export function formatPin(pin: string, separator = ' '): string {
  return normalizePin(pin).replace(/(\d{3})(?=\d)/g, `$1${separator}`);
}

/**
 * Compares a submitted PIN with the expected one after normalizing both. The
 * loop always walks the full expected length so timing does not reveal how
 * many leading digits matched.
 */
export function verifyPin(expected: string, submitted: string): boolean {
  const a = normalizePin(expected);
  const b = normalizePin(submitted);
  if (!isValidPin(a)) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

export interface DeriveRoomIdOptions {
  /** Separates apps (and environments) that share a relay or a browser profile. Default: `'snap-pair'`. */
  namespace?: string;
  /** What `value` is, so a PIN and a room code with the same text never collide. Default: `'pin'`. */
  kind?: 'pin' | 'code';
}

/**
 * Derives an opaque room id from a PIN or room code:
 * `'sp' + hex(SHA-256('snap-pair/v1|<namespace>|<kind>|<value>'))[0..24]`.
 *
 * Uses SubtleCrypto when available and an identical pure-JS SHA-256 otherwise,
 * so a host on HTTPS and a guest on plain HTTP get the same id. The hash keeps
 * raw PINs out of relay URLs and logs and namespaces rooms per app; with only
 * 10^6 PINs it is not a secret.
 */
export async function deriveRoomId(value: string, { namespace = 'snap-pair', kind = 'pin' }: DeriveRoomIdOptions = {}): Promise<string> {
  const digest = await sha256Hex(`snap-pair/v1|${namespace}|${kind}|${value}`);
  return `sp${digest.slice(0, 24)}`;
}

/** BroadcastChannel name for a PIN, e.g. `'snap-pair:sp3f…'`. */
export async function deriveChannelName(pin: string, { prefix = 'snap-pair', namespace }: { prefix?: string; namespace?: string } = {}): Promise<string> {
  return `${prefix}:${await deriveRoomId(normalizePin(pin), { namespace, kind: 'pin' })}`;
}
