// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getScreenOrientation,
  isMotionSupported,
  isOrientationSupported,
  lockScreenOrientation,
  needsPermission,
  requestOrientationPermission,
  subscribeMotion,
  subscribeOrientation,
  unlockScreenOrientation,
} from './orientation';

/** Stubs DeviceOrientationEvent / DeviceMotionEvent, optionally with iOS-style requestPermission. */
function stubSensors({ orientation, motion }: { orientation?: () => Promise<string>; motion?: () => Promise<string> } = {}) {
  const Orientation = class extends Event {};
  const Motion = class extends Event {};
  const orientationRequest = orientation ? vi.fn(orientation) : undefined;
  const motionRequest = motion ? vi.fn(motion) : undefined;
  if (orientationRequest) Object.assign(Orientation, { requestPermission: orientationRequest });
  if (motionRequest) Object.assign(Motion, { requestPermission: motionRequest });
  vi.stubGlobal('DeviceOrientationEvent', Orientation);
  vi.stubGlobal('DeviceMotionEvent', Motion);
  return { orientationRequest, motionRequest };
}

function fire(type: string, props: Record<string, unknown>) {
  window.dispatchEvent(Object.assign(new Event(type), props));
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (screen as any).orientation;
  delete (window as any).ondeviceorientationabsolute;
});

describe('feature detection and permissions', () => {
  it('reports unsupported when the events are missing', async () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    vi.stubGlobal('DeviceMotionEvent', undefined);
    expect(isOrientationSupported()).toBe(false);
    expect(isMotionSupported()).toBe(false);
    expect(needsPermission()).toBe(false);
    await expect(requestOrientationPermission()).resolves.toBe('unsupported');
    const unsubscribe = subscribeOrientation(vi.fn());
    expect(() => { unsubscribe(); unsubscribe(); }).not.toThrow();
  });

  it('grants without prompting where no permission API exists (Android, desktop)', async () => {
    stubSensors();
    expect(isOrientationSupported()).toBe(true);
    expect(needsPermission()).toBe(false);
    await expect(requestOrientationPermission()).resolves.toBe('granted');
  });

  it('starts both iOS permission prompts synchronously (inside the user gesture)', async () => {
    const { orientationRequest, motionRequest } = stubSensors({
      orientation: async () => 'granted',
      motion: async () => 'granted',
    });
    expect(needsPermission()).toBe(true);

    const result = requestOrientationPermission();
    // Both prompts must already be requested before anything is awaited.
    expect(orientationRequest).toHaveBeenCalledTimes(1);
    expect(motionRequest).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toBe('granted');
  });

  it('can skip the motion prompt', async () => {
    const { motionRequest } = stubSensors({ orientation: async () => 'granted', motion: async () => 'granted' });
    await expect(requestOrientationPermission({ motion: false })).resolves.toBe('granted');
    expect(motionRequest).not.toHaveBeenCalled();
  });

  it('reports denied when any prompt is refused or rejected outside a gesture', async () => {
    stubSensors({ orientation: async () => 'granted', motion: async () => 'denied' });
    await expect(requestOrientationPermission()).resolves.toBe('denied');

    stubSensors({ orientation: () => Promise.reject(new DOMException('Requires user gesture', 'NotAllowedError')) });
    await expect(requestOrientationPermission()).resolves.toBe('denied');

    stubSensors({ orientation: () => { throw new Error('sync failure'); } });
    await expect(requestOrientationPermission()).resolves.toBe('denied');
  });
});

describe('subscriptions', () => {
  it('maps deviceorientation events and unsubscribes idempotently', () => {
    stubSensors();
    const listener = vi.fn();
    const unsubscribe = subscribeOrientation(listener);
    fire('deviceorientation', { alpha: 10, beta: 20, gamma: -5, absolute: false, webkitCompassHeading: 270 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      alpha: 10, beta: 20, gamma: -5, absolute: false, webkitCompassHeading: 270, timestamp: expect.any(Number),
    }));

    unsubscribe();
    unsubscribe();
    fire('deviceorientation', { alpha: 1, beta: 2, gamma: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('normalizes missing angles to null', () => {
    stubSensors();
    const listener = vi.fn();
    const stop = subscribeOrientation(listener);
    fire('deviceorientation', {});
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ alpha: null, beta: null, gamma: null, absolute: false }));
    stop();
  });

  it('prefers deviceorientationabsolute when asked and available', () => {
    stubSensors();
    (window as any).ondeviceorientationabsolute = null;
    const listener = vi.fn();
    const stop = subscribeOrientation(listener, { absolute: true });
    fire('deviceorientation', { alpha: 1 });
    fire('deviceorientationabsolute', { alpha: 2, absolute: true });
    expect(listener.mock.calls.map(([reading]) => reading.alpha)).toEqual([2]);
    stop();
  });

  it('maps devicemotion events', () => {
    stubSensors();
    const listener = vi.fn();
    const stop = subscribeMotion(listener);
    fire('devicemotion', {
      acceleration: { x: 1, y: 2, z: 3 },
      accelerationIncludingGravity: { x: 1, y: 2, z: 12.8 },
      rotationRate: { alpha: 4, beta: 5, gamma: 6 },
      interval: 16,
    });
    stop();
    fire('devicemotion', {});
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      acceleration: { x: 1, y: 2, z: 3 },
      accelerationIncludingGravity: { z: 12.8 },
      rotationRate: { alpha: 4, beta: 5, gamma: 6 },
      interval: 16,
    });
  });
});

describe('screen orientation', () => {
  it('locks when allowed and resolves false instead of throwing when not', async () => {
    const lock = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new DOMException('fullscreen required', 'SecurityError'));
    const unlock = vi.fn(() => { throw new Error('not locked'); });
    Object.defineProperty(screen, 'orientation', { configurable: true, value: { type: 'landscape-primary', lock, unlock } });

    await expect(lockScreenOrientation('landscape')).resolves.toBe(true);
    await expect(lockScreenOrientation('portrait')).resolves.toBe(false);
    expect(lock).toHaveBeenCalledWith('landscape');
    expect(() => unlockScreenOrientation()).not.toThrow();
    expect(getScreenOrientation()).toBe('landscape');
  });

  it('degrades without the Screen Orientation API', async () => {
    await expect(lockScreenOrientation('portrait')).resolves.toBe(false);
    expect(() => unlockScreenOrientation()).not.toThrow();
    expect(['portrait', 'landscape']).toContain(getScreenOrientation());
  });
});
