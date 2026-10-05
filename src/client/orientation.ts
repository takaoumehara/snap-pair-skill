import type { Unsubscribe } from '../core/types';

/**
 * DeviceOrientation / DeviceMotion helpers for motion and tilt controllers.
 *
 * iOS 13+ Safari gates sensor events behind `DeviceOrientationEvent.requestPermission()`
 * (and `DeviceMotionEvent.requestPermission()`), which only works when called
 * synchronously inside a user gesture (tap/click handler) on a secure origin.
 * Typical flow:
 *
 * ```ts
 * if (needsPermission()) showButton('Enable motion', async () => {
 *   if ((await requestOrientationPermission()) === 'granted') start();
 * });
 * else start();
 * function start() { stop = subscribeOrientation(({ beta, gamma }) => steer(beta, gamma)); }
 * ```
 *
 * Nothing here touches `window` at import time, so it is SSR-safe.
 */

export type SensorPermission = 'granted' | 'denied' | 'unsupported';

export interface OrientationReading {
  /** Rotation around z (compass-like), 0–360, or null when unknown. */
  alpha: number | null;
  /** Front-back tilt, -180–180. */
  beta: number | null;
  /** Left-right tilt, -90–90. */
  gamma: number | null;
  absolute: boolean;
  /** iOS only: compass heading in degrees, when available. */
  webkitCompassHeading?: number;
  timestamp: number;
}

export interface MotionReading {
  acceleration: { x: number | null; y: number | null; z: number | null } | null;
  accelerationIncludingGravity: { x: number | null; y: number | null; z: number | null } | null;
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
  /** Milliseconds between samples, as reported by the device. */
  interval: number;
  timestamp: number;
}

type PermissionedEvent = { requestPermission?: () => Promise<'granted' | 'denied' | 'default'> };

const getWindow = (): (Window & typeof globalThis) | undefined => (typeof window === 'undefined' ? undefined : window);

const orientationEventClass = (): PermissionedEvent | undefined =>
  (getWindow() as unknown as { DeviceOrientationEvent?: PermissionedEvent } | undefined)?.DeviceOrientationEvent;

const motionEventClass = (): PermissionedEvent | undefined =>
  (getWindow() as unknown as { DeviceMotionEvent?: PermissionedEvent } | undefined)?.DeviceMotionEvent;

/** True when the browser exposes DeviceOrientation events (it may still never fire, e.g. on desktops). */
export function isOrientationSupported(): boolean {
  return typeof orientationEventClass() === 'function';
}

export function isMotionSupported(): boolean {
  return typeof motionEventClass() === 'function';
}

/** True on browsers that require `requestOrientationPermission()` from a user gesture (iOS 13+). */
export function needsPermission(): boolean {
  return typeof orientationEventClass()?.requestPermission === 'function'
    || typeof motionEventClass()?.requestPermission === 'function';
}

/**
 * Asks for sensor access. Call it directly from a tap/click handler: both
 * permission prompts are started synchronously, before any `await`, because
 * iOS rejects requests made after the gesture's task has ended.
 *
 * Resolves `'granted'` without prompting where no permission is needed,
 * `'unsupported'` where the events don't exist, and `'denied'` when the user
 * refuses or the call was not made from a gesture.
 */
export function requestOrientationPermission({ motion = true }: { motion?: boolean } = {}): Promise<SensorPermission> {
  if (!isOrientationSupported()) return Promise.resolve('unsupported');
  const requests: Promise<string>[] = [];
  const orientation = orientationEventClass();
  const motionClass = motionEventClass();
  try {
    if (typeof orientation?.requestPermission === 'function') requests.push(orientation.requestPermission());
    if (motion && typeof motionClass?.requestPermission === 'function') requests.push(motionClass.requestPermission());
  } catch {
    return Promise.resolve('denied');
  }
  if (requests.length === 0) return Promise.resolve('granted');
  return Promise.all(requests).then(
    (results) => (results.every((result) => result === 'granted') ? 'granted' : 'denied'),
    () => 'denied',
  );
}

