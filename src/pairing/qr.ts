import { createElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PairingInfo } from '../core/types';
import { buildJoinUrl, normalizeRoomCode } from '../core/utils';
import { isValidPin, normalizePin } from './pin';

/**
 * Join URLs and QR codes. snap-pair still ships no QR encoder: `qrcode` is an
 * optional peer dependency that is loaded on demand (or injected), and every
 * helper returns `null`/`undefined` when it is unavailable so `HostHUD` falls
 * back to the typed code and link.
 */

export { buildJoinUrl };

export interface JoinUrlParams {
  /** Query parameter carrying a room code. Default: `'room'` (as in `buildJoinUrl`). */
  codeParam?: string;
  /** Query parameter carrying a numeric PIN. Default: `'pin'`. */
  pinParam?: string;
}

/**
 * Join URL for a host's pairing info: `?pin=123456` when the room is reached
 * by PIN (relay transports in `pairing: 'pin'` mode), `?room=ABC234` otherwise.
 * A PIN that is a separate secret next to a room code is never put in the URL.
 */
export function buildPairingJoinUrl(
  baseUrl: string,
  pairing: Pick<PairingInfo, 'code' | 'pin'>,
  { codeParam = 'room', pinParam = 'pin' }: JoinUrlParams = {},
): string {
  return pairing.pin && pairing.pin === pairing.code
    ? buildJoinUrl(baseUrl, pairing.pin, pinParam)
    : buildJoinUrl(baseUrl, pairing.code, codeParam);
}

/**
 * Reads a room code and/or PIN from a join URL (e.g. `location.href` on the
 * guest). Values are normalized; invalid ones come back as `null`.
 */
export function parseJoinUrl(
  url: string | URL,
  { codeParam = 'room', pinParam = 'pin' }: JoinUrlParams = {},
): { code: string | null; pin: string | null } {
  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch {
    return { code: null, pin: null };
  }
  const code = normalizeRoomCode(parsed.searchParams.get(codeParam) ?? '');
  const pin = normalizePin(parsed.searchParams.get(pinParam) ?? '');
  return { code: code || null, pin: isValidPin(pin) ? pin : null };
}

// ---- QR encoding ------------------------------------------------------------

export interface QrOptions {
  /** Quiet-zone modules. Default: 2. */
  margin?: number;
  /** Default: `'M'`. */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  color?: { dark?: string; light?: string };
}

/** The part of the `qrcode` package API used here; any compatible encoder works. */
export interface QrCodeLib {
  toDataURL(text: string, options?: QrOptions & { width?: number }): Promise<string>;
}

// A variable specifier keeps TypeScript and bundlers from requiring the optional
// peer dependency. Bundled apps should inject it: `useQrRenderer({ lib: QRCode })`.
const QRCODE_MODULE = 'qrcode';
let defaultLib: Promise<QrCodeLib | null> | null = null;

/**
 * Loads the optional `qrcode` peer dependency; `null` when it is not installed
 * or not resolvable. The default import is attempted once and cached.
 */
export function loadQrLib(importer?: (specifier: string) => Promise<any>): Promise<QrCodeLib | null> {
  const load = async (): Promise<QrCodeLib | null> => {
    try {
      const mod = importer
        ? await importer(QRCODE_MODULE)
        : await import(/* @vite-ignore */ /* webpackIgnore: true */ QRCODE_MODULE);
      const lib = mod?.toDataURL ? mod : mod?.default;
      return typeof lib?.toDataURL === 'function' ? lib as QrCodeLib : null;
    } catch {
      return null;
    }
  };
  if (importer) return load();
  defaultLib ??= load();
  return defaultLib;
}

/**
 * PNG data URL of a QR code for `text`, or `null` when no encoder is available
 * or encoding fails (e.g. text too long).
 */
export async function toQrDataUrl(
  text: string,
  { size = 256, lib, margin = 2, errorCorrectionLevel = 'M', color }: QrOptions & { size?: number; lib?: QrCodeLib | null } = {},
): Promise<string | null> {
  const encoder = lib === undefined ? await loadQrLib() : lib;
  if (!encoder) return null;
  try {
    return await encoder.toDataURL(text, { width: size, margin, errorCorrectionLevel, ...(color ? { color } : {}) });
  } catch {
    return null;
  }
}

export type QrRenderer = (value: string, size: number) => ReactNode;

interface QrImageProps {
  value: string;
  size: number;
  lib: QrCodeLib;
  options: QrOptions;
  alt: string;
}

function QrImage({ value, size, lib, options, alt }: QrImageProps) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    let live = true;
    setSrc(undefined);
    toQrDataUrl(value, { ...JSON.parse(optionsKey), size, lib }).then((url) => {
      if (live) setSrc(url);
    });
    return () => { live = false; };
  }, [value, size, lib, optionsKey]);

  if (src === null) return null; // Encoding failed; the HUD still shows the code and link.
  if (src === undefined) {
    return createElement('span', {
      'aria-hidden': true,
      'data-snap-pair-qr-loading': '',
      style: { display: 'inline-block', width: size, height: size },
    });
  }
  return createElement('img', { src, width: size, height: size, alt, 'data-snap-pair-qr-image': '' });
}

/** Builds a `HostHUD` `renderQr` from an encoder you already have (e.g. `import QRCode from 'qrcode'`). */
export function createQrRenderer(lib: QrCodeLib, { alt = 'QR code to join', ...options }: QrOptions & { alt?: string } = {}): QrRenderer {
  return (value, size) => createElement(QrImage, { value, size, lib, options, alt });
}

/**
 * `renderQr` for `HostHUD`, or `undefined` until (or unless) an encoder is
 * available. With `lib` it is ready immediately; otherwise `qrcode` is loaded
 * on demand. `lib: null` disables QR codes.
 *
 * ```tsx
 * const renderQr = useQrRenderer();
 * return <HostHUD pairing={pairing} renderQr={renderQr} />;
 * ```
 */
export function useQrRenderer(
  { lib, alt, margin, errorCorrectionLevel, color }: QrOptions & { lib?: QrCodeLib | null; alt?: string } = {},
): QrRenderer | undefined {
  const [loaded, setLoaded] = useState<QrCodeLib | null>(null);

  useEffect(() => {
    if (lib !== undefined) return undefined;
    let live = true;
    loadQrLib().then((found) => {
      if (live) setLoaded(found);
    });
    return () => { live = false; };
  }, [lib]);

  const encoder = lib === undefined ? loaded : lib;
  const colorKey = JSON.stringify(color ?? null);
  return useMemo(
    () => (encoder ? createQrRenderer(encoder, { alt, margin, errorCorrectionLevel, color: JSON.parse(colorKey) ?? undefined }) : undefined),
    [encoder, alt, margin, errorCorrectionLevel, colorKey],
  );
}
