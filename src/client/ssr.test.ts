// Runs in the default node environment: no window, document, or screen.
import { describe, expect, it } from 'vitest';

describe('client utilities during SSR', () => {
  it('import without touching browser globals and degrade to no-ops', async () => {
    expect(typeof window).toBe('undefined');
    const orientation = await import('./orientation');
    const wakeLock = await import('./wakeLock');

    expect(orientation.isOrientationSupported()).toBe(false);
    expect(orientation.needsPermission()).toBe(false);
    await expect(orientation.requestOrientationPermission()).resolves.toBe('unsupported');
    expect(() => orientation.subscribeOrientation(() => undefined)()).not.toThrow();
    expect(() => orientation.subscribeMotion(() => undefined)()).not.toThrow();
    expect(orientation.getScreenOrientation()).toBeNull();
    await expect(orientation.lockScreenOrientation('portrait')).resolves.toBe(false);

    expect(wakeLock.isWakeLockSupported()).toBe(false);
    const lock = wakeLock.createWakeLock();
    await expect(lock.request()).resolves.toBe(false);
    await expect(lock.dispose()).resolves.toBeUndefined();
  });

  it('the whole barrel imports without browser globals', async () => {
    const api = await import('../index');
    expect(api.BroadcastChannelTransport).toBeTypeOf('function');
    expect(api.isWebRTCSupported()).toBe(false);
  });
});