/**
 * Calls `listener` for every orientation event. With `absolute: true` it
 * prefers `deviceorientationabsolute` (Chrome/Android) when available.
 * Returns an idempotent unsubscribe; a no-op where unsupported.
 */
export function subscribeOrientation(
  listener: (reading: OrientationReading) => void,
  { absolute = false }: { absolute?: boolean } = {},
): Unsubscribe {
  const win = getWindow();
  if (!win || !isOrientationSupported()) return () => undefined;
  const eventName = absolute && 'ondeviceorientationabsolute' in win ? 'deviceorientationabsolute' : 'deviceorientation';
  const handler = (event: Event) => {
    const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
    const reading: OrientationReading = {
      alpha: e.alpha ?? null,
      beta: e.beta ?? null,
      gamma: e.gamma ?? null,
      absolute: Boolean(e.absolute),
      timestamp: e.timeStamp || Date.now(),
    };
    if (typeof e.webkitCompassHeading === 'number') reading.webkitCompassHeading = e.webkitCompassHeading;
    listener(reading);
  };
  win.addEventListener(eventName, handler);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    win.removeEventListener(eventName, handler);
  };
}

/** Calls `listener` for every `devicemotion` event. Returns an idempotent unsubscribe; a no-op where unsupported. */
export function subscribeMotion(listener: (reading: MotionReading) => void): Unsubscribe {
  const win = getWindow();
  if (!win || !isMotionSupported()) return () => undefined;
  const vector = (v: { x: number | null; y: number | null; z: number | null } | null | undefined) =>
    (v ? { x: v.x ?? null, y: v.y ?? null, z: v.z ?? null } : null);
  const handler = (event: Event) => {
    const e = event as DeviceMotionEvent;
    listener({
      acceleration: vector(e.acceleration),
      accelerationIncludingGravity: vector(e.accelerationIncludingGravity),
      rotationRate: e.rotationRate
        ? { alpha: e.rotationRate.alpha ?? null, beta: e.rotationRate.beta ?? null, gamma: e.rotationRate.gamma ?? null }
        : null,
      interval: e.interval ?? 0,
      timestamp: e.timeStamp || Date.now(),
    });
  };
  win.addEventListener('devicemotion', handler);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    win.removeEventListener('devicemotion', handler);
  };
}

export type ScreenOrientationLock =
  | 'any' | 'natural' | 'landscape' | 'portrait'
  | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary';

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: ScreenOrientationLock) => Promise<void>;
  unlock?: () => void;
};

const getScreenOrientationApi = (): LockableScreenOrientation | undefined =>
  (typeof screen === 'undefined' ? undefined : (screen.orientation as LockableScreenOrientation | undefined));

/** `'portrait'` / `'landscape'` from the Screen Orientation API (or the viewport), or null during SSR. */
export function getScreenOrientation(): 'portrait' | 'landscape' | null {
  const type = getScreenOrientationApi()?.type;
  if (type) return type.startsWith('portrait') ? 'portrait' : 'landscape';
  const win = getWindow();
  if (!win) return null;
  return win.innerHeight >= win.innerWidth ? 'portrait' : 'landscape';
}

/**
 * Tries to lock the screen orientation. Most browsers only allow it in
 * fullscreen (and iOS Safari not at all), so failure is expected: resolves
 * `false` instead of throwing.
 */
export async function lockScreenOrientation(orientation: ScreenOrientationLock): Promise<boolean> {
  const api = getScreenOrientationApi();
  if (typeof api?.lock !== 'function') return false;
  try {
    await api.lock(orientation);
    return true;
  } catch {
    return false;
  }
}

/** Releases a lock taken with `lockScreenOrientation`; never throws. */
export function unlockScreenOrientation(): void {
  try {
    getScreenOrientationApi()?.unlock?.();
  } catch {
    // Not locked, or not supported.
  }
}
