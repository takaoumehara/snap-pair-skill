import { lockScreenOrientation, unlockScreenOrientation, type ScreenOrientationLock } from './orientation';

/**
 * Fullscreen helpers for controller pages. Orientation locks usually only
 * work in fullscreen, so `enterFullscreen` does both. iOS Safari on iPhone has
 * no element fullscreen: everything resolves `false` there instead of throwing.
 * SSR-safe: nothing touches `document` at import time.
 */

type FullscreenElement = Element & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
};

const getDocument = (): FullscreenDocument | undefined => (typeof document === 'undefined' ? undefined : document as FullscreenDocument);

export function isFullscreenSupported(): boolean {
  const doc = getDocument();
  if (!doc) return false;
  const el = doc.documentElement as FullscreenElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

export function isFullscreen(): boolean {
  const doc = getDocument();
  return Boolean(doc && (doc.fullscreenElement ?? doc.webkitFullscreenElement));
}

/**
 * Enters fullscreen (call it from a tap handler) and then tries to lock the
 * orientation. Resolves `{ fullscreen, locked }`; never rejects.
 */
export async function enterFullscreen(orientation?: ScreenOrientationLock): Promise<{ fullscreen: boolean; locked: boolean }> {
  const doc = getDocument();
  if (!doc) return { fullscreen: false, locked: false };
  const el = doc.documentElement as FullscreenElement;
  let fullscreen = isFullscreen();
  if (!fullscreen) {
    try {
      if (typeof el.requestFullscreen === 'function') await el.requestFullscreen();
      else if (typeof el.webkitRequestFullscreen === 'function') await el.webkitRequestFullscreen();
      else return { fullscreen: false, locked: orientation ? await lockScreenOrientation(orientation) : false };
      fullscreen = true;
    } catch {
      fullscreen = false;
    }
  }
  const locked = orientation ? await lockScreenOrientation(orientation) : false;
  return { fullscreen, locked };
}

/** Leaves fullscreen and releases any orientation lock; never throws. */
export async function exitFullscreen(): Promise<void> {
  unlockScreenOrientation();
  const doc = getDocument();
  if (!doc || !isFullscreen()) return;
  try {
    if (typeof doc.exitFullscreen === 'function') await doc.exitFullscreen();
    else if (typeof doc.webkitExitFullscreen === 'function') await doc.webkitExitFullscreen();
  } catch {
    // Already left.
  }
}

/** Calls `listener` on fullscreen changes; returns an unsubscribe. */
export function onFullscreenChange(listener: (fullscreen: boolean) => void): () => void {
  const doc = getDocument();
  if (!doc) return () => undefined;
  const handler = () => listener(isFullscreen());
  doc.addEventListener('fullscreenchange', handler);
  doc.addEventListener('webkitfullscreenchange', handler);
  return () => {
    doc.removeEventListener('fullscreenchange', handler);
    doc.removeEventListener('webkitfullscreenchange', handler);
  };
}
